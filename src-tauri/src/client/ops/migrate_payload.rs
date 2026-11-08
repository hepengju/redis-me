//! 命令模式迁移：结构化 KeyPayload（源读 → 目标写），不经 redis-cli 文本往返。

use crate::client::ops::field_scan::{ARRAY_INDEX_MAX, vadd_values, vgetattr_opt, vsetattr_json_or_clear};
use crate::model::*;
use crate::support::convert::*;
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::bail;
use parking_lot::MutexGuard;
use redis::{Commands, Value, ValueType};

/// Vector Set / TimeSeries 单键最多迁移条数（与 cmd 导出上限一致）；触达且仍有剩余 → 整键失败。
const ELEMENT_LIMIT: usize = 1000;

/// 源侧读出的整键载荷，目标侧按类型直写。
pub enum KeyPayload {
    String(Vec<u8>),
    Hash(Vec<(Vec<u8>, Vec<u8>)>),
    List(Vec<Vec<u8>>),
    Set(Vec<Vec<u8>>),
    ZSet(Vec<(Vec<u8>, f64)>),
    /// entry id + field-value 对
    Stream(Vec<(Vec<u8>, Vec<(Vec<u8>, Vec<u8>)>)>),
    Json(Vec<u8>),
    /// 下标 + 值
    Array(Vec<(i64, Vec<u8>)>),
    /// element 名 + 向量 + 可选 attrs JSON
    VectorSet(Vec<(Vec<u8>, Vec<f64>, Option<String>)>),
    /// timestamp 明文 + value 明文
    TimeSeries(Vec<(String, String)>),
}

/// 从源连接读出整键。
pub fn read_key_payload0(
    mut conn: MutexGuard<'_, impl Commands>,
    key: RedisKey,
) -> AnyResult<KeyPayload> {
    read_key_payload(&mut *conn, &key)
}

/// 把载荷写到目标连接（调用方已处理冲突 DEL）。
pub fn write_key_payload0(
    mut conn: MutexGuard<'_, impl Commands>,
    key: RedisKey,
    payload: KeyPayload,
) -> AnyResult<()> {
    write_key_payload(&mut *conn, &key, payload)
}

fn read_key_payload(conn: &mut impl Commands, key: &RedisKey) -> AnyResult<KeyPayload> {
    let key_type: ValueType = conn.key_type(key)?;
    if key_type == ValueType::None {
        bail!(AppError::KeyNotFound {
            key: vec8_to_display_string(key.to_bytes())
        });
    }

    let payload = match key_type {
        ValueType::String => {
            let value: Vec<u8> = conn.get(key)?;
            KeyPayload::String(value)
        }
        ValueType::Hash => {
            let pairs: Vec<(Vec<u8>, Vec<u8>)> = conn.hgetall(key)?;
            KeyPayload::Hash(pairs)
        }
        ValueType::List => {
            let items: Vec<Vec<u8>> = conn.lrange(key, 0, -1)?;
            KeyPayload::List(items)
        }
        ValueType::Set => {
            let members: Vec<Vec<u8>> = conn.smembers(key)?;
            KeyPayload::Set(members)
        }
        ValueType::ZSet => {
            let pairs: Vec<(Vec<u8>, f64)> = conn.zrange_withscores(key, 0, -1)?;
            KeyPayload::ZSet(pairs)
        }
        ValueType::Stream => {
            let raw: Value = redis::cmd("XRANGE")
                .arg(key)
                .arg("-")
                .arg("+")
                .query(conn)?;
            KeyPayload::Stream(parse_xrange_ordered(raw)?)
        }
        ValueType::JSON => {
            let json: Value = redis::cmd("JSON.GET").arg(key).query(conn)?;
            let bytes = match json {
                Value::Nil => Vec::new(),
                Value::BulkString(b) => b,
                other => redis_value_to_bulk_bytes(other),
            };
            if bytes.is_empty() {
                bail!(AppError::KeyNotFound {
                    key: vec8_to_display_string(key.to_bytes())
                });
            }
            KeyPayload::Json(bytes)
        }
        _ if is_array_type(&key_type) => {
            let raw: Value = redis::cmd("ARSCAN")
                .arg(key)
                .arg(0u64)
                .arg(ARRAY_INDEX_MAX)
                .query(conn)?;
            KeyPayload::Array(parse_arscan_pairs(raw)?)
        }
        ValueType::VectorSet => KeyPayload::VectorSet(read_vector_set(conn, key)?),
        ValueType::TimeSeries => KeyPayload::TimeSeries(read_time_series(conn, key)?),
        other => bail!(AppError::KeyTypeUnsupported {
            value_type: ui_key_type(other)
        }),
    };
    Ok(payload)
}

fn read_vector_set(
    conn: &mut impl Commands,
    key: &RedisKey,
) -> AnyResult<Vec<(Vec<u8>, Vec<f64>, Option<String>)>> {
    let mut out = Vec::new();
    let mut start: Vec<u8> = b"-".to_vec();
    let mut truncated = false;
    loop {
        let names: Vec<Vec<u8>> = match redis::cmd("VRANGE")
            .arg(key)
            .arg(&start)
            .arg("+")
            .arg(100)
            .query(conn)
        {
            Ok(names) => names,
            Err(_) => break,
        };
        if names.is_empty() {
            break;
        }
        for name in &names {
            if out.len() >= ELEMENT_LIMIT {
                truncated = true;
                break;
            }
            let Ok(nums) = conn.vemb::<_, _, Vec<f64>>(key, name) else {
                continue;
            };
            if nums.is_empty() {
                continue;
            }
            let attrs = vgetattr_opt(conn, key, name);
            out.push((name.clone(), nums, attrs));
        }
        if truncated || names.len() < 100 {
            break;
        }
        let mut next = vec![b'('];
        next.extend_from_slice(names.last().unwrap());
        start = next;
    }
    if truncated {
        bail!(AppError::MigrateCommandExportLimit {
            key: vec8_to_display_string(key.to_bytes())
        });
    }
    Ok(out)
}

fn read_time_series(conn: &mut impl Commands, key: &RedisKey) -> AnyResult<Vec<(String, String)>> {
    let mut out = Vec::new();
    let mut to = "+".to_string();
    loop {
        let remain = ELEMENT_LIMIT.saturating_sub(out.len());
        if remain == 0 {
            bail!(AppError::MigrateCommandExportLimit {
                key: vec8_to_display_string(key.to_bytes())
            });
        }
        let page = remain.min(100);
        let raw: Value = redis::cmd("TS.REVRANGE")
            .arg(key)
            .arg("-")
            .arg(&to)
            .arg("COUNT")
            .arg(page)
            .query(conn)?;
        let items = parse_ts_range_items(raw)?;
        if items.is_empty() {
            break;
        }
        out.extend(items.iter().map(|item| (item.key.clone(), item.value.clone())));
        if items.len() < page {
            break;
        }
        to = ts_timestamp_dec_one(&items.last().unwrap().key);
    }
    // REVRANGE 是新→旧；写入 TS.ADD 用旧→新更自然
    out.reverse();
    Ok(out)
}

fn write_key_payload(conn: &mut impl Commands, key: &RedisKey, payload: KeyPayload) -> AnyResult<()> {
    match payload {
        KeyPayload::String(value) => {
            let _: () = conn.set(key, value)?;
        }
        KeyPayload::Hash(pairs) => {
            if !pairs.is_empty() {
                let _: () = conn.hset_multiple(key, &pairs)?;
            }
        }
        KeyPayload::List(items) => {
            if !items.is_empty() {
                let _: () = conn.rpush(key, items)?;
            }
        }
        KeyPayload::Set(members) => {
            if !members.is_empty() {
                let _: () = conn.sadd(key, members)?;
            }
        }
        KeyPayload::ZSet(pairs) => {
            if !pairs.is_empty() {
                // ZADD key score member ...
                let mut cmd = redis::cmd("ZADD");
                cmd.arg(key);
                for (member, score) in pairs {
                    cmd.arg(score).arg(member);
                }
                let _: () = cmd.query(conn)?;
            }
        }
        KeyPayload::Stream(entries) => {
            for (id, fields) in entries {
                let mut cmd = redis::cmd("XADD");
                cmd.arg(key).arg(&id);
                for (f, v) in fields {
                    cmd.arg(f).arg(v);
                }
                let _: () = cmd.query(conn)?;
            }
        }
        KeyPayload::Json(bytes) => {
            let _: () = redis::cmd("JSON.SET")
                .arg(key)
                .arg("$")
                .arg(bytes)
                .query(conn)?;
        }
        KeyPayload::Array(pairs) => {
            if !pairs.is_empty() {
                let mut cmd = redis::cmd("ARMSET");
                cmd.arg(key);
                for (idx, val) in pairs {
                    cmd.arg(idx).arg(val);
                }
                let _: () = cmd.query(conn)?;
            }
        }
        KeyPayload::VectorSet(items) => {
            for (name, nums, attrs) in items {
                vadd_values(conn, key, &nums, &name)?;
                if let Some(a) = attrs.as_deref() {
                    vsetattr_json_or_clear(conn, key, &name, a)?;
                }
            }
        }
        KeyPayload::TimeSeries(samples) => {
            for (ts, val) in samples {
                let _: Value = redis::cmd("TS.ADD")
                    .arg(key)
                    .arg(&ts)
                    .arg(&val)
                    .query(conn)?;
            }
        }
    }
    Ok(())
}
