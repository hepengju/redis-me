use crate::utils::error::AppError;
use crate::utils::model::*;

pub use crate::utils::redis_cli_tty::redis_value_to_cli_display;
use anyhow::bail;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use chrono::DateTime;
use log::{error, info};
use rand::RngExt;
use rand::distr::{Alphanumeric, SampleString};
use rand::prelude::IteratorRandom;
use redis::streams::{StreamId, StreamInfoConsumer, StreamInfoGroup, StreamRangeReply};
use redis::{FromRedisValue, Value, ValueType};
use serde_json::{Map, Value as JsonValue};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::time::Duration;

// 统一应用返回值
pub type AnyResult<T> = anyhow::Result<T>;
pub type ApiResult<T> = Result<T, String>;

// 常量定义
pub const REDIS_ME_FIELD_TO_DELETE_TMP_VALUE: &str = "REDIS_ME_FIELD_TO_DELETE_TMP_VALUE";
pub const REDIS_ME_SUBSCRIBE_STOP_CHANNEL: &str = "REDIS_ME_SUBSCRIBE_STOP_CHANNEL";
pub const CONNECTION_CHECK_SECONDS: i64 = 30; // 30s 检查 1 次连接，避免频繁检查
pub const CONNECTION_CHECK_TIMEOUT: Duration = Duration::from_secs(3); // 已有连接探活 PING
pub const CONNECTION_CONNECT_TIMEOUT: Duration = Duration::from_secs(10); // 建连默认（TCP+握手+PING），设置可覆盖
pub const CONNECTION_NORMAL_TIMEOUT: Duration = Duration::from_secs(30); // 连接操作默认操作时长

pub const EVENT_SUBSCRIBE: &str = "subscribe";
pub const EVENT_MONITOR: &str = "monitor";
pub const EVENT_EXPORT: &str = "export";
pub const EVENT_IMPORT: &str = "import";
pub const EVENT_COMMAND_LOG: &str = "command-log";

pub const ME_JSON_TYPE_NAME: &str = "json";
pub const REDIS_JSON_TYPE_NAME: &str = "ReJSON-RL";

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

pub fn ui_key_type(key_type: ValueType) -> String {
    let key_type: String = key_type.into();
    ui_key_type_str(&key_type)
}

/// `TYPE` 等返回的原始类型名（含模块名如 ReJSON-RL）统一为与 `ui_key_type` 一致的展示名
pub fn ui_key_type_str(key_type: &str) -> String {
    if key_type == REDIS_JSON_TYPE_NAME {
        ME_JSON_TYPE_NAME.to_string()
    } else {
        key_type.to_string()
    }
}

pub fn to_key_type(key_type: &str) -> ValueType {
    match key_type {
        ME_JSON_TYPE_NAME => ValueType::JSON,
        // 规范化为小写 "array"，与 TYPE 回复一致，便于 is_array_type 识别
        s if s.eq_ignore_ascii_case("array") => ValueType::Unknown("array".into()),
        _ => key_type.into(),
    }
}

/// Redis 8.8 Array 类型判断。
///
/// redis-rs 当前尚无正式 `ValueType::Array`，`TYPE` / `into()` 会落到
/// `ValueType::Unknown("array")`。所有 Array 读写分支必须经此函数，勿散落匹配字符串。
///
/// **升级注意**：若日后 redis-rs 增加 `ValueType::Array`（或 Unknown 字符串变化），
/// 必须同步扩展本函数，否则会落入 `KeyTypeUnknown` / 静默走错分支。
pub fn is_array_type(t: &ValueType) -> bool {
    matches!(t, ValueType::Unknown(s) if s.eq_ignore_ascii_case("array"))
}

/// 解析 Array 索引（十进制非负）；供 ARSET/ARGET/ARDEL 等使用
pub fn parse_array_index(s: &str) -> AnyResult<i64> {
    let idx = s
        .trim()
        .parse::<i64>()
        .map_err(|_| anyhow::anyhow!("invalid array index: {}", s))?;
    if idx < 0 {
        bail!("invalid array index: {}", s);
    }
    Ok(idx)
}

pub fn ui_xinfo_group(group: StreamInfoGroup) -> XInfoGroup {
    XInfoGroup {
        name: group.name,
        consumers: group.consumers,
        pending: group.pending,
        last_delivered_id: group.last_delivered_id,
        entries_read: group.entries_read,
        lag: group.lag,
    }
}

pub fn ui_xinfo_consumer(consumer: StreamInfoConsumer) -> XInfoConsumer {
    XInfoConsumer {
        name: consumer.name,
        pending: consumer.pending,
        idle: consumer.idle,
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

// 辅助函数
pub fn tuple_to_key_size(keys: Vec<(Vec<u8>, u64, String)>) -> Vec<RedisKeySize> {
    let mut key_list: Vec<RedisKeySize> = keys
        .into_iter()
        .map(|(key, size, key_type)| RedisKeySize::from((key, size, ui_key_type_str(&key_type))))
        .collect();
    key_list.sort_by_key(|x| x.size);
    key_list.reverse();
    key_list
}

pub fn ui_key_list(keys: Vec<Vec<u8>>) -> Vec<RedisKey> {
    // UTF-8 键省略 bytes，见 RedisKey::from(Vec<u8>)
    keys.into_iter().map(RedisKey::from).collect()
}

pub fn ui_list_items(
    start_index: i64,
    value: &[Vec<u8>],
    format: &BytesFormat,
) -> Vec<crate::utils::model::RedisListItem> {
    value
        .iter()
        .enumerate()
        .map(|(i, v)| crate::utils::model::RedisListItem {
            index: start_index + i as i64,
            value: format_bytes(v, format),
        })
        .collect()
}

/// 解析 ARSCAN 一对索引+原始 bytes。
/// Redis 8.8 实际为嵌套 `[[idx, val], ...]`（见命令示例）；亦兼容扁平 `[idx, val, ...]`。
pub fn parse_arscan_pairs(raw: Value) -> AnyResult<Vec<(i64, Vec<u8>)>> {
    let arr = match raw {
        Value::Nil => return Ok(Vec::new()),
        Value::Array(a) => a,
        other => bail!(AppError::Internal {
            message: format!("unexpected ARSCAN reply: {:?}", other)
        }),
    };
    if arr.is_empty() {
        return Ok(Vec::new());
    }

    let parse_one = |idx_v: &Value, val_v: &Value| -> AnyResult<(i64, Vec<u8>)> {
        let idx: i64 = FromRedisValue::from_redis_value_ref(idx_v)
            .map_err(|e| anyhow::anyhow!("ARSCAN index parse: {}", e))?;
        let val_bytes: Vec<u8> = FromRedisValue::from_redis_value_ref(val_v)
            .map_err(|e| anyhow::anyhow!("ARSCAN value parse: {}", e))?;
        Ok((idx, val_bytes))
    };

    // 嵌套：每个元素是 [idx, val]
    if matches!(arr.first(), Some(Value::Array(_))) {
        let mut pairs = Vec::with_capacity(arr.len());
        for entry in &arr {
            match entry {
                Value::Array(pair) if pair.len() >= 2 => {
                    pairs.push(parse_one(&pair[0], &pair[1])?);
                }
                other => bail!(AppError::Internal {
                    message: format!("unexpected ARSCAN pair: {:?}", other)
                }),
            }
        }
        return Ok(pairs);
    }

    // 扁平：idx1, val1, idx2, val2, ...
    let mut pairs = Vec::with_capacity(arr.len() / 2);
    let mut i = 0;
    while i + 1 < arr.len() {
        pairs.push(parse_one(&arr[i], &arr[i + 1])?);
        i += 2;
    }
    Ok(pairs)
}

/// ARSCAN → List 同行形状 `{index, value}`（IPC 展示用）
pub fn ui_array_items_from_arscan(
    raw: Value,
    format: &BytesFormat,
) -> AnyResult<Vec<crate::utils::model::RedisListItem>> {
    Ok(parse_arscan_pairs(raw)?
        .into_iter()
        .map(|(index, bytes)| crate::utils::model::RedisListItem {
            index,
            value: format_bytes(&bytes, format),
        })
        .collect())
}

pub fn ui_hash_value(value: &[(Vec<u8>, Vec<u8>)], format: &BytesFormat) -> Vec<RedisHashItem> {
    value
        .iter()
        .map(|(key, value)| {
            let key: String = format_bytes(key, format);
            let value: String = format_bytes(value, format);
            RedisHashItem {
                key,
                value,
                ttl: None,
            }
        })
        .collect()
}

pub fn ui_set_value(value: HashSet<Vec<u8>>, format: &BytesFormat) -> Vec<String> {
    value
        .into_iter()
        .map(|v| format_bytes(&v, format))
        .collect()
}

pub fn ui_zset_value(value: Vec<(Vec<u8>, f64)>, format: &BytesFormat) -> Vec<RedisZetItem> {
    value
        .into_iter()
        .map(|(value, score)| RedisZetItem {
            value: format_bytes(&value, format),
            score,
        })
        .collect()
}

pub fn ui_stream_value(reply: StreamRangeReply) -> Vec<RedisStreamItem> {
    reply
        .ids
        .into_iter()
        .map(|sid| {
            let StreamId { id, map, .. } = sid;
            RedisStreamItem {
                id,
                value: ui_stream_id(map),
            }
        })
        .collect()
}

pub fn ui_stream_id(stream_id: HashMap<String, Value>) -> HashMap<String, String> {
    stream_id
        .into_iter()
        .map(|(k, v)| (k, redis_value_to_string(v, "\n")))
        .collect()
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

fn is_hex_digit(c: u8) -> bool {
    c.is_ascii_digit() || (b'a'..=b'f').contains(&c) || (b'A'..=b'F').contains(&c)
}

fn hex_digit_to_int(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a' | b'A' => 10,
        b'b' | b'B' => 11,
        b'c' | b'C' => 12,
        b'd' | b'D' => 13,
        b'e' | b'E' => 14,
        b'f' | b'F' => 15,
        _ => 0,
    }
}

/// 与 redis-cli sdssplitargs 一致的分词（终端命令、ACL selector 等复用）
pub fn split_redis_args(line: &str) -> AnyResult<Vec<Vec<u8>>> {
    let mut args = Vec::new();
    let bytes = line.as_bytes();
    let mut p = 0usize;

    loop {
        while p < bytes.len() && bytes[p].is_ascii_whitespace() {
            p += 1;
        }
        if p >= bytes.len() {
            break;
        }

        let mut current = Vec::new();
        let mut in_double = false;
        let mut in_single = false;
        let mut done = false;

        while !done {
            if p >= bytes.len() {
                if in_double || in_single {
                    bail!("unbalanced quotes");
                }
                done = true;
                continue;
            }

            if in_double {
                if bytes[p] == b'\\'
                    && p + 1 < bytes.len()
                    && bytes[p + 1] == b'x'
                    && p + 3 < bytes.len()
                    && is_hex_digit(bytes[p + 2])
                    && is_hex_digit(bytes[p + 3])
                {
                    let byte = hex_digit_to_int(bytes[p + 2]) * 16 + hex_digit_to_int(bytes[p + 3]);
                    current.push(byte);
                    p += 3;
                } else if bytes[p] == b'\\' && p + 1 < bytes.len() {
                    p += 1;
                    let c = match bytes[p] {
                        b'n' => b'\n',
                        b'r' => b'\r',
                        b't' => b'\t',
                        b'b' => b'\x08',
                        b'a' => b'\x07',
                        other => other,
                    };
                    current.push(c);
                } else if bytes[p] == b'"' {
                    if p + 1 < bytes.len() && !bytes[p + 1].is_ascii_whitespace() {
                        bail!("unbalanced quotes");
                    }
                    done = true;
                } else {
                    current.push(bytes[p]);
                }
            } else if in_single {
                if bytes[p] == b'\\' && p + 1 < bytes.len() && bytes[p + 1] == b'\'' {
                    p += 1;
                    current.push(b'\'');
                } else if bytes[p] == b'\'' {
                    if p + 1 < bytes.len() && !bytes[p + 1].is_ascii_whitespace() {
                        bail!("unbalanced quotes");
                    }
                    done = true;
                } else {
                    current.push(bytes[p]);
                }
            } else {
                match bytes[p] {
                    b' ' | b'\n' | b'\r' | b'\t' => done = true,
                    b'"' => in_double = true,
                    b'\'' => in_single = true,
                    ch => current.push(ch),
                }
            }

            if p < bytes.len() {
                p += 1;
            }
        }

        args.push(current);
    }

    Ok(args)
}

// 解析命令：主要考虑解析带有引号的参数，比如：config set save "3600 1 300 100 60 10000"
pub fn parse_command(command: &str) -> AnyResult<(String, Vec<Vec<u8>>)> {
    let tokens = split_redis_args(command.trim())?;
    let first = tokens
        .first()
        .map(|b| String::from_utf8_lossy(b).into_owned())
        .unwrap_or_default();
    let other = tokens.into_iter().skip(1).collect();
    Ok((first, other))
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

/// `XRANGE` 原始数组回复 → 保序 entry（id + field-value 对），避免 `HashMap` 打乱顺序
pub fn parse_xrange_ordered(raw: Value) -> AnyResult<Vec<(Vec<u8>, Vec<(Vec<u8>, Vec<u8>)>)>> {
    let entries = match raw {
        Value::Array(arr) => arr,
        _ => bail!(AppError::Internal {
            message: "XRANGE expected array".into()
        }),
    };
    let mut result = Vec::with_capacity(entries.len());
    for entry in entries {
        let parts = match entry {
            Value::Array(p) if p.len() >= 2 => p,
            _ => continue,
        };
        let id = redis_value_to_bulk_bytes(parts[0].clone());
        // 字段列表：实测 RESP3 下 Redis 核心命令仍返回扁平数组 [f1, v1, ...]；
        // Map 分支为防御性兼容（RESP3 规范允许 Map 回复，其他服务端实现可能返回 Map）
        let fields: Vec<(Vec<u8>, Vec<u8>)> = match &parts[1] {
            Value::Array(f) => f
                .chunks(2)
                .filter(|chunk| chunk.len() == 2)
                .map(|chunk| {
                    (
                        redis_value_to_bulk_bytes(chunk[0].clone()),
                        redis_value_to_bulk_bytes(chunk[1].clone()),
                    )
                })
                .collect(),
            Value::Map(m) => {
                // RESP3 Map 形态确认点：日志出现即说明兼容分支生效
                info!("RESP3: XRANGE 字段列表以 Map 返回，按 Map 保序解析");
                m.iter()
                    .map(|(k, v)| {
                        (
                            redis_value_to_bulk_bytes(k.clone()),
                            redis_value_to_bulk_bytes(v.clone()),
                        )
                    })
                    .collect()
            }
            _ => continue,
        };
        result.push((id, fields));
    }
    Ok(result)
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

// 慢查询结果转换
pub fn redis_value_to_log(value: Value, node: &str) -> AnyResult<RedisSlowLog> {
    // 防御性兼容：实测 RESP3 下 Redis 核心命令 SLOWLOG GET 仍返回 Array；
    // 若其他服务端实现按 RESP3 规范返回 Map（id/timestamp/duration/command/client-addr/client-name），按字段名解析
    if let Value::Map(map) = value {
        // 按条循环调用（最多 128 条），进程内只提示一次避免刷屏
        static RESP3_SLOWLOG_MAP_NOTED: std::sync::Once = std::sync::Once::new();
        RESP3_SLOWLOG_MAP_NOTED.call_once(|| {
            info!("RESP3: SLOWLOG 条目以 Map 返回，按字段名解析（slow_log_from_map）");
        });
        return slow_log_from_map(map, node);
    }
    let items = match value {
        Value::Array(arr) if arr.len() >= 4 => arr,
        Value::Array(_) => bail!("slow query entries have at least 4 elements"),
        _ => bail!("should be an array of slow query entries"),
    };

    let id: u64 = FromRedisValue::from_redis_value_ref(&items[0])?;
    let time = timestamp_to_string(FromRedisValue::from_redis_value_ref(&items[1])?);
    let cost: f64 = FromRedisValue::from_redis_value_ref(&items[2])?;
    let command: String = redis_value_to_string(items[3].clone(), " ");
    let client: String = if items.len() > 4 {
        FromRedisValue::from_redis_value_ref(&items[4])?
    } else {
        "".into()
    };

    let client_name: String = if items.len() > 5 {
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

/// RESP3 Map 形态的慢日志条目：按字段名取值，与数组形态语义一致
fn slow_log_from_map(map: Vec<(Value, Value)>, node: &str) -> AnyResult<RedisSlowLog> {
    let mut id: u64 = 0;
    let mut timestamp: i64 = 0;
    let mut duration: f64 = 0.0;
    let mut command = String::new();
    let mut client = String::new();
    let mut client_name = String::new();
    for (k, v) in map {
        match redis_value_to_string(k, "").as_str() {
            "id" => id = FromRedisValue::from_redis_value(v)?,
            "timestamp" => timestamp = FromRedisValue::from_redis_value(v)?,
            "duration" => duration = FromRedisValue::from_redis_value(v)?,
            "command" => command = redis_value_to_string(v, " "),
            "client-addr" => client = redis_value_to_string(v, ""),
            "client-name" => client_name = redis_value_to_string(v, ""),
            _ => {}
        }
    }
    Ok(RedisSlowLog {
        node: node.to_string(),
        id,
        time: timestamp_to_string(timestamp),
        cost: duration / 1000.0,
        command,
        client,
        client_name,
    })
}

// 时间戳 (秒) 转字符串
pub fn timestamp_to_string(timestamp: i64) -> String {
    let datetime = DateTime::from_timestamp(timestamp, 0)
        .unwrap()
        .with_timezone(&chrono_tz::Asia::Shanghai);
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}

/// `tot_mem` → `totMem`，与 `RedisClientInfo` 的 `rename_all = "camelCase"` 一致。
fn redis_client_json_key(norm_snake: &str) -> String {
    let parts: Vec<&str> = norm_snake.split('_').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() {
        return String::new();
    }
    let mut out = String::from(parts[0]);
    for p in parts.iter().skip(1) {
        let mut c = p.chars();
        if let Some(f) = c.next() {
            out.push(f.to_ascii_uppercase());
            out.extend(c);
        }
    }
    out
}

fn redis_client_put_u64(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        let n = v.parse::<u64>().unwrap_or(0);
        obj.insert(redis_client_json_key(norm), JsonValue::Number(n.into()));
    }
}

fn redis_client_put_i64(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        let n = v.parse::<i64>().unwrap_or(0);
        obj.insert(redis_client_json_key(norm), serde_json::json!(n));
    }
}

fn redis_client_put_u8(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        if let Ok(n) = v.parse::<u8>() {
            obj.insert(redis_client_json_key(norm), JsonValue::Number(n.into()));
        }
    }
}

fn redis_client_put_str(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        obj.insert(
            redis_client_json_key(norm),
            JsonValue::String((*v).to_string()),
        );
    }
}

// 解析客户端信息（Redis 行里缺字段时由 `RedisClientInfo` 上 `#[serde(default)]` 填 0 / ""）
pub fn parse_client_info(client_info: &str) -> AnyResult<RedisClientInfo> {
    let mut raw: HashMap<String, &str> = HashMap::with_capacity(32);
    for key_eq_val in client_info.split_whitespace() {
        if let Some((key, val)) = key_eq_val.split_once('=') {
            raw.insert(key.replace('-', "_"), val);
        }
    }

    let mut obj = Map::new();

    for k in [
        "id",
        "fd",
        "age",
        "idle",
        "db",
        "sub",
        "psub",
        "ssub",
        "watch",
        "qbuf",
        "qbuf_free",
        "argv_mem",
        "multi_mem",
        "obl",
        "oll",
        "omem",
        "tot_mem",
        "redir",
        "rbp",
        "rbs",
        "io_thread",
    ] {
        redis_client_put_u64(&mut obj, &raw, k);
    }
    redis_client_put_i64(&mut obj, &raw, "multi");
    redis_client_put_u8(&mut obj, &raw, "resp");

    for k in ["addr", "laddr", "name", "flags", "events", "cmd", "user"] {
        redis_client_put_str(&mut obj, &raw, k);
    }

    let client: RedisClientInfo = serde_json::from_value(JsonValue::Object(obj))?;
    Ok(client)
}

// info 信息转换成图表数据
pub fn info_to_chart(redis_info: RedisInfo) -> AnyResult<RedisChart> {
    let mut chart = RedisChart::default();

    let mut key_total = 0;
    for line in redis_info.info.lines() {
        if line.is_empty() || line.starts_with("#") {
            continue;
        }

        if let Some((key, value)) = line.split_once(":").map(|(k, v)| (k.trim(), v.trim())) {
            match key {
                "connected_clients" => chart.connected_clients = value.parse().unwrap_or_default(),
                "instantaneous_ops_per_sec" => {
                    chart.instantaneous_ops_per_sec = value.parse().unwrap_or_default()
                }
                "used_memory" => chart.used_memory = value.parse().unwrap_or_default(),
                "instantaneous_input_kbps" => {
                    chart.instantaneous_input_kbps = value.parse().unwrap_or_default()
                }
                "instantaneous_output_kbps" => {
                    chart.instantaneous_output_kbps = value.parse().unwrap_or_default()
                }
                "total_connections_received" => {
                    chart.total_connections_received = value.parse().unwrap_or_default()
                }
                "total_commands_processed" => {
                    chart.total_commands_processed = value.parse().unwrap_or_default()
                }
                "keyspace_hits" => chart.keyspace_hits = value.parse().unwrap_or_default(),
                "keyspace_misses" => chart.keyspace_misses = value.parse().unwrap_or_default(),
                _ => {
                    // db0:keys=14410,expires=3997,avg_ttl=736124073
                    // db1:keys=50,expires=0,avg_ttl=0,subexpiry=0
                    // 匹配以 db 开头，后跟 1-2 位数字的 key
                    if key.starts_with("db") && key.len() >= 3 {
                        let num_part = &key[2..]; // 截取 db 后的数字部分
                        if num_part.chars().all(|c| c.is_ascii_digit()) && num_part.len() <= 2 {
                            // 解析 value 中的 keys 数值，包含完整的错误处理
                            let size = value
                                .split(',')
                                .next() // 取第一个逗号前的部分 (keys=14410)
                                .and_then(|part| part.split_once('=')) // 分割 key=value
                                .and_then(|(_, val)| val.parse::<u64>().ok()); // 解析数值

                            // 3. 更新数据结构（无 unwrap，安全处理解析失败）
                            if let Some(size) = size {
                                key_total += size;
                            }
                        }
                    }
                }
            }
        }
    }
    chart.key_total = key_total;
    chart.cache_hit_ratio = if chart.keyspace_hits + chart.keyspace_misses > 0 {
        chart.keyspace_hits as f64 / (chart.keyspace_hits + chart.keyspace_misses) as f64
    } else {
        0.0
    };
    Ok(chart)
}

/// 解析路径：shellexpand 自动处理 ~ 和环境变量
pub fn parse_path(path: &str) -> PathBuf {
    let expanded = shellexpand::full(path).unwrap_or(std::borrow::Cow::Borrowed(path));
    PathBuf::from(expanded.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::model::RedisKey;
    use base64::Engine;
    use base64::prelude::BASE64_STANDARD;

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

    #[test]
    fn test_redis_key_from_binary_keeps_bytes() {
        let raw = vec![0xff, 0x00, 0xfe];
        let rk = RedisKey::from(raw.clone());
        assert_eq!(rk.bytes, raw);
        assert_eq!(rk.to_bytes(), raw.as_slice());
        assert!(!rk.key.is_empty()); // lossy 展示非空
    }

    #[test]
    fn test_ui_key_list_omits_utf8_bytes() {
        let list = ui_key_list(vec![b"a".to_vec(), vec![0xff]]);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].key, "a");
        assert!(list[0].bytes.is_empty());
        assert_eq!(list[1].bytes, vec![0xff]);
    }

    #[test]
    fn test_parse_command() {
        let (cmd, args) = parse_command("").unwrap();
        assert_eq!(cmd, "");
        assert!(args.is_empty());

        let (cmd, args) = parse_command("ping").unwrap();
        assert_eq!(cmd, "ping");
        assert!(args.is_empty());

        let (cmd, args) = parse_command("set name hepengju").unwrap();
        assert_eq!(cmd, "set");
        assert_eq!(args, vec![b"name".to_vec(), b"hepengju".to_vec()]);

        let (cmd, args) = parse_command(r#"config set save "3600 1 300 100 60 10000" "#).unwrap();
        assert_eq!(cmd, "config");
        assert_eq!(
            args,
            vec![
                b"set".to_vec(),
                b"save".to_vec(),
                b"3600 1 300 100 60 10000".to_vec()
            ]
        );

        let (cmd, args) = parse_command(r#"config set save '3600 1 300 100 60 10000' "#).unwrap();
        assert_eq!(cmd, "config");
        assert_eq!(
            args,
            vec![
                b"set".to_vec(),
                b"save".to_vec(),
                b"3600 1 300 100 60 10000".to_vec()
            ]
        );
    }

    #[test]
    fn test_split_redis_args_escapes() {
        let args = split_redis_args(r#"SET "MultiLine" "Line01\nLine02""#).unwrap();
        assert_eq!(args[0], b"SET");
        assert_eq!(args[1], b"MultiLine");
        assert_eq!(args[2], b"Line01\nLine02");

        let args = split_redis_args(r#"SET 'MultiLine' 'Line01\nLine02'"#).unwrap();
        assert_eq!(args[2], b"Line01\\nLine02");

        let args = split_redis_args(r#"SET key "\xff\x00""#).unwrap();
        assert_eq!(args[2], vec![0xff, 0x00]);

        let args = split_redis_args(r#"call "Sabrina" and "Mark Smith\n""#).unwrap();
        assert_eq!(
            args,
            vec![
                b"call".to_vec(),
                b"Sabrina".to_vec(),
                b"and".to_vec(),
                b"Mark Smith\n".to_vec()
            ]
        );

        assert!(split_redis_args(r#""foo"bar"#).is_err());

        // 双引号内 \"、\\
        let args = split_redis_args(r#"SET key "say \"hi\"""#).unwrap();
        assert_eq!(args[2], br#"say "hi""#);

        let args = split_redis_args(r#"SET key "a\\b""#).unwrap();
        assert_eq!(args[2], br"a\b");

        // 空引号参数
        let args = split_redis_args(r#"SET key """#).unwrap();
        assert_eq!(args, vec![b"SET".to_vec(), b"key".to_vec(), Vec::new()]);

        // 单引号内 \'
        let args = split_redis_args(r#"SET key 'it\'s'"#).unwrap();
        assert_eq!(args[2], b"it's");

        // 未闭合引号
        assert!(split_redis_args(r#"SET key "abc"#).is_err());
        assert!(split_redis_args(r#"SET key "abc\"#).is_err());
    }

    #[test]
    fn test_parse_xrange_ordered() {
        let raw = Value::Array(vec![Value::Array(vec![
            Value::SimpleString("1-0".into()),
            Value::Array(vec![
                Value::SimpleString("f2".into()),
                Value::BulkString(b"v2".to_vec()),
                Value::SimpleString("f1".into()),
                Value::BulkString(b"v1".to_vec()),
            ]),
        ])]);
        let entries = parse_xrange_ordered(raw).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, b"1-0");
        assert_eq!(
            entries[0].1,
            vec![
                (b"f2".to_vec(), b"v2".to_vec()),
                (b"f1".to_vec(), b"v1".to_vec()),
            ]
        );

        // RESP3：字段部分为 Map（保序）
        let raw3 = Value::Array(vec![Value::Array(vec![
            Value::SimpleString("1-0".into()),
            Value::Map(vec![
                (
                    Value::SimpleString("f2".into()),
                    Value::BulkString(b"v2".to_vec()),
                ),
                (
                    Value::SimpleString("f1".into()),
                    Value::BulkString(b"v1".to_vec()),
                ),
            ]),
        ])]);
        let entries = parse_xrange_ordered(raw3).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, b"1-0");
        assert_eq!(
            entries[0].1,
            vec![
                (b"f2".to_vec(), b"v2".to_vec()),
                (b"f1".to_vec(), b"v1".to_vec()),
            ]
        );
    }

    #[test]
    fn test_redis_value_to_log_resp3_map() {
        // RESP3：SLOWLOG GET 单条为 Map
        let entry = Value::Map(vec![
            (Value::SimpleString("id".into()), Value::Int(14)),
            (
                Value::SimpleString("timestamp".into()),
                Value::Int(1759409274),
            ),
            (Value::SimpleString("duration".into()), Value::Int(1500)),
            (
                Value::SimpleString("command".into()),
                Value::Array(vec![
                    Value::BulkString(b"keys".to_vec()),
                    Value::BulkString(b"*".to_vec()),
                ]),
            ),
            (
                Value::SimpleString("client-addr".into()),
                Value::SimpleString("127.0.0.1:50000".into()),
            ),
            (
                Value::SimpleString("client-name".into()),
                Value::SimpleString("RedisME".into()),
            ),
        ]);
        let log = redis_value_to_log(entry, "").unwrap();
        assert_eq!(log.id, 14);
        assert_eq!(log.cost, 1.5);
        assert_eq!(log.command, "keys *");
        assert_eq!(log.client, "127.0.0.1:50000");
        assert_eq!(log.client_name, "RedisME");
    }

    #[test]
    fn test_timestamp_to_string() {
        let timestamp = 1759409274;
        println!("{}", timestamp_to_string(timestamp));
    }

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
}
