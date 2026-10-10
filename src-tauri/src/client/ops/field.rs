//! 字段增删改和单条读取，以及 Array 最近插入的元素。整键操作在 `key`。

use crate::client::ops::field_scan::{
    handle_other_value_type, hash_field_ttl_to_preserve, resolve_include_field_ttl, vadd_values,
    vemb_json_or_dash, vgetattr_opt, vsetattr_json_or_clear,
};
use crate::model::*;
use crate::support::convert::{is_array_type, parse_array_index, to_key_type};
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::{Context, bail};
use parking_lot::MutexGuard;
use redis::{
    Commands, ExpireOption, FromRedisValue, IntegerReplyOrNoOp, JsonCommands, Value, ValueType,
};

/// 往已有键追加字段。不存在的键会按类型创建。
pub fn field_add0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisFieldAdd,
    httl_supported: bool,
) -> AnyResult<RedisKey> {
    let key_fmt = param.key_fmt.as_ref().cloned().unwrap_or_default();
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();

    // `bytes` 为空：沿用界面上的键名 + key_fmt 解析；非空：扫描/详情得到的二进制键，避免经 String 丢失
    let key: RedisKey = if param.key.bytes.is_empty() {
        parse_bytes(&param.key.key, &key_fmt)?.into()
    } else {
        param.key
    };
    let mode = param.mode;
    let mut key_type = to_key_type(&param.key_type);

    match mode.as_str() {
        "key" => {
            let exists: bool = conn.exists(&key)?;
            if exists {
                bail!(AppError::KeyAlreadyExists {
                    key: vec8_to_display_string(key.to_bytes())
                })
            }
        }
        // 直接沿用前端键类型：键不存在时 Redis 命令会自动创建；省一次 TYPE 调用
        "field" => key_type = to_key_type(&param.key_type),
        _ => bail!(AppError::FieldOperationNotSupported { mode }),
    }

    let fv_list = param.field_value_list;

    match key_type {
        ValueType::String => {
            // 解析输入格式为字节，然后写入
            let bytes = parse_bytes(&param.value, &val_fmt)?;
            conn.set(&key, &bytes)?
        }
        ValueType::Hash => {
            // 先解析再写入，避免中途解析失败导致已写入部分字段
            type HashFieldBytes = (Vec<u8>, Vec<u8>);
            let (field_pairs, ttls): (Vec<HashFieldBytes>, Vec<i64>) = fv_list
                .iter()
                .map(|f| -> AnyResult<_> {
                    Ok((
                        (
                            parse_bytes(&f.field_key, &val_fmt)?,
                            parse_bytes(&f.field_value, &val_fmt)?,
                        ),
                        f.field_ttl,
                    ))
                })
                .collect::<AnyResult<Vec<_>>>()?
                .into_iter()
                .unzip();
            let _: () = conn.hset_multiple(&key, &field_pairs)?;
            if httl_supported {
                for ((fk, _), ttl) in field_pairs.iter().zip(&ttls) {
                    if *ttl > 0 {
                        let _: () = conn.hexpire(&key, *ttl, ExpireOption::NONE, fk)?;
                    }
                }
            }
        }
        ValueType::List => {
            let mut elems: Vec<Vec<u8>> = fv_list
                .iter()
                .map(|f| parse_bytes(&f.field_value, &val_fmt))
                .collect::<AnyResult<Vec<_>>>()?;
            let lpush = param.list_push_method == "lpush";
            if lpush {
                // 与一次 LPUSH key v_n … v_1 相同：表头插入后顺序与 fv_list 一致
                elems.reverse();
            }
            let _: usize = if lpush {
                conn.lpush(&key, &elems)?
            } else {
                conn.rpush(&key, &elems)?
            };
        }
        ValueType::Set => {
            let members: Vec<Vec<u8>> = fv_list
                .iter()
                .map(|f| parse_bytes(&f.field_value, &val_fmt))
                .collect::<AnyResult<Vec<_>>>()?;
            let _: usize = conn.sadd(&key, &members)?;
        }
        ValueType::ZSet => {
            let items: Vec<(Vec<u8>, f64)> = fv_list
                .iter()
                .map(|f| -> AnyResult<_> {
                    Ok((parse_bytes(&f.field_value, &val_fmt)?, f.field_score))
                })
                .collect::<AnyResult<Vec<_>>>()?;
            let pairs: Vec<(f64, Vec<u8>)> = items.into_iter().map(|(m, s)| (s, m)).collect();
            let _: usize = conn.zadd_multiple(&key, &pairs)?;
        }
        ValueType::Stream => {
            let items: Vec<(Vec<u8>, Vec<u8>)> = fv_list
                .iter()
                .map(|f| -> AnyResult<(Vec<u8>, Vec<u8>)> {
                    Ok((
                        parse_bytes(&f.field_key, &val_fmt)?,
                        parse_bytes(&f.field_value, &val_fmt)?,
                    ))
                })
                .collect::<AnyResult<Vec<_>>>()?;
            conn.xadd(&key, &param.stream_id, &items)?
        }
        ValueType::JSON => {
            let value: serde_json::Value =
                serde_json::from_str(&param.value).with_context(|| "json parse error")?;
            conn.json_set(&key, "$", &value)?
        }
        // Array：arinsert→ARINSERT；否则 ARSET（field_key=索引）；见 is_array_type 升级注释
        _ if is_array_type(&key_type) => {
            let arinsert = param.array_write_method.eq_ignore_ascii_case("arinsert");
            if arinsert {
                let mut cmd = redis::cmd("ARINSERT");
                cmd.arg(&key);
                for f in &fv_list {
                    let val = parse_bytes(&f.field_value, &val_fmt)?;
                    cmd.arg(&val);
                }
                let _: i64 = cmd.query(&mut conn)?;
            } else {
                for f in &fv_list {
                    let idx = parse_array_index(&f.field_key)?;
                    let val = parse_bytes(&f.field_value, &val_fmt)?;
                    let _: i64 = redis::cmd("ARSET")
                        .arg(&key)
                        .arg(idx)
                        .arg(&val)
                        .query(&mut conn)?;
                }
            }
        }
        // Vector Set：VADD VALUES（redis-rs）；空/零向量交给 Redis 原错；可选 VSETATTR
        ValueType::VectorSet => {
            let elem = if let Some(f) = fv_list.first() {
                parse_bytes(&f.field_key, &val_fmt)?
            } else {
                bail!("vectorset element name is required");
            };
            vadd_values(&mut conn, &key, &param.vector, &elem)?;
            if !param.attrs.trim().is_empty() {
                vsetattr_json_or_clear(&mut conn, &key, &elem, &param.attrs)?;
            }
        }
        // TimeSeries：timestamp/value 为明文（不走 wire）；空列表或空样本 → TS.ADD key * 0
        ValueType::TimeSeries => {
            let samples: Vec<(&str, &str)> = fv_list
                .iter()
                .map(|f| (f.field_key.trim(), f.field_value.trim()))
                .filter(|(ts, val)| !ts.is_empty() || !val.is_empty())
                .collect();
            if samples.is_empty() {
                let _: Value = redis::cmd("TS.ADD")
                    .arg(&key)
                    .arg("*")
                    .arg(0)
                    .query(&mut conn)?;
            } else {
                for (ts, val) in samples {
                    let timestamp = if ts.is_empty() { "*" } else { ts };
                    if val.is_empty() {
                        bail!("timeseries value is required");
                    }
                    let _: Value = redis::cmd("TS.ADD")
                        .arg(&key)
                        .arg(timestamp)
                        .arg(val)
                        .query(&mut conn)?;
                }
            }
        }
        _ => {
            handle_other_value_type(&key_type, &key)?;
        }
    };

    if "key" == mode && param.ttl > 0 {
        let _: () = conn.expire(&key, param.ttl)?;
    }
    Ok(key)
}

/// 修改已有字段。Hash 在改值前会尽量保留字段自己的过期时间。
pub fn field_set0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisFieldSet,
    httl_supported: bool,
) -> AnyResult<()> {
    let key: RedisKey = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();

    match key_type {
        ValueType::Hash => {
            // HSET 会清除字段级 TTL；UI 开启时用用户输入，未开启则写前 HTTL、写后 HEXPIRE 补回
            let key_bytes = parse_bytes(&param.field_key, &val_fmt)?;
            let value_bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let include_field_ttl =
                resolve_include_field_ttl(param.include_field_ttl, httl_supported);
            let preserve_ttl = if httl_supported && !include_field_ttl {
                hash_field_ttl_to_preserve(&mut conn, &key, &key_bytes, httl_supported)?
            } else {
                None
            };
            let _: () = conn.hset(&key, &key_bytes, &value_bytes)?;
            if httl_supported {
                if include_field_ttl && param.field_ttl > 0 {
                    let _: () =
                        conn.hexpire(&key, param.field_ttl, ExpireOption::NONE, &key_bytes)?;
                } else if let Some(ttl) = preserve_ttl {
                    let _: () = conn.hexpire(&key, ttl, ExpireOption::NONE, &key_bytes)?;
                }
            }
        }
        ValueType::List => {
            let bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let _: () = conn.lset(&key, param.field_index, &bytes)?;
        }
        ValueType::Set => {
            let src_bytes = parse_bytes(&param.src_field_value, &val_fmt)?;
            let bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let _: () = conn.srem(&key, &src_bytes)?;
            let _: () = conn.sadd(&key, &bytes)?;
        }
        ValueType::ZSet => {
            let src_bytes = parse_bytes(&param.src_field_value, &val_fmt)?;
            let bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let _: () = conn.zrem(&key, &src_bytes)?;
            let _: () = conn.zadd(&key, &bytes, param.field_score)?;
        }
        // Array：按索引 ARSET；见 is_array_type 升级注释
        _ if is_array_type(&key_type) => {
            let bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let idx = if !param.field_key.is_empty() {
                parse_array_index(&param.field_key)?
            } else {
                let i = param.field_index as i64;
                if i < 0 {
                    bail!("invalid array index: {}", i);
                }
                i
            };
            let _: i64 = redis::cmd("ARSET")
                .arg(&key)
                .arg(idx)
                .arg(&bytes)
                .query(&mut conn)?;
        }
        // Vector Set：VADD upsert + VSETATTR；前端恒提交当前全量，空串=清除属性（官方约定）
        ValueType::VectorSet => {
            let elem = parse_bytes(&param.field_key, &val_fmt)?;
            vadd_values(&mut conn, &key, &param.vector, &elem)?;
            vsetattr_json_or_clear(&mut conn, &key, &elem, &param.attrs)?;
        }
        // TimeSeries：同 timestamp upsert；ON_DUPLICATE LAST（policy=BLOCK 时透传原错）
        ValueType::TimeSeries => {
            let ts = param.field_key.trim();
            let val = param.field_value.trim();
            if ts.is_empty() {
                bail!("timeseries timestamp is required");
            }
            if val.is_empty() {
                bail!("timeseries value is required");
            }
            let _: Value = redis::cmd("TS.ADD")
                .arg(&key)
                .arg(ts)
                .arg(val)
                .arg("ON_DUPLICATE")
                .arg("LAST")
                .query(&mut conn)?;
        }
        _ => {
            handle_other_value_type(&key_type, &key)?;
        }
    };
    Ok(())
}

/// Hash 字段过期：不改字段值。>0 → HEXPIRE；否则 HPERSIST。
pub fn field_ttl0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisFieldTtl,
    httl_supported: bool,
) -> AnyResult<()> {
    if !httl_supported {
        bail!(AppError::HttlNotSupported);
    }
    let key: RedisKey = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    if key_type != ValueType::Hash {
        handle_other_value_type(&key_type, &key)?;
        return Ok(());
    }
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();
    let field_bytes = parse_bytes(&param.field_key, &val_fmt)?;
    let replies: Vec<IntegerReplyOrNoOp> = if param.field_ttl > 0 {
        conn.hexpire(&key, param.field_ttl, ExpireOption::NONE, &field_bytes)?
    } else {
        conn.hpersist(&key, &field_bytes)?
    };
    if matches!(replies.first(), Some(IntegerReplyOrNoOp::NotExists)) {
        bail!(AppError::FieldNotFound {
            hash_key: param.field_key,
        });
    }
    Ok(())
}

/// 单条字段读取：Hash→HGET+HTTL，List→LINDEX，ZSet→ZSCORE；Set/Stream 等不支持
pub fn field_get0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisFieldGet,
    httl_supported: bool,
) -> AnyResult<RedisFieldValue> {
    let key: RedisKey = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();

    match key_type {
        ValueType::Hash => {
            let field_bytes = parse_bytes(&param.field_key, &val_fmt)?;
            let value: Option<Vec<u8>> = conn.hget(&key, &field_bytes)?;
            let value_bytes = value.ok_or_else(|| AppError::FieldNotFound {
                hash_key: param.field_key.clone(),
            })?;
            let mut field_ttl = -1i64;
            let include_field_ttl =
                resolve_include_field_ttl(param.include_field_ttl, httl_supported);
            if include_field_ttl
                && let Ok(ttl_values) =
                    conn.httl::<_, _, Vec<IntegerReplyOrNoOp>>(&key, &[&field_bytes])
            {
                field_ttl = match ttl_values.first() {
                    Some(IntegerReplyOrNoOp::IntegerReply(ttl)) => *ttl as i64,
                    Some(IntegerReplyOrNoOp::NotExists) => -2,
                    Some(IntegerReplyOrNoOp::ExistsButNotRelevant) | None => -1,
                    _ => -1,
                };
            }
            Ok(RedisFieldValue {
                field_key: format_bytes(&field_bytes, &val_fmt),
                field_value: format_bytes(&value_bytes, &val_fmt),
                field_score: 0.0,
                field_ttl,
                field_attrs: String::new(),
            })
        }
        ValueType::List => {
            let value: Option<Vec<u8>> = conn.lindex(&key, param.field_index)?;
            let value_bytes = value.ok_or_else(|| AppError::FieldNotFound {
                hash_key: param.field_index.to_string(),
            })?;
            Ok(RedisFieldValue {
                field_key: String::new(),
                field_value: format_bytes(&value_bytes, &val_fmt),
                field_score: 0.0,
                field_ttl: -1,
                field_attrs: String::new(),
            })
        }
        ValueType::ZSet => {
            let member_bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let score: Option<f64> = conn.zscore(&key, &member_bytes)?;
            let score = score.ok_or_else(|| AppError::FieldNotFound {
                hash_key: param.field_value.clone(),
            })?;
            Ok(RedisFieldValue {
                field_key: String::new(),
                field_value: format_bytes(&member_bytes, &val_fmt),
                field_score: score,
                field_ttl: -1,
                field_attrs: String::new(),
            })
        }
        // Array：ARGET；见 is_array_type 升级注释
        _ if is_array_type(&key_type) => {
            let idx = param.field_index as i64;
            if idx < 0 {
                bail!("invalid array index: {}", idx);
            }
            let value: Option<Vec<u8>> = redis::cmd("ARGET").arg(&key).arg(idx).query(&mut conn)?;
            let value_bytes = value.ok_or_else(|| AppError::FieldNotFound {
                hash_key: idx.to_string(),
            })?;
            Ok(RedisFieldValue {
                field_key: String::new(),
                field_value: format_bytes(&value_bytes, &val_fmt),
                field_score: 0.0,
                field_ttl: -1,
                field_attrs: String::new(),
            })
        }
        // VectorSet：VISMEMBER + VEMB + VGETATTR
        ValueType::VectorSet => {
            let elem = parse_bytes(&param.field_key, &val_fmt)?;
            let exists: bool = redis::cmd("VISMEMBER")
                .arg(&key)
                .arg(&elem)
                .query(&mut conn)?;
            if !exists {
                bail!(AppError::FieldNotFound {
                    hash_key: param.field_key.clone(),
                });
            }
            let vector = vemb_json_or_dash(&mut conn, &key, &elem);
            let attrs = vgetattr_opt(&mut conn, &key, &elem).unwrap_or_default();
            Ok(RedisFieldValue {
                field_key: format_bytes(&elem, &val_fmt),
                field_value: vector,
                field_score: 0.0,
                field_ttl: -1,
                field_attrs: attrs,
            })
        }
        _ => {
            handle_other_value_type(&key_type, &key)?;
            unreachable!()
        }
    }
}

/// Hash 全量字段名：HKEYS，按 val_fmt 格式化后返回
pub fn hash_keys0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisHashKeys,
) -> AnyResult<Vec<String>> {
    let key = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    if key_type != ValueType::Hash {
        handle_other_value_type(&key_type, &key)?;
        unreachable!()
    }
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();
    let fields: Vec<Vec<u8>> = redis::cmd("HKEYS").arg(&key).query(&mut conn)?;
    Ok(fields
        .into_iter()
        .map(|f| format_bytes(&f, &val_fmt))
        .collect())
}

/// Hash 全量字段值：HVALS，按 val_fmt 格式化后返回
pub fn hash_values0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisHashKeys,
) -> AnyResult<Vec<String>> {
    let key = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    if key_type != ValueType::Hash {
        handle_other_value_type(&key_type, &key)?;
        unreachable!()
    }
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();
    let values: Vec<Vec<u8>> = redis::cmd("HVALS").arg(&key).query(&mut conn)?;
    Ok(values
        .into_iter()
        .map(|v| format_bytes(&v, &val_fmt))
        .collect())
}

/// List/Set/ZSet 通用弹出：LPOP/RPOP/SPOP/ZPOPMIN/ZPOPMAX
pub fn field_pop0(mut conn: MutexGuard<impl Commands>, param: RedisPop) -> AnyResult<String> {
    let key = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    let cmd = param.mode.to_uppercase();
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();

    // 校验键类型
    let expected = match cmd.as_str() {
        "LPOP" | "RPOP" => ValueType::List,
        "SPOP" => ValueType::Set,
        "ZPOPMIN" | "ZPOPMAX" => ValueType::ZSet,
        other => bail!(AppError::FieldOperationNotSupported { mode: other.into() }),
    };
    if key_type != expected {
        handle_other_value_type(&key_type, &key)?;
        unreachable!()
    }

    // 执行命令
    match cmd.as_str() {
        "LPOP" | "RPOP" | "SPOP" => {
            let value: Option<Vec<u8>> = redis::cmd(&cmd).arg(&key).query(&mut conn)?;
            Ok(value
                .map(|v| format_bytes(&v, &val_fmt))
                .unwrap_or_default())
        }
        "ZPOPMIN" | "ZPOPMAX" => {
            let value: Option<Vec<(Vec<u8>, f64)>> = redis::cmd(&cmd).arg(&key).query(&mut conn)?;
            let result = value.and_then(|mut v| v.pop()).map(|(member, score)| {
                let member_str = format_bytes(&member, &val_fmt);
                format!("{} (score: {})", member_str, score)
            });
            Ok(result.unwrap_or_default())
        }
        _ => unreachable!(),
    }
}

/// 按类型删除字段或成员。
pub fn field_del0(mut conn: MutexGuard<impl Commands>, param: RedisFieldDel) -> AnyResult<()> {
    let key: RedisKey = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();

    match key_type {
        ValueType::Hash => {
            let field_key = parse_bytes(&param.field_key, &val_fmt)?;
            let _: () = conn.hdel(&key, field_key)?;
        }
        ValueType::List => {
            let _: () = conn.lset(&key, param.field_index, REDIS_ME_FIELD_TO_DELETE_TMP_VALUE)?;
            let _: () = conn.lrem(&key, 1, REDIS_ME_FIELD_TO_DELETE_TMP_VALUE)?;
        }
        ValueType::Set => {
            let bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let _: () = conn.srem(&key, bytes)?;
        }
        ValueType::ZSet => {
            let bytes = parse_bytes(&param.field_value, &val_fmt)?;
            let _: () = conn.zrem(&key, bytes)?;
        }
        ValueType::Stream => {
            let _: () = conn.xdel(&key, &[param.stream_id])?;
        }
        // Array：ARDEL 删槽（留空洞）；见 is_array_type 升级注释
        _ if is_array_type(&key_type) => {
            let idx = param.field_index as i64;
            if idx < 0 {
                bail!("invalid array index: {}", idx);
            }
            let _: i64 = redis::cmd("ARDEL").arg(&key).arg(idx).query(&mut conn)?;
        }
        // Vector Set：VREM（redis-rs）；元素名 field_key
        ValueType::VectorSet => {
            let elem = parse_bytes(&param.field_key, &val_fmt)?;
            let _: bool = conn.vrem(&key, &elem)?;
        }
        // TimeSeries：TS.DEL from to（单点 from=to）；timestamp 在 field_key 明文
        ValueType::TimeSeries => {
            let ts = param.field_key.trim();
            if ts.is_empty() {
                bail!("timeseries timestamp is required");
            }
            let _: i64 = redis::cmd("TS.DEL")
                .arg(&key)
                .arg(ts)
                .arg(ts)
                .query(&mut conn)?;
        }
        _ => {
            handle_other_value_type(&key_type, &key)?;
        }
    };
    Ok(())
}

/// Array `ARLASTITEMS`：最近插入的元素。`REV` 时最近的排在前面。
/// 官方回复允许 string 或 null；稀疏 ARMSET 键可能含空槽 null。
pub fn ar_last_items0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisArLastItems,
) -> AnyResult<Vec<RedisArLastItemsItem>> {
    let key: RedisKey = param.key;
    let key_type: ValueType = conn.key_type(&key)?;
    if !is_array_type(&key_type) {
        handle_other_value_type(&key_type, &key)?;
        unreachable!()
    }
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();
    let count = if param.count == 0 { 10 } else { param.count };
    let mut cmd = redis::cmd("ARLASTITEMS");
    cmd.arg(&key).arg(count);
    if param.reverse {
        cmd.arg("REV");
    }
    let raw: Value = cmd.query(&mut conn)?;
    let arr = match raw {
        Value::Nil => Vec::new(),
        Value::Array(a) => a,
        other => bail!(AppError::Internal {
            message: format!("unexpected ARLASTITEMS reply: {:?}", other)
        }),
    };
    let mut items = Vec::with_capacity(arr.len());
    for (i, entry) in arr.into_iter().enumerate() {
        let value = match entry {
            Value::Nil => None,
            v => {
                let bytes: Vec<u8> = FromRedisValue::from_redis_value(v)
                    .map_err(|e| anyhow::anyhow!("ARLASTITEMS value parse: {}", e))?;
                Some(format_bytes(&bytes, &val_fmt))
            }
        };
        items.push(RedisArLastItemsItem {
            index: i as i64,
            value,
        });
    }
    Ok(items)
}
