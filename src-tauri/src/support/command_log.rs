//! 命令执行日志：拦截 Redis 请求并写入环形缓冲。
//!
//! - 单机：LoggingConnection 包装 Connection，在 ConnectionLike 拦截。
//! - 集群：LoggingClusterConnection 包装 ClusterConnection（ConnectionLike + route_command）。
//! - Pipeline 仅在 req_packed_commands 记一条汇总（附首个命令便于识别用途）；Subscribe/Monitor/导出线程走独立连接，不记录。
//! - 连接初始化命令（INFO、CLIENT SETNAME、PING、CLUSTER NODES 等）均记入日志。
//! - 错误判定：`req_command` 的 `Err`，以及 RESP3 下 `Ok(Value::ServerError)`（与 redis-rs `Cmd::query` 的 `extract_error` 一致）。
//! - 写入后通过 `command-log` 事件推增量；打开面板时 `command_logs(limit)` 拉一次快照。

use crate::model::{CommandLogEntry, CommandLogEvent};
use crate::support::format::format_quoted;
use crate::support::util::EVENT_COMMAND_LOG;
use chrono::Local;
use log::debug;
use parking_lot::RwLock;
use redis::cluster::ClusterConnection;
use redis::cluster_routing::RoutingInfo;
use redis::{Arg, Cmd, Connection, ConnectionLike, RedisResult, Value};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const DEFAULT_MAX_ENTRIES: usize = 1_000;

/// 每连接一份，挂在 MeBase.command_logger
#[derive(Debug)]
pub struct CommandLogger {
    entries: RwLock<Vec<CommandLogEntry>>,
    next_id: AtomicU64,
    max_entries: usize,
    conn_id: String,
    /// 连接显示名，仅用于控制台 info 日志
    conn_name: String,
    app_handle: RwLock<Option<AppHandle>>,
}

impl CommandLogger {
    /// 一条连接一份日志。上限见 `DEFAULT_MAX_ENTRIES`。
    pub fn new(conn_id: String, conn_name: String) -> Self {
        Self {
            entries: RwLock::new(Vec::new()),
            next_id: AtomicU64::new(1),
            max_entries: DEFAULT_MAX_ENTRIES,
            conn_id,
            conn_name,
            app_handle: RwLock::new(None),
        }
    }

    /// connect 成功后绑定，用于 push 时 emit 增量事件
    pub fn bind_app_handle(&self, app_handle: AppHandle) {
        *self.app_handle.write() = Some(app_handle);
    }

    /// 清空内存里的日志。不通知前端，面板自己会再拉一次。
    pub fn clear(&self) {
        self.entries.write().clear();
    }

    /// 最近 limit 条（新→旧），供打开面板时拉快照
    pub fn query(&self, limit: Option<u64>) -> Vec<CommandLogEntry> {
        let limit = limit.unwrap_or(1000) as usize;
        let entries = self.entries.read();
        entries.iter().rev().take(limit).cloned().collect()
    }

    /// 从 redis-rs 的 `Cmd` 记一条，含耗时和错误。
    pub fn log_from_cmd(
        &self,
        db_index: u16,
        cmd: &Cmd,
        result: &RedisResult<Value>,
        duration_ms: u64,
    ) {
        let (command, args) = parse_cmd(cmd);
        let error = command_log_error(result);
        self.push_entry(db_index, &command, &args, error, duration_ms);
    }

    /// 调用方已经拆好命令名和参数时用这个记。
    pub fn log_raw(
        &self,
        db_index: u16,
        command: &str,
        args: &[String],
        error: Option<String>,
        duration_ms: u64,
    ) {
        self.push_entry(db_index, command, args, error, duration_ms);
    }

    /// 记一条命令：推给前端，并放进内存环形缓冲，超出上限时丢掉最旧的。
    fn push_entry(
        &self,
        db_index: u16,
        command: &str,
        args: &[String],
        error: Option<String>,
        duration_ms: u64,
    ) {
        let full_command = if args.is_empty() {
            command.to_string()
        } else {
            format!("{} {}", command, args.join(" "))
        };

        let entry = CommandLogEntry {
            id: self.next_id.fetch_add(1, Ordering::Relaxed),
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            db_index,
            command: command.to_string(),
            args: args.to_vec(),
            full_command,
            duration_ms,
            error,
        };

        debug!(
            "[{}] db={} {}",
            self.conn_name, db_index, entry.full_command
        );
        self.emit_entry(&entry);

        let mut entries = self.entries.write();
        entries.push(entry);
        if entries.len() > self.max_entries {
            let drop_count = entries.len() - self.max_entries;
            entries.drain(0..drop_count);
        }
    }

    /// 把这条日志发给前端。应用句柄还没就绪时直接丢掉。
    fn emit_entry(&self, entry: &CommandLogEntry) {
        let Some(app_handle) = self.app_handle.read().clone() else {
            return;
        };
        let event = CommandLogEvent {
            id: self.conn_id.clone(),
            entry: entry.clone(),
        };
        let _ = app_handle.emit(EVENT_COMMAND_LOG, event);
    }

    /// 管道只记一条汇总。`first` 是第一条实际命令，用来代表整批。
    fn log_pipeline_packed(
        &self,
        db_index: u16,
        count: usize,
        first: Option<&str>,
        result: &RedisResult<Vec<Value>>,
        duration_ms: u64,
    ) {
        let summary = match first {
            Some(first) => format!("{}x commands ({})", count.max(1), first),
            None => format!("{}x commands", count.max(1)),
        };
        let error = result.as_ref().err().map(|e| e.to_string());
        self.push_entry(db_index, "PIPELINE", &[summary], error, duration_ms);
    }
}

/// 单机模式：包装 Connection（勿 DerefMut，避免与 redis blanket ConnectionLike 冲突）
pub struct LoggingConnection {
    inner: Connection,
    logger: Arc<CommandLogger>,
    db_index: u16,
}

impl LoggingConnection {
    /// 包住单机连接。`db_index` 跟着 `SELECT` 更新，日志里要显示当前库。
    pub fn new(inner: Connection, logger: Arc<CommandLogger>, db_index: u16) -> Self {
        Self {
            inner,
            logger,
            db_index,
        }
    }

    /// 读超时交给内层连接。记日志不改超时。
    pub fn set_read_timeout(&mut self, timeout: Option<Duration>) -> RedisResult<()> {
        self.inner.set_read_timeout(timeout)
    }

    /// 写超时交给内层连接。
    pub fn set_write_timeout(&mut self, timeout: Option<Duration>) -> RedisResult<()> {
        self.inner.set_write_timeout(timeout)
    }

    /// `SELECT` 成功后更新日志里显示的库号。
    pub fn set_db_index(&mut self, db: u16) {
        self.db_index = db;
    }
}

impl ConnectionLike for LoggingConnection {
    /// 执行一条命令并记日志。
    fn req_command(&mut self, cmd: &Cmd) -> RedisResult<Value> {
        let start = Instant::now();
        let result = self.inner.req_command(cmd);
        let duration_ms = start.elapsed().as_millis() as u64;
        self.logger
            .log_from_cmd(self.db_index, cmd, &result, duration_ms);
        result
    }

    /// 单条已打包命令不单独记。pipeline 走 `req_packed_commands`。
    fn req_packed_command(&mut self, cmd: &[u8]) -> RedisResult<Value> {
        self.inner.req_packed_command(cmd)
    }

    /// pipeline 只记一条汇总，带上第一条命令的名字。
    fn req_packed_commands(
        &mut self,
        cmd: &[u8],
        offset: usize,
        count: usize,
    ) -> RedisResult<Vec<Value>> {
        let start = Instant::now();
        let result = self.inner.req_packed_commands(cmd, offset, count);
        let duration_ms = start.elapsed().as_millis() as u64;
        let first = parse_pipeline_first(cmd, offset);
        self.logger.log_pipeline_packed(
            self.db_index,
            count,
            first.as_deref(),
            &result,
            duration_ms,
        );
        result
    }

    /// 日志里显示的当前库。
    fn get_db(&self) -> i64 {
        self.db_index as i64
    }

    /// 探活交给内层连接。
    fn check_connection(&mut self) -> bool {
        self.inner.check_connection()
    }

    /// 连接是否还开着。
    fn is_open(&self) -> bool {
        self.inner.is_open()
    }
}

/// 集群模式：包装 ClusterConnection
pub struct LoggingClusterConnection {
    inner: ClusterConnection,
    logger: Arc<CommandLogger>,
    db_index: u16,
}

impl LoggingClusterConnection {
    /// 包住集群连接。库号一般是 0，和单机包装同一套日志。
    pub fn new(inner: ClusterConnection, logger: Arc<CommandLogger>, db_index: u16) -> Self {
        Self {
            inner,
            logger,
            db_index,
        }
    }

    /// 读超时交给集群连接。
    pub fn set_read_timeout(&mut self, timeout: Option<Duration>) -> RedisResult<()> {
        self.inner.set_read_timeout(timeout)
    }

    /// 写超时交给集群连接。
    pub fn set_write_timeout(&mut self, timeout: Option<Duration>) -> RedisResult<()> {
        self.inner.set_write_timeout(timeout)
    }

    /// 发到指定节点并记日志。ACL 广播这类调用走这里。
    pub fn route_command(&mut self, cmd: &Cmd, route: RoutingInfo) -> RedisResult<Value> {
        let start = Instant::now();
        let result = self.inner.route_command(cmd, route);
        let duration_ms = start.elapsed().as_millis() as u64;
        self.logger
            .log_from_cmd(self.db_index, cmd, &result, duration_ms);
        result
    }

    /// pipeline 查询要拿到里面的 `ClusterConnection`。
    pub fn inner_mut(&mut self) -> &mut ClusterConnection {
        &mut self.inner
    }

    /// ClusterPipeline::query 只接受 ClusterConnection，在此补记 PIPELINE 汇总。
    /// 跨 slot 键的批量命令（批量 DEL/TTL、MEMORY usage 等）必须走 ClusterPipeline 按 slot 拆分；
    /// redis-rs 的 req_packed_commands 不支持多节点分发，跨 slot 批量会发往随机节点导致 MOVED 错误
    pub fn cluster_pipe_query<T: redis::FromRedisValue>(
        &mut self,
        pipe: &redis::cluster::ClusterPipeline,
        command_count: usize,
    ) -> RedisResult<T> {
        let start = Instant::now();
        let result = pipe.query(self.inner_mut());
        let duration_ms = start.elapsed().as_millis() as u64;
        let log_result: RedisResult<Vec<Value>> = match &result {
            Ok(_) => Ok(vec![]),
            Err(e) => Err(e.clone()),
        };
        // ClusterPipeline 未暴露 packed 字节，借 cmd_iter 取首条命令用于日志识别
        let first = pipe.cmd_iter().next().map(format_cmd_brief);
        self.logger.log_pipeline_packed(
            self.db_index,
            command_count,
            first.as_deref(),
            &log_result,
            duration_ms,
        );
        result
    }
}

impl ConnectionLike for LoggingClusterConnection {
    /// 执行一条命令并记日志。路由由 redis-rs 决定。
    fn req_command(&mut self, cmd: &Cmd) -> RedisResult<Value> {
        let start = Instant::now();
        let result = self.inner.req_command(cmd);
        let duration_ms = start.elapsed().as_millis() as u64;
        self.logger
            .log_from_cmd(self.db_index, cmd, &result, duration_ms);
        result
    }

    /// 单条已打包命令不单独记。pipeline 走 `req_packed_commands`。
    fn req_packed_command(&mut self, cmd: &[u8]) -> RedisResult<Value> {
        self.inner.req_packed_command(cmd)
    }

    /// pipeline 只记一条汇总，带上第一条命令的名字。
    fn req_packed_commands(
        &mut self,
        cmd: &[u8],
        offset: usize,
        count: usize,
    ) -> RedisResult<Vec<Value>> {
        let start = Instant::now();
        let result = self.inner.req_packed_commands(cmd, offset, count);
        let duration_ms = start.elapsed().as_millis() as u64;
        let first = parse_pipeline_first(cmd, offset);
        self.logger.log_pipeline_packed(
            self.db_index,
            count,
            first.as_deref(),
            &result,
            duration_ms,
        );
        result
    }

    /// 日志里显示的当前库。
    fn get_db(&self) -> i64 {
        self.db_index as i64
    }

    /// 探活交给内层连接。
    fn check_connection(&mut self) -> bool {
        self.inner.check_connection()
    }

    /// 连接是否还开着。
    fn is_open(&self) -> bool {
        self.inner.is_open()
    }
}

// ------------------------------ 仅本文件使用 ------------------------------

/// 从 Redis 结果里抽出错误文本。成功且没有内嵌错误时返回 `None`。
fn command_log_error(result: &RedisResult<Value>) -> Option<String> {
    match result {
        Err(e) => Some(e.to_string()),
        Ok(value) => value.clone().extract_error().err().map(|e| e.to_string()),
    }
}

/// 日志参数显示上限（字符）
const LOG_ARG_MAX: usize = 32;

/// 日志参数显示：可打印 UTF-8 原样，其余按 redis-cli 风格转义，超长截断
fn display_log_arg(bytes: &[u8]) -> String {
    let mut s = match std::str::from_utf8(bytes) {
        Ok(text) if !text.chars().any(char::is_control) => text.to_string(),
        _ => format_quoted(bytes),
    };
    if s.chars().count() > LOG_ARG_MAX {
        s = s.chars().take(LOG_ARG_MAX).collect();
        s.push_str("...");
    }
    s
}

/// 将 Cmd 格式化为日志摘要（复用 parse_cmd 的转义/截断规则）
fn format_cmd_brief(cmd: &Cmd) -> String {
    let (command, args) = parse_cmd(cmd);
    if args.is_empty() {
        command
    } else {
        format!("{} {}", command, args.join(" "))
    }
}

/// 从 packed RESP 字节解析首个实际执行的命令（跳过 offset 条），用于 PIPELINE 汇总展示
fn parse_pipeline_first(packed: &[u8], offset: usize) -> Option<String> {
    // 跳过一条 RESP 命令数组，返回剩余字节
    fn skip_resp_array(data: &[u8]) -> Option<&[u8]> {
        let rest = data.strip_prefix(b"*")?;
        let nl = rest.windows(2).position(|w| w == b"\r\n")?;
        let count: usize = std::str::from_utf8(&rest[..nl]).ok()?.parse().ok()?;
        let mut rest = &rest[nl + 2..];
        for _ in 0..count {
            rest = rest.strip_prefix(b"$")?;
            let nl = rest.windows(2).position(|w| w == b"\r\n")?;
            let len: usize = std::str::from_utf8(&rest[..nl]).ok()?.parse().ok()?;
            // 长度已知，直接跳过数据体，不能在数据内搜索 \r\n
            rest = rest.get(nl + 2 + len + 2..)?;
        }
        Some(rest)
    }

    let mut rest = packed;
    for _ in 0..offset {
        rest = skip_resp_array(rest)?;
    }
    let rest = rest.strip_prefix(b"*")?;
    let nl = rest.windows(2).position(|w| w == b"\r\n")?;
    let count: usize = std::str::from_utf8(&rest[..nl]).ok()?.parse().ok()?;
    let mut rest = &rest[nl + 2..];
    let mut parts: Vec<String> = Vec::new();
    // 最多取3个参数，截断过长内容，避免日志行过长
    for i in 0..count {
        rest = rest.strip_prefix(b"$")?;
        let nl = rest.windows(2).position(|w| w == b"\r\n")?;
        let len: usize = std::str::from_utf8(&rest[..nl]).ok()?.parse().ok()?;
        let data = rest.get(nl + 2..nl + 2 + len)?;
        if i < 4 {
            let s = display_log_arg(data);
            parts.push(if i == 0 { s.to_ascii_uppercase() } else { s });
        }
        rest = rest.get(nl + 2 + len + 2..)?;
    }
    if parts.is_empty() {
        None
    } else {
        // 参数超过3个时，在末尾参数补省略号
        if count > 4
            && let Some(last) = parts.last_mut()
            && !last.ends_with("...")
        {
            last.push_str("...");
        }
        Some(parts.join(" "))
    }
}

/// 从 `Cmd` 取出大写命令名和已截断的参数，供日志一行展示。
fn parse_cmd(cmd: &Cmd) -> (String, Vec<String>) {
    let args: Vec<String> = cmd
        .args_iter()
        .filter_map(|arg| match arg {
            Arg::Simple(bytes) => Some(display_log_arg(bytes)),
            Arg::Cursor => Some("CURSOR".to_string()),
            _ => None,
        })
        .collect();
    let command = args
        .first()
        .cloned()
        .unwrap_or_else(|| "UNKNOWN".into())
        .to_uppercase();
    let rest = args.into_iter().skip(1).collect();
    (command, rest)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 日志条数超过上限时丢掉最老的，只留最近几条。
    #[test]
    fn ring_buffer_overwrites_oldest() {
        let logger = CommandLogger {
            entries: RwLock::new(Vec::new()),
            next_id: AtomicU64::new(1),
            max_entries: 3,
            conn_id: "test".into(),
            conn_name: "test".into(),
            app_handle: RwLock::new(None),
        };
        let cmd = redis::cmd("GET");
        for _ in 0..5 {
            logger.log_from_cmd(0, &cmd, &Ok(Value::Okay), 1);
        }
        assert_eq!(logger.entries.read().len(), 3);
    }

    /// 管道摘要跳过前面的 SELECT，超长参数截断，二进制按转义显示。
    #[test]
    fn parse_pipeline_first_skips_offset_and_truncates() {
        let mut packed = Vec::new();
        // 首条为 SELECT（offset 跳过），次条为 VEMB
        packed.extend_from_slice(b"*2\r\n$6\r\nSELECT\r\n$1\r\n0\r\n");
        packed.extend_from_slice(b"*3\r\n$4\r\nVEMB\r\n$8\r\nvec2word\r\n$200\r\n");
        packed.extend(std::iter::repeat_n(b'x', 202)); // 200 字节 + \r\n
        assert_eq!(
            parse_pipeline_first(&packed, 1),
            Some(format!("VEMB vec2word {}...", "x".repeat(32)))
        );
        // offset 0 返回首条命令
        assert_eq!(
            parse_pipeline_first(&packed, 0).as_deref(),
            Some("SELECT 0")
        );
        // 二进制参数按 redis-cli 风格转义，不再出现乱码
        let bin = b"*2\r\n$4\r\nVEMB\r\n$3\r\n\x00\x01\xff\r\n";
        assert_eq!(
            parse_pipeline_first(bin, 0).as_deref(),
            Some("VEMB \"\\x00\\x01\\xff\"")
        );
        // 非法字节返回 None
        assert_eq!(parse_pipeline_first(b"garbage", 0), None);
    }

    /// 服务端错误回复要写进命令日志，不能当成成功。
    #[test]
    fn command_log_error_includes_server_error_value() {
        let wire = b"-NOPERM User has no permissions to run the 'config|get' command\r\n";
        let value = redis::parse_redis_value(wire).unwrap();
        let err = command_log_error(&Ok(value)).expect("should detect server error");
        assert!(err.contains("NoPerm") || err.contains("permissions"));
    }

    /// 可打印参数原样；控制字符按 redis-cli 转义，超长截断并加省略号。
    #[test]
    fn log_arg_quotes_binary_and_truncates() {
        assert_eq!(display_log_arg(b"hello"), "hello");
        assert_eq!(display_log_arg(b"\n"), r#""\n""#);
        let long = "a".repeat(40);
        assert_eq!(
            display_log_arg(long.as_bytes()),
            format!("{}...", "a".repeat(32))
        );

        let (command, args) = parse_cmd(redis::cmd("get").arg("mykey"));
        assert_eq!(command, "GET");
        assert_eq!(args, vec!["mykey".to_string()]);
        assert_eq!(format_cmd_brief(&redis::cmd("PING")), "PING");
    }
}
