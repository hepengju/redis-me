use crate::client::ops::field_scan::handle_other_value_type;
use crate::model::*;
use crate::support::convert::{is_array_type, ui_xinfo_consumer, ui_xinfo_group};
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::bail;
use chrono::DateTime;
use log::info;
use parking_lot::MutexGuard;
use redis::streams::{StreamInfoConsumersReply, StreamInfoGroupsReply};
use redis::{Commands, FromRedisValue, Value, ValueType};
use serde_json::{Map, Value as JsonValue};
use std::collections::HashMap;

/// Array ARINFO：元数据（默认不含 FULL）；RESP2 扁平键值对 / RESP3 Map。
pub fn ar_info0(
    mut conn: MutexGuard<impl Commands>,
    key: RedisKey,
) -> AnyResult<Vec<RedisArInfoItem>> {
    let key_type: ValueType = conn.key_type(&key)?;
    if !is_array_type(&key_type) {
        handle_other_value_type(&key_type, &key)?;
        unreachable!()
    }
    let raw: Value = redis::cmd("ARINFO").arg(&key).query(&mut conn)?;
    parse_info_kv_items(raw, "ARINFO")
}

/// TimeSeries TS.INFO：元数据；行结构同 ARINFO。labels/rules 等嵌套数组展平为可读字符串。
pub fn ts_info0(
    mut conn: MutexGuard<impl Commands>,
    key: RedisKey,
) -> AnyResult<Vec<RedisArInfoItem>> {
    let key_type: ValueType = conn.key_type(&key)?;
    if key_type != ValueType::TimeSeries {
        handle_other_value_type(&key_type, &key)?;
        unreachable!()
    }
    let raw: Value = redis::cmd("TS.INFO").arg(&key).query(&mut conn)?;
    parse_ts_info_items(raw)
}

/// ARINFO / VINFO 等扁平键值回复 → 保序 field/value 行
pub fn parse_info_kv_items(raw: Value, cmd: &str) -> AnyResult<Vec<RedisArInfoItem>> {
    match raw {
        Value::Nil => Ok(Vec::new()),
        Value::Map(map) => Ok(map
            .into_iter()
            .map(|(k, v)| RedisArInfoItem {
                field: redis_value_to_string(k, ""),
                value: redis_value_to_string(v, ""),
            })
            .collect()),
        Value::Array(arr) => {
            let mut items = Vec::with_capacity(arr.len() / 2);
            let mut i = 0;
            while i + 1 < arr.len() {
                items.push(RedisArInfoItem {
                    field: redis_value_to_string(arr[i].clone(), ""),
                    value: redis_value_to_string(arr[i + 1].clone(), ""),
                });
                i += 2;
            }
            Ok(items)
        }
        other => bail!(AppError::Internal {
            message: format!("unexpected {} reply: {:?}", cmd, other)
        }),
    }
}

/// `XINFO GROUPS`：Stream 的消费组。
pub fn xinfo_groups0(
    mut conn: MutexGuard<impl Commands>,
    key: RedisKey,
) -> AnyResult<Vec<XInfoGroup>> {
    let reply: StreamInfoGroupsReply = conn.xinfo_groups(&key)?;
    Ok(reply.groups.into_iter().map(ui_xinfo_group).collect())
}

/// `XINFO CONSUMERS`：某个消费组里的消费者。
pub fn xinfo_consumers0(
    mut conn: MutexGuard<impl Commands>,
    key: RedisKey,
    group: String,
) -> AnyResult<Vec<XInfoConsumer>> {
    let reply: StreamInfoConsumersReply = conn.xinfo_consumers(&key, &group)?;
    Ok(reply.consumers.into_iter().map(ui_xinfo_consumer).collect())
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
    // 原始行整行保留，供前端「复制」操作展示完整信息
    obj.insert(
        "raw".into(),
        JsonValue::String(client_info.trim().to_string()),
    );

    let client: RedisClientInfo = serde_json::from_value(JsonValue::Object(obj))?;
    Ok(client)
}

// info 信息转换成图表数据
pub fn info_to_chart(redis_info: RedisInfo) -> AnyResult<RedisChart> {
    // 保留来源节点地址，供前端多节点折线区分（单机为空串）
    let mut chart = RedisChart {
        node: redis_info.node,
        ..Default::default()
    };

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

// ------------------------------ 仅本文件使用 ------------------------------

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
fn timestamp_to_string(timestamp: i64) -> String {
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

/// CLIENT LIST 里的无符号整数字段。缺字段或解析失败写成 0。
fn redis_client_put_u64(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        let n = v.parse::<u64>().unwrap_or(0);
        obj.insert(redis_client_json_key(norm), JsonValue::Number(n.into()));
    }
}

/// CLIENT LIST 里的有符号整数字段（如 `multi`）。缺字段写成 0。
fn redis_client_put_i64(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        let n = v.parse::<i64>().unwrap_or(0);
        obj.insert(redis_client_json_key(norm), serde_json::json!(n));
    }
}

/// CLIENT LIST 里的 `u8` 字段（如 `resp`）。解析失败就跳过，交给 serde 默认值。
fn redis_client_put_u8(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm)
        && let Ok(n) = v.parse::<u8>()
    {
        obj.insert(redis_client_json_key(norm), JsonValue::Number(n.into()));
    }
}

/// CLIENT LIST 里的字符串字段。缺字段不写入，交给 serde 默认空串。
fn redis_client_put_str(obj: &mut Map<String, JsonValue>, raw: &HashMap<String, &str>, norm: &str) {
    if let Some(v) = raw.get(norm) {
        obj.insert(
            redis_client_json_key(norm),
            JsonValue::String((*v).to_string()),
        );
    }
}

/// TS.INFO 嵌套值展平：label 对 `k=v`；规则等多元素用 `,`；多组用 `; `
fn format_ts_info_value(value: Value) -> String {
    match value {
        Value::Array(items)
            if !items.is_empty() && items.iter().all(|x| matches!(x, Value::Array(_))) =>
        {
            items
                .into_iter()
                .map(|item| match item {
                    Value::Array(pair) if pair.len() == 2 => {
                        format!(
                            "{}={}",
                            redis_value_to_string(pair[0].clone(), ""),
                            redis_value_to_string(pair[1].clone(), "")
                        )
                    }
                    Value::Array(parts) => parts
                        .into_iter()
                        .map(|p| redis_value_to_string(p, ""))
                        .collect::<Vec<_>>()
                        .join(","),
                    other => redis_value_to_string(other, ""),
                })
                .collect::<Vec<_>>()
                .join("; ")
        }
        Value::Array(items) => items
            .into_iter()
            .map(|x| redis_value_to_string(x, ""))
            .collect::<Vec<_>>()
            .join(", "),
        other => redis_value_to_string(other, ", "),
    }
}

/// `TS.INFO` 的扁平键值或 Map。嵌套的 labels、rules 先展平成可读字符串。
fn parse_ts_info_items(raw: Value) -> AnyResult<Vec<RedisArInfoItem>> {
    match raw {
        Value::Nil => Ok(Vec::new()),
        Value::Map(map) => Ok(map
            .into_iter()
            .map(|(k, v)| RedisArInfoItem {
                field: redis_value_to_string(k, ""),
                value: format_ts_info_value(v),
            })
            .collect()),
        Value::Array(arr) => {
            let mut items = Vec::with_capacity(arr.len() / 2);
            let mut i = 0;
            while i + 1 < arr.len() {
                items.push(RedisArInfoItem {
                    field: redis_value_to_string(arr[i].clone(), ""),
                    value: format_ts_info_value(arr[i + 1].clone()),
                });
                i += 2;
            }
            Ok(items)
        }
        other => bail!(AppError::Internal {
            message: format!("unexpected TS.INFO reply: {:?}", other)
        }),
    }
}

#[cfg(test)]
mod ts_info_parse_tests {
    use super::*;

    /// labels 展成 `k=v`，rules 这种多元素用逗号，组与组用分号。
    #[test]
    fn labels_pairs_flatten() {
        let raw = Value::Array(vec![
            Value::BulkString(b"totalSamples".to_vec()),
            Value::Int(2),
            Value::BulkString(b"labels".to_vec()),
            Value::Array(vec![
                Value::Array(vec![
                    Value::BulkString(b"device".to_vec()),
                    Value::BulkString(b"thermometer".to_vec()),
                ]),
                Value::Array(vec![
                    Value::BulkString(b"location".to_vec()),
                    Value::BulkString(b"lab".to_vec()),
                ]),
            ]),
            Value::BulkString(b"rules".to_vec()),
            Value::Array(vec![Value::Array(vec![
                Value::BulkString(b"dest".to_vec()),
                Value::Int(60000),
                Value::BulkString(b"avg".to_vec()),
            ])]),
        ]);
        let items = parse_ts_info_items(raw).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].field, "totalSamples");
        assert_eq!(items[0].value, "2");
        assert_eq!(items[1].field, "labels");
        assert_eq!(items[1].value, "device=thermometer; location=lab");
        assert_eq!(items[2].field, "rules");
        assert_eq!(items[2].value, "dest,60000,avg");
    }

    /// TS.INFO 的空回复和 Map 都能收；不是数组或 Map 就报错。
    #[test]
    fn ts_info_nil_map_and_unexpected() {
        assert!(parse_ts_info_items(Value::Nil).unwrap().is_empty());
        let map = Value::Map(vec![(
            Value::BulkString(b"totalSamples".to_vec()),
            Value::Int(4),
        )]);
        let items = parse_ts_info_items(map).unwrap();
        assert_eq!(items[0].field, "totalSamples");
        assert_eq!(items[0].value, "4");
        assert!(parse_ts_info_items(Value::Int(1)).is_err());
    }

    /// ARINFO / VINFO 按对取值，落单的最后一个丢掉；空回复是空列表。
    #[test]
    fn info_kv_pairs_drop_trailing_odd() {
        assert!(parse_info_kv_items(Value::Nil, "VINFO").unwrap().is_empty());
        let raw = Value::Array(vec![
            Value::BulkString(b"size".to_vec()),
            Value::Int(2),
            Value::BulkString(b"orphan".to_vec()),
        ]);
        let items = parse_info_kv_items(raw, "ARINFO").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].field, "size");
        assert_eq!(items[0].value, "2");
        assert!(parse_info_kv_items(Value::Int(1), "VINFO").is_err());
    }
}

#[cfg(test)]
mod info_parse_tests {
    use super::*;

    /// RESP3 Map 形态的慢日志也能填上耗时和客户端。
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

    /// INFO 里的注释和坏数字跳过；db0/db1 的 keys 相加，三位库号不算，命中率用 hits/(hits+misses)。
    #[test]
    fn chart_sums_keyspace_and_ignores_comments() {
        let info = RedisInfo {
            node: String::new(),
            info: "\
# Clients
connected_clients:3
instantaneous_ops_per_sec:bad
db0:keys=10,expires=1
db1:keys=5,expires=0
db100:keys=99
keyspace_hits:3
keyspace_misses:1
"
            .into(),
        };
        let chart = info_to_chart(info).unwrap();
        assert_eq!(chart.connected_clients, 3);
        assert_eq!(chart.instantaneous_ops_per_sec, 0.0);
        assert_eq!(chart.key_total, 15);
        assert_eq!(chart.keyspace_hits, 3);
        assert!((chart.cache_hit_ratio - 0.75).abs() < 1e-9);
    }

    /// 两边都是 0 时命中率为 0，避免除零。
    #[test]
    fn chart_hit_ratio_is_zero_without_lookups() {
        let chart = info_to_chart(RedisInfo {
            node: String::new(),
            info: "keyspace_hits:0\nkeyspace_misses:0\n".into(),
        })
        .unwrap();
        assert_eq!(chart.cache_hit_ratio, 0.0);
        assert_eq!(chart.key_total, 0);
    }

    /// 慢日志数组至少 4 段；耗时从微秒换成毫秒，缺客户端时留空。
    #[test]
    fn slowlog_array_converts_cost_and_rejects_short() {
        let raw = Value::Array(vec![
            Value::Int(1),
            Value::Int(0),
            Value::Int(2500),
            Value::Array(vec![
                Value::BulkString(b"GET".to_vec()),
                Value::BulkString(b"k".to_vec()),
            ]),
        ]);
        let log = redis_value_to_log(raw, "n1").unwrap();
        assert_eq!(log.node, "n1");
        assert_eq!(log.id, 1);
        assert_eq!(log.cost, 2.5);
        assert_eq!(log.command, "GET k");
        assert_eq!(log.time, "1970-01-01 08:00:00");
        assert!(log.client.is_empty());
        assert!(redis_value_to_log(Value::Array(vec![Value::Int(1)]), "").is_err());
        assert!(redis_value_to_log(Value::Int(1), "").is_err());
    }

    /// CLIENT INFO 缺的字段用空串或 0，已有字段按原文填上。
    #[test]
    fn parse_client_info_fills_missing_fields() {
        let line = "id=10 addr=127.0.0.1:6380 flags=N db=15 cmd=get user=default resp=3";
        let info = parse_client_info(line).unwrap();
        assert_eq!(info.id, 10);
        assert_eq!(info.addr, "127.0.0.1:6380");
        assert_eq!(info.flags, "N");
        assert_eq!(info.db, 15);
        assert_eq!(info.cmd, "get");
        assert_eq!(info.user, "default");
        assert_eq!(info.resp, 3);
        assert_eq!(info.name, "");
        assert_eq!(info.age, 0);
        assert_eq!(info.fd, 0);

        let dashed = parse_client_info("id=1 qbuf-free=8").unwrap();
        assert_eq!(dashed.qbuf_free, 8);
    }
}
