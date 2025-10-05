use crate::utils::state::ClientAccess;
use crate::api_command;
use crate::utils::model::*;
use crate::utils::util::*;
use std::collections::HashMap;
use log::info;
use tauri::{command, AppHandle};

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
api_command!(get(key: Vec<u8>, hash_key: Option<String>) -> RedisValue);

// 设置TTL
api_command!(ttl(key: Vec<u8>, ttl: i64) -> ());

// 设置值
api_command!(set(key: Vec<u8>, value: String, ttl: i64) -> ());

// 删除键
api_command!(del(key: Vec<u8>) -> ());

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

// 监控命令
api_command!(monitor(node: &str, seconds: Option<u32>) -> ());

// 发布消息
api_command!(publish(channel: &str, message: &str) -> ());

// 订阅消息
api_command!(subscribe(channel: &str, seconds: Option<u32>) -> ());

// 模拟数据
api_command!(mock_data(count: u64) -> ());
