use bon::{Builder};
use serde::{Deserialize, Serialize};

// 连接
#[derive(Debug, Builder, Deserialize, Serialize)]
pub struct Connection {
    name: String,

    ip: String,
    port: i32,
    username: Option<String>,
    password: Option<String>,

    ssh: Option<bool>,
    ssl: Option<bool>,
    sentinel: Option<bool>,
    cluster: Option<bool>,
}

pub struct RedisKey {

}

pub struct RedisValue {

}