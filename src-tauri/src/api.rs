use crate::api_commands;
use crate::client::state::{ClientAccess, app_timeouts};
use crate::utils::app_store;
use crate::utils::capabilities::ServerCapabilities;
use crate::utils::model::*;
use crate::utils::util::*;
use specta::specta;
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use tauri::Manager;
use tauri::utils::platform::current_exe;
use tauri::{AppHandle, command};

// 默认示例
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[command]
#[specta]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 应用程序目录
#[command]
#[specta]
pub fn app_dir() -> ApiResult<String> {
    match current_exe() {
        Ok(path) => Ok(path.parent().unwrap().to_string_lossy().to_string()),
        Err(e) => Err(e.to_string()),
    }
}

/// 是否通过应用商店类渠道安装（内置更新应关闭）：Win MSIX / macOS MAS / Linux Flatpak·Snap。
#[command]
#[specta]
pub fn is_app_store() -> bool {
    app_store::detect()
}

/// 更新安装完成后重启。macOS 上延迟 `open` 再退出，避免 single-instance 与 `relaunch()` 竞态。
#[command]
#[specta]
pub fn restart_after_update(app: AppHandle) -> ApiResult<()> {
    #[cfg(target_os = "macos")]
    {
        let exe = tauri::process::current_binary(&app.env()).map_err(|e| e.to_string())?;
        let app_bundle =
            macos_app_bundle_path(&exe).ok_or_else(|| "无法定位应用 bundle".to_string())?;
        let bundle = shell_escape(&app_bundle.to_string_lossy());
        std::process::Command::new("sh")
            .args(["-c", &format!("sleep 0.8; open {bundle}")])
            .spawn()
            .map_err(|e| e.to_string())?;
        app.exit(0);
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.request_restart();
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_app_bundle_path(exe: &std::path::Path) -> Option<std::path::PathBuf> {
    let macos_dir = exe.parent()?;
    if macos_dir.file_name()? != "MacOS" {
        return None;
    }
    let contents = macos_dir.parent()?;
    if contents.file_name()? != "Contents" {
        return None;
    }
    Some(contents.parent()?.to_path_buf())
}

#[cfg(target_os = "macos")]
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

// 测试连接
#[command]
#[specta]
pub fn test_conn(app_handle: AppHandle, conf: ConnConfig) -> ApiResult<()> {
    let (connect_timeout, _) = app_timeouts(&app_handle);
    to_api_result(conf.test(connect_timeout))
}

// 哨兵模式获取主节点列表
#[command]
#[specta]
pub fn masters(app_handle: AppHandle, conf: ConnConfig) -> ApiResult<Vec<HashMap<String, String>>> {
    let (connect_timeout, command_timeout) = app_timeouts(&app_handle);
    to_api_result(conf.masters(connect_timeout, command_timeout))
}

// 连接信息发送到后端
#[command]
#[specta]
pub fn conn_list(app_handle: AppHandle, conn_list: Vec<ConnConfig>) -> ApiResult<()> {
    to_api_result(app_handle.conn_list(conn_list))
}

// 全局应用设置同步到后端（建连/命令超时等）
#[command]
#[specta]
pub fn app_settings(app_handle: AppHandle, app_settings: AppSettings) -> ApiResult<()> {
    to_api_result(app_handle.app_settings(app_settings))
}

// 连接
#[command]
#[specta]
pub fn connect(app_handle: AppHandle, id: &str) -> ApiResult<ServerCapabilities> {
    let client = app_handle
        .connect(app_handle.clone(), id)
        .map_err(|e| e.to_string())?;
    let capabilities = client.base().capabilities.clone();
    Ok(capabilities)
}

// 断开
#[command]
#[specta]
pub fn disconnect(app_handle: AppHandle, id: &str) -> ApiResult<()> {
    to_api_result(app_handle.disconnect(id))
}

// 使用宏简化代码
// to_api_result(app_handle.get_client(id).and_then(|client| client.$name($($param),*)))
api_commands!(
    db_list() -> Vec<RedisDB>;                 // 数据库列表
    select_db(db: u16) -> ();                  // 切换数据库
    info(node: Option<String>)  -> RedisInfo;  // 信息
    info_list() -> Vec<RedisInfo>;             // 信息列表
    chart(node: Option<String>) -> RedisChart; // 图表
    chart_list() -> Vec<RedisChart>;           // 图表列表
    node_list() -> Vec<RedisNode>;             // 节点列表
    scan(param: ScanParam) -> ScanResult;      // 扫描
    field_scan(param: FieldScanParam)  -> FieldScanResult;        // 字段扫描
    //get(key: RedisKey, hash_key: Option<String>) -> RedisValue; // 获取值(不扫描，直接获取所有)
    ttl(key: RedisKey, ttl: i64) -> ();                           // 设置TTL
    set(param: RedisSetParam) -> ();                              // 设置值
    del(key: RedisKey) -> ();                                     // 删除键
    rename(key: RedisKey, new_key: RedisKey) -> RedisKey;         // 重命名键
    copy(param: RedisCopyParam) -> RedisKey;                      // 复制键
    field_add(param: RedisFieldAdd) -> RedisKey;                  // 新增字段
    field_set(param: RedisFieldSet) -> ();                        // 编辑字段
    field_ttl(param: RedisFieldTtl) -> ();                        // Hash 字段过期（HEXPIRE/HPERSIST）
    field_get(param: RedisFieldGet) -> RedisFieldValue;           // 读取单条字段
    hash_keys(param: RedisHashKeys) -> Vec<String>;               // Hash 全量字段名（HKEYS）
    hash_values(param: RedisHashKeys) -> Vec<String>;             // Hash 全量字段值（HVALS）
    field_pop(param: RedisPop) -> String;                          // List/Set/ZSet 弹出元素（LPOP/RPOP/SPOP/ZPOPMIN/ZPOPMAX）
    field_del(param: RedisFieldDel) -> ();                        // 删除字段
    zset_rank(param: RedisZsetRank) -> RedisZsetRankResult;       // ZSet 排名查询（ZRANK/ZREVRANK）
    zset_range(param: RedisZsetRange) -> Vec<RedisZsetRangeItem>;  // ZSet Top/Bottom 范围查询（ZRANGE/ZREVRANGE）
    ar_last_items(param: RedisArLastItems) -> Vec<RedisArLastItemsItem>; // Array ARLASTITEMS
    ar_info(key: RedisKey) -> Vec<RedisArInfoItem>;               // Array ARINFO 元数据
    v_info(key: RedisKey) -> Vec<RedisArInfoItem>;                // Vector Set VINFO 元数据（行结构同 ARINFO）
    v_getattr(param: RedisVAttr) -> String;                       // Vector Set VGETATTR（按需，不随 VRANGE）
    v_setattr(param: RedisVAttr) -> ();                           // Vector Set VSETATTR（空串删除）
    v_sim(param: RedisVSim) -> Vec<RedisVSimItem>;                // Vector Set VSIM 相似度查询
    object_info(key: RedisKey) -> RedisObjectInfo;                // OBJECT 自省（ENCODING/IDLETIME/REFCOUNT/FREQ）
    execute_command(param: RedisCommand) -> String;               // 执行命令
    config_get(pattern: &str, node: Option<String>) -> HashMap<String, String>; // 获取配置
    config_set(key: &str, value: &str, node: Option<String>) -> ();             // 设置配置
    slow_log(count: Option<u64>, node: Option<String>) -> Vec<RedisSlowLog>;    // 慢日志
    memory_usage(param: RedisMemoryParam) -> RedisMemoryResult;                 // 内存分析（一轮）
    client_list(node: Option<String>, client_type: Option<String>) -> Vec<RedisClientInfo>; // 客户端列表
    publish(channel: &str, message: &str, msg_fmt: Option<BytesFormat>) -> (); // 发布消息
    subscribe_stop() -> ();                         // 订阅消息停止
    monitor_stop()   -> ();                         // 监控命令停止
    batch_del(param: RedisBatchKey) -> ();          // 批量删除
    batch_ttl(param: RedisBatchTtl) -> ();          // 批量更新过期时间
    mock_data(count: u64) -> ();                    // 模拟数据
    key_type(key: RedisKey) -> String;              // 获取键类型
    get_key_as_command(key: RedisKey) -> String;    // 复制为 redis-cli 命令
    get_field_as_command(param: RedisFieldAsCommand) -> String; // 表格单行复制为命令
    xinfo_groups(key: RedisKey) -> Vec<XInfoGroup>; // 获取Stream类型的组信息
    xinfo_consumers(key: RedisKey, group: String) -> Vec<XInfoConsumer>; // 获取Stream类型的消费者信息
    key_slot(key: RedisKey) -> u64;                           // 获取键的槽位
    key_node(key: RedisKey) -> Vec<RedisNode>;                // 获取键所在节点ID
    flush_db() -> ();                                         // 清空当前数据库
    flush_all() -> ();                                        // 清空所有数据库
    acl_users() -> Vec<String>;                               // ACL 用户列表
    acl_list_users() -> Vec<AclUserDetail>;                   // ACL LIST 解析用户详情（单次往返）
    acl_getuser(username: &str) -> AclUserDetail;             // ACL 用户详情
    acl_setuser(param: AclSetuserParam) -> ();                // ACL 新建/更新用户
    acl_deluser(usernames: Vec<String>) -> usize;             // ACL 删除用户
    acl_whoami() -> String;                                   // ACL 当前用户
    acl_cat(category: Option<String>) -> Vec<String>;         // ACL 命令分类
    acl_genpass(bits: Option<i64>) -> String;                 // ACL 生成密码
    acl_save() -> ();                                         // ACL 保存规则
    acl_load() -> ();                                         // ACL 加载规则
    acl_log(count: Option<u64>) -> Vec<AclLogEntry>;          // ACL 安全日志
    acl_log_reset() -> ();                                    // ACL 清空安全日志
    acl_dryrun(username: String, command: String) -> String;  // ACL 模拟测试
    command_logs(limit: Option<u64>) -> Vec<CommandLogEntry>; // 命令日志（打开面板时拉快照）
    command_logs_clear() -> ();                               // 清空命令日志
    // 以下方法需要 app_handle（内部从 MeBase 获取）
    monitor(node: &str) -> ();                  // 监控命令
    subscribe(channel: Option<String>) -> ();   // 订阅消息
    export_csv(param: RedisExportCsv) -> ();    // 导出CSV
    import_csv(param: RedisImportCsv) -> ();    // 导入CSV
    import_cmd(file: String) -> ();             // 导入命令
);
