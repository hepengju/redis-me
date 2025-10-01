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

#[cfg(test)]
mod tests {
    use crate::model::{ScanCursor, ScanParam};
    use crate::api::*;

    // 初始化日志, 避免所有测试方法都需要额外调用init方法
    // #[ctor::ctor]
    // fn init() {
    //     let _ = env_logger::builder()
    //         .filter_level(LevelFilter::Info)
    //         .is_test(true)
    //         .try_init();
    // }

    #[test]
    fn test_info() {
        let result = info("test", None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_node() {
        let result = info("test", Some("192.168.1.11:7001")).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_node_list() {
        let vec = node_list("1").unwrap();
        println!("vec: {vec:#?}")
    }

    #[test]
    fn test_scan() {
        let param = ScanParam {
            pattern: "*".into(),
            count: 10,
            scan_type: None,

            cursor: ScanCursor {
                ready_nodes: vec![],
                now_node: "".into(),
                now_cursor: 0,
                finished: false,
            },
            load_all: false,
        };
        let result1 = scan("test", param).unwrap();
        println!("{result1:#?}");

        let param2 = ScanParam {
            pattern: "*".into(),
            count: 10,
            scan_type: None,
            cursor: result1.cursor,
            load_all: false,
        };
        let result2 = scan("test", param2).unwrap();
        println!("{result2:#?}");
    }

    #[test]
    fn test_get(){
        let value = get("test", "hepengju:list".into(), None).unwrap();
        println!("{value:#?}");
        println!("{}", serde_json::to_string(&value).unwrap());

        let value = get("test", "hepengju:string".into(), None).unwrap();
        println!("{}", serde_json::to_string(&value).unwrap());
    }
}
