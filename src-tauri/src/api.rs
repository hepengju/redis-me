#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::util::{to_me_result, ApiResult};
use crate::model::{RedisNode, RedisValue, ScanParam, ScanResult};
use crate::{service};

#[tauri::command]
pub fn info(id: &str, node: Option<&str>) -> ApiResult<String> {
    to_me_result(service::info(id, node))
}

/// 节点列表
#[tauri::command]
pub fn node_list(id: &str) -> ApiResult<Vec<RedisNode>> {
    to_me_result(service::node_list(id))
}

/// 扫描
#[tauri::command]
pub fn scan(id: &str, param: ScanParam) -> ApiResult<ScanResult> {
    to_me_result(service::scan(id, param))
}

/// 获取值
#[tauri::command]
pub fn get(id: &str, key: Vec<u8>, hash_key: Option<String>) -> ApiResult<RedisValue> {
    to_me_result(service::get(id, key, hash_key))
}