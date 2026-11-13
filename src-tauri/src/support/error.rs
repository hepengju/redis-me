use serde::{Deserialize, Serialize};

/// 应用错误 - 参数直接存在枚举中
///
/// 序列化示例:
/// ```json
/// {
///   "code": "key_not_found",
///   "key": "user:1001"
/// }
/// ```
///
/// 前端根据 `code` 字段获取翻译模板，其他字段用于插值
///
/// 使用方式:
/// ```text
/// bail!(AppError::KeyNotFound { key: "user:1001".into() })
/// bail!(AppError::ConnectionLockTimeout)
/// bail!(AppError::FileReadFailed { filename: "xxx".into(), detail: e.to_string() })
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum AppError {
    // 连接相关
    ConnectionNotFound {
        id: String,
    },
    ConnectionLockTimeout,
    ClusterDbSwitchNotSupported,
    /// 勾了 SSL，但对端仍是明文 Redis（探测到 RESP）
    TlsNotEnabled,
    /// 未勾 SSL，但对端是 TLS（明文被 RST，且 TLS 探测确认）
    SslRequired,
    /// 哨兵 GET-MASTER-ADDR-BY-NAME 未返回该主节点
    SentinelMasterNotFound {
        name: String,
    },
    /// 集群拓扑里的通告地址客户端不可达（如 cluster-announce-ip 配成 127.0.0.1/内网 IP），
    /// 建连在墙钟上限内仍未完成
    ClusterNodesUnreachable {
        timeout_secs: u64,
    },
    KeyNodeNotFound {
        key: String,
    },

    // 键值操作
    KeyNotFound {
        key: String,
    },
    KeyAlreadyExists {
        key: String,
    },
    KeyTypeUnsupported {
        value_type: String,
    },
    KeyTypeUnknown {
        value_type: String,
    },
    FieldNotFound {
        hash_key: String,
    },
    FieldNotFoundStream {
        stream_id: String,
    },
    FieldOperationNotSupported {
        mode: String,
    },
    /// Hash 字段过期（HTTL/HEXPIRE/HPERSIST）需 Redis/Valkey >= 7.4
    HttlNotSupported,
    FieldScanNotSupported {
        value_type: String,
    },
    InvalidZsetScoreBound {
        bound: String,
    },
    SearchReplyInvalid {
        detail: String,
    },
    /// 新建索引只接受一条 FT.CREATE
    SearchCreateNotFtCreate,
    /// 修改索引只接受一条 FT.ALTER
    SearchAlterNotFtAlter,

    // 配置相关
    InvalidNodeFormat {
        node: String,
    },

    // 导入导出 / 迁移
    ExportImportRunning,
    /// 已有键传输任务在跑
    MigrateRunning,
    /// 源与目标不能是同一连接同一 DB
    MigrateSameSourceTarget,
    EmptyKeyList,
    EmptyParameters,
    ImportInvalidLine {
        line: String,
    },
    /// 命令方式导出行数触达上限（Vector Set / TimeSeries），整键失败
    MigrateCommandExportLimit {
        key: String,
    },

    // SSH 相关
    SshKeyFileEmpty,
    SshLoginMethodNotSupported {
        method: String,
    },
    SshAuthFailed,
    SshTimeout,
    /// 同一连接不能同时开 SSH 与代理
    SshAndProxyMutuallyExclusive,
    /// Unix 套接字未填路径
    UnixSocketPathRequired,
    /// 路径不是绝对路径
    UnixSocketPathInvalid,
    /// Unix 套接字不能与集群、哨兵、SSL、代理同时使用
    UnixSocketIncompatible,
    /// 当前系统不能本机直连 Unix 套接字（需改走 SSH）
    UnixSocketPlatformUnsupported,

    // 网络代理
    ProxyModeNotSupported {
        mode: String,
    },
    ProxyTypeNotSupported {
        proxy_type: String,
    },
    ProxyHostRequired,
    ProxyAuthRequired,
    ProxyConnectRejected {
        status: u16,
    },
    ProxyHandshakeFailed {
        detail: String,
    },
    /// HTTPS 代理类型会对代理本身做 TLS；Clash 等明文口会握手失败
    ProxyTlsToProxyFailed,

    // 文件操作
    FileReadFailed {
        filename: String,
        detail: String,
    },
    FileWriteFailed {
        filename: String,
        detail: String,
    },

    // 通用错误（保留技术细节用）
    Internal {
        message: String,
    },
}

/// 将 AppError 转换为 anyhow::Error
impl From<AppError> for anyhow::Error {
    /// 序列化成 JSON；序列化失败时退回 Debug 文本。
    fn from(err: AppError) -> Self {
        anyhow::anyhow!(serde_json::to_string(&err).unwrap_or_else(|_| format!("{:?}", err)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 带参数的错误能按 JSON 来回，字段不丢。
    #[test]
    fn test_error_serialization() {
        let err = AppError::KeyNotFound {
            key: "user:1001".into(),
        };
        let json = serde_json::to_string(&err).unwrap();
        println!("Error JSON: {}", json);

        let parsed: AppError = serde_json::from_str(&json).unwrap();
        match parsed {
            AppError::KeyNotFound { key } => assert_eq!(key, "user:1001"),
            _ => panic!("wrong error type"),
        }
    }

    /// 没有参数的错误序列化后再解析，类型还在。
    #[test]
    fn test_error_no_params() {
        let err = AppError::ConnectionLockTimeout;
        let json = serde_json::to_string(&err).unwrap();
        println!("Error JSON: {}", json);

        let parsed: AppError = serde_json::from_str(&json).unwrap();
        match parsed {
            AppError::ConnectionLockTimeout => {}
            _ => panic!("wrong error type"),
        }
    }
}
