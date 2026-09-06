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
/// ```rust
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
    SentinelNotSupported,
    ClusterNotSupported,
    ClusterDbSwitchNotSupported,
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

    // 配置相关
    InvalidNodeFormat {
        node: String,
    },

    // 导入导出
    ExportImportRunning,
    EmptyKeyList,
    EmptyParameters,
    ImportInvalidLine {
        line: String,
    },

    // SSH 相关
    SshKeyFileEmpty,
    SshLoginMethodNotSupported {
        method: String,
    },
    SshAuthFailed,
    SshTimeout,

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
    fn from(err: AppError) -> Self {
        anyhow::anyhow!(serde_json::to_string(&err).unwrap_or_else(|_| format!("{:?}", err)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
