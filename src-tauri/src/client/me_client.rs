use crate::client::ops::info::info_to_chart;
use crate::client::state::MeBase;
use crate::model::*;
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::bail;
use chrono::Utc;
use log::info;
use parking_lot::MutexGuard;
use redis::ConnectionLike;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

#[rustfmt::skip]
pub trait MeClient: Send + Sync {
    // 连接与库
    fn base(&self) -> &MeBase;
    fn db_list(&self) -> AnyResult<Vec<RedisDB>>;
    fn select_db(&self, db: u16) -> AnyResult<()>;

    // 信息与节点
    fn info(&self, node: Option<String>) -> AnyResult<RedisInfo>;
    /// 各节点 INFO 列表。`node_filter`：**仅 `"all"`=全部节点**、
    /// `"master"`/`"slave"`=按角色过滤、`"ip:port"`=仅指定节点；`None`/空串=不匹配（返回空）。单机忽略该参数。
    fn info_list(&self, node_filter: Option<String>) -> AnyResult<Vec<RedisInfo>>;
    fn node_list(&self) -> AnyResult<Vec<RedisNode>>;

    // 扫描
    fn scan(&self, param: ScanParam) -> AnyResult<ScanResult>;
    fn field_scan(&self, param: FieldScanParam) -> AnyResult<FieldScanResult>;

    // 键
    fn ttl(&self, key: RedisKey, ttl: i64) -> AnyResult<()>;
    fn set(&self, param: RedisSetParam) -> AnyResult<()>;
    fn del(&self, key: RedisKey) -> AnyResult<()>;
    fn rename(&self, key: RedisKey, new_key: RedisKey) -> AnyResult<RedisKey>;
    fn copy(&self, param: RedisCopyParam) -> AnyResult<RedisKey>;
    fn object_info(&self, key: RedisKey) -> AnyResult<RedisObjectInfo>;
    fn key_type(&self, key: RedisKey) -> AnyResult<String>;
    /// 批量 MEMORY USAGE，与入参等长；键不存在为 None。不支持时直接报错，不发命令。
    fn key_memory(&self, keys: Vec<RedisKey>) -> AnyResult<Vec<Option<u64>>>;
    fn key_slot(&self, key: RedisKey) -> AnyResult<u64>;
    fn key_node(&self, key: RedisKey) -> AnyResult<Vec<RedisNode>>;
    fn batch_del(&self, param: RedisBatchKey) -> AnyResult<()>;
    fn batch_ttl(&self, param: RedisBatchTtl) -> AnyResult<()>;
    fn flush_db(&self) -> AnyResult<()>;
    fn flush_all(&self) -> AnyResult<()>;

    // 字段
    fn field_add(&self, param: RedisFieldAdd) -> AnyResult<RedisKey>;
    fn field_set(&self, param: RedisFieldSet) -> AnyResult<()>;
    fn field_ttl(&self, param: RedisFieldTtl) -> AnyResult<()>;
    fn field_get(&self, param: RedisFieldGet) -> AnyResult<RedisFieldValue>;
    fn hash_keys(&self, param: RedisHashKeys) -> AnyResult<Vec<String>>;
    fn hash_values(&self, param: RedisHashKeys) -> AnyResult<Vec<String>>;
    fn field_pop(&self, param: RedisPop) -> AnyResult<String>;
    fn field_del(&self, param: RedisFieldDel) -> AnyResult<()>;

    // 有序集合
    fn zset_rank(&self, param: RedisZsetRank) -> AnyResult<RedisZsetRankResult>;
    fn zset_range(&self, param: RedisZsetRange) -> AnyResult<Vec<RedisZsetRangeItem>>;

    // Array
    fn ar_last_items(&self, param: RedisArLastItems) -> AnyResult<Vec<RedisArLastItemsItem>>;
    fn ar_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>>;

    // Vector Set
    fn v_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>>;
    fn v_getattr(&self, param: RedisVAttr) -> AnyResult<String>;
    fn v_setattr(&self, param: RedisVAttr) -> AnyResult<()>;
    fn v_sim(&self, param: RedisVSim) -> AnyResult<Vec<RedisVSimItem>>;

    // TimeSeries
    fn ts_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>>;

    // RedisSearch
    fn search_index_names(&self) -> AnyResult<Vec<String>>;
    fn search_index_list(&self) -> AnyResult<Vec<SearchIndexInfo>>;
    fn search_query(&self, param: SearchQueryParam) -> AnyResult<SearchQueryResult>;
    fn search_index_drop(&self, index: String, delete_docs: bool) -> AnyResult<()>;
    fn search_index_create(&self, command: String) -> AnyResult<()>;
    fn search_index_alter(&self, command: String) -> AnyResult<()>;
    fn search_tag_vals(&self, index: String, field: String) -> AnyResult<Vec<String>>;
    fn search_syn_dump(&self, index: String) -> AnyResult<Vec<SearchSynGroup>>;
    fn search_syn_update(&self, index: String, group: String, terms: Vec<String>) -> AnyResult<()>;
    fn search_sample_load(&self, kind: String) -> AnyResult<SearchSampleResult>;

    // Stream
    fn xinfo_groups(&self, key: RedisKey) -> AnyResult<Vec<XInfoGroup>>;
    fn xinfo_consumers(&self, key: RedisKey, group: String) -> AnyResult<Vec<XInfoConsumer>>;

    // 命令
    fn execute_command(&self, param: RedisCommand) -> AnyResult<String>;
    fn get_key_as_command(&self, key: RedisKey) -> AnyResult<String>;
    fn get_field_as_command(&self, param: RedisFieldAsCommand) -> AnyResult<String>;

    // 配置与诊断
    fn config_get(&self, pattern: &str, node: Option<String>) -> AnyResult<HashMap<String, String>>;
    fn config_set(&self, key: &str, value: &str, node: Option<String>) -> AnyResult<()>;
    fn slow_log(&self, count: Option<u64>, node: Option<String>) -> AnyResult<Vec<RedisSlowLog>>;
    fn memory_usage_keys(&self, keys: &[RedisKey], size_limit: u64, need_key_type: bool) -> AnyResult<Vec<RedisKeySize>>;
    fn client_list(&self, node: Option<String>, client_type: Option<String>) -> AnyResult<Vec<RedisClientInfo>>;

    // 发布订阅与监视
    fn publish(&self, channel: &str, message: &str, msg_fmt: Option<BytesFormat>) -> AnyResult<()>;
    fn subscribe(&self, channel: Option<String>) -> AnyResult<()>;
    fn subscribe_stop(&self) -> AnyResult<()>;
    fn monitor(&self, node: &str) -> AnyResult<()>;
    fn monitor_stop(&self) -> AnyResult<()>;
    // 键空间通知（独立于发布订阅通道）
    fn notify_subscribe(&self, param: NotifySubscribeParam) -> AnyResult<()>;
    fn notify_subscribe_stop(&self) -> AnyResult<()>;

    // 导入导出
    fn export_csv(&self, param: RedisExportCsv) -> AnyResult<()>;
    fn import_csv(&self, param: RedisImportCsv) -> AnyResult<()>;
    fn import_cmd(&self, file: String) -> AnyResult<()>;
    fn mock_data(&self, count: u64) -> AnyResult<()>;

    // ACL
    fn acl_users(&self) -> AnyResult<Vec<String>>;
    fn acl_list_users(&self) -> AnyResult<Vec<AclUserDetail>>;
    fn acl_getuser(&self, username: &str) -> AnyResult<AclUserDetail>;
    fn acl_setuser(&self, param: AclSetuserParam) -> AnyResult<()>;
    fn acl_deluser(&self, usernames: Vec<String>) -> AnyResult<usize>;
    fn acl_whoami(&self) -> AnyResult<String>;
    fn acl_cat(&self, category: Option<String>) -> AnyResult<Vec<String>>;
    fn acl_genpass(&self, bits: Option<i64>) -> AnyResult<String>;
    fn acl_save(&self) -> AnyResult<()>;
    fn acl_load(&self) -> AnyResult<()>;
    fn acl_log(&self, count: Option<u64>) -> AnyResult<Vec<AclLogEntry>>;
    fn acl_log_reset(&self) -> AnyResult<()>;
    fn acl_dryrun(&self, username: String, command: String) -> AnyResult<String>;

    // ------------------------------ 默认实现 ------------------------------

    /// 连接名称，取自配置。
    fn name(&self) -> String {
        self.base().conf.name.clone()
    }

    /// 单节点监控图，由 INFO 换算。
    fn chart(&self, node: Option<String>) -> AnyResult<RedisChart> {
        info_to_chart(self.info(node)?)
    }

    /// 各节点监控图，由 INFO 列表换算；`node_filter` 语义见 `info_list`。
    fn chart_list(&self, node_filter: Option<String>) -> AnyResult<Vec<RedisChart>> {
        let info_list = self.info_list(node_filter)?;
        info_list.into_iter().map(info_to_chart).collect()
    }

    /// 按模式扫描一页键，再估算这些键的内存占用。
    fn memory_usage(&self, param: RedisMemoryParam) -> AnyResult<RedisMemoryResult> {
        if !self.base().capabilities.memory_usage_supported {
            bail!("MEMORY USAGE is not supported");
        }
        let scan = self.scan(ScanParam {
            pattern: param.pattern.clone().unwrap_or_else(|| "*".into()),
            scan_type: None,
            cursor: param.cursor.clone(),
            exact: false,
            count: param.scan_count,
        })?;
        let scanned = scan.key_list.len() as u64;
        let key_list = self.memory_usage_keys(
            &scan.key_list,
            param.size_limit,
            param.need_key_type.unwrap_or(false),
        )?;
        Ok(RedisMemoryResult {
            key_list,
            cursor: scan.cursor,
            scanned,
        })
    }

    /// 已有导入或导出在跑时拒绝再开一个，并把自己标成进行中。返回的标记交给后台线程。
    fn export_import_check_running(&self) -> AnyResult<Arc<AtomicBool>> {
        let running = self.base().export_import_running.clone();
        if running.load(Ordering::Relaxed) {
            bail!(AppError::ExportImportRunning);
        }
        running.store(true, Ordering::Relaxed);
        Ok(running)
    }

    /// 查询本连接已记录的命令日志。
    fn command_logs(&self, limit: Option<u64>) -> AnyResult<Vec<CommandLogEntry>> {
        Ok(self.base().command_logger.query(limit))
    }

    /// 清空本连接的命令日志。
    fn command_logs_clear(&self) -> AnyResult<()> {
        self.base().command_logger.clear();
        Ok(())
    }
}

/// 复用现有连接，还是先 PING，还是直接重连。单机和集群共用，避免两处判断走偏。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnReuse {
    /// 距上次探活或重连不到检查间隔，且本地仍标记为开着。
    Keep,
    /// 超过检查间隔，但还没到「多半已断」的空闲时长。用短超时 PING。
    Probe,
    /// 本地已关闭，或空闲超过 `CONNECTION_STALE_SECONDS`。PING 要么必然失败，要么很可能干等超时。
    Reconnect,
}

/// `idle_secs` 为距上次探活或重连的秒数。本地已关闭时不再看空闲时长。
pub fn conn_reuse(is_open: bool, idle_secs: i64) -> ConnReuse {
    if !is_open || idle_secs >= CONNECTION_STALE_SECONDS {
        ConnReuse::Reconnect
    } else if idle_secs < CONNECTION_CHECK_SECONDS {
        ConnReuse::Keep
    } else {
        ConnReuse::Probe
    }
}

/// 按 `conn_reuse` 拿连接。
///
/// 标准库 Mutex 不能设加锁超时，所以用 parking_lot；暂不重入，其 Guard 没有 deref_mut。
/// `lock_conn` 每次现锁。重连闭包会再锁同一把 Mutex，所以调用它之前必须先丢掉 guard，否则死锁。
/// 最多重连一次：成功的重连会把 `last_check` 刷新成现在，下一轮应直接复用；
/// 若新连接仍要重连或探活失败，说明这条连接不可用，不再空转。
pub fn get_checked_conn<'a, T, L, P, R>(
    mut lock_conn: L,
    last_check: &AtomicI64,
    mut probe: P,
    mut reconnect: R,
) -> AnyResult<MutexGuard<'a, T>>
where
    T: ConnectionLike,
    L: FnMut() -> Option<MutexGuard<'a, T>>,
    P: FnMut(&mut T) -> AnyResult<bool>,
    R: FnMut() -> AnyResult<()>,
{
    let mut retried = false;
    loop {
        let Some(mut guard) = lock_conn() else {
            bail!(AppError::ConnectionLockTimeout);
        };
        let now = Utc::now().timestamp();
        let idle = now - last_check.load(Ordering::Relaxed);
        match conn_reuse(guard.is_open(), idle) {
            ConnReuse::Keep => return Ok(guard),
            ConnReuse::Probe => {
                // 先记下检查时间，避免这次 PING 变慢时，下一次点击又探一遍
                last_check.store(now, Ordering::Relaxed);
                if probe(&mut guard).unwrap_or(false) {
                    return Ok(guard);
                }
            }
            ConnReuse::Reconnect => {
                if guard.is_open() {
                    info!("连接空闲 {idle}s，跳过探活直接重连");
                } else {
                    info!("连接已关闭，跳过探活直接重连");
                }
            }
        }
        drop(guard);
        if retried {
            bail!(AppError::Internal {
                message: "重连后连接仍不可用".into(),
            });
        }
        retried = true;
        reconnect()?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 短间隔直接复用；中间档探活；本地已关或空闲过久则跳过 PING。
    #[test]
    fn conn_reuse_skips_ping_when_closed_or_stale() {
        assert_eq!(conn_reuse(true, 0), ConnReuse::Keep);
        assert_eq!(
            conn_reuse(true, CONNECTION_CHECK_SECONDS - 1),
            ConnReuse::Keep
        );
        assert_eq!(conn_reuse(true, CONNECTION_CHECK_SECONDS), ConnReuse::Probe);
        assert_eq!(
            conn_reuse(true, CONNECTION_STALE_SECONDS - 1),
            ConnReuse::Probe
        );
        assert_eq!(
            conn_reuse(true, CONNECTION_STALE_SECONDS),
            ConnReuse::Reconnect
        );
        // 刚用过但 redis-rs 已标记关闭：再 PING 没有成功的可能
        assert_eq!(conn_reuse(false, 0), ConnReuse::Reconnect);
        // 时钟回拨时按仍在检查间隔内处理，不因为负数空闲去探活
        assert_eq!(conn_reuse(true, -5), ConnReuse::Keep);
    }
}
