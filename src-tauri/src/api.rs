use crate::client::state::ClientAccess;
use crate::api_command;
use crate::utils::model::*;
use crate::utils::util::*;
use std::collections::HashMap;
use tauri::AppHandle;

// 信息: 原始写法，下面用宏简化一下
// #[tauri::command]
// pub fn demo(app_handle: AppHandle, id: &str, node: Option<String>) -> ApiResult<RedisInfo> {
//     to_api_result(app_handle.get_client(id).and_then(|client| client.info(node)))
// }

// 信息
api_command!(info(app_handle: AppHandle, id: &str, node: Option<String>) -> RedisInfo);

// 信息列表
api_command!(info_list(app_handle: AppHandle, id: &str) -> Vec<RedisInfo>);

// 节点列表
api_command!(node_list(app_handle: AppHandle, id: &str) -> Vec<RedisNode>);

// 扫描
api_command!(scan(app_handle: AppHandle, id: &str, param: ScanParam) -> ScanResult);

// 获取值
api_command!(get(app_handle: AppHandle, id: &str, key: Vec<u8>, hash_key: Option<String>) -> RedisValue);

// 设置TTL
api_command!(ttl(app_handle: AppHandle, id: &str, key: Vec<u8>, ttl: i64) -> ());

// 设置值
api_command!(set(app_handle: AppHandle, id: &str, key: Vec<u8>, value: String, ttl: i64) -> ());

// 删除键
api_command!(del(app_handle: AppHandle, id: &str, key: Vec<u8>) -> ());

// 新增字段
api_command!(field_add(app_handle: AppHandle, id: &str, param: RedisFieldAdd) -> ());

// 编辑字段
api_command!(field_set(app_handle: AppHandle, id: &str, param: RedisFieldSet) -> ());

// 删除字段
api_command!(field_del(app_handle: AppHandle, id: &str, param: RedisFieldDel) -> ());

// 执行命令
api_command!(execute_command(app_handle: AppHandle, id: &str, param: RedisCommand) -> String);

// 获取配置
api_command!(config_get(app_handle: AppHandle, id: &str, pattern: &str, node: Option<String>) -> HashMap<String, String>);

// 设置配置
api_command!(config_set(app_handle: AppHandle, id: &str, key: &str, value: &str, node: Option<String>) -> ());

// 慢日志
api_command!(slow_log(app_handle: AppHandle, id: &str, count: Option<u64>, node: Option<String>) -> Vec<RedisSlowLog>);

// 内存分析
api_command!(memory_usage(app_handle: AppHandle, id: &str, param: RedisMemoryParam) -> Vec<RedisKeySize>);

// 客户端列表
api_command!(client_list(app_handle: AppHandle, id: &str, node: Option<String>, client_type: Option<String>) -> Vec<RedisClientInfo>);

// 监控命令
api_command!(monitor(app_handle: AppHandle, id: &str, node: &str, seconds: Option<u32>) -> ());

// 发布消息
api_command!(publish(app_handle: AppHandle, id: &str, channel: &str, message: &str) -> ());

// 订阅消息
api_command!(subscribe(app_handle: AppHandle, id: &str, channel: &str, seconds: Option<u32>) -> ());

// 模拟数据
api_command!(mock_data(app_handle: AppHandle, id: &str, count: u64) -> ());
