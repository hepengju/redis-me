use crate::api_model;
use crate::utils::model::MeBase;
use crate::utils::util::redis_value_to_string;
use redis::{ConnectionLike, Value};
use serde::{Deserialize, Serialize};
use specta::Type;

// 服务器能力（connect 时检测并返回）
api_model!(
    #[derive(Default)]
    ServerCapabilities {
        version: String,
        is_valkey: bool,
        info_supported: bool,
        acl_supported: bool,
        acl_dryrun_supported: bool,
        acl_selector_supported: bool,
        httl_supported: bool,
        /// 集群模式是否支持编号数据库（Valkey 9+）
        cluster_db_supported: bool,
    }
);

/// 从 INFO 输出中解析服务器版本
/// 返回 (版本号, 是否为 Valkey)
pub fn parse_server_version(info: &str) -> (String, bool) {
    let mut valkey_version = None;
    let mut redis_version = None;
    for line in info.lines() {
        if let Some(v) = line.strip_prefix("valkey_version:") {
            valkey_version = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("redis_version:") {
            redis_version = Some(v.trim().to_string());
        }
    }
    let is_valkey = valkey_version.is_some();
    let version = valkey_version.or(redis_version).unwrap_or_default();
    (version, is_valkey)
}

/// 检测服务器能力：优先通过 INFO SERVER 解析版本号，失败时 fallback 到 HTTL 命令探测
pub fn detect_server_capabilities(
    conn: &mut impl ConnectionLike,
    base: &mut MeBase,
    is_cluster: bool,
) {
    // Value接收是为了适配单机（返回String）和集群（返回Map）场景
    if let Ok(value) = redis::cmd("info").arg("server").query::<Value>(conn) {
        let info = redis_value_to_string(value, "\n");
        let (version, is_valkey) = parse_server_version(&info);
        base.capabilities = detect_capabilities(&version, is_valkey, is_cluster);
        log::info!("服务版本: {} (is_valkey={})", version, is_valkey);
    } else {
        log::info!("INFO SERVER 不可用，尝试 HTTL 命令探测字段级 TTL 支持");
        base.capabilities.info_supported = false;
        base.capabilities.httl_supported = detect_httl_by_command(conn);
        base.capabilities.cluster_db_supported = false;
    }
    log::info!("服务能力: {:?}", base.capabilities);
}

/// 根据版本号检测服务能力
pub fn detect_capabilities(version: &str, is_valkey: bool, is_cluster: bool) -> ServerCapabilities {
    let mut parts = version.split('.');
    let major = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    ServerCapabilities {
        version: version.to_string(),
        is_valkey,
        // INFO 命令执行成功即支持
        info_supported: true,
        // ACL 自 Redis/Valkey 6.0 起支持；用于 Info 入口与 ACL 页
        acl_supported: major >= 6,
        // ACL DRYRUN 自 Redis/Valkey 7.0 起支持
        acl_dryrun_supported: major >= 7,
        // ACL selectors 自 Redis/Valkey 7.2 起支持
        acl_selector_supported: major > 7 || (major == 7 && minor >= 2),
        // Hash 字段级 TTL 自 Redis/Valkey 7.4 起支持
        httl_supported: major > 7 || (major == 7 && minor >= 4),
        // Valkey 9+ 集群模式编号数据库（Redis OSS 集群不支持）
        cluster_db_supported: is_cluster && is_valkey && major >= 9,
    }
}

/// 通过实际执行 HTTL 命令探测服务器是否支持字段级 TTL
/// 用于 INFO 命令不可用（如 ACL 限制）时的 fallback 探测
pub fn detect_httl_by_command(conn: &mut impl ConnectionLike) -> bool {
    let result: redis::RedisResult<Vec<i64>> = redis::cmd("HTTL")
        .arg("nonexistent_key_for_probe")
        .arg("FIELDS")
        .arg("1")
        .arg("_probe_field_")
        .query(conn);

    match result {
        Ok(_) => true,
        Err(_) => false,
    }
}
