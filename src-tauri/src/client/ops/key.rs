//! 键本身：类型、对象信息、过期、整键写入、删除、复制，以及清空当前库或全部库。字段在 `field`。

use crate::model::*;
use crate::support::convert::ui_key_type;
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::{Context, bail};
use parking_lot::MutexGuard;
use redis::{Commands, CopyOptions, JsonCommands, SetExpiry, SetOptions};

/// 设置或取消键的过期时间。正数是秒，否则改成持久键。
pub fn ttl0(mut conn: MutexGuard<impl Commands>, key: RedisKey, ttl: i64) -> AnyResult<()> {
    if ttl > 0 {
        // 为 key 设置超时时间。超时时间到期后，该 key 将被自动删除。
        // 请注意，调用 EXPIRE/`PEXPIRE` 时使用非正数超时，或调用 `EXPIREAT`/`PEXPIREAT` 时使用过去的时间，
        // 将导致 key 被 删除 而非过期（相应地，发出的 key 事件 将是 del，而不是 expired）。
        // 整数回复：如果未设置超时时间则返回 0；例如，key 不存在，或者由于提供的参数而跳过了操作。
        // 整数回复：如果已设置超时时间则返回 1。
        let _: () = conn.expire(&key, ttl)?;
    } else {
        // 移除 key 上已有的过期时间，将键从易失（设置了过期时间的键）变为变为持久
        // 整型回复: 如果 key 不存在或没有关联的过期时间，则返回 0。
        // 整型回复: 如果已移除过期时间，则返回 1。
        let _: () = conn.persist(&key)?;
    };
    Ok(())
}

/// 写入整个键。JSON 用 `JSON.SET`，其余按字符串 `SET`。TTL 大于 0 时一并设置。
pub fn set0(mut conn: MutexGuard<impl Commands>, param: RedisSetParam) -> AnyResult<()> {
    let key = param.key;
    let format = param.input_format.as_ref().cloned().unwrap_or_default();
    // 解析输入格式为字节（MsgPack 由前端编码为 base64 后传入）
    let bytes = parse_bytes(&param.value, &format)?;

    if param.key_type.unwrap_or_default() == ME_JSON_TYPE_NAME {
        // json 类型
        let value: serde_json::Value =
            serde_json::from_str(&param.value).with_context(|| "json parse error")?;
        let _: () = conn.json_set(&key, "$", &value)?;
        if param.ttl > 0 {
            let _: () = conn.expire(&key, param.ttl)?;
        }
    } else {
        // string 类型
        if param.ttl > 0 {
            let options = SetOptions::default().with_expiration(SetExpiry::EX(param.ttl as u64));
            let _: () = conn.set_options(&key, &bytes, options)?;
        } else {
            let _: () = conn.set(&key, &bytes)?;
        };
    }
    Ok(())
}

/// `DEL`。
pub fn del0(mut conn: MutexGuard<impl Commands>, key: RedisKey) -> AnyResult<()> {
    let _: () = conn.del(&key)?;
    Ok(())
}

/// 批量 `DEL` 回复合计。单键回复是 0 或 1，键不存在时为 0。
pub fn deleted_count(deleted: &[i64]) -> u64 {
    deleted
        .iter()
        .map(|n| if *n > 0 { *n as u64 } else { 0 })
        .sum()
}

/// `COPY` 到指定库。目标键已存在时直接报错，不覆盖。
pub fn copy0(mut conn: MutexGuard<impl Commands>, param: RedisCopyParam) -> AnyResult<RedisKey> {
    let dest = &param.destination;
    if conn.exists(dest)? {
        bail!(AppError::KeyAlreadyExists {
            key: vec8_to_display_string(dest.to_bytes())
        });
    }

    let opts = CopyOptions::default().db(param.db);
    let _: bool = conn.copy(&param.source, dest, opts)?;
    Ok(param.destination.to_normal())
}

/// `TYPE`。键不存在时返回 `none`。
pub fn key_type0(mut conn: MutexGuard<impl Commands>, key: RedisKey) -> AnyResult<String> {
    // 简单字符串回复：key 的类型，如果 key 不存在则返回 none
    let key_type: redis::ValueType = conn.key_type(&key)?;
    Ok(ui_key_type(key_type))
}

/// OBJECT ENCODING / IDLETIME / REFCOUNT / FREQ。IDLETIME、FREQ 受 maxmemory-policy 限制时写入对应的 error。
pub fn object_info0(
    mut conn: MutexGuard<impl Commands>,
    key: RedisKey,
) -> AnyResult<RedisObjectInfo> {
    let encoding: Option<String> = conn.object_encoding(&key)?;
    let refcount_raw: Option<usize> = conn.object_refcount(&key)?;
    let refcount = refcount_raw.map(|n| n as u64);

    // LFU 策略下 IDLETIME 报错；非 LFU 下 FREQ 报错 —— 记录原因供前端提示
    let (idle_time, idle_time_error) = match conn.object_idletime(&key) {
        Ok(v) => {
            let n: Option<usize> = v;
            (n.map(|x| x as u64), None)
        }
        Err(e) => (None, Some(e.to_string())),
    };
    let (freq, freq_error) = match conn.object_freq(&key) {
        Ok(v) => {
            let n: Option<usize> = v;
            (n.map(|x| x as u64), None)
        }
        Err(e) => (None, Some(e.to_string())),
    };

    Ok(RedisObjectInfo {
        encoding,
        idle_time,
        idle_time_error,
        refcount,
        freq,
        freq_error,
    })
}

/// `FLUSHDB`：清空当前库。
pub fn flush_db0(mut conn: MutexGuard<impl Commands>) -> AnyResult<()> {
    let _: () = conn.flushdb()?;
    Ok(())
}

/// `FLUSHALL`：清空全部库。
pub fn flush_all0(mut conn: MutexGuard<impl Commands>) -> AnyResult<()> {
    let _: () = conn.flushall()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::deleted_count;

    #[test]
    fn sums_positive_del_replies() {
        assert_eq!(deleted_count(&[]), 0);
        assert_eq!(deleted_count(&[1, 0, 1, 0]), 2);
    }
}
