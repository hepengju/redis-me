use anyhow::bail;
use rand::Rng;
use rand::distr::{Alphanumeric, SampleString};
use rand::prelude::IteratorRandom;
use redis::{FromRedisValue, RedisResult, Value};
use serde::ser::{SerializeMap, SerializeSeq};
use serde::{Serialize, Serializer};
use std::ops::Deref;
use std::str::from_utf8;

// 统一应用返回值
pub type AnyResult<T> = anyhow::Result<T>;
pub type ApiResult<T> = Result<T, String>;

// tauri的错误处理中需要返回的错误实现序列化, anyhow的错误并没有实现，因此简单返回字符串错误
pub fn to_api_result<T>(result: anyhow::Result<T>) -> ApiResult<T> {
    match result {
        Ok(value) => Ok(value),
        Err(err) => Err(err.to_string()),
    }
}

// 字节数组转字符串
pub fn vec8_to_string(v: Vec<u8>) -> String {
    unsafe { String::from_utf8_unchecked(v) }
}

// 断言
pub fn assert_is_true(value: bool, message: String) -> AnyResult<()> {
    if value { Ok(()) } else { bail!(message) }
}

// vec中随机选择一个
pub fn random_item<T>(vec: Vec<T>) -> T {
    vec.into_iter().choose(&mut rand::rng()).unwrap()
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
pub fn value_to_string(value: Value) -> String {
    match value {
        // 参考 FromRedisValue::from_redis_value
        Value::BulkString(bytes) => vec8_to_string(bytes),
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
        Value::Boolean( val) => val.to_string(),
        Value::BigNumber(bigint) => bigint.to_string(),
        Value::Array( vec) => {
            vec.into_iter().map(|v| value_to_string(v)).collect::<Vec<String>>().join("\n")
        },
        Value::Set(set) => {
            set.into_iter().map(|v| value_to_string(v)).collect::<Vec<String>>().join("\n")
        },
        Value::Map(map) => {
            map.into_iter()
                .map(|(k, v)| (value_to_string(k), value_to_string(v)))
                .map(|(k, v)| format!("{}: {}", k, v))
                .collect::<Vec<String>>()
                .join("\n")
        },
        // 其余暂不解析
        _ => "Unknown value".to_string(),
    }
}


// Model定义宏（DeepSeek生成）
#[macro_export]
macro_rules! api_model {
    ($struct:ident {
        $(
            $(#[$meta:meta])*  // 匹配字段前的属性
            $field:ident : $type:ty
        ),+
        $(,)?
    }) => {
        #[derive(Serialize, Deserialize, Debug, Clone)]
        #[serde(rename_all = "camelCase")]
        pub struct $struct {
            $(
                $(#[$meta])*    // 展开字段前的属性
                pub $field: $type
            ),+
        }
    };
}

// Api定义宏
#[macro_export]
macro_rules! api_command {
    ($(#[$attr:meta])* $fn_name:ident($($param:ident: $param_type:ty),*) -> $ret:ty) => {
        $(#[$attr])*
        #[tauri::command]
        pub fn $fn_name($($param: $param_type),*) -> ApiResult<$ret> {
            to_api_result(service::$fn_name($($param),*))
        }
    };
}

// #[derive(Debug)]
// struct RedisValueWrapper(pub Value);
//
// impl Serialize for RedisValueWrapper {
//     fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
//     where
//         S: Serializer,
//     {
//         match &self.0 {
//             Value::Nil => serializer.serialize_none(),
//             Value::Int(i) => serializer.serialize_i64(*i),
//             Value::BulkString(bytes) => serializer.serialize_str(vec8_to_string(bytes.clone()).as_str()),
//             Value::Array(vec) => {
//                 let mut seq = serializer.serialize_seq(Some(vec.len()))?;
//                 for v in vec {
//                     seq.serialize_element(&RedisValueWrapper(*v))?;
//                 }
//                 seq.end()
//             }
//             Value::SimpleString(s) => serializer.serialize_str(&s),
//             Value::Okay => serializer.serialize_str("OK"),
//             Value::Map(map) => {
//                 let mut map_ser = serializer.serialize_map(Some(map.len()))?;
//                 for (k, v) in map {
//                     map_ser.serialize_entry(&RedisValueWrapper(*k), &RedisValueWrapper(*v))?;
//                 }
//                 map_ser.end()
//             }
//             Value::Attribute { data, attributes } => {
//                 // TODO
//                 serializer.serialize_str("Value::Attribute")
//             }
//             Value::Set(set) => {
//                 let mut seq = serializer.serialize_seq(Some(set.len()))?;
//                 for v in set {
//                     seq.serialize_element(&RedisValueWrapper(*v))?;
//                 }
//                 seq.end()
//             }
//             Value::Double(f) => serializer.serialize_f64(*f),
//             Value::Boolean(b) => serializer.serialize_bool(*b),
//             Value::VerbatimString { format, text } => {
//                 let mut map = serializer.serialize_map(Some(2))?;
//                 map.serialize_entry("format", &format.to_string())?;
//                 map.serialize_entry("text", &text)?;
//                 map.end()
//             }
//             Value::BigNumber(bigint) => serializer.serialize_str(&bigint.to_string()),
//             Value::Push { kind, data } => {
//                 serializer.serialize_str("Value::Push")
//             }
//             Value::ServerError(err) => {
//                 let mut map = serializer.serialize_map(Some(2))?;
//                 map.serialize_entry("code", &err.code())?;
//                 map.serialize_entry("details", &err.details())?;
//                 map.end()
//             }
//         }
//     }
// }

#[cfg(test)]
mod tests {
    use super::*;

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
}
