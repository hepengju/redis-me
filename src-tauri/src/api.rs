#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::model::{
    RedisCommand, RedisFieldAdd, RedisFieldDel, RedisFieldSet, RedisInfo, RedisKeySize,
    RedisMemoryParam, RedisNode, RedisSlowLog, RedisValue, ScanParam, ScanResult,
};
use crate::util::{ApiResult, to_api_result};
use crate::{api_command, service};
use std::collections::HashMap;

// 信息: 原始写法，下面用宏简化一下
// #[tauri::command]
// pub fn info(id: &str, node: Option<&str>) -> ApiResult<String> {
//     to_api_result(service::info(id, node))
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

// 模拟数据
api_command!(mock_data(id: &str, count: usize) -> ());

// 执行命令
api_command!(execute_command(id: &str, param: RedisCommand) -> String);

// 获取配置
api_command!(config_get(id: &str, pattern: &str, node: Option<String>) -> HashMap<String, String>);

// 设置配置
api_command!(config_set(id: &str, key: &str, value: &str, node: Option<String>) -> ());

// 慢日志
api_command!(slow_log(id: &str, count: Option<usize>, node: Option<String>) -> Vec<RedisSlowLog>);

// 内存分析
api_command!(memory_usage(id: &str, param: RedisMemoryParam) -> Vec<RedisKeySize>);

#[cfg(test)]
mod tests {
    use std::time::Duration;
    use redis::cluster::{ClusterClient, ClusterPipeline};
    use redis::TlsMode;
    use crate::conn::get_conn;
    use super::*;
    use crate::model::{RedisFieldAdd, RedisFieldValue, ScanCursor, ScanParam};
    use crate::service::{del, field_add, get, node_list, scan};
    use crate::util::AnyResult;

    #[test]
    fn test_info() {
        let result = info("test", None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_node() {
        let result = info("test", Some("192.168.1.11:7006".into())).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_list() {
        let vec = info_list("test").unwrap();
        println!("vec: {vec:#?}")
    }

    #[test]
    fn test_node_list() {
        let vec = node_list("test").unwrap();
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

    #[test]
    fn test_mock_data() {
        mock_data("test", 10).unwrap();
    }

    #[test]
    fn test_execute_command() {
        mock_command("ping");
        mock_command("cluster info");
        mock_command("cluster slots");
        mock_command("config get save");
        mock_command("config get *");
        mock_command(r#"config set save "3600 1 300 100 60 10000" "#);
    }

    fn mock_command(command: &str) {
        let result = execute_command(
            "test",
            RedisCommand {
                command: command.into(),
                node: None,
                auto_broadcast: true,
            },
        );
        println!("{result:#?}");
    }

    #[test]
    fn test_config_get() {
        let result = config_get("test", "*", None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_config_set() {
        let result = config_set("test", "save", "3600 2 300 100 60 10000", None).unwrap();
        println!("{result:#?}");
        let result = config_set(
            "test",
            "save",
            "3600 2 300 100 60 10000",
            Some("10.106.0.167:7005".into()),
        )
        .unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_slow_log() {
        let result = slow_log("test", Some(3), Some("10.106.0.167:7005".into())).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_memory_usage() {
        let result = memory_usage("test", RedisMemoryParam {
            pattern: None,
            size_limit: 1,
            count_limit: 100,
            scan_count: 1000,
            scan_total: 10000,
            sleep_millis: 0
        }).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_cluster_pipeline() -> AnyResult<()> {
        let mut conn = get_conn("test")?;
        let mut pipe = ClusterPipeline::with_capacity(5);

        pipe.cmd("memory").arg("usage").arg("redis-me-mock:string:25gdlqZlLv");
        pipe.cmd("memory").arg("usage").arg("redis-me-mock:string:7C9V7PrOAt");
        pipe.cmd("memory").arg("usage").arg("redis-me-mock:string:7xpp7PJrxe");
        pipe.cmd("memory").arg("usage").arg("redis-me-mock:string:x09Ylj6WrN");
        pipe.cmd("memory").arg("usage").arg("redis-me-mock:string:not_exist");

        let sizes: Vec<Option<usize>> = pipe.query(&mut conn)?;
        println!("{sizes:#?}");
        Ok(())
    }

    // https://github.com/redis-rs/redis-rs/issues/1814
    #[test]
    fn test_cluster_pipeline_reproduce() -> anyhow::Result<()> {
        // redis cluster: 7001 ~ 7006, with ssl and password
        let nodes = vec!["rediss://192.168.1.11:7001"];
        let client = ClusterClient::builder(nodes)
            .tls(TlsMode::Insecure)
            .password("hepengju".into())
            .build()?;
        let mut conn = client.get_connection()?;

        // get
        let mut pipe = ClusterPipeline::new();
        pipe.cmd("get").arg("hepengju:string1");
        pipe.cmd("get").arg("hepengju:string2");
        pipe.cmd("get").arg("hepengju:string3");
        let results: Vec<String> = pipe.query(&mut conn)?;
        println!("{results:?}");
        // ["string1value", "string2value", "string3value"]

        // memory usage
        pipe = ClusterPipeline::new();
        pipe.cmd("memory").arg("usage").arg("hepengju:string1");
        pipe.cmd("memory").arg("usage").arg("hepengju:string2");
        pipe.cmd("memory").arg("usage").arg("hepengju:string3");
        let sizes: Vec<Option<usize>> = pipe.query(&mut conn)?;
        // Error: An error was signalled by the server - Moved: 14021 192.168.1.11:7005
        println!("{sizes:?}");

        Ok(())
    }
}
