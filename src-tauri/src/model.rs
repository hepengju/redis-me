#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::api_model;
use serde::{Deserialize, Serialize};

// 集群节点
api_model!( RedisNode {
    id: String,
    node: String,
    is_master: bool,
    slave_of_node: Option<String>
});

// 扫描参数
api_model!( ScanParam {
    pattern: String,
    count: usize,
    scan_type: Option<String>,

    cursor: ScanCursor,
    load_all: bool,
});

// 扫描游标
api_model!( ScanCursor {
    ready_nodes: Vec<String>,
    now_node: String,
    now_cursor: u64,
    finished: bool,
});

// 扫描结果
api_model!( ScanResult {
    key_list: Vec<RedisKey>,
    cursor: ScanCursor,
});

// Redis键: 由于键是字节存储的，考虑转换为utf-8字符串显示后可能会丢失信息，因此封装为对象
api_model!( RedisKey {
    key: String,    // 显示
    bytes: Vec<u8>, // 修改、删除等依据
});

// Redis值
api_model!( RedisValue {
    #[serde(rename = "type")]
    key_type: String,
    ttl: i64,
    value: serde_json::Value,
});

api_model!( RedisZetItem {
    value: String,
    score: f64,
});

