#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::util::{to_me_result, MeResult};
use crate::model::{RedisNode, RedisValue, ScanParam, ScanResult};
use crate::service;

/// 信息
#[tauri::command]
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    to_me_result(service::info(id, node))
}

/// 节点列表
#[tauri::command]
pub fn node_list(id: &str) -> MeResult<Vec<RedisNode>> {
    to_me_result(service::node_list(id))
}

/// 扫描
#[tauri::command]
pub fn scan(id: &str, param: ScanParam) -> MeResult<ScanResult> {
    to_me_result(service::scan(id, param))
}

/// 获取值
#[tauri::command]
pub fn get(id: &str, key: Vec<u8>, hash_key: Option<String>) -> MeResult<RedisValue> {
    to_me_result(service::get(id, key, hash_key))
}