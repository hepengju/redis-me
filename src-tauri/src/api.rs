#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::model::{RedisFieldAdd, RedisFieldDel, RedisFieldSet, RedisNode, RedisValue, ScanParam, ScanResult};
use crate::util::{ApiResult, to_api_result};
use crate::{api_command, service};

// 信息: 原始写法，下面用宏简化一下
// #[tauri::command]
// pub fn info(id: &str, node: Option<&str>) -> ApiResult<String> {
//     to_api_result(service::info(id, node))
// }

// 信息
api_command!(info(id: &str, node: Option<&str>) -> String);

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

#[cfg(test)]
mod tests {
    use crate::api::*;
    use crate::model::{RedisFieldValue, ScanCursor, ScanParam};
    use crate::service::{del, field_add, get, node_list, scan};

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
    fn test_get() {
        let value = get("test", "hepengju:list".into(), None).unwrap();
        println!("{value:#?}");
        println!("{}", serde_json::to_string(&value).unwrap());

        let value = get("test", "hepengju:string".into(), None).unwrap();
        println!("{}", serde_json::to_string(&value).unwrap());
    }

    #[test]
    fn test_field_add() {
        del("test", "redis_me:string".into()).unwrap();

        field_add(
            "test",
            RedisFieldAdd {
                key: "redis_me:string".into(),
                bytes: vec![],
                mode: "key".into(),
                key_type: "string".into(),
                ttl: -1,
                value: "字符串值".into(),
                list_push_method: "".into(),
                field_value_list: vec![],
            },
        )
        .unwrap();

        field_add(
            "test",
            RedisFieldAdd {
                key: "".into(),
                bytes: "redis_me:hash".into(),
                mode: "field".into(),
                key_type: "hash".into(),
                ttl: -1,
                value: "".into(),
                list_push_method: "".into(),
                field_value_list: vec![
                    RedisFieldValue {
                        field_key: "hash_key1".into(),
                        field_value: "value1".into(),
                        field_score: 0.0,
                    },
                    RedisFieldValue {
                        field_key: "hash_key2".into(),
                        field_value: "value2".into(),
                        field_score: 0.0,
                    },
                ],
            },
        )
        .unwrap();
    }
}
