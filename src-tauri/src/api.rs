#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::model::{RedisNode, ScanParam};
use crate::service;

pub type MeResult<T> = Result<T, anyhow::Error>;

/// 信息
#[tauri::command]
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    service::info(id, node)
}

/// 节点列表
#[tauri::command]
pub fn node_list(id: &str) -> MeResult<Vec<RedisNode>> {
    service::node_list(id)
}

/// 扫描
#[tauri::command]
pub fn scan(id: &str, param: ScanParam) -> MeResult<Vec<String>> {
    todo!()
}
