//! 和 Redis 类型无关的小工具：wire 字节、路径、随机数、超时和命令名映射。
//! 认识某种类型或界面行的转换在 `support::convert`。

use crate::model::*;
use crate::support::error::AppError;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use log::error;
use rand::RngExt;
use rand::distr::{Alphanumeric, SampleString};
use rand::prelude::IteratorRandom;
use redis::Value;
use std::path::PathBuf;
use std::time::Duration;

// 统一应用返回值
pub type AnyResult<T> = anyhow::Result<T>;
pub type ApiResult<T> = Result<T, String>;

// 常量定义
pub const REDIS_ME_FIELD_TO_DELETE_TMP_VALUE: &str = "REDIS_ME_FIELD_TO_DELETE_TMP_VALUE";
pub const REDIS_ME_SUBSCRIBE_STOP_CHANNEL: &str = "REDIS_ME_SUBSCRIBE_STOP_CHANNEL";
/// 通知订阅专用停止频道：与发布订阅的停止频道分开，两个 Tab 同时订阅时互不串扰
pub const REDIS_ME_NOTIFY_STOP_CHANNEL: &str = "REDIS_ME_NOTIFY_STOP_CHANNEL";
pub const CONNECTION_CHECK_SECONDS: i64 = 30; // 30s 检查 1 次连接，避免频繁检查
/// 已有连接的探活 PING。活连接通常远小于 1 秒；死连接少等，避免点击卡住。
/// 测试连接和首次建连走 `CONNECTION_CONNECT_TIMEOUT`，不用这个值。
pub const CONNECTION_CHECK_TIMEOUT: Duration = Duration::from_secs(1);
pub const CONNECTION_LOCK_TIMEOUT: Duration = Duration::from_secs(10); // 取连接等锁
/// 空闲超过此时长不再 PING，直接重连。
///
/// `is_open` 只在某次读写已经失败后才变 false。NAT、防火墙、云负载均衡静默回收空闲 TCP 时，
/// 标志仍是 true，PING 的读会一直等到 `CONNECTION_CHECK_TIMEOUT`（1 秒），点击就会卡住。
/// 这类回收常见落在 5～15 分钟，10 分钟后探活多半是白等。
/// 30 秒～10 分钟仍 PING：活连接只要一两毫秒，避免把还好的连接拆掉重建。
pub const CONNECTION_STALE_SECONDS: i64 = 10 * 60;
pub const CONNECTION_CONNECT_TIMEOUT: Duration = Duration::from_secs(10); // 建连默认（TCP+握手+PING），设置可覆盖
pub const CONNECTION_NORMAL_TIMEOUT: Duration = Duration::from_secs(30); // 连接操作默认操作时长
/// 集群客户端内部命令重试次数。redis-rs 默认 16 次：当拓扑里的通告地址客户端不可达
/// （如 cluster-announce-ip 配成 127.0.0.1/内网 IP）时，建连验证会「重连种子 + 刷新拓扑」
/// 反复循环而长时间卡死，且单次重试的退避最长可达数百秒。降到 3 次仍能覆盖正常的
/// MOVED/ASK 重定向与单次故障转移，又不至于把失败拖成分钟级。
pub const CLUSTER_COMMAND_RETRIES: u32 = 3;

pub const EVENT_SUBSCRIBE: &str = "subscribe";
pub const EVENT_MONITOR: &str = "monitor";
pub const EVENT_NOTIFY: &str = "notify";
pub const EVENT_EXPORT: &str = "export";
pub const EVENT_IMPORT: &str = "import";
pub const EVENT_COMMAND_LOG: &str = "command-log";
pub const EVENT_VALUE_DOWNLOAD: &str = "value-download";

pub const ME_JSON_TYPE_NAME: &str = "json";
pub const REDIS_JSON_TYPE_NAME: &str = "ReJSON-RL";

/// UI / IPC 展示名（小写）；与 `TYPE` 原始名 `TSDB-TYPE` 成对，仿 JSON
pub const ME_TIMESERIES_TYPE_NAME: &str = "timeseries";
pub const REDIS_TIMESERIES_TYPE_NAME: &str = "TSDB-TYPE";

/// 将用户输入的命令名按连接 meta.commandMap 映射为服务端实际命令（键为小写，如 `config`）。
pub fn resolve_command_name(conf: &ConnConfig, cmd: &str) -> String {
    let map = conf.command_map();
    if map.is_empty() {
        return cmd.to_string();
    }
    let key = cmd.to_ascii_lowercase();
    map.get(&key).cloned().unwrap_or_else(|| cmd.to_string())
}

// tauri 的错误处理中需要返回的错误实现序列化，anyhow 的错误并没有实现，因此简单返回字符串错误
pub fn to_api_result<T>(result: anyhow::Result<T>) -> ApiResult<T> {
    match result {
        Ok(value) => Ok(value),
        Err(err) => {
            // 尝试解析为 AppError（国际化的错误码）
            let error_message = err.to_string();
            if let Ok(app_error) = serde_json::from_str::<AppError>(&error_message) {
                // 返回序列化的 AppError JSON
                return Err(serde_json::to_string(&app_error).unwrap_or(error_message));
            }

            // 避免原始错误和 source 错误的字符串一致，提示两遍（比如 connection timed out）
            let message = match err.source() {
                Some(source)
                    if !source.to_string().is_empty() && err.to_string() != source.to_string() =>
                {
                    format!("{}: {}", err, source)
                }
                _ => err.to_string(),
            };
            // 剥离 redis-rs 的 ServerErrorKind 前缀（如 ResponseError:）
            let message = message.replace("ResponseError: ", "");
            error!("错误：{}", message);
            Err(message)
        }
    }
}

// 字节数组转字符串：无效的 UTF-8 字节显示为十六进制转义（如 \xFF） [DeepSeek]
// 实测十六进制转义并不好用，还是先采用比较简单的方法处理
pub fn vec8_to_display_string(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_string()
}

/// 按 wire 格式将字节转为 IPC 字符串
pub fn format_bytes(bytes: &[u8], format: &BytesFormat) -> String {
    match format {
        BytesFormat::Base64 => BASE64_STANDARD.encode(bytes),
        BytesFormat::UTF8 => vec8_to_display_string(bytes),
    }
}

/// 将 IPC 字符串解析为字节（hex/binary/msgpack 等在前端转为 base64 后再传入）
pub fn parse_bytes(input: &str, format: &BytesFormat) -> AnyResult<Vec<u8>> {
    match format {
        BytesFormat::Base64 => BASE64_STANDARD
            .decode(input)
            .map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e)),
        BytesFormat::UTF8 => Ok(input.as_bytes().to_vec()),
    }
}

// 字节数组转 Base64 字符串：RedisKey 的 bytes
// pub fn vec8_to_base64_string(bytes: &[u8]) -> String {
//     BASE64_STANDARD.encode(bytes)
// }

// vec 中随机选择一个
pub fn random_item<T>(vec: &[T]) -> &T {
    vec.iter().choose(&mut rand::rng()).unwrap()
}

// 随机 N 个字符
pub fn random_string(len: usize) -> String {
    Alphanumeric.sample_string(&mut rand::rng(), len)
}

// 随机范围
pub fn random_range(min: i32, max: i32) -> i32 {
    rand::rng().random_range(min..=max)
}

/// Redis 回复值 → bulk bytes（复制为命令、XRANGE 解析等）
pub fn redis_value_to_bulk_bytes(value: Value) -> Vec<u8> {
    match value {
        Value::BulkString(b) => b,
        Value::SimpleString(s) => s.into_bytes(),
        Value::Int(i) => i.to_string().into_bytes(),
        Value::Double(d) => d.to_string().into_bytes(),
        Value::Boolean(b) => (if b { "1" } else { "0" }).into(),
        Value::Nil => Vec::new(),
        other => redis_value_to_string(other, "").into_bytes(),
    }
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
        // 其余暂不解析，直接转换为字符串
        _ => format!("{:?}", value),
    }
}

/// 解析路径：shellexpand 自动处理 ~ 和环境变量
pub fn parse_path(path: &str) -> PathBuf {
    let expanded = shellexpand::full(path).unwrap_or(std::borrow::Cow::Borrowed(path));
    PathBuf::from(expanded.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ConnConfig, ConnMetaValue, RedisKey};
    use base64::Engine;
    use base64::prelude::BASE64_STANDARD;
    use std::collections::HashMap;

    /// 键能编成 JSON，序列化路径本身不报错。
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

    /// UTF-8 键只留文本，bytes 留空，读回时再从文本取。
    #[test]
    fn test_redis_key_from_utf8_omits_bytes() {
        let rk = RedisKey::from(b"user:1".to_vec());
        assert_eq!(rk.key, "user:1");
        assert!(rk.bytes.is_empty());
        assert_eq!(rk.to_bytes(), b"user:1");

        let rk = RedisKey::from("hello".to_string());
        assert_eq!(rk.key, "hello");
        assert!(rk.bytes.is_empty());
        assert_eq!(rk.to_bytes(), b"hello");
    }

    /// 非法 UTF-8 键把原始字节留在 bytes 里。
    #[test]
    fn test_redis_key_from_binary_keeps_bytes() {
        let raw = vec![0xff, 0x00, 0xfe];
        let rk = RedisKey::from(raw.clone());
        assert_eq!(rk.bytes, raw);
        assert_eq!(rk.to_bytes(), raw.as_slice());
        assert!(!rk.key.is_empty()); // lossy 展示非空
    }

    /// 家目录、环境变量和 Windows 路径都能展开。
    #[test]
    fn test_parse_path() {
        // 支持多种格式
        let paths = vec![
            "~/.ssh/id_rsa",                  // Unix 风格
            r"~\.ssh\id_rsa",                 // Unix 风格
            "$HOME/.ssh/id_rsa",              // 环境变量
            "C:\\Users\\he_pe\\.ssh\\id_rsa", // Windows 风格
            r"C:\Users\he_pe\.ssh\id_rsa",    // 原始字符串
        ];

        for path in paths {
            println!("\nTrying: {}", path);
            println!("Parsed: {:?}", parse_path(path))
        }
    }

    /// UTF-8 原样往返；非 UTF-8 走 base64，坏的 base64 报错。
    #[test]
    fn bytes_roundtrip_utf8_and_base64() {
        assert_eq!(format_bytes("中文".as_bytes(), &BytesFormat::UTF8), "中文");
        assert_eq!(
            parse_bytes("中文", &BytesFormat::UTF8).unwrap(),
            "中文".as_bytes()
        );
        let raw = [0xff, 0xfe];
        let encoded = format_bytes(&raw, &BytesFormat::Base64);
        assert_eq!(parse_bytes(&encoded, &BytesFormat::Base64).unwrap(), raw);
        assert!(parse_bytes("@@@", &BytesFormat::Base64).is_err());
    }

    /// 命令映射键转成小写，空映射名或空目标丢掉。
    #[test]
    fn command_map_skips_blank() {
        let mut conf = ConnConfig::default();
        assert_eq!(resolve_command_name(&conf, "CONFIG"), "CONFIG");
        conf.meta.insert(
            "commandMap".into(),
            ConnMetaValue::Object(HashMap::from([(
                " Config ".into(),
                ConnMetaValue::String("config2".into()),
            )])),
        );
        assert_eq!(resolve_command_name(&conf, "config"), "config2");
        assert_eq!(resolve_command_name(&conf, "GET"), "GET");
    }

    /// 标量收成 bulk 字节；数组按分隔符拼，Map 写成 `k: v`。
    #[test]
    fn redis_value_flattens_scalars_and_aggregates() {
        assert_eq!(redis_value_to_bulk_bytes(Value::Nil), b"");
        assert_eq!(redis_value_to_bulk_bytes(Value::Boolean(true)), b"1");
        assert_eq!(redis_value_to_bulk_bytes(Value::Int(7)), b"7");
        assert_eq!(redis_value_to_string(Value::Nil, ","), "");
        assert_eq!(redis_value_to_string(Value::Okay, ""), "OK");
        assert_eq!(
            redis_value_to_string(
                Value::Array(vec![Value::Int(1), Value::SimpleString("a".into())]),
                ","
            ),
            "1,a"
        );
        assert_eq!(
            redis_value_to_string(
                Value::Map(vec![(Value::SimpleString("k".into()), Value::Int(2))]),
                " "
            ),
            "k: 2"
        );
    }

    /// 成功原样返回；普通错误收成字符串，不把 source 再拼一遍。
    #[test]
    fn api_result_keeps_ok_and_stringifies_err() {
        assert_eq!(to_api_result(Ok(3)).unwrap(), 3);
        let err = to_api_result::<()>(Err(anyhow::anyhow!("boom"))).unwrap_err();
        assert!(err.contains("boom"));
    }
}
