use crate::model::ScanParam;

pub type MeResult<T> = Result<T, anyhow::Error>;

/// 信息
#[tauri::command]
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    todo!()
}

/// 节点列表
#[tauri::command]
pub fn node_list(id: &str, node: Option<&str>) -> MeResult<Vec<String>> {
    todo!()
}

/// 扫描
#[tauri::command]
pub fn scan(id: &str, param: ScanParam) -> MeResult<Vec<String>> {
    todo!()
}
