use crate::client::me_client::MeClient;
use crate::client::me_cluster::MeCluster;
use crate::client::me_single::MeSingle;
use crate::model::{AppSettings, ConnConfig};
use crate::support::capabilities::ServerCapabilities;
use crate::support::error::AppError;
use crate::support::util::{AnyResult, CONNECTION_CONNECT_TIMEOUT, CONNECTION_NORMAL_TIMEOUT};
use chrono::Utc;
use log::{debug, info};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU16};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

/// 单条连接的运行时状态。只在后端使用，不参与前端类型导出。
#[derive(Debug, Clone)]
pub struct MeBase {
    pub id: String,
    pub conf: ConnConfig,
    pub db: Arc<AtomicU16>,
    pub subscribe_running: Arc<AtomicBool>,
    pub monitor_running: Arc<AtomicBool>,
    /// 通知（键空间/键事件）订阅独立开关：不复用 subscribe_running，可与发布订阅并行
    pub notify_running: Arc<AtomicBool>,
    pub export_import_running: Arc<AtomicBool>,
    pub last_check_time: Arc<AtomicI64>,
    /// 已建立连接上的单次命令读写超时（init 时从 AppSettings 快照）
    pub command_timeout: Duration,
    /// 建连超时（TCP+握手+PING；init 时从 AppSettings 快照，重连复用）
    pub connection_timeout: Duration,
    /// 本连接命令执行日志（环形缓冲）
    pub command_logger: Arc<crate::support::command_log::CommandLogger>,
    /// 用于后台线程 emit 事件到前端
    pub app_handle: Arc<parking_lot::RwLock<Option<AppHandle>>>,
    /// 连接成功后检测的服务器能力
    pub capabilities: ServerCapabilities,
}

impl From<&ConnConfig> for MeBase {
    /// 用连接配置做出运行时状态。超时先用默认值，真正建连时再按设置覆盖。
    fn from(conf: &ConnConfig) -> Self {
        MeBase {
            id: conf.id.clone(),
            conf: conf.clone(),
            db: Arc::new(AtomicU16::new(conf.db)),
            subscribe_running: Arc::new(AtomicBool::new(false)),
            monitor_running: Arc::new(AtomicBool::new(false)),
            notify_running: Arc::new(AtomicBool::new(false)),
            export_import_running: Arc::new(AtomicBool::new(false)),
            last_check_time: Arc::new(AtomicI64::new(Utc::now().timestamp())),
            command_timeout: CONNECTION_NORMAL_TIMEOUT,
            connection_timeout: CONNECTION_CONNECT_TIMEOUT,
            command_logger: Arc::new(crate::support::command_log::CommandLogger::new(
                conf.id.clone(),
                conf.name.clone(),
            )),
            app_handle: Arc::new(parking_lot::RwLock::new(None::<AppHandle>)),
            capabilities: ServerCapabilities::default(),
        }
    }
}

impl MeBase {
    /// 获取绑定的 AppHandle，未初始化时返回错误
    pub fn get_app_handle(&self) -> AnyResult<AppHandle> {
        self.app_handle.read().clone().ok_or_else(|| {
            AppError::Internal {
                message: "AppHandle not initialized".to_string(),
            }
            .into()
        })
    }
}

/// 进程内的连接表、已打开的客户端，以及全局超时设置。
pub struct AppState {
    // 初始化连接列表
    pub connections: Mutex<HashMap<String, ConnConfig>>,

    // 缓存连接客户端
    pub clients: RwLock<HashMap<String, Arc<Box<dyn MeClient>>>>,

    /// 全局设置（建连/命令超时等），由前端 app_settings 同步
    pub app_settings: RwLock<AppSettings>,

    /// 键迁移进行中标记：true=继续，false=空闲或已取消。全局同时只跑一个迁移任务。
    pub migrate_running: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            clients: RwLock::new(HashMap::new()),
            app_settings: RwLock::new(AppSettings::default()),
            migrate_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// 读取当前全局建连超时、命令超时
pub fn app_timeouts(app: &AppHandle) -> (Duration, Duration) {
    let state: State<AppState> = app.state();
    let s = state.app_settings.read().unwrap();
    (s.connection_timeout(), s.command_timeout())
}

/// 从 `AppHandle` 同步连接列表，并查找、建立或断开客户端。
pub trait ClientAccess {
    /// 用前端发来的列表整表替换内存里的连接配置。
    fn conn_list(&self, conn_list: Vec<ConnConfig>) -> AnyResult<()>;
    /// 同步全局超时。已经打开的连接不改，下次重连才用新值。
    fn app_settings(&self, app_settings: AppSettings) -> AnyResult<()>;
    /// 取已打开的客户端。没有就建连。
    fn get_client(&self, id: &str) -> AnyResult<Arc<Box<dyn MeClient>>>;
    /// 按 id 建连并放进缓存。
    fn connect(&self, app_handle: AppHandle, id: &str) -> AnyResult<Arc<Box<dyn MeClient>>>;
    /// 从缓存拿掉客户端。本来就没有也算成功。
    fn disconnect(&self, id: &str) -> AnyResult<()>;
}

impl ClientAccess for AppHandle {
    /// 用前端发来的列表整表替换内存里的连接配置。
    fn conn_list(&self, conn_list: Vec<ConnConfig>) -> AnyResult<()> {
        let state: State<AppState> = self.state();
        let mut map = state.connections.lock().unwrap();
        map.clear();
        for conn in conn_list {
            map.insert(conn.id.clone(), conn);
        }
        debug!("同步连接列表完成: {}", map.len());
        Ok(())
    }

    /// 同步全局超时。已经打开的连接不改，下次重连才用新值。
    fn app_settings(&self, app_settings: AppSettings) -> AnyResult<()> {
        let state: State<AppState> = self.state();
        *state.app_settings.write().unwrap() = app_settings.normalized();
        debug!(
            "同步应用设置: connection_timeout_secs={}, command_timeout_secs={}",
            state.app_settings.read().unwrap().connection_timeout_secs,
            state.app_settings.read().unwrap().command_timeout_secs
        );
        Ok(())
    }

    /// 取已打开的客户端。没有就建连。
    fn get_client(&self, id: &str) -> AnyResult<Arc<Box<dyn MeClient>>> {
        let state: State<AppState> = self.state();
        {
            // Read lock在此代码块内，自动释放锁
            let clients = state.clients.read().unwrap();
            if let Some(client) = clients.get(id) {
                debug!("获取连接: {}", client.name());
                return Ok(Arc::clone(client));
            }
        }
        self.connect(self.clone(), id)
    }

    /// 按 id 建连并放进缓存。
    fn connect(&self, app_handle: AppHandle, id: &str) -> AnyResult<Arc<Box<dyn MeClient>>> {
        let state: State<AppState> = self.state();
        let map = state.connections.lock().unwrap();
        let conn = map
            .get(id)
            .ok_or(AppError::ConnectionNotFound { id: id.into() })?;

        let (connect_timeout, command_timeout) = app_timeouts(self);
        let mut clients = state.clients.write().unwrap();
        let client = Arc::new(if conn.cluster {
            MeCluster::init(conn, connect_timeout, command_timeout)?
        } else {
            MeSingle::init(conn, connect_timeout, command_timeout)?
        });

        client
            .base()
            .command_logger
            .bind_app_handle(app_handle.clone());
        *client.base().app_handle.write() = Some(app_handle);
        clients.insert(id.to_string(), Arc::clone(&client));
        info!("连接成功: {}", client.name());
        Ok(client)
    }

    /// 从缓存拿掉客户端。本来就没有也算成功。
    /// 真正释放放到后台：空闲连接 Drop 时可能探活/重连，不能占着 clients 写锁，否则另一条连接的 connect 会跟着等。
    fn disconnect(&self, id: &str) -> AnyResult<()> {
        let state: State<AppState> = self.state();
        let removed = {
            let mut clients = state.clients.write().unwrap();
            clients.remove(id)
        };
        if let Some(client) = removed {
            info!("断开连接: {}", client.name());
            thread::spawn(move || drop(client));
        } else {
            info!("未找到连接, 断开忽略: {}", id);
        }
        Ok(())
    }
}
