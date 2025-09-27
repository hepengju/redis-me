use crate::model::ScanParam;
use crate::service::info;

pub type MeResult<T> = Result<T, anyhow::Error>;

/// 信息
#[tauri::command]
pub fn api_info(id: &str, node: Option<&str>) -> MeResult<String> {
    info(id, node)
}

/// 节点列表
#[tauri::command]
pub fn api_node_list(id: &str, node: Option<&str>) -> MeResult<Vec<String>> {
    todo!()
}

/// 扫描
#[tauri::command]
pub fn scan(id: &str, param: ScanParam) -> MeResult<Vec<String>> {
    todo!()
}
