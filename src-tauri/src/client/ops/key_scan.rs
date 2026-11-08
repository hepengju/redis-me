//! 键扫描。精确匹配走 EXISTS，否则组装 `SCAN`。按 pattern 扫完一批键，给批量删除和导出用。
//! 字段扫描在 `field_scan`。

use crate::client::me_client::MeClient;
use crate::model::*;
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::bail;
use log::info;
use redis::Cmd;

// 通用实现: 由于Connection动态兼容问题，无法写在接口里面，因此写在方法中

/// Redis SCAN COUNT：来自 ScanParam.count（前端 keyScanCount）；0 时兜底 1000
pub fn scan_0_batch_count(count: u64) -> u64 {
    if count == 0 { 1000 } else { count }
}

/// 完全匹配时用 EXISTS 判断键是否存在；否则返回 None 走 SCAN
/// 注意：EXISTS 路径不校验 scan_type，精确查完整键名时更符合实际使用场景
pub fn scan_0_exact<C: redis::ConnectionLike>(
    conn: &mut C,
    pattern: &str,
    exact: bool,
) -> AnyResult<Option<ScanResult>> {
    if !exact {
        return Ok(None);
    }
    let exists: bool = redis::cmd("EXISTS").arg(pattern).query(conn)?;
    let key_list = if exists {
        vec![RedisKey::from(pattern)]
    } else {
        vec![]
    };
    Ok(Some(ScanResult {
        cursor: ScanCursor {
            finished: true,
            ..Default::default()
        },
        key_list,
    }))
}

/// 组装一次 `SCAN`。`scan_type` 非空时加上 `TYPE`。
pub fn scan_1_cmd(cursor: u64, pattern: &str, batch_count: u64, scan_type: Option<String>) -> Cmd {
    // SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]
    let mut cmd = redis::cmd("scan");
    cmd.arg(cursor)
        .arg("match")
        .arg(pattern)
        .arg("count")
        .arg(batch_count);

    if let Some(mut scan_type) = scan_type
        && !scan_type.is_empty()
    {
        // SCAN TYPE 要原始模块名；UI 用 json / timeseries
        if scan_type == ME_JSON_TYPE_NAME {
            scan_type = REDIS_JSON_TYPE_NAME.to_string();
        } else if scan_type == ME_TIMESERIES_TYPE_NAME {
            scan_type = REDIS_TIMESERIES_TYPE_NAME.to_string();
        }
        cmd.arg("type").arg(scan_type);
    }
    cmd
}

/// 按 pattern 把键 SCAN 完，供批量删除和导出使用。`COUNT` 只是提示，这里会翻到游标为 0。
pub fn batch_key0(
    rmc: &(impl MeClient + ?Sized),
    param: RedisBatchKey,
    assert_not_empty: bool,
) -> AnyResult<Vec<RedisKey>> {
    let key_list = if param.key_list.is_empty() {
        if param.pattern.is_empty() {
            bail!(AppError::EmptyParameters)
        }
        // 直接匹配：循环 SCAN 至 cursor.finished（单次 scan 只跑一轮）
        let mut all_keys: Vec<RedisKey> = vec![];
        let mut cursor: Option<ScanCursor> = None;
        loop {
            let scan_result = rmc.scan(ScanParam {
                pattern: param.pattern.clone(),
                scan_type: None,
                cursor,
                exact: false,
                count: 10000,
            })?;
            all_keys.extend(scan_result.key_list);
            if scan_result.cursor.finished {
                break;
            }
            cursor = Some(scan_result.cursor);
        }
        info!("scan key count: {}", all_keys.len());
        all_keys
    } else {
        param.key_list
    };

    if assert_not_empty && key_list.is_empty() {
        bail!(AppError::EmptyKeyList)
    }

    Ok(key_list)
}

#[cfg(test)]
mod key_scan_cmd_tests {
    use super::*;

    /// 把命令参数收成字符串，方便断言 TYPE 的位置。
    fn cmd_args(cmd: &Cmd) -> Vec<String> {
        cmd.args_iter()
            .map(|arg| match arg {
                redis::Arg::Simple(bytes) => String::from_utf8(bytes.to_vec()).unwrap(),
                redis::Arg::Cursor => "CURSOR".into(),
                _ => unreachable!("command args are plain bytes"),
            })
            .collect()
    }

    /// 取出 `SCAN` 里 `TYPE` 后面的那个参数。没有 TYPE 就是 `None`。
    fn scan_type_arg(scan_type: Option<&str>) -> Option<String> {
        let args = cmd_args(&scan_1_cmd(0, "*", 10, scan_type.map(str::to_string)));
        args.windows(2)
            .find(|pair| pair[0].eq_ignore_ascii_case("type"))
            .map(|pair| pair[1].clone())
    }

    /// 界面上的 json / timeseries 要换成模块 TYPE 名；空类型不加 TYPE。
    #[test]
    fn maps_module_type_and_skips_empty() {
        assert_eq!(
            scan_type_arg(Some(ME_TIMESERIES_TYPE_NAME)).as_deref(),
            Some(REDIS_TIMESERIES_TYPE_NAME)
        );
        assert_eq!(
            scan_type_arg(Some(ME_JSON_TYPE_NAME)).as_deref(),
            Some(REDIS_JSON_TYPE_NAME)
        );
        assert_eq!(scan_type_arg(None), None);
        assert_eq!(scan_type_arg(Some("")), None);
    }

    /// 键扫描 COUNT 为 0 时兜底 1000，和字段扫描的 20 不是同一个数。
    #[test]
    fn batch_count_defaults_to_1000() {
        assert_eq!(scan_0_batch_count(0), 1000);
        assert_eq!(scan_0_batch_count(50), 50);
    }
}
