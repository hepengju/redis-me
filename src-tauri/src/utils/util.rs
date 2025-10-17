use crate::utils::model::{RedisClientInfo, RedisSlowLog};
use anyhow::bail;
use chrono::DateTime;
use log::error;
use rand::distr::{Alphanumeric, SampleString};
use rand::prelude::IteratorRandom;
use rand::Rng;
use redis::{FromRedisValue, Value};
use std::collections::HashMap;

// 统一应用返回值
pub type AnyResult<T> = anyhow::Result<T>;
pub type ApiResult<T> = Result<T, String>;

// 常量定义
pub const REDIS_ME_FIELD_TO_DELETE_TMP_VALUE: &str = "REDIS_ME_FIELD_TO_DELETE_TMP_VALUE";
pub const REDIS_ME_SUBSCRIBE_STOP_CHANNEL: &str = "REDIS_ME_PUBLISH_STOP_CHANNEL_MESSAGE";

// tauri的错误处理中需要返回的错误实现序列化, anyhow的错误并没有实现，因此简单返回字符串错误
pub fn to_api_result<T>(result: anyhow::Result<T>) -> ApiResult<T> {
    match result {
        Ok(value) => Ok(value),
        Err(err) => {
            error!("错误: {}", err.to_string());
            Err(err.to_string())
        }
    }
}

// 字节数组转字符串: 无效的 UTF-8 字节显示为十六进制转义（如 \xFF） [DeepSeek]
pub fn vec8_to_display_string(bytes: &[u8]) -> String {
    //unsafe { String::from_utf8_unchecked(v) }
    let mut result = String::new();
    let mut pos = 0;
    while pos < bytes.len() {
        // 尝试将剩余字节解码为 UTF-8
        match std::str::from_utf8(&bytes[pos..]) {
            Ok(s) => {
                // 全部有效，直接追加字符串
                result.push_str(s);
                pos = bytes.len();
            }
            Err(e) => {
                // 存在无效字节
                let valid_up_to = e.valid_up_to();
                // 处理有效部分
                if valid_up_to > 0 {
                    if let Ok(s) = std::str::from_utf8(&bytes[pos..(pos + valid_up_to)]) {
                        result.push_str(s);
                    }
                    pos += valid_up_to;
                }
                // 处理无效部分
                if let Some(error_len) = e.error_len() {
                    // 逐个转义错误字节（最多处理剩余的字节长度）
                    let end = std::cmp::min(pos + error_len, bytes.len());
                    for byte in &bytes[pos..end] {
                        result.push_str(&format!("\\x{:02x}", byte));
                    }
                    pos = end;
                } else {
                    // 无法确定错误长度，转义当前字节
                    result.push_str(&format!("\\x{:02x}", bytes[pos]));
                    pos += 1;
                }
            }
        }
    }
    result
}

// 字节数组转Base64字符串: RedisKey 的 bytes
// pub fn vec8_to_base64_string(bytes: &[u8]) -> String {
//     BASE64_STANDARD.encode(bytes)
// }

// 断言
pub fn assert_is_true(value: bool, message: String) -> AnyResult<()> {
    if value { Ok(()) } else { bail!(message) }
}

// vec中随机选择一个
pub fn random_item<T>(vec: &Vec<T>) -> &T {
    vec.iter().choose(&mut rand::rng()).unwrap()
}

// 随机N个字符
pub fn random_string(len: usize) -> String {
    Alphanumeric.sample_string(&mut rand::rng(), len)
}

// 随机范围
pub fn random_range(min: i32, max: i32) -> i32 {
    rand::rng().random_range(min..=max)
}

// 解析命令: 主要考虑解析带有引号的参数, 比如: config set save "3600 1 300 100 60 10000"
pub fn parse_command(command: &str) -> AnyResult<(String, Vec<String>)> {
    let tokens = shell_words::split(command)?;
    let first = tokens.first().cloned().unwrap_or_default();
    let other = tokens.into_iter().skip(1).collect();
    Ok((first, other))
}

// 命令返回值转换
pub fn redis_value_to_string(value: Value, sep: &str) -> String {
    match value {
        // 参考 FromRedisValue::from_redis_value
        Value::BulkString(bytes) => vec8_to_display_string(&bytes),
        Value::Okay => "OK".to_string(),
        Value::SimpleString(val) => val,
        Value::VerbatimString {
            format: _,
            ref text,
        } => text.to_string(),
        Value::Double(val) => val.to_string(),
        Value::Int(val) => val.to_string(),
        // 以下为扩展补充的
        Value::Nil => "".to_string(),
        Value::Boolean(val) => val.to_string(),
        Value::BigNumber(bigint) => bigint.to_string(),
        Value::Array(vec) => vec
            .into_iter()
            .map(|v| redis_value_to_string(v, sep))
            .collect::<Vec<String>>()
            .join(sep),
        Value::Set(set) => set
            .into_iter()
            .map(|v| redis_value_to_string(v, sep))
            .collect::<Vec<String>>()
            .join(sep),
        Value::Map(map) => map
            .into_iter()
            .map(|(k, v)| (redis_value_to_string(k, sep), redis_value_to_string(v, sep)))
            .map(|(k, v)| format!("{}: {}", k, v))
            .collect::<Vec<String>>()
            .join(sep),
        // 其余暂不解析, 直接转换为字符串
        _ => format!("{:?}", value),
    }
}

// 慢查询结果转换
pub fn redis_value_to_log(value: Value, node: &str) -> AnyResult<RedisSlowLog> {
    let items = match value {
        Value::Array(arr) if arr.len() >= 4 => arr,
        Value::Array(_) => bail!("慢查询条目至少4个元素"),
        _ => bail!("应为慢查询条目的数组"),
    };

    let id: u64 = FromRedisValue::from_redis_value_ref(&items[0])?;
    let time = timestamp_to_string(FromRedisValue::from_redis_value_ref(&items[1])?);
    let cost: f64 = FromRedisValue::from_redis_value_ref(&items[2])?;
    let command: String = redis_value_to_string(items[3].clone(), " ");
    let client: String = if items.len() > 5 {
        FromRedisValue::from_redis_value_ref(&items[4])?
    } else {
        "".into()
    };

    let client_name: String = if items.len() > 6 {
        FromRedisValue::from_redis_value_ref(&items[5])?
    } else {
        "".into()
    };

    Ok(RedisSlowLog {
        node: node.to_string(),
        id,
        time,
        cost: cost / 1000.0,
        command,
        client,
        client_name,
    })
}

// 时间戳(秒)转字符串
pub fn timestamp_to_string(timestamp: i64) -> String {
    let datetime = DateTime::from_timestamp(timestamp, 0)
        .unwrap()
        .with_timezone(&chrono_tz::Asia::Shanghai);
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}

// 解析客户端信息
pub fn parse_client_info(client_info: &str) -> AnyResult<RedisClientInfo> {
    let mut map = HashMap::with_capacity(32);

    for key_eq_val in client_info.split_whitespace().into_iter() {
        if let Some((key, val)) = key_eq_val.split_once("=") {
            map.insert(key, val);
        }
    }

    let json = serde_json::to_string(&map)?;
    let client: RedisClientInfo = serde_json::from_str(&json)?;
    Ok(client)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::model::RedisKey;
    use base64::prelude::BASE64_STANDARD;
    use base64::Engine;

    #[test]
    fn test_serde() -> AnyResult<()> {
        let key = RedisKey {
            key: "hepengju".to_string(),
            bytes: "hepengju".into(),
        };

        let json = serde_json::to_string(&key)?;
        println!("json: {}", json);
        // json: {"key":"hepengju","bytes":[104,101,112,101,110,103,106,117]}
        let base64 = BASE64_STANDARD.encode(b"hepengju");
        println!("base64: {}", base64);
        // base64: aGVwZW5nanU=
        Ok(())
    }

    #[test]
    fn test_parse_command() -> () {
        // cmd: , args: []
        // cmd: ping, args: []
        // cmd: set, args: ["name", "hepengju"]
        // cmd: config, args: ["set", "save", "3600 1 300 100 60 10000"]
        // cmd: config, args: ["set", "save", "3600 1 300 100 60 10000"]
        let (cmd, args) = parse_command("").unwrap();
        println!("cmd: {}, args: {:?}", cmd, args);
        let (cmd, args) = parse_command("ping").unwrap();
        println!("cmd: {}, args: {:?}", cmd, args);
        let (cmd, args) = parse_command("set name hepengju").unwrap();
        println!("cmd: {}, args: {:?}", cmd, args);
        let (cmd, args) = parse_command(r#"config set save "3600 1 300 100 60 10000" "#).unwrap();
        println!("cmd: {}, args: {:?}", cmd, args);
        let (cmd, args) = parse_command(r#"config set save '3600 1 300 100 60 10000' "#).unwrap();
        println!("cmd: {}, args: {:?}", cmd, args);
    }

    #[test]
    fn test_timestamp_to_string() {
        let timestamp = 1759409274;
        println!("{}", timestamp_to_string(timestamp));
    }
}
