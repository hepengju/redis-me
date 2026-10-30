use crate::model::*;
use crate::support::convert::*;
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::bail;
use parking_lot::MutexGuard;
use redis::streams::StreamRangeReply;
use redis::vector_sets::{EmbeddingInput, VectorAddInput};
use redis::{Cmd, Commands, FromRedisValue, IntegerReplyOrNoOp, Value, ValueType};
use log::warn;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter};

/// 是否执行 HTTL/HEXPIRE：须同时满足服务端能力与调用方 opt（默认 false）
pub fn resolve_include_field_ttl(opt: Option<bool>, httl_supported: bool) -> bool {
    httl_supported && opt.unwrap_or(false)
}

/// HSET 前读取 Hash 字段剩余过期秒数；无字段级 TTL 或已永久则返回 None
pub fn hash_field_ttl_to_preserve(
    conn: &mut impl Commands,
    key: &RedisKey,
    field: &[u8],
    httl_supported: bool,
) -> AnyResult<Option<i64>> {
    if !httl_supported {
        return Ok(None);
    }
    let ttl_values = conn.httl::<_, _, Vec<IntegerReplyOrNoOp>>(key, &[field])?;
    Ok(match ttl_values.first() {
        Some(IntegerReplyOrNoOp::IntegerReply(ttl)) if *ttl > 0 => Some(*ttl as i64),
        _ => None,
    })
}

/// 字段扫描入口：精确查询或按类型翻页，最后组装成一页结果。
pub fn field_scan0(
    mut conn: MutexGuard<impl Commands>,
    param: FieldScanParam,
    httl_supported: bool,
    memory_usage_supported: bool,
) -> AnyResult<FieldScanResult> {
    let bytes_format = param.bytes_format.as_ref().cloned().unwrap_or_default();
    let include_field_ttl = field_scan_include_field_ttl(&param, httl_supported);

    // String, Json, List, Stream 直接获取；Hash/Set/ZSet 走 exact 或 *SCAN（ZSet 有分数范围时走 ZRANGEBYSCORE）
    let (mut value, key_type, mut cc, length, value_truncated) =
        field_scan_0_get(&mut conn, &param, &bytes_format)?;
    if value.is_none() {
        if let Some((exact_value, exact_cc)) = field_scan_0_exact(
            &mut conn,
            &param.key,
            &key_type,
            &param,
            &bytes_format,
            include_field_ttl,
        )? {
            value = Some(exact_value);
            cc = exact_cc;
        } else {
            // 每次 API 只执行一轮 HSCAN/SSCAN/ZSCAN，循环由前端控制；COUNT 用 fieldScanCount，非键扫描 batch
            let batch_count = field_scan_batch_count(param.count);
            let cmd = field_scan_1_cmd(
                &key_type,
                &param.key,
                cc.now_cursor,
                &param.pattern,
                batch_count,
            )?;
            let (next_cursor, new_value): (u64, Value) = cmd.query(&mut conn)?;
            let mut scan_value = FieldScanValue::default();
            field_scan_2_value(
                &mut conn,
                &key_type,
                &mut scan_value,
                new_value,
                &param.key,
                &bytes_format,
                include_field_ttl,
            )?;
            cc.now_cursor = next_cursor;
            if next_cursor == 0 {
                cc.finished = true;
            }
            value = Some(field_scan_3_json(&key_type, &scan_value)?);
        }
    }

    let include_meta = field_scan_include_meta(&param);
    field_scan_4_return(
        conn,
        param.key,
        key_type,
        value.unwrap_or_default(),
        cc,
        length,
        value_truncated,
        include_meta,
        memory_usage_supported,
    )
}

/// Array 索引上界：Redis `arrayParseIndex` 拒绝 UINT64_MAX（仅 ARSEEK 例外），故用 MAX-1。
pub const ARRAY_INDEX_MAX: u64 = u64::MAX - 1;

/// Vector Set：VADD VALUES（redis-rs）；upsert 返回 false 仍算成功
pub fn vadd_values(
    conn: &mut impl Commands,
    key: &RedisKey,
    vector: &[f64],
    element: &[u8],
) -> AnyResult<()> {
    let _: bool = conn.vadd(
        key,
        VectorAddInput::Values(EmbeddingInput::Float64(vector)),
        element,
    )?;
    Ok(())
}

/// Vector Set：VEMB → JSON 展示串；失败返回 "-"（不拖死整页）
pub fn vemb_json_or_dash(conn: &mut impl Commands, key: &RedisKey, element: &[u8]) -> String {
    conn.vemb::<_, _, Vec<f64>>(key, element)
        .ok()
        .and_then(|nums| serde_json::to_string(&nums).ok())
        .unwrap_or_else(|| "-".into())
}

/// Vector Set：VGETATTR；无属性 / 失败 → None（不拖死整页）
pub fn vgetattr_opt(conn: &mut impl Commands, key: &RedisKey, element: &[u8]) -> Option<String> {
    conn.vgetattr::<_, _, Option<String>>(key, element)
        .ok()
        .flatten()
        .filter(|s: &String| !s.is_empty())
}

/// Vector Set：VSETATTR；空串删除属性（官方约定）
pub fn vsetattr_json_or_clear(
    conn: &mut impl Commands,
    key: &RedisKey,
    element: &[u8],
    attrs: &str,
) -> AnyResult<()> {
    let payload = attrs.trim();
    let _: bool = redis::cmd("VSETATTR")
        .arg(key)
        .arg(element)
        .arg(payload)
        .query(conn)?;
    Ok(())
}

/// `ZRANK` / `ZREVRANK`：成员的排名和分数。
pub fn zset_rank0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisZsetRank,
) -> AnyResult<RedisZsetRankResult> {
    let key: RedisKey = param.key;
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();
    let member_bytes = parse_bytes(&param.member, &val_fmt)?;
    let rank: Option<u64> = conn.zrank(&key, &member_bytes)?;
    let rev_rank: Option<u64> = conn.zrevrank(&key, &member_bytes)?;
    Ok(RedisZsetRankResult { rank, rev_rank })
}

/// ZSet Top/Bottom 范围查询：ZRANGE/ZREVRANGE ... WITHSCORES
pub fn zset_range0(
    mut conn: MutexGuard<impl Commands>,
    param: RedisZsetRange,
) -> AnyResult<Vec<RedisZsetRangeItem>> {
    let key: RedisKey = param.key;
    let val_fmt = param.val_fmt.as_ref().cloned().unwrap_or_default();
    let cmd_name = if param.reverse { "ZREVRANGE" } else { "ZRANGE" };
    let end = (param.count as isize).saturating_sub(1);
    let values: Vec<(Vec<u8>, f64)> = redis::cmd(cmd_name)
        .arg(&key)
        .arg(0)
        .arg(end)
        .arg("WITHSCORES")
        .query(&mut conn)?;
    Ok(values
        .into_iter()
        .map(|(v, s)| RedisZsetRangeItem {
            value: format_bytes(&v, &val_fmt),
            score: s,
        })
        .collect())
}

/// 当前操作不支持这个键类型时返回对应错误。调用方在匹配失败后调用，正常类型不会走到这里。
pub fn handle_other_value_type(
    value_type: &ValueType,
    key: &RedisKey,
) -> AnyResult<serde_json::Value> {
    match value_type {
        ValueType::Unknown(other) => {
            if "none" == other {
                bail!(AppError::KeyNotFound {
                    key: vec8_to_display_string(key.to_bytes())
                })
            } else {
                bail!(AppError::KeyTypeUnknown {
                    value_type: other.into()
                })
            }
        }
        //ValueType::Stream => bail!("Unsupported Type: Stream"),
        _ => bail!(AppError::KeyTypeUnsupported {
            value_type: format!("{:?}", value_type)
        }),
    }
}

/// GETRANGE 单块字节数。分块拉取写盘，峰值内存只占一块；Redis 字符串上限 512MB，1MB 分片兼顾进度平滑与往返开销。
const VALUE_DOWNLOAD_CHUNK: usize = 1024 * 1024;

fn emit_value_download(
    app_handle: &AppHandle,
    id: &str,
    percent: u8,
    finished: bool,
    error: Option<String>,
) {
    let event = ValueDownloadEvent {
        id: id.to_string(),
        percent,
        finished,
        error,
    };
    let _ = app_handle.emit(EVENT_VALUE_DOWNLOAD, event);
}

/// 下载 STRING 原始值：STRLEN + 分块 GETRANGE 直写本地文件，不经前端展示链路。
/// 每写完一块 emit 一次进度；`finished=true` 表示结束（成功或 `error` 有值）。
pub fn value_download0(
    mut conn: impl Commands,
    param: RedisValueDownload,
    app_handle: AppHandle,
    id: String,
) -> AnyResult<()> {
    let key_type: ValueType = conn.key_type(&param.key)?;
    if key_type != ValueType::String {
        return handle_other_value_type(&key_type, &param.key).map(|_| ());
    }
    let strlen: usize = conn.strlen(&param.key)?;
    let mut file =
        std::fs::File::create(&param.file).map_err(|e| AppError::FileWriteFailed {
            filename: param.file.clone(),
            detail: e.to_string(),
        })?;
    if strlen == 0 {
        emit_value_download(&app_handle, &id, 100, true, None);
        return Ok(());
    }
    let mut written = 0usize;
    while written < strlen {
        let end = (written + VALUE_DOWNLOAD_CHUNK - 1).min(strlen - 1) as isize;
        let chunk: Vec<u8> = conn.getrange(&param.key, written as isize, end)?;
        if chunk.is_empty() {
            break; // 防御：值被并发删除/截短时提前结束
        }
        std::io::Write::write_all(&mut file, &chunk).map_err(|e| AppError::FileWriteFailed {
            filename: param.file.clone(),
            detail: e.to_string(),
        })?;
        written += chunk.len();
        let percent = ((written as f64 / strlen as f64) * 100.0).min(100.0) as u8;
        emit_value_download(&app_handle, &id, percent, false, None);
    }
    emit_value_download(&app_handle, &id, 100, true, None);
    Ok(())
}

/// 后台线程执行大值下载；命令侧立即返回，进度经 EVENT_VALUE_DOWNLOAD 推送。
pub fn value_download_0_thread(
    conn: impl Commands + Send + 'static,
    param: RedisValueDownload,
    app_handle: AppHandle,
    id: String,
) {
    match value_download0(conn, param, app_handle.clone(), id.clone()) {
        Ok(_) => {}
        Err(e) => {
            warn!("value download err: {e}");
            emit_value_download(&app_handle, &id, 0, true, Some(e.to_string()));
        }
    }
}

// ------------------------------ 仅本文件使用 ------------------------------

/// fieldScan 单次 HSCAN/SSCAN/ZSCAN/LRANGE 的 COUNT，来自 settings.fieldScanCount
fn field_scan_batch_count(count: u64) -> u64 {
    if count == 0 { 20 } else { count }
}

/// 是否在结果里带 TTL 和内存。参数缺省时带上。
fn field_scan_include_meta(param: &FieldScanParam) -> bool {
    param.include_meta.unwrap_or(true)
}

/// 这一页要不要查 Hash 字段的剩余过期时间。服务端不支持时直接跳过。
fn field_scan_include_field_ttl(param: &FieldScanParam, httl_supported: bool) -> bool {
    resolve_include_field_ttl(param.include_field_ttl, httl_supported)
}

/// 需要元数据时总是向服务器查 TYPE。否则用参数里已有的类型，没有再查。
fn resolve_field_scan_key_type(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
) -> AnyResult<ValueType> {
    if field_scan_include_meta(param) {
        Ok(conn.key_type(key)?)
    } else if let Some(ref t) = param.key_type {
        Ok(to_key_type(t))
    } else {
        Ok(conn.key_type(key)?)
    }
}

/// 精确字段查询（`exact=true`）。
///
/// **pattern 约定**：前端 `match` 是搜索框明文（如 `dune` / Hash 字段名），
/// **不是** IPC wire（`bytes_format=base64`）。Hash/Set/ZSet/Array/VectorSet
/// 均应按 `member.as_bytes()`（或索引明文）定位；**禁止** `parse_bytes(member, bytes_format)`，
/// 否则会把 `"dune"` 误当 base64 解码成乱码，VISMEMBER/HGET 等永远 miss。
/// 命中后再用 `format_bytes(..., bytes_format)` 写回行内 wire。
fn field_scan_0_exact(
    conn: &mut impl Commands,
    key: &RedisKey,
    key_type: &ValueType,
    param: &FieldScanParam,
    bytes_format: &BytesFormat,
    include_field_ttl: bool,
) -> AnyResult<Option<(serde_json::Value, ScanCursor)>> {
    if !param.exact {
        return Ok(None);
    }
    let cc = ScanCursor {
        finished: true,
        ..Default::default()
    };
    let member = &param.pattern;
    let json = match key_type {
        ValueType::Hash => {
            let value: Option<Vec<u8>> = conn.hget(key, member)?;
            let mut items = match value {
                Some(bytes) => ui_hash_value(&[(member.as_bytes().to_vec(), bytes)], bytes_format),
                None => Vec::new(),
            };
            if include_field_ttl && !items.is_empty() {
                let field_bytes = member.as_bytes().to_vec();
                if let Ok(ttl_values) =
                    conn.httl::<_, _, Vec<IntegerReplyOrNoOp>>(key, &[&field_bytes])
                    && let (Some(item), Some(ttl_reply)) = (items.first_mut(), ttl_values.first())
                {
                    item.ttl = match ttl_reply {
                        IntegerReplyOrNoOp::IntegerReply(ttl) => Some(*ttl as i64),
                        IntegerReplyOrNoOp::NotExists => Some(-2),
                        IntegerReplyOrNoOp::ExistsButNotRelevant => Some(-1),
                        _ => None,
                    };
                }
            }
            serde_json::to_value(items)?
        }
        ValueType::Set => {
            let exists: bool = conn.sismember(key, member)?;
            let set = if exists {
                ui_set_value(HashSet::from([member.as_bytes().to_vec()]), bytes_format)
            } else {
                Vec::new()
            };
            serde_json::to_value(set)?
        }
        ValueType::ZSet => {
            let score: Option<f64> = conn.zscore(key, member)?;
            let zset = score
                .map(|score| ui_zset_value(vec![(member.as_bytes().to_vec(), score)], bytes_format))
                .unwrap_or_default();
            serde_json::to_value(zset)?
        }
        // Array：ARGET 精确取索引（见 is_array_type 升级注释）
        _ if is_array_type(key_type) => {
            let idx = parse_array_index(member)?;
            let value: Option<Vec<u8>> = redis::cmd("ARGET").arg(key).arg(idx).query(conn)?;
            let items = match value {
                Some(bytes) => vec![RedisListItem {
                    index: idx,
                    value: format_bytes(&bytes, bytes_format),
                }],
                None => Vec::new(),
            };
            serde_json::to_value(items)?
        }
        // Vector Set：VISMEMBER 检查存在，返回元素+向量+属性（与扫描格式一致）
        ValueType::VectorSet => {
            let elem = member.as_bytes().to_vec();
            let exists: bool = redis::cmd("VISMEMBER").arg(key).arg(&elem).query(conn)?;
            let items: Vec<RedisVectorSetItem> = if exists {
                let name = format_bytes(&elem, bytes_format);
                let vector = vemb_json_or_dash(conn, key, &elem);
                let attrs = vgetattr_opt(conn, key, &elem).unwrap_or_default();
                vec![RedisVectorSetItem {
                    name,
                    vector,
                    attrs,
                }]
            } else {
                Vec::new()
            };
            serde_json::to_value(items)?
        }
        _ => return Ok(None),
    };
    Ok(Some((json, cc)))
}

/// STRING 按阈值决定 GET 全量或 GETRANGE 预览；返回 (bytes, strlen, truncated)
fn load_string_bytes(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
) -> AnyResult<(Vec<u8>, usize, bool)> {
    let strlen: usize = conn.strlen(key)?;
    let meta = param.meta.as_ref();
    let force_full = meta.and_then(|m| m.force_full_value).unwrap_or(false);
    if !force_full
        && let Some(limit) = meta.and_then(|m| m.value_byte_limit)
        && strlen > limit as usize
    {
        // 与 defaultSettings.valuePreviewBytes 一致（前端未传时）
        let preview = meta.and_then(|m| m.value_preview_bytes).unwrap_or(4096) as usize;
        let end = preview.saturating_sub(1) as isize;
        let value: Vec<u8> = conn.getrange(key, 0, end)?;
        return Ok((value, strlen, true));
    }
    let value: Vec<u8> = conn.get(key)?;
    Ok((value, strlen, false))
}

/// List 是否从大下标往小下标扫。只表示方向，不交换上下界。
fn list_scan_desc(param: &FieldScanParam) -> bool {
    param
        .meta
        .as_ref()
        .and_then(|m| m.list_desc)
        .unwrap_or(false)
}

/// List 扫描区间。负下标裁进长度内，正下标保持原值，缺省是整表。
fn resolve_list_scan_range(param: &FieldScanParam, list_len: usize) -> (i64, i64) {
    let max_default = list_len.saturating_sub(1) as i64;
    let meta = param.meta.as_ref();
    let raw_min = meta.and_then(|m| m.list_min_index);
    let raw_max = meta.and_then(|m| m.list_max_index);

    let min = raw_min.map_or(0, |v| {
        if v < 0 {
            (list_len as i64 + v).max(0)
        } else {
            v
        }
    });
    let max = raw_max.map_or(max_default, |v| {
        if v < 0 {
            (list_len as i64 + v).max(0)
        } else {
            v
        }
    });

    (min, max)
}

/// 空串/缺省 → None；非空 trim 后的原文（供 Redis 分数边界）
fn zset_score_bound_raw(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// 任一侧分数非空则走 ZRANGEBYSCORE，否则保持 ZSCAN
fn zset_score_range_active(param: &FieldScanParam) -> bool {
    param.meta.as_ref().is_some_and(|m| {
        zset_score_bound_raw(&m.zset_min_score).is_some()
            || zset_score_bound_raw(&m.zset_max_score).is_some()
    })
}

/// 将用户输入规范为 Redis ZRANGEBYSCORE 边界文本（空 → ±inf）
fn parse_zset_score_bound(raw: Option<&str>, unbounded: &str) -> AnyResult<String> {
    let Some(s) = raw else {
        return Ok(unbounded.to_string());
    };
    let lower = s.to_ascii_lowercase();
    if lower == "-inf" || lower == "-infinity" {
        return Ok("-inf".into());
    }
    if lower == "+inf" || lower == "inf" || lower == "+infinity" || lower == "infinity" {
        return Ok("+inf".into());
    }
    match s.parse::<f64>() {
        Ok(n) if n.is_finite() => Ok(s.to_string()),
        _ => bail!(AppError::InvalidZsetScoreBound {
            bound: s.to_string()
        }),
    }
}

/// ZSet 按分数范围分页：ZRANGEBYSCORE … WITHSCORES LIMIT offset count；多取 1 条作 peek。
fn field_scan_zset_by_score(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
    bytes_format: &BytesFormat,
    cc: &mut ScanCursor,
) -> AnyResult<Vec<RedisZetItem>> {
    let count = field_scan_batch_count(param.count);
    let meta = param.meta.as_ref();
    let min = parse_zset_score_bound(
        meta.and_then(|m| zset_score_bound_raw(&m.zset_min_score)),
        "-inf",
    )?;
    let max = parse_zset_score_bound(
        meta.and_then(|m| zset_score_bound_raw(&m.zset_max_score)),
        "+inf",
    )?;

    let fetch = count + 1;
    let mut values: Vec<(Vec<u8>, f64)> = redis::cmd("ZRANGEBYSCORE")
        .arg(key)
        .arg(&min)
        .arg(&max)
        .arg("WITHSCORES")
        .arg("LIMIT")
        .arg(cc.now_cursor)
        .arg(fetch)
        .query(conn)?;

    if values.len() as u64 > count {
        values.pop();
        cc.finished = false;
        cc.now_cursor += count;
    } else {
        cc.finished = true;
    }

    Ok(ui_zset_value(values, bytes_format))
}

/// List 用 LRANGE 翻一页。这一页已经盖住区间端点时标记结束，避免再打一次空查询。
fn field_scan_list_page(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
    bytes_format: &BytesFormat,
    cc: &mut ScanCursor,
) -> AnyResult<Vec<RedisListItem>> {
    let count = field_scan_batch_count(param.count);
    let list_len: usize = conn.llen(key)?;
    if list_len == 0 {
        cc.finished = true;
        return Ok(Vec::new());
    }
    let (range_min, range_max) = resolve_list_scan_range(param, list_len);

    if range_min > range_max {
        cc.finished = true;
        return Ok(Vec::new());
    }

    let desc = list_scan_desc(param);
    let (start, end) = if desc {
        let potential_end = range_max - cc.now_cursor as i64;
        if potential_end < range_min {
            cc.finished = true;
            return Ok(Vec::new());
        }
        let end = potential_end;
        let start = (end - count as i64 + 1).max(range_min);
        (start, end)
    } else {
        let start = range_min + cc.now_cursor as i64;
        let end = (start + count as i64 - 1).min(range_max);
        (start, end)
    };
    let raw: Vec<Vec<u8>> = conn.lrange(key, start as isize, end as isize)?;
    if raw.is_empty() {
        cc.finished = true;
        return Ok(Vec::new());
    }
    let mut items = ui_list_items(start, &raw, bytes_format);
    // LRANGE 始终按索引升序返回；降序扫描时反转，使结果页从高索引到低索引
    if desc {
        items.reverse();
    }

    cc.now_cursor += items.len() as u64;
    // 这一页已经盖住区间端点，就是最后一页，不必再打一次空的 LRANGE
    let covered = if desc {
        start <= range_min
    } else {
        end >= range_max
    };
    if covered {
        cc.finished = true;
    }
    Ok(items)
}

/// Array 扫描区间：复用 FieldScanMeta.list_min/max_index（与 List 工具栏同一套输入）；负值按 0 / MAX 处理。
fn resolve_array_scan_bounds(param: &FieldScanParam) -> Option<(u64, u64)> {
    let meta = param.meta.as_ref();
    let min = match meta.and_then(|m| m.list_min_index) {
        Some(v) if v >= 0 => v as u64,
        _ => 0,
    };
    let max = match meta.and_then(|m| m.list_max_index) {
        Some(v) if v >= 0 => (v as u64).min(ARRAY_INDEX_MAX),
        _ => ARRAY_INDEX_MAX,
    };
    if min > max { None } else { Some((min, max)) }
}

/// Array ARSCAN 分页：只返回已填充槽；`now_cursor` 存下一页起始索引（非 HSCAN cursor）。
/// 不调 ARLEN：`end` 用区间上界或 ARRAY_INDEX_MAX；LIMIT 多扫 1 条作 peek（同 Stream COUNT+1）。
fn field_scan_array_page(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
    bytes_format: &BytesFormat,
    cc: &mut ScanCursor,
) -> AnyResult<Vec<RedisListItem>> {
    let count = field_scan_batch_count(param.count);
    let Some((range_min, range_max)) = resolve_array_scan_bounds(param) else {
        cc.finished = true;
        return Ok(Vec::new());
    };
    let start = cc.now_cursor.max(range_min);
    if start > range_max {
        cc.finished = true;
        return Ok(Vec::new());
    }

    let raw: Value = redis::cmd("ARSCAN")
        .arg(key)
        .arg(start)
        .arg(range_max)
        .arg("LIMIT")
        .arg(count + 1)
        .query(conn)?;
    let mut items = ui_array_items_from_arscan(raw, bytes_format)?;

    if (items.len() as u64) > count {
        items.pop(); // peek：多扫的一条不返回
        if let Some(last) = items.last() {
            cc.now_cursor = (last.index as u64).saturating_add(1);
        }
        cc.finished = false;
    } else {
        cc.finished = true;
    }
    Ok(items)
}

/// Vector Set 分页浏览，返回元素名+向量+属性。
/// 模式由前端选择：随机采样 VRANDMEMBER（默认，无分页）；范围查询 VRANGE（exclusive 游标）。
/// 错误（命令不支持 / 无权限等）直接透出，由前端提示，不再隐式降级。
fn field_scan_vectorset_page(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
    bytes_format: &BytesFormat,
    cc: &mut ScanCursor,
) -> AnyResult<Vec<RedisVectorSetItem>> {
    let count = field_scan_batch_count(param.count);
    let sample = param
        .meta
        .as_ref()
        .and_then(|m| m.vectorset_sample)
        .unwrap_or(true);

    let names: Vec<Vec<u8>> = if sample {
        // 随机采样：一次拉完即结束，无分页
        cc.finished = true;
        cc.stream_cursor = String::new();
        redis::cmd("VRANDMEMBER").arg(key).arg(count).query(conn)?
    } else {
        // 范围查询：exclusive 游标续页
        let start: Vec<u8> = if cc.stream_cursor.is_empty() {
            b"-".to_vec()
        } else {
            let mut b = vec![b'('];
            b.extend(parse_bytes(&cc.stream_cursor, bytes_format)?);
            b
        };
        let names: Vec<Vec<u8>> = redis::cmd("VRANGE")
            .arg(key)
            .arg(start)
            .arg("+")
            .arg(count)
            .query(conn)?;
        if (names.len() as u64) < count {
            cc.finished = true;
        } else {
            cc.finished = false;
            if let Some(last) = names.last() {
                cc.stream_cursor = format_bytes(last, bytes_format);
            }
        }
        names
    };

    // 2. Pipeline VEMB 批量获取向量
    // 此处不用 ClusterPipeline：命令全部针对同一 key（同 slot），req_packed_commands
    // 会按 slot 整批路由到目标节点（1 次 RTT），比 ClusterPipeline 更轻；仅跨 slot 键才需 ClusterPipeline
    let mut elements = Vec::with_capacity(names.len());
    if !names.is_empty() {
        let mut pipe = redis::pipe();
        for name_bytes in &names {
            pipe.cmd("VEMB").arg(key).arg(name_bytes.as_slice());
        }
        let packed = pipe.get_packed_pipeline();
        let vemb_results: Vec<redis::Value> = conn.req_packed_commands(&packed, 0, names.len())?;

        // 3. Pipeline VGETATTR 批量获取属性
        let mut pipe = redis::pipe();
        for name_bytes in &names {
            pipe.cmd("VGETATTR").arg(key).arg(name_bytes.as_slice());
        }
        let packed = pipe.get_packed_pipeline();
        let vgetattr_results: Vec<redis::Value> =
            conn.req_packed_commands(&packed, 0, names.len())?;

        // 4. 组装 RedisVectorSetItem
        for (i, name_bytes) in names.iter().enumerate() {
            let name = format_bytes(name_bytes, bytes_format);
            let vector: Vec<f64> =
                FromRedisValue::from_redis_value_ref(&vemb_results[i]).unwrap_or_default();
            let vector = serde_json::to_string(&vector).unwrap_or_else(|_| "-".into());
            let attrs: Option<String> =
                FromRedisValue::from_redis_value_ref(&vgetattr_results[i]).unwrap_or_default();
            elements.push(RedisVectorSetItem {
                name,
                vector,
                attrs: attrs.unwrap_or_default(),
            });
        }
    }

    Ok(elements)
}

/// TimeSeries 分页：默认 `TS.REVRANGE`（新→旧）；`ts_desc=false` 时用 `TS.RANGE`。
/// 续页：`stream_cursor` 存上一页边缘 timestamp；倒序下一页 `to = ts−1`，正序 `from = ts+1`。
/// `FILTER_BY_VALUE` 仅在工具栏有输入时追加。
fn field_scan_timeseries_page(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    param: &FieldScanParam,
    cc: &mut ScanCursor,
) -> AnyResult<Vec<RedisTimeSeriesItem>> {
    let count = field_scan_batch_count(param.count);
    let meta = param.meta.as_ref();
    let is_desc = meta.and_then(|m| m.ts_desc).unwrap_or(true);

    let toolbar_from = meta
        .and_then(|m| m.ts_min.as_ref())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "-".into());
    let toolbar_to = meta
        .and_then(|m| m.ts_max.as_ref())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "+".into());

    let (from, to) = if is_desc {
        // REVRANGE：首页用工具栏上界；续页用上一页最小 ts−1
        let to = if cc.stream_cursor.is_empty() {
            toolbar_to
        } else {
            ts_timestamp_dec_one(&cc.stream_cursor)
        };
        (toolbar_from, to)
    } else {
        // RANGE：首页用工具栏下界；续页用上一页最大 ts+1
        let from = if cc.stream_cursor.is_empty() {
            toolbar_from
        } else {
            ts_timestamp_inc_one(&cc.stream_cursor)
        };
        (from, toolbar_to)
    };

    let mut cmd = redis::cmd(if is_desc { "TS.REVRANGE" } else { "TS.RANGE" });
    cmd.arg(key).arg(&from).arg(&to);

    let min_v = meta
        .and_then(|m| m.ts_min_value.as_ref())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let max_v = meta
        .and_then(|m| m.ts_max_value.as_ref())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if min_v.is_some() || max_v.is_some() {
        cmd.arg("FILTER_BY_VALUE")
            .arg(min_v.as_deref().unwrap_or("-inf"))
            .arg(max_v.as_deref().unwrap_or("+inf"));
    }

    cmd.arg("COUNT").arg(count);
    let raw: Value = cmd.query(conn)?;
    let items = parse_ts_range_items(raw)?;

    if (items.len() as u64) < count {
        cc.finished = true;
        cc.stream_cursor.clear();
    } else {
        cc.finished = false;
        // 页内最后一条：倒序为本页最小 ts，正序为本页最大 ts
        if let Some(last) = items.last() {
            cc.stream_cursor = last.key.clone();
        }
    }
    Ok(items)
}

/// 按键类型取一页字段。Hash/Set/ZSet 的 SCAN 命令留给下一步；List、Array、VectorSet、TimeSeries 在这里翻页。
fn field_scan_0_get(
    mut conn: &mut MutexGuard<impl Commands>,
    param: &FieldScanParam,
    bytes_format: &BytesFormat,
) -> AnyResult<(
    Option<serde_json::Value>,
    ValueType,
    ScanCursor,
    usize,
    bool,
)> {
    let key = &param.key;

    let key_type = resolve_field_scan_key_type(conn, key, param)?;
    let mut cc = param.cursor.clone().unwrap_or_default();

    // String类型的bytes长度
    let mut length = 0;
    let mut value_truncated = false;

    let value: Option<serde_json::Value> = match key_type {
        ValueType::None => {
            bail!(AppError::KeyNotFound {
                key: vec8_to_display_string(key.to_bytes())
            })
        }
        ValueType::String => {
            let (value, strlen, truncated) = load_string_bytes(conn, key, param)?;
            length = strlen;
            value_truncated = truncated;
            let value: String = format_bytes(&value, bytes_format);
            cc.finished = true;
            Some(serde_json::to_value(value)?)
        }
        ValueType::JSON => {
            let value: Value = redis::cmd("JSON.GET").arg(key).query(&mut conn)?;
            cc.finished = true;
            Some(serde_json::from_str(&redis_value_to_string(value, "\n"))?)
        }
        ValueType::Hash => None,
        ValueType::List => {
            let items = field_scan_list_page(conn, key, param, bytes_format, &mut cc)?;
            Some(serde_json::to_value(items)?)
        }
        // Array：非精确走 ARSCAN 分页；精确时返回 None，由 field_scan_0_exact→ARGET 处理
        // （见 is_array_type；勿默认 ARGETRANGE）
        _ if is_array_type(&key_type) => {
            if param.exact {
                None
            } else {
                let items = field_scan_array_page(conn, key, param, bytes_format, &mut cc)?;
                Some(serde_json::to_value(items)?)
            }
        }
        // Vector Set：非精确按所选模式浏览；精确交 field_scan_0_exact
        ValueType::VectorSet => {
            if param.exact {
                None
            } else {
                let items = field_scan_vectorset_page(conn, key, param, bytes_format, &mut cc)?;
                Some(serde_json::to_value(items)?)
            }
        }
        // ZSet：精确走 ZSCORE；填了分数范围则 ZRANGEBYSCORE 分页，否则回落 ZSCAN
        ValueType::ZSet => {
            if param.exact {
                None
            } else if zset_score_range_active(param) {
                let items = field_scan_zset_by_score(conn, key, param, bytes_format, &mut cc)?;
                Some(serde_json::to_value(items)?)
            } else {
                None
            }
        }
        ValueType::Stream => {
            let count = field_scan_batch_count(param.count);
            let is_desc = param
                .meta
                .as_ref()
                .and_then(|m| m.stream_desc)
                .unwrap_or(true);

            let (arg1, arg2) = if is_desc {
                // XREVRANGE: (end, start)
                let end = if cc.stream_cursor.is_empty() {
                    match param.meta.as_ref() {
                        Some(meta) if !meta.max_id.is_empty() => &meta.max_id,
                        _ => "+",
                    }
                } else {
                    &cc.stream_cursor
                };
                let start = match param.meta.as_ref() {
                    Some(meta) if !meta.min_id.is_empty() => &meta.min_id,
                    _ => "-",
                };
                (end, start)
            } else {
                // XRANGE: (start, end)
                let start = if cc.stream_cursor.is_empty() {
                    match param.meta.as_ref() {
                        Some(meta) if !meta.min_id.is_empty() => &meta.min_id,
                        _ => "-",
                    }
                } else {
                    &cc.stream_cursor
                };
                let end = match param.meta.as_ref() {
                    Some(meta) if !meta.max_id.is_empty() => &meta.max_id,
                    _ => "+",
                };
                (start, end)
            };

            // 每一页都多取 1 条：满页说明后面还有，不能把刚好凑满 COUNT 当成结束
            let scan_count = count + 1;

            let cmd_name = if is_desc { "XREVRANGE" } else { "XRANGE" };
            let mut cmd = redis::cmd(cmd_name);
            cmd.arg(key).arg(arg1).arg(arg2);
            cmd.arg("COUNT").arg(scan_count);
            let reply: StreamRangeReply = cmd.query(&mut conn)?;
            let mut value = ui_stream_value(reply);

            if value.len() > count as usize {
                cc.finished = false;
                cc.stream_cursor = value.pop().unwrap().id;
            } else {
                cc.finished = true;
            };
            Some(serde_json::to_value(value)?)
        }
        // TimeSeries：TS.RANGE / REVRANGE 分页（见 field_scan_timeseries_page）；不做精确单点
        ValueType::TimeSeries => {
            let items = field_scan_timeseries_page(conn, key, param, &mut cc)?;
            Some(serde_json::to_value(items)?)
        }
        ValueType::Unknown(_) => {
            handle_other_value_type(&key_type, key)?;
            None
        }
        _ => None,
    };
    Ok((value, key_type, cc, length, value_truncated))
}

/// 组装 HSCAN / SSCAN / ZSCAN。`pattern` 为空或 `*` 时不加 MATCH。
fn field_scan_1_cmd(
    key_type: &ValueType,
    key: &RedisKey,
    cursor: u64,
    pattern: &str,
    batch_count: u64,
) -> AnyResult<Cmd> {
    let scan_command = match key_type {
        ValueType::Hash => "hscan",
        ValueType::Set => "sscan",
        ValueType::ZSet => "zscan",
        _ => bail!(AppError::FieldScanNotSupported {
            value_type: ui_key_type(key_type.clone())
        }),
    };

    let mut cmd = redis::cmd(scan_command);
    cmd.arg(key).arg(cursor);
    if !pattern.is_empty() && pattern != "*" {
        cmd.arg("MATCH").arg(pattern);
    }
    cmd.arg("COUNT").arg(batch_count);
    Ok(cmd)
}

/// 把 SCAN 回复写入 `FieldScanValue`，并返回本页条数。
fn field_scan_2_value(
    conn: &mut impl Commands,
    key_type: &ValueType,
    scan_value: &mut FieldScanValue,
    new_value: Value,
    key: &RedisKey,
    bytes_format: &BytesFormat,
    include_field_ttl: bool,
) -> AnyResult<usize> {
    let new_count = match key_type {
        ValueType::Hash => {
            let value: Vec<(Vec<u8>, Vec<u8>)> = FromRedisValue::from_redis_value(new_value)?;
            let new_count = value.len();
            let mut new_value = ui_hash_value(&value, bytes_format);

            if include_field_ttl {
                let fields: Vec<&Vec<u8>> = value.iter().map(|(f, _)| f).collect();
                if let Ok(ttl_values) = conn.httl::<_, _, Vec<IntegerReplyOrNoOp>>(key, &fields) {
                    for (item, ttl_reply) in new_value.iter_mut().zip(ttl_values) {
                        item.ttl = match ttl_reply {
                            IntegerReplyOrNoOp::IntegerReply(ttl) => Some(ttl as i64),
                            IntegerReplyOrNoOp::NotExists => Some(-2),
                            IntegerReplyOrNoOp::ExistsButNotRelevant => Some(-1),
                            _ => None,
                        };
                    }
                }
            }

            scan_value.hash.extend(new_value);
            new_count
        }
        ValueType::Set => {
            let value: HashSet<Vec<u8>> = FromRedisValue::from_redis_value(new_value)?;
            let new_count = value.len();
            scan_value.set.extend(ui_set_value(value, bytes_format));
            new_count
        }

        ValueType::ZSet => {
            let value: Vec<(Vec<u8>, f64)> = FromRedisValue::from_redis_value(new_value)?;
            let new_count = value.len();
            scan_value.zset.extend(ui_zset_value(value, bytes_format));
            new_count
        }
        _ => bail!(AppError::FieldScanNotSupported {
            value_type: ui_key_type(key_type.clone())
        }),
    };
    Ok(new_count)
}

/// 把一页字段序列化成返回给前端的 JSON。
fn field_scan_3_json(
    key_type: &ValueType,
    scan_value: &FieldScanValue,
) -> AnyResult<serde_json::value::Value> {
    let value = match key_type {
        ValueType::Hash => serde_json::to_value(&scan_value.hash)?,
        ValueType::Set => serde_json::to_value(&scan_value.set)?,
        ValueType::ZSet => serde_json::to_value(&scan_value.zset)?,
        _ => bail!(AppError::FieldScanNotSupported {
            value_type: ui_key_type(key_type.clone())
        }),
    };
    Ok(value)
}

/// 集合类型用 HLEN/LLEN 等填充 length；String 仍用已算好的 bytes 长度
fn resolve_field_scan_length(
    conn: &mut MutexGuard<impl Commands>,
    key: &RedisKey,
    key_type: &ValueType,
    field_byte_len: usize,
) -> AnyResult<usize> {
    let len = if is_array_type(key_type) {
        // Array 元素数用 ARCOUNT（非 ARLEN）
        redis::cmd("ARCOUNT").arg(key).query(conn)?
    } else {
        match key_type {
            ValueType::String => field_byte_len,
            ValueType::Hash => conn.hlen(key)?,
            ValueType::List => conn.llen(key)?,
            ValueType::Set => conn.scard(key)?,
            ValueType::ZSet => conn.zcard(key)?,
            ValueType::Stream => redis::cmd("XLEN").arg(key).query(conn)?,
            ValueType::VectorSet => conn.vcard(key)?,
            // TimeSeries：TS.INFO totalSamples；失败则回落 field_byte_len（通常为 0）
            ValueType::TimeSeries => {
                let raw: Value = redis::cmd("TS.INFO").arg(key).query(conn)?;
                ts_info_total_samples(&raw).unwrap_or(field_byte_len as u64) as usize
            }
            _ => field_byte_len,
        }
    };
    Ok(len)
}

/// 组装 fieldScan 的一页结果。`include_meta` 时再查 TTL 和 `MEMORY USAGE`。
// 连接、键、游标和是否带元数据都要分开传，不值得再包一层结构体。
#[allow(clippy::too_many_arguments)]
fn field_scan_4_return(
    mut conn: MutexGuard<impl Commands>,
    key: RedisKey,
    key_type: ValueType,
    value: serde_json::Value,
    cursor: ScanCursor,
    length: usize,
    value_truncated: bool,
    include_meta: bool,
    memory_usage_supported: bool,
) -> AnyResult<FieldScanResult> {
    let (ttl, size, length, logical_length, vector_dim) = if include_meta {
        let ttl: i64 = conn.ttl(&key)?;
        // 不支持时不发命令，size 保持 0，String 由前端按键名+值长度粗估
        let size: u64 = if memory_usage_supported {
            redis::cmd("memory")
                .arg("usage")
                .arg(&key)
                .query(&mut conn)
                .unwrap_or(0)
        } else {
            0
        };
        let length = resolve_field_scan_length(&mut conn, &key, &key_type, length)?;
        // Array 额外返回 ARLEN（逻辑长度）；升级 redis-rs 时同步检查 is_array_type
        let logical_length = if is_array_type(&key_type) {
            let arlen: u64 = redis::cmd("ARLEN").arg(&key).query(&mut conn)?;
            Some(arlen)
        } else {
            None
        };
        // 空集 VDIM 可能报错，仅 length>0 时取维度（redis-rs vdim）
        let vector_dim = if key_type == ValueType::VectorSet && length > 0 {
            let dim: usize = conn.vdim(&key)?;
            Some(dim as u64)
        } else {
            None
        };
        (ttl, size, length, logical_length, vector_dim)
    } else {
        (0, 0, length, None, None)
    };

    Ok(FieldScanResult {
        key_type: ui_key_type(key_type),
        ttl,
        size,
        value,
        cursor,
        length,
        value_truncated,
        logical_length,
        vector_dim,
    })
}

#[cfg(test)]
mod zset_score_range_tests {
    use super::*;

    /// 只填分数上下界，其它字段用扫描默认值。
    fn param_with_scores(min: Option<&str>, max: Option<&str>) -> FieldScanParam {
        FieldScanParam {
            key: RedisKey {
                key: "z".into(),
                bytes: vec![],
            },
            count: 20,
            cursor: None,
            pattern: "*".into(),
            exact: false,
            meta: Some(FieldScanMeta {
                max_id: String::new(),
                min_id: String::new(),
                value_byte_limit: None,
                value_preview_bytes: None,
                force_full_value: None,
                list_min_index: None,
                list_max_index: None,
                list_desc: None,
                stream_desc: None,
                vectorset_sample: None,
                zset_min_score: min.map(str::to_string),
                zset_max_score: max.map(str::to_string),
                ts_min: None,
                ts_max: None,
                ts_min_value: None,
                ts_max_value: None,
                ts_desc: None,
            }),
            bytes_format: None,
            include_meta: None,
            key_type: None,
            include_field_ttl: None,
        }
    }

    /// 两侧都空、只有空白，或没有 meta 时，仍走 ZSCAN。
    #[test]
    fn inactive_when_both_empty() {
        assert!(!zset_score_range_active(&param_with_scores(None, None)));
        assert!(!zset_score_range_active(&param_with_scores(
            Some("  "),
            Some("")
        )));
        let no_meta = FieldScanParam {
            meta: None,
            ..param_with_scores(None, None)
        };
        assert!(!zset_score_range_active(&no_meta));
    }

    /// 任意一侧有分数就改走 ZRANGEBYSCORE，包括只写了 inf。
    #[test]
    fn active_when_either_side_set() {
        assert!(zset_score_range_active(&param_with_scores(Some("1"), None)));
        assert!(zset_score_range_active(&param_with_scores(None, Some("9"))));
        assert!(zset_score_range_active(&param_with_scores(
            Some("-inf"),
            Some("+inf")
        )));
    }

    /// 空边界用调用方给的 ±inf；大小写和 infinity 都收成 Redis 的 inf。
    #[test]
    fn parse_bound_defaults_and_inf() {
        assert_eq!(parse_zset_score_bound(None, "-inf").unwrap(), "-inf");
        assert_eq!(
            parse_zset_score_bound(Some("-inf"), "+inf").unwrap(),
            "-inf"
        );
        assert_eq!(
            parse_zset_score_bound(Some("+INF"), "-inf").unwrap(),
            "+inf"
        );
        assert_eq!(parse_zset_score_bound(Some("inf"), "-inf").unwrap(), "+inf");
        assert_eq!(
            parse_zset_score_bound(Some("-Infinity"), "+inf").unwrap(),
            "-inf"
        );
        assert_eq!(parse_zset_score_bound(Some("1.5"), "-inf").unwrap(), "1.5");
        assert_eq!(parse_zset_score_bound(Some("1e2"), "-inf").unwrap(), "1e2");
    }

    /// 非数字、NaN 和开区间括号都不是合法分数边界。
    #[test]
    fn parse_bound_rejects_invalid() {
        assert!(parse_zset_score_bound(Some("abc"), "-inf").is_err());
        assert!(parse_zset_score_bound(Some("NaN"), "-inf").is_err());
        assert!(parse_zset_score_bound(Some("(1.5"), "-inf").is_err());
    }
}

#[cfg(test)]
mod list_scan_range_tests {
    use super::*;

    /// List 扫描参数：下标范围和是否倒序，其余用默认值。
    fn list_param(min: Option<i64>, max: Option<i64>, desc: Option<bool>) -> FieldScanParam {
        FieldScanParam {
            key: RedisKey {
                key: "l".into(),
                bytes: vec![],
            },
            count: 2,
            cursor: None,
            pattern: "*".into(),
            exact: false,
            meta: Some(FieldScanMeta {
                max_id: String::new(),
                min_id: String::new(),
                value_byte_limit: None,
                value_preview_bytes: None,
                force_full_value: None,
                list_min_index: min,
                list_max_index: max,
                list_desc: desc,
                stream_desc: None,
                vectorset_sample: None,
                zset_min_score: None,
                zset_max_score: None,
                ts_min: None,
                ts_max: None,
                ts_min_value: None,
                ts_max_value: None,
                ts_desc: None,
            }),
            bytes_format: None,
            include_meta: None,
            key_type: None,
            include_field_ttl: None,
        }
    }

    /// 负下标按长度裁进表内，正下标保持原值，缺省是整表。
    #[test]
    fn clips_negative_indexes_and_keeps_positive() {
        assert_eq!(
            resolve_list_scan_range(&list_param(None, None, None), 5),
            (0, 4)
        );
        assert_eq!(
            resolve_list_scan_range(&list_param(Some(-1), Some(-2), None), 5),
            (4, 3)
        );
        assert_eq!(
            resolve_list_scan_range(&list_param(Some(-100), Some(2), None), 5),
            (0, 2)
        );
        assert_eq!(
            resolve_list_scan_range(&list_param(Some(1), Some(3), None), 5),
            (1, 3)
        );
        let mut no_meta = list_param(None, None, None);
        no_meta.meta = None;
        assert_eq!(resolve_list_scan_range(&no_meta, 5), (0, 4));
    }

    /// 降序只是方向标记，不把上下界对调。
    #[test]
    fn desc_is_a_flag_and_does_not_swap_bounds() {
        let desc = list_param(Some(0), Some(4), Some(true));
        assert!(list_scan_desc(&desc));
        assert_eq!(resolve_list_scan_range(&desc, 5), (0, 4));
        assert!(!list_scan_desc(&list_param(None, None, None)));
        assert!(!list_scan_desc(&list_param(None, None, Some(false))));
    }

    /// 字段 TTL 要服务端支持和调用方同时打开；COUNT 为 0 时兜底 20，和键扫描的 1000 不同。
    #[test]
    fn field_ttl_and_batch_count_defaults() {
        assert!(!resolve_include_field_ttl(None, true));
        assert!(!resolve_include_field_ttl(Some(true), false));
        assert!(resolve_include_field_ttl(Some(true), true));
        let mut param = list_param(None, None, None);
        assert!(!field_scan_include_field_ttl(&param, true));
        param.include_field_ttl = Some(true);
        assert!(field_scan_include_field_ttl(&param, true));
        assert_eq!(field_scan_batch_count(0), 20);
        assert_eq!(field_scan_batch_count(7), 7);
    }

    /// 没传 include_meta 时默认带上 TTL 和内存。
    #[test]
    fn include_meta_defaults_on() {
        let mut param = list_param(None, None, None);
        assert!(field_scan_include_meta(&param));
        param.include_meta = Some(false);
        assert!(!field_scan_include_meta(&param));
    }

    /// Array 的负下标当成缺省（0 到最大索引），上下界颠倒则这一页没有范围。
    #[test]
    fn array_bounds_treat_negative_as_open() {
        assert_eq!(
            resolve_array_scan_bounds(&list_param(None, None, None)),
            Some((0, ARRAY_INDEX_MAX))
        );
        assert_eq!(
            resolve_array_scan_bounds(&list_param(Some(-1), Some(-2), None)),
            Some((0, ARRAY_INDEX_MAX))
        );
        assert_eq!(
            resolve_array_scan_bounds(&list_param(Some(3), Some(8), None)),
            Some((3, 8))
        );
        assert_eq!(
            resolve_array_scan_bounds(&list_param(Some(9), Some(1), None)),
            None
        );
    }
}

#[cfg(test)]
mod field_scan_cmd_tests {
    use super::*;

    /// 把命令参数收成字符串，方便看 MATCH 有没有加上。
    fn cmd_args(cmd: &Cmd) -> Vec<String> {
        cmd.args_iter()
            .map(|arg| match arg {
                redis::Arg::Simple(bytes) => String::from_utf8(bytes.to_vec()).unwrap(),
                redis::Arg::Cursor => "CURSOR".into(),
                _ => unreachable!("command args are plain bytes"),
            })
            .collect()
    }

    fn key() -> RedisKey {
        RedisKey {
            key: "hk".into(),
            bytes: vec![],
        }
    }

    /// Hash / Set / ZSet 分别走对应 SCAN；空 pattern 和 `*` 不加 MATCH，其它类型报错。
    #[test]
    fn scan_command_and_match() {
        let hash = field_scan_1_cmd(&ValueType::Hash, &key(), 5, "f*", 20).unwrap();
        assert_eq!(
            cmd_args(&hash),
            ["hscan", "hk", "5", "MATCH", "f*", "COUNT", "20"]
        );

        let set = field_scan_1_cmd(&ValueType::Set, &key(), 0, "*", 10).unwrap();
        assert_eq!(cmd_args(&set), ["sscan", "hk", "0", "COUNT", "10"]);

        let zset = field_scan_1_cmd(&ValueType::ZSet, &key(), 0, "", 10).unwrap();
        assert_eq!(cmd_args(&zset), ["zscan", "hk", "0", "COUNT", "10"]);

        let err = field_scan_1_cmd(&ValueType::List, &key(), 0, "*", 10).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("field_scan_not_supported"), "{msg}");
        assert!(msg.contains("list"), "{msg}");
    }
}
