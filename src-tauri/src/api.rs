use crate::api_command;
use crate::client::state::ClientAccess;
use crate::utils::model::*;
use crate::utils::util::*;
use log::info;
use std::collections::HashMap;
use tauri::{AppHandle, command};

// 默认演示李明亮
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 信息: 原始写法，其余用宏简化一下
#[command]
pub fn connect(app_handle: AppHandle, id: &str) -> ApiResult<()> {
    to_api_result(app_handle.connect(id)).and_then(|_| {
        info!("{} connect success", id);
        Ok(())
    })
}

#[command]
pub fn disconnect(app_handle: AppHandle, id: &str) -> ApiResult<()> {
    to_api_result(app_handle.disconnect(id))
}

// 信息
api_command!(info(node: Option<String>) -> RedisInfo);

// 信息列表
api_command!(info_list() -> Vec<RedisInfo>);

// 节点列表
api_command!(node_list() -> Vec<RedisNode>);

// 扫描
api_command!(scan(param: ScanParam) -> ScanResult);

// 获取值
api_command!(get(key: RedisKey, hash_key: Option<String>) -> RedisValue);

// 设置TTL
api_command!(ttl(key: RedisKey, ttl: i64) -> ());

// 设置值
api_command!(set(key: RedisKey, value: String, ttl: i64) -> ());

// 删除键
api_command!(del(key: RedisKey) -> ());

// 批量删除
api_command!(batch_del(key: RedisBatchDelete) -> ());

// 新增字段
api_command!(field_add(param: RedisFieldAdd) -> ());

// 编辑字段
api_command!(field_set(param: RedisFieldSet) -> ());

// 删除字段
api_command!(field_del(param: RedisFieldDel) -> ());

// 执行命令
api_command!(execute_command(param: RedisCommand) -> String);

// 获取配置
api_command!(config_get(pattern: &str, node: Option<String>) -> HashMap<String, String>);

// 设置配置
api_command!(config_set(key: &str, value: &str, node: Option<String>) -> ());

// 慢日志
api_command!(slow_log(count: Option<u64>, node: Option<String>) -> Vec<RedisSlowLog>);

// 内存分析
api_command!(memory_usage(param: RedisMemoryParam) -> Vec<RedisKeySize>);

// 客户端列表
api_command!(client_list(node: Option<String>, client_type: Option<String>) -> Vec<RedisClientInfo>);

// 发布消息
api_command!(publish(channel: &str, message: &str) -> ());

// 订阅消息
api_command!(subscribe(channel: Option<String>) -> ());
api_command!(subscribe_stop() -> ());

// 监控命令
api_command!(monitor(node: &str) -> ());
api_command!(monitor_stop(node: &str) -> ());

// 模拟数据
api_command!(mock_data(count: u64) -> ());
