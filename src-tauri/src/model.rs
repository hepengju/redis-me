use serde::{Deserialize, Serialize};

// 连接
// #[derive(Debug, Builder, Deserialize, Serialize)]
// pub struct Connection {
//     name: String,
//
//     ip: String,
//     port: i32,
//     username: Option<String>,
//     password: Option<String>,
//
//     ssh: Option<bool>,
//     ssl: Option<bool>,
//     sentinel: Option<bool>,
//     cluster: Option<bool>,
// }
#[derive(Debug, Deserialize, Serialize, Default)]
pub struct RedisNode {
    pub node: String,
    pub isMaster: bool,
    pub slaveOfNode: String
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct ScanParam {
    pub id: String,

    // #[serde(default = "*")]
    pub pattern: String,

    // #[serde(default = "1000")]
    pub count: usize,

    pub scan_type: Option<String>,
}

/// Redis键: 由于键是字节存储的，考虑转换为utf-8字符串显示后可能会丢失信息，因此封装为对象
#[derive(Debug, Deserialize, Serialize)]
pub struct RedisKey {
    pub key: String,    // 显示
    pub bytes: Vec<u8>, // 修改、删除等依据
}

pub struct RedisValue {
    // pub _type: String,
    // pub ttl: u64,
    // pub value: Object,
    // pub rawValue:
}
