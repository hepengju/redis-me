#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::api_command;
use crate::model::*;
use crate::client::get_cache_client;
use crate::util::{to_api_result, ApiResult};
use std::collections::HashMap;

// 信息: 原始写法，下面用宏简化一下
// #[tauri::command]
// pub fn info(id: &str, node: Option<String>) -> ApiResult<RedisInfo> {
//     to_api_result(get_cache_client(id).and_then(|client| client.info(node)))
// }

// 信息
api_command!(info(id: &str, node: Option<String>) -> RedisInfo);

// 信息列表
api_command!(info_list(id: &str) -> Vec<RedisInfo>);

// 节点列表
api_command!(node_list(id: &str) -> Vec<RedisNode>);

// 扫描
api_command!(scan(id: &str, param: ScanParam) -> ScanResult);

// 获取值
api_command!(get(id: &str, key: Vec<u8>, hash_key: Option<String>) -> RedisValue);

// 设置TTL
api_command!(ttl(id: &str, key: Vec<u8>, ttl: i64) -> ());

// 设置值
api_command!(set(id: &str, key: Vec<u8>, value: String, ttl: i64) -> ());

// 删除键
api_command!(del(id: &str, key: Vec<u8>) -> ());

// 新增字段
api_command!(field_add(id: &str, param: RedisFieldAdd) -> ());

// 编辑字段
api_command!(field_set(id: &str, param: RedisFieldSet) -> ());

// 删除字段
api_command!(field_del(id: &str, param: RedisFieldDel) -> ());

// 执行命令
api_command!(execute_command(id: &str, param: RedisCommand) -> String);

// 获取配置
api_command!(config_get(id: &str, pattern: &str, node: Option<String>) -> HashMap<String, String>);

// 设置配置
api_command!(config_set(id: &str, key: &str, value: &str, node: Option<String>) -> ());

// 慢日志
api_command!(slow_log(id: &str, count: Option<u64>, node: Option<String>) -> Vec<RedisSlowLog>);

// 内存分析
api_command!(memory_usage(id: &str, param: RedisMemoryParam) -> Vec<RedisKeySize>);

// 客户端列表
api_command!(client_list(id: &str, node: Option<String>, client_type: Option<String>) -> Vec<RedisClientInfo>);

// 监控命令
api_command!(monitor(id: &str, node: &str, seconds: Option<u32>) -> ());

// 发布消息
api_command!(publish(id: &str, channel: &str, message: &str) -> ());

// 订阅消息
api_command!(subscribe(id: &str, channel: &str, seconds: Option<u32>) -> ());

// 模拟数据
api_command!(mock_data(id: &str, count: u64) -> ());
