use crate::api_commands;
use crate::client::state::ClientAccess;
use crate::utils::model::*;
use crate::utils::util::*;
use log::info;
use std::collections::HashMap;
use tauri::{command, AppHandle};

// 默认示例
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 信息: 原始写法，其余用宏简化一下
#[command]
pub fn connect(app_handle: AppHandle, id: &str) -> ApiResult<()> {
    to_api_result(app_handle.connect(id)).and_then(|_| Ok(()))
}

#[command]
pub fn disconnect(app_handle: AppHandle, id: &str) -> ApiResult<()> {
    to_api_result(app_handle.disconnect(id))
}

// 使用宏简化代码
// to_api_result(app_handle.get_client(id).and_then(|client| client.$name($($param),*)))
api_commands!(
    info(node: Option<String>) -> RedisInfo; // 信息
    info_list() -> Vec<RedisInfo>;           // 信息列表
    node_list() -> Vec<RedisNode>;           // 节点列表
    scan(param: ScanParam) -> ScanResult;    // 扫描
    get(key: RedisKey, hash_key: Option<String>) -> RedisValue; // 获取值
    ttl(key: RedisKey, ttl: i64) -> ();                 // 设置TTL
    set(key: RedisKey, value: String, ttl: i64) -> ();  // 设置值
    del(key: RedisKey) -> ();                           // 删除键
    batch_del(param: RedisBatchDelete) -> ();           // 批量删除
    field_add(param: RedisFieldAdd) -> ();              // 新增字段
    field_set(param: RedisFieldSet) -> ();              // 编辑字段
    field_del(param: RedisFieldDel) -> ();              // 删除字段
    execute_command(param: RedisCommand) -> String;     // 执行命令
    config_get(pattern: &str, node: Option<String>) -> HashMap<String, String>; // 获取配置
    config_set(key: &str, value: &str, node: Option<String>) -> ();             // 设置配置
    slow_log(count: Option<u64>, node: Option<String>) -> Vec<RedisSlowLog>;    // 慢日志
    memory_usage(param: RedisMemoryParam) -> Vec<RedisKeySize>;                 // 内存分析
    client_list(node: Option<String>, client_type: Option<String>) -> Vec<RedisClientInfo>; // 客户端列表
    publish(channel: &str, message: &str) -> (); // 发布消息
    subscribe(channel: Option<String>) -> ();    // 订阅消息
    subscribe_stop() -> ();
    monitor(node: &str) -> ();                   // 监控命令
    monitor_stop(node: &str) -> ();
    mock_data(count: u64) -> ();                 // 模拟数据
);
