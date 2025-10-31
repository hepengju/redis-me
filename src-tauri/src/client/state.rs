use crate::client::client::RedisMeClient;
use crate::client::impl_cluster::RedisMeCluster;
use crate::client::impl_single::RedisMeSingle;
use crate::utils::conn::get_client_single;
use crate::utils::model::RedisConn;
use crate::utils::util::AnyResult;
use anyhow::{anyhow};
use log::info;
use redis::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct AppState {
    // 初始化连接列表
    pub connections: Mutex<HashMap<String, RedisConn>>,

    // 缓存连接客户端
    pub clients: RwLock<HashMap<String, Arc<Box<dyn RedisMeClient>>>>,
}

pub trait ClientAccess {
    fn conn_list(&self, conn_list: Vec<RedisConn>) -> AnyResult<()>;
    fn get_client(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>>;
    fn connect(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>>;
    fn disconnect(&self, id: &str) -> AnyResult<()>;

    // 创建新单节点连接: 用于新线程的监控或订阅
    fn new_node_conn(&self, id: &str) -> AnyResult<Connection>;
}

impl ClientAccess for AppHandle {
    fn conn_list(&self, conn_list: Vec<RedisConn>) -> AnyResult<()> {
        let state: State<AppState> = self.state();
        let mut map = state.connections.lock().unwrap();
        map.clear();
        for conn in conn_list {
            map.insert(conn.id.clone(), conn);
        }
        info!("同步连接列表完成: {}", map.len());
        Ok(())
    }

    fn get_client(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>> {
        let state: State<AppState> = self.state();
        {
            // Read lock在此代码块内，自动释放锁
            let clients = state.clients.read().unwrap();
            if let Some(client) = clients.get(id) {
                return Ok(Arc::clone(client));
            }
        }
        self.connect(id)
    }

    fn connect(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>> {
        let state: State<AppState> = self.state();
        let map = state.connections.lock().unwrap();
        let conn = map.get(id).ok_or(anyhow!("未找到连接: {}", id))?;

        let mut clients = state.clients.write().unwrap();
        let client = Arc::new(if conn.cluster {
            RedisMeCluster::new(conn)?
        } else {
            RedisMeSingle::new(conn)?
        });
        clients.insert(id.to_string(), Arc::clone(&client));
        info!("连接成功: {}", id);
        Ok(client)
    }

    fn disconnect(&self, id: &str) -> AnyResult<()> {
        let state: State<AppState> = self.state();
        let mut clients = state.clients.write().unwrap();
        if clients.get(id).is_some() {
            clients.remove(id);
            info!("断开连接: {}", id);
        } else {
            info!("未找到连接, 断开忽略: {}", id)
        }
        Ok(())
    }

    fn new_node_conn(&self, id: &str) -> AnyResult<Connection> {
        let state: State<AppState> = self.state();
        let map = state.connections.lock().unwrap();
        let redis_conn = map.get(id).ok_or(anyhow!("未找到连接: {}", id))?;
        let client = get_client_single(redis_conn)?;
        let conn = client.get_connection()?;
        Ok(conn)
    }
}
