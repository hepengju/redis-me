#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use serde::{Deserialize, Serialize};
use crate::api_model;

// 集群节点
api_model!( RedisNode {
    id: String,
    node: String,
    is_master: bool,
    slave_of_node: Option<String>
});

// 扫描参数
api_model!( ScanParam {
    id: String,
    pattern: String,
    count: usize,
    scan_type: Option<String>,
});

// Redis键: 由于键是字节存储的，考虑转换为utf-8字符串显示后可能会丢失信息，因此封装为对象
api_model!( RedisKey {
    key: String,    // 显示
    bytes: Vec<u8>, // 修改、删除等依据
}
);

// Redis值
// api_model!( RedisValue {
//     key_type: String,
//     ttl: u64,
//     value: dyn Any,
//     rawValue: Vec<u8>,
// });
