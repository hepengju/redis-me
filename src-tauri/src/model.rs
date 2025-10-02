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

// Zset条目
api_model!( RedisZetItem {
    value: String,
    score: f64,
});

// 字段新增
api_model!( RedisFieldAdd {
    key: String,     // 新增键时输入key
    bytes: Vec<u8>,  // 键已经存在时，新增字段时输入旧键的bytes
    mode: String,    // key-新增键, field-新增字段

    #[serde(rename = "type")]
    key_type: String,
    ttl: i64,
    value: String, // 字段类型为String时的值

    list_push_method: String, // lpush, rpush
    field_value_list: Vec<RedisFieldValue>,
});

// 字段修改
api_model!( RedisFieldSet {
    bytes: Vec<u8>,
    src_field_key: String,
    src_field_value: String,
    field_index: isize,
    field_key: String,
    field_value: String,
    field_score: f64,
});

// 字段值
api_model!( RedisFieldValue {
    field_key: String,
    field_value: String,
    field_score: f64,
});

// 字段删除
api_model!( RedisFieldDel {
    bytes: Vec<u8>,
    field_index: isize,
    field_key: String,
    field_value: String,
});

// 执行命令
api_model!( RedisCommand {
    command: String,
    node: Option<String>,
    auto_broadcast: bool,
});