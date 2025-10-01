#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::model::{RedisNode, RedisValue, ScanParam, ScanResult};
use crate::util::{to_api_result, ApiResult};
use crate::service;

#[tauri::command]
pub fn info(id: &str, node: Option<&str>) -> ApiResult<String> {
    to_api_result(service::info(id, node))
}

/// 节点列表
#[tauri::command]
pub fn node_list(id: &str) -> ApiResult<Vec<RedisNode>> {
    to_api_result(service::node_list(id))
}

/// 扫描
#[tauri::command]
pub fn scan(id: &str, param: ScanParam) -> ApiResult<ScanResult> {
    to_api_result(service::scan(id, param))
}

/// 获取值
#[tauri::command]
pub fn get(id: &str, key: Vec<u8>, hash_key: Option<String>) -> ApiResult<RedisValue> {
    to_api_result(service::get(id, key, hash_key))
}

/// 设置TTL
#[tauri::command]
pub fn ttl(id: &str, key: Vec<u8>, ttl: i64) -> ApiResult<i64> {
    to_api_result(service::ttl(id, key, ttl))
}

/// 设置值
#[tauri::command]
pub fn set(id: &str, key:Vec<u8>, value: String, ttl: i64) -> ApiResult<String> {
    to_api_result(service::set(id, key, value, ttl))
}

/// 删除键
#[tauri::command]
pub fn del(id: &str, key: Vec<u8>) -> ApiResult<i64> {
    to_api_result(service::del(id, key))
}


