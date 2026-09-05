#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::api_model;
use crate::utils::capabilities::ServerCapabilities;
use crate::utils::conn::{get_client_cluster, get_client_single, init_single_connection};
use crate::utils::error::AppError;
use crate::utils::util::{
    AnyResult, CONNECTION_CONNECT_TIMEOUT, CONNECTION_NORMAL_TIMEOUT, vec8_to_display_string,
};
use chrono::Utc;
use parking_lot::RwLock;
use redis::{ProtocolVersion, RedisWrite, ToRedisArgs, ToSingleRedisArg};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU16};
use std::time::Duration;
use tauri::AppHandle;

/// 终端输出格式，对应 redis-cli `--raw` / `--csv` / `--json`；默认 TTY
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CliOutputMode {
    #[default]
    Standard,
    Raw,
    Json,
    Csv,
}

/// 前后端 IPC 字节格式：utf8 文本或 base64 原始字节（hex/binary/msgpack 等视图格式在前端处理）
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum BytesFormat {
    #[default]
    UTF8, // 默认字符串（UTF-8 lossy）
    Base64, // 原始字节的 Base64 编码
}

/// 连接 meta 值（与前端 JSON 结构一致，供 specta 导出）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum ConnMetaValue {
    String(String),
    Number(f64),
    Bool(bool),
    Object(HashMap<String, ConnMetaValue>),
    Array(Vec<ConnMetaValue>),
    Null,
}

// 连接信息
api_model!(
    #[derive(Default)]
    ConnConfig {
        id: String,
        name: String,

        host: String,
        port: u16,
        username: String,
        password: String,
        db: u16,

        // 集群模式
        cluster: bool,

        // SSL连接
        ssl: bool,
        ssl_option: SslOption,

        // 哨兵模式
        sentinel: bool,
        sentinel_option: SentinelOption,

        // SSH隧道
        ssh: bool,
        ssh_option: SshOption,

        // 扩展元信息（分组、命令映射、库别名等，与前端 conn.meta 一致）
        #[serde(default)]
        meta: HashMap<String, ConnMetaValue>,
    }
);

impl ConnConfig {
    /// 从 meta.commandMap 解析命令映射（键为小写原命令名）。
    pub fn command_map(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();
        let Some(ConnMetaValue::Object(obj)) = self.meta.get("commandMap") else {
            return map;
        };
        for (k, v) in obj {
            let ConnMetaValue::String(mapped) = v else {
                continue;
            };
            let cmd = k.trim().to_ascii_lowercase();
            let mapped = mapped.trim();
            if !cmd.is_empty() && !mapped.is_empty() {
                map.insert(cmd, mapped.to_string());
            }
        }
        map
    }

    /// 通信协议（meta.protocol）：仅 resp3 生效，其余/缺省均为默认 RESP2
    pub fn protocol_version(&self) -> ProtocolVersion {
        match self.meta.get("protocol") {
            Some(ConnMetaValue::String(p)) if p.eq_ignore_ascii_case("resp3") => {
                ProtocolVersion::RESP3
            }
            _ => ProtocolVersion::RESP2,
        }
    }

    /// meta.protocol 是否为 resp3
    pub fn is_resp3(&self) -> bool {
        self.protocol_version().supports_resp3()
    }

    /// 极简模式（meta.uiMode=minimal）：仅键值与终端；连接时跳过 CLIENT SETNAME
    pub fn is_minimal_mode(&self) -> bool {
        matches!(
            self.meta.get("uiMode"),
            Some(ConnMetaValue::String(s)) if s == "minimal"
        )
    }
}

api_model!(
    #[derive(Default)]
    SslOption {
        key: String,
        cert: String,
        ca: String,
    }
);

api_model!(
    #[derive(Default)]
    SentinelOption {
        master_name: String,
        master_username: String,
        master_password: String,
    }
);

api_model!(
    #[derive(Default)]
    SshOption {
        host: String,
        port: u16,

        login_type: String, // pwd 用户名/密码, pkfile 私钥文件
        username: String,
        password: String,
        pkfile: String,
        passphrase: String,
    }
);

fn default_connection_timeout_secs() -> u64 {
    CONNECTION_CONNECT_TIMEOUT.as_secs()
}

// 全局应用设置：由前端 settings 同步，新连接/重连时快照 connection_timeout / command_timeout
api_model!(AppSettings {
    #[serde(default = "default_connection_timeout_secs")]
    connection_timeout_secs: u64,
    command_timeout_secs: u64,
});

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            connection_timeout_secs: CONNECTION_CONNECT_TIMEOUT.as_secs(),
            command_timeout_secs: CONNECTION_NORMAL_TIMEOUT.as_secs(),
        }
    }
}

impl AppSettings {
    pub fn normalized(self) -> Self {
        Self {
            connection_timeout_secs: self.connection_timeout_secs.clamp(5, 300),
            command_timeout_secs: self.command_timeout_secs.clamp(5, 300),
        }
    }

    pub fn connection_timeout(&self) -> Duration {
        Duration::from_secs(self.connection_timeout_secs)
    }

    pub fn command_timeout(&self) -> Duration {
        Duration::from_secs(self.command_timeout_secs)
    }
}

impl ConnConfig {
    pub fn test(&self, connect_timeout: Duration) -> AnyResult<()> {
        if self.cluster {
            get_client_cluster(self, Some(connect_timeout))?;
        } else {
            get_client_single(self, connect_timeout, true)?;
        };
        // 单机模式返回的元组在测试后丢弃，SSH 隧道随之关闭
        // 集群模式不支持 SSH
        Ok(())
    }

    pub fn masters(
        &self,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<Vec<HashMap<String, String>>> {
        let mut conf = self.clone();
        conf.sentinel = false;
        let (client, _) = get_client_single(&conf, connect_timeout, false)?;
        let mut conn = init_single_connection(&client, conf.db, connect_timeout, command_timeout)?;
        let masters: Vec<HashMap<String, String>> =
            redis::cmd("sentinel").arg("masters").query(&mut conn)?;
        Ok(masters)
    }
}

// 客户端的公共属性（仅后端内部使用，不参与前端类型导出）
#[derive(Debug, Clone)]
pub struct MeBase {
    pub id: String,
    pub conf: ConnConfig,
    pub db: Arc<AtomicU16>,
    pub subscribe_running: Arc<AtomicBool>,
    pub monitor_running: Arc<AtomicBool>,
    pub export_import_running: Arc<AtomicBool>,
    pub last_check_time: Arc<AtomicI64>,
    /// 已建立连接上的单次命令读写超时（init 时从 AppSettings 快照）
    pub command_timeout: Duration,
    /// 建连超时（TCP+握手+PING；init 时从 AppSettings 快照，重连复用）
    pub connection_timeout: Duration,
    /// 本连接命令执行日志（环形缓冲）
    pub command_logger: Arc<crate::utils::command_log::CommandLogger>,
    /// 用于后台线程 emit 事件到前端
    pub app_handle: Arc<RwLock<Option<AppHandle>>>,
    /// 连接成功后检测的服务器能力
    pub capabilities: ServerCapabilities,
}

impl From<&ConnConfig> for MeBase {
    fn from(conf: &ConnConfig) -> Self {
        MeBase {
            id: conf.id.clone(),
            conf: conf.clone(),
            db: Arc::new(AtomicU16::new(conf.db)),
            subscribe_running: Arc::new(AtomicBool::new(false)),
            monitor_running: Arc::new(AtomicBool::new(false)),
            export_import_running: Arc::new(AtomicBool::new(false)),
            last_check_time: Arc::new(AtomicI64::new(Utc::now().timestamp())),

            command_timeout: CONNECTION_NORMAL_TIMEOUT,
            connection_timeout: CONNECTION_CONNECT_TIMEOUT,
            command_logger: Arc::new(crate::utils::command_log::CommandLogger::new(
                conf.id.clone(),
                conf.name.clone(),
            )),
            app_handle: Arc::new(RwLock::new(None::<AppHandle>)),
            capabilities: ServerCapabilities::default(),
        }
    }
}

// 新增：MeBase 更新版本和能力的方法
impl MeBase {
    /// 获取绑定的 AppHandle，未初始化时返回错误
    pub fn get_app_handle(&self) -> AnyResult<AppHandle> {
        self.app_handle.read().clone().ok_or_else(|| {
            AppError::Internal {
                message: "AppHandle not initialized".to_string(),
            }
            .into()
        })
    }
}

// 数据库信息
api_model!(RedisDB { db: u16, size: u64 });

// 信息 图形
api_model!(
    #[derive(Default)]
    RedisChart {
        node: String,

        // db0:keys=1558,expires=0,avg_ttl=0,subexpiry=0; db1:keys=50,expires=0,avg_ttl=0,subexpiry=0
        key_total: u64,                 // 键总数
        connected_clients: u64,         // 客户端数量
        instantaneous_ops_per_sec: f64, // 命令执行数/秒
        used_memory: u64,               // 内存使用量
        instantaneous_input_kbps: f64,  // 网络输入
        instantaneous_output_kbps: f64, // 网络输出

        total_connections_received: u64, // 服务器接受的总连接数
        total_commands_processed: u64,   // 服务器处理的总命令数

        // 计算缓存命中率: Cache Hit Ratio = keyspace_hits / (keyspace_hits + keyspace_misses)
        keyspace_hits: u64,   // 在主字典中成功查找键的数量
        keyspace_misses: u64, // 在主字典中查找键失败的数量
        cache_hit_ratio: f64, // 缓存命中率
    }
);

// 信息 info命令
api_model!(RedisInfo {
    node: String,
    info: String,
});

// 集群节点
api_model!(
#[derive(Default)]
RedisNode {
    id: String,
    node: String,
    flags: String,
    slots: Option<String>,
    slave_of_node: Option<String>
});

// 扫描参数
api_model!(ScanParam {
    #[serde(rename = "match")]
    pattern: String,

    #[serde(rename = "type")]
    scan_type: Option<String>,

    cursor: Option<ScanCursor>,

    /// 完全匹配：true 时后端 EXISTS；false 时 SCAN
    exact: bool,

    /// Redis SCAN COUNT（来自前端 keyScanCount）；0 时后端兜底
    count: u64,
});

// fieldScan 按类型的扩展参数：Stream 范围、STRING 大值预览阈值等
api_model!(FieldScanMeta {
    /// Stream XREVRANGE 上界和下界
    max_id: String,
    min_id: String,
    /// STRING 全量加载字节上限；超过且未 force 时仅 GETRANGE 预览前 value_preview_bytes
    value_byte_limit: Option<u64>,
    value_preview_bytes: Option<u64>,
    force_full_value: Option<bool>,
    /// List LRANGE / Array ARSCAN 下界；空则 0
    list_min_index: Option<i64>,
    /// List LRANGE 上界（空则 len-1）；Array ARSCAN 上界（空则索引最大值）
    list_max_index: Option<i64>,
    /// List 扫描方向：true 从 max 向 min，false 从 min 向 max
    list_desc: Option<bool>,
    /// Stream 扫描方向：true 从 max 向 min（XREVRANGE），false 从 min 向 max（XRANGE）
    stream_desc: Option<bool>,
    /// VectorSet 浏览模式：true 随机采样（VRANDMEMBER，无分页）；false 范围查询（VRANGE）；默认 true
    vectorset_sample: Option<bool>,
    /// ZSet 分数下界；空/缺省则 -inf。任一侧非空即走 ZRANGEBYSCORE
    #[serde(default)]
    zset_min_score: Option<String>,
    /// ZSet 分数上界；空/缺省则 +inf
    #[serde(default)]
    zset_max_score: Option<String>,
});

api_model!(FieldScanParam {
    key: RedisKey,
    count: u64,
    cursor: Option<ScanCursor>,
    /// HSCAN/SSCAN/ZSCAN 的 MATCH pattern（前端字段名 match）
    #[serde(rename = "match")]
    pattern: String,
    /// 完全匹配：true 时走 HGET / SISMEMBER / ZSCORE
    exact: bool,
    meta: Option<FieldScanMeta>,
    bytes_format: Option<BytesFormat>, // 扫描/展示用字节格式
    /// 是否拉取 TYPE/TTL/MEMORY/HLEN；前端续扫时为 false
    include_meta: Option<bool>,
    /// 续扫时传入（include_meta=false），避免重复 TYPE
    key_type: Option<String>,
    /// Hash 扫描是否附带 HTTL（默认 false 以提速）
    include_field_ttl: Option<bool>,
});

api_model!(XInfoGroup{
    name: String,
    consumers: usize,
    pending: usize,
    last_delivered_id: String,
    entries_read: Option<usize>,
    lag: Option<usize>
});

api_model!(XInfoConsumer {
    name: String,
    pending: usize,
    idle: usize,
});

api_model!(
#[derive(Default)]
FieldScanValue {
    hash: Vec<RedisHashItem>,
    set: Vec<String>,
    zset: Vec<RedisZetItem>,
});

// 扫描游标
api_model!(
#[derive(Default)]
ScanCursor {
    ready_nodes: Vec<String>,
    now_node: String,
    /// SCAN 游标 IPC 用字符串，避免 JS Number 超过 2^53 丢精度导致续扫卡死
    #[serde(with = "u64_as_string")]
    #[specta(type = String)]
    now_cursor: u64,
    stream_cursor: String,
    finished: bool,
});

// 扫描结果
api_model!(ScanResult {
    key_list: Vec<RedisKey>,
    cursor: ScanCursor,
});

api_model!(FieldScanResult {
    #[serde(rename = "type")]
    key_type: String,
    ttl: i64,
    size: u64,
    #[specta(type = specta_typescript::Any)]
    value: serde_json::Value,
    cursor: ScanCursor,
    length: usize, // String/Hash字段：原始 bytes 长度；集合类型：元素总数(HLEN/LLEN/SCARD/ZCARD/XLEN/ARCOUNT)
    /// STRING 因超过 value_byte_limit 仅返回预览片段时为 true
    value_truncated: bool,
    /// Array：ARLEN（逻辑长度 maxIndex+1）；其它类型为 None
    #[serde(default, skip_serializing_if = "Option::is_none")]
    logical_length: Option<u64>,
    /// Vector Set：VDIM（向量维度）；其它类型为 None
    #[serde(default, skip_serializing_if = "Option::is_none")]
    vector_dim: Option<u64>,
});

// Redis键: 由于键是字节存储的，考虑转换为utf-8字符串显示后可能会丢失信息，因此封装为对象
// 备注: bytes 序列化为 base64。合法 UTF-8 键可省略 bytes（空 Vec），to_bytes 回退 key.as_bytes()；
//       非法 UTF-8 / 二进制键必须带 bytes，key 仅作 lossy 展示。
api_model!(RedisKey {
    key: String,    // 显示

    #[serde(with = "v8_base64")]
    #[specta(type = String)]
    bytes: Vec<u8>, // 修改、删除等依据；UTF-8 可省略（JSON 为 Base64 字符串）
});

impl RedisKey {
    pub fn to_bytes(&self) -> &[u8] {
        // 扫描 UTF-8 键 / 手动新增键：bytes 为空，用 key；二进制键：必须用 bytes
        if self.bytes.is_empty() {
            self.key.as_bytes()
        } else {
            &self.bytes
        }
    }

    pub fn to_normal(&self) -> Self {
        if self.key.is_empty() {
            RedisKey::from(self.bytes.clone())
        } else if self.bytes.is_empty() {
            RedisKey::from(self.key.clone())
        } else {
            self.clone()
        }
    }
}

impl From<&str> for RedisKey {
    fn from(s: &str) -> Self {
        // 字符串构造的键本身是 UTF-8，无需再带一份 bytes
        RedisKey {
            key: s.to_string(),
            bytes: Vec::new(),
        }
    }
}
impl From<String> for RedisKey {
    fn from(s: String) -> Self {
        RedisKey {
            key: s,
            bytes: Vec::new(),
        }
    }
}
impl From<Vec<u8>> for RedisKey {
    fn from(bytes: Vec<u8>) -> Self {
        // 合法 UTF-8：只留 key，省略 bytes，降低 SCAN 全量时的 IPC/前端内存
        match String::from_utf8(bytes) {
            Ok(key) => RedisKey {
                key,
                bytes: Vec::new(),
            },
            Err(e) => {
                let bytes = e.into_bytes();
                RedisKey {
                    key: vec8_to_display_string(&bytes),
                    bytes,
                }
            }
        }
    }
}

impl From<RedisKey> for String {
    fn from(redis_key: RedisKey) -> Self {
        if redis_key.key.is_empty() {
            String::from_utf8_lossy(&redis_key.bytes).to_string()
        } else {
            redis_key.key.clone()
        }
    }
}

impl ToRedisArgs for RedisKey {
    fn write_redis_args<W>(&self, out: &mut W)
    where
        W: ?Sized + RedisWrite,
    {
        out.write_arg(self.to_bytes())
    }
}
impl ToSingleRedisArg for RedisKey {}

// 复制键：COPY source destination [DB destination-db] [REPLACE]
api_model!(RedisCopyParam {
    source: RedisKey,
    destination: RedisKey,
    db: u16,
});

// 批量删除
api_model!(RedisBatchKey {
    #[serde(rename = "match")]
    pattern: String,
    key_list: Vec<RedisKey>,
});

// 批量更新过期时间
api_model!(RedisBatchTtl {
    key_list: Vec<RedisKey>,
    ttl: i64
});

fn default_export_format() -> String {
    "csv".into()
}

// 导出（csv：DUMP 格式；cmd：redis-cli 可执行命令文本）
api_model!(RedisExportCsv {
    #[serde(rename = "match")]
    pattern: String,
    key_list: Vec<RedisKey>,
    file: String,
    with_ttl: bool,
    #[serde(default = "default_export_format")]
    export_format: String,
});

impl From<RedisExportCsv> for RedisBatchKey {
    fn from(value: RedisExportCsv) -> Self {
        RedisBatchKey {
            pattern: value.pattern,
            key_list: value.key_list,
        }
    }
}

// 导入
api_model!(RedisImportCsv {
    file: String,
    ttl: i64,
    handle_ttl: String, // TTL处理: 尝试读取 parse, 自定义 custom, 永久 forever
    handle_conflict: String, // 冲突处理: 覆盖 replace, 忽略 ignore
});

// Hash条目
api_model!(RedisHashItem{
    key: String,
    value: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    ttl: Option<i64>,
});

// List 条目（fieldScan 返回，index 为 Redis 列表下标）
api_model!(RedisListItem {
    index: i64,
    value: String,
});

// Zset条目
api_model!(RedisZetItem {
    value: String,
    score: f64,
});

// Stream条目
api_model!(RedisStreamItem {
    id: String,
    value: HashMap<String, String>, // map转化为的json字符串
});

// 字段新增
api_model!(RedisFieldAdd {
    /// 目标 Redis 键（与 `RedisFieldSet` / `RedisFieldDel` 一致）；`bytes` 为空时由 `key` 文本 + `key_fmt` 解析
    key: RedisKey,
    mode: String,    // key-新增键, field-新增字段

    #[serde(rename = "type")]
    key_type: String,
    ttl: i64,
    value: String, // 字段类型为String时的值

    list_push_method: String, // lpush, rpush
    /// Array 写入方式：arset（指定索引）/ arinsert（游标插入）
    array_write_method: String,
    /// Vector Set：前端已解析的浮点分量（勿传多格式文本；空=非 vectorset）
    #[serde(default)]
    vector: Vec<f64>,
    /// Vector Set：attrs JSON 文本；空=不设 SETATTR（新建不带属性）
    #[serde(default)]
    attrs: String,
    field_value_list: Vec<RedisFieldValue>,
    stream_id: String, // stream

    /// 仅 Redis 顶层键名（`key`）如何解码为字节；不含 Hash/Stream 的字段名
    key_fmt: Option<BytesFormat>,
    /// 除 Redis 键名外的输入：String 值、Hash 字段名与值、List/Set/ZSet 成员、Stream 字段名与值等
    val_fmt: Option<BytesFormat>,

});

// Array ARLASTITEMS（对标 ZSet TopN）
api_model!(RedisArLastItems {
    key: RedisKey,
    /// 返回数量
    count: u64,
    /// true: REV（最近优先）；false: 默认插入顺序中最旧优先
    reverse: bool,
    val_fmt: Option<BytesFormat>,
});

api_model!(RedisArLastItemsItem {
    /// 结果序位（0 起，非 Redis 索引；ARLASTITEMS 不返回槽位）
    index: i64,
    /// None = Redis null（空槽）；Some = 按 val_fmt 编码后的值
    value: Option<String>,
});

// Array ARINFO 元数据一行（保序；字段名与 Redis 回复一致）
api_model!(RedisArInfoItem {
    field: String,
    value: String,
});

// Vector Set：按元素读写 attrs（VGETATTR / VSETATTR；不随 VRANGE）
api_model!(RedisVAttr {
    key: RedisKey,
    /// 元素名 wire（与 fieldScan 行 key 一致）
    field_key: String,
    /// 仅 VSETATTR：JSON 文本；空串删除属性
    #[serde(default)]
    attrs: String,
    val_fmt: Option<BytesFormat>,
});

// Vector Set VSIM：相似度查询（WITHSCORES 固定开启）
api_model!(RedisVSim {
    key: RedisKey,
    /// ele | values
    mode: String,
    /// ELE：查询元素名（按 val_fmt 解码）
    #[serde(default)]
    field_key: String,
    /// VALUES：查询向量
    #[serde(default)]
    vector: Vec<f64>,
    /// COUNT；默认由调用方填
    count: u64,
    /// 是否 WITHATTRIBS
    with_attribs: bool,
    /// FILTER 表达式；空=不加
    #[serde(default)]
    filter: String,
    /// EPSILON；None=不加
    epsilon: Option<f64>,
    /// EF；None=不加
    ef: Option<u64>,
    val_fmt: Option<BytesFormat>,
});

api_model!(RedisVSimItem {
    /// 元素名（val_fmt 编码）
    key: String,
    /// 相似度 1=同向，0=反向
    score: f64,
    /// WITHATTRIBS 时返回；无属性为空串
    #[serde(default)]
    attrs: String,
});

// Vector Set 元素（field_scan 返回，含向量+属性）
api_model!(RedisVectorSetItem {
    /// 元素名（val_fmt 编码）
    name: String,
    /// 向量 JSON 数组字符串 "[1.0, 2.0, ...]"
    vector: String,
    /// 属性 JSON 对象字符串 "{\"pos\":\"noun\"}"
    #[serde(default)]
    attrs: String,
});

// 字段修改
api_model!(RedisFieldSet {
    key: RedisKey,
    src_field_value: String,
    field_index: isize,
    field_key: String,
    field_value: String,
    field_score: f64,
    field_ttl: i64, // 字段 TTL（秒），仅 Redis/Valkey >= 7.4
    /// true：界面展示/编辑字段 TTL；false：不拉取列表 TTL，保存时仍保留原有过期
    include_field_ttl: Option<bool>,
    /// 编辑字段时解析用户输入（含 Hash 字段名）；Redis 键由 `key` 承载，不再经此格式解析
    val_fmt: Option<BytesFormat>,
    /// Vector Set：前端已解析的浮点分量（与 `RedisFieldAdd.vector` 一致；空=非 vectorset）
    #[serde(default)]
    vector: Vec<f64>,
    /// Vector Set：前端恒提交当前全量 attrs JSON（空串=清除属性，官方约定）
    #[serde(default)]
    attrs: String
});

// Hash HKEYS / HVALS 共用参数
api_model!(RedisHashKeys {
    key: RedisKey,
    /// Hash 字段名/值解码格式，与 field_get / fieldScan 一致
    val_fmt: Option<BytesFormat>,
});

// List/Set/ZSet 通用弹出：LPOP/RPOP/SPOP/ZPOPMIN/ZPOPMAX
// mode: LPOP/RPOP/SPOP/ZPOPMIN/ZPOPMAX
api_model!(RedisPop {
    key: RedisKey,
    /// 操作模式（LPOP/RPOP/SPOP/ZPOPMIN/ZPOPMAX）
    mode: String,
    /// 弹出元素的展示格式
    val_fmt: Option<BytesFormat>,
});

api_model!(RedisFieldGet {
    key: RedisKey,
    field_index: isize,
    field_key: String,
    /// ZSet 成员定位；Hash 用 field_key、List 用 field_index
    field_value: String,
    /// 为 true 时对 Hash 执行 HTTL；默认 false
    include_field_ttl: Option<bool>,
    val_fmt: Option<BytesFormat>,
});

// 表格单行 → redis-cli 命令（与 RedisFieldDel 相同的行定位字段）
api_model!(RedisFieldAsCommand {
    key: RedisKey,
    field_index: isize,
    field_key: String,
    field_value: String,
    stream_id: String,
    val_fmt: Option<BytesFormat>,
});

// 字段值
api_model!(RedisFieldValue {
    field_key: String,
    field_value: String,
    field_score: f64,
    field_ttl: i64, // 字段 TTL（秒），仅 Redis/Valkey >= 7.4
    /// VectorSet：VGETATTR 返回的属性 JSON；无属性或其他类型为空串
    #[serde(default)]
    field_attrs: String
});

// ZSet 排名查询
api_model!(RedisZsetRank {
    key: RedisKey,
    member: String,
    val_fmt: Option<BytesFormat>,
});

api_model!(RedisZsetRankResult {
    rank: Option<u64>,
    rev_rank: Option<u64>,
});

// OBJECT 自省：ENCODING / IDLETIME / REFCOUNT / FREQ（*_error 为策略限制等原因）
api_model!(RedisObjectInfo {
    encoding: Option<String>,
    idle_time: Option<u64>,
    /// IDLETIME 因 maxmemory-policy 等不可用时的错误信息
    idle_time_error: Option<String>,
    refcount: Option<u64>,
    freq: Option<u64>,
    /// FREQ 因 maxmemory-policy 等不可用时的错误信息
    freq_error: Option<String>,
});

// ZSet Top/Bottom 范围查询
api_model!(RedisZsetRange {
    key: RedisKey,
    /// true: ZREVRANGE (分数从高到低); false: ZRANGE (分数从低到高)
    reverse: bool,
    /// 返回数量限制
    count: u64,
    /// 值解码格式
    val_fmt: Option<BytesFormat>,
});

api_model!(RedisZsetRangeItem {
    value: String,
    score: f64,
});

// 字段删除
api_model!(RedisFieldDel {
    key: RedisKey,
    field_index: isize,
    field_key: String,
    field_value: String,
    stream_id: String, // stream
    val_fmt: Option<BytesFormat>, // 非 utf8 时 field_key/field_value 为 base64  wire 字符串
});

// 设置参数
api_model!(RedisSetParam {
    key: RedisKey,
    value: String,
    ttl: i64,
    key_type: Option<String>,
    input_format: Option<BytesFormat>,
});

// 执行命令
api_model!(RedisCommand {
    command: String,
    node: Option<String>,
    auto_broadcast: Option<bool>,
    /// 终端输出格式；`None` 等同 `standard`（TTY）
    output_mode: Option<CliOutputMode>,
});

// 命令执行日志条目
api_model!(CommandLogEntry {
    id: u64,
    timestamp: String,
    db_index: u16,
    command: String,
    args: Vec<String>,
    full_command: String,
    duration_ms: u64,
    error: Option<String>,
});

// 慢日志
api_model!(RedisSlowLog {
    node: String,
    id: u64,
    time: String,
    client: String,
    command: String,
    cost: f64,
    client_name: String
});

// 内存分析：一轮 SCAN + MEMORY USAGE，循环/暂停由前端控制（与键列表 SCAN 同构）
api_model!(RedisMemoryParam {
    #[serde(rename = "match")]
    pattern: Option<String>, // 匹配模式

    size_limit: u64,  // 只收 >= 此字节的键
    scan_count: u64,  // SCAN COUNT
    cursor: Option<ScanCursor>,
    need_key_type: Option<bool>,
});

api_model!(RedisMemoryResult {
    key_list: Vec<RedisKeySize>,
    cursor: ScanCursor,
    /// 本轮 SCAN 拿到的键数（过滤 size_limit 之前，供进度估算）
    scanned: u64,
});

// 内存分析结果
api_model!(RedisKeySize {
    key: String,    // 显示

    #[serde(with = "v8_base64")]
    #[specta(type = String)]
    bytes: Vec<u8>, // 修改、删除等依据（JSON 为 Base64 字符串）

    #[serde(rename = "type")]
    key_type: String ,  // 类型
    size: u64,        // 大小
});

impl From<(Vec<u8>, u64, String)> for RedisKeySize {
    fn from((key, size, key_type): (Vec<u8>, u64, String)) -> Self {
        // 与 RedisKey::from 一致：UTF-8 省略 bytes
        let rk = RedisKey::from(key);
        RedisKeySize {
            key: rk.key,
            bytes: rk.bytes,
            size,
            key_type,
        }
    }
}

// 客户端（缺省字段：`parse_client_info` 未写入 JSON 时由结构体 `#[serde(default)]` 填 0 / ""）
api_model!(
    #[serde(default)]
    #[derive(Default)]
    RedisClientInfo {
        id: u64,        // 唯一的 64 位客户端 ID
        addr: String,   // 客户端的地址/端口
        laddr: String,  // 客户端连接到的本地地址/端口（绑定地址）
        fd: u64,        // 对应于套接字的文件描述符
        name: String,   // 客户端使用 CLIENT SETNAME 设置的名称
        age: u64,       // 连接的总持续时间（秒）
        idle: u64,      // 连接的空闲时间（秒）
        flags: String,  // 客户端标志（见下文）
        db: u64,        // 当前数据库 ID
        sub: u64,       // 频道订阅数
        psub: u64,      // 模式匹配订阅数
        ssub: u64,      // 分片频道订阅数。在 Redis 7.0.3 中添加
        multi: i64,     // MULTI/EXEC 上下文中的命令数（无事务时常为 -1）
        watch: u64,     // 此客户端当前正在监视的键数。在 Redis 7.4 中添加
        qbuf: u64,      // 查询缓冲区长度（0 表示没有待处理的查询）
        qbuf_free: u64, // 查询缓冲区的可用空间（0 表示缓冲区已满）
        argv_mem: u64,  // 下一个命令的不完整参数（已从查询缓冲区中提取）
        multi_mem: u64, // 缓冲的多命令使用的内存。在 Redis 7.0 中添加
        obl: u64,       // 输出缓冲区长度
        oll: u64,       // 输出列表长度（当缓冲区满时，回复在此列表中排队）
        omem: u64,      // 输出缓冲区内存使用情况
        tot_mem: u64,   // 此客户端在其各种缓冲区中消耗的总内存
        events: String, // 文件描述符事件（见下文）
        cmd: String,    // 执行的最后一条命令
        user: String,   // 客户端的已认证用户名
        redir: u64,     // 当前客户端跟踪重定向的客户端 id
        resp: u8,       // 客户端 RESP 协议版本。在 Redis 7.0 中添加
        rbp: u64,       // 客户端连接以来其读取缓冲区的峰值大小。在 Redis 7.0 中添加
        rbs: u64,       // 客户端读取缓冲区当前大小（字节）。在 Redis 7.0 中添加
        io_thread: u64, // 分配给客户端的 I/O 线程 ID。在 Redis 8.0 中添加
    }
);

api_model!(SubscribeEvent {
    id: String,
    datetime: String,
    channel: String,
    message: String,
});

api_model!(MonitorEvent {
    id: String,
    datetime: String,
    command: String,
});

api_model!(CommandLogEvent {
    id: String,
    entry: CommandLogEntry,
});

api_model!(ExportImportEvent {
    id: String,
    ok_count: u64,
    err_count: u64,
    total_count: u64,
    ignore_count: u64,
    finished: bool
});

// ACL 用户详情（由 ACL GETUSER 结构化转换而来）
api_model!(
    #[derive(Default)]
    AclUserDetail {
        username: String,
        enabled: bool,
        nopass: bool,
        flags: Vec<String>,
        password_hashes: Vec<String>,
        command_rules: Vec<String>,
        key_patterns: Vec<String>,
        channel_patterns: Vec<String>,
        selectors: Vec<String>
    }
);

// ACL SETUSER 参数（新建/更新用户）
api_model!(AclSetuserParam {
    username: String,
    enabled: bool,
    password_hashes: Vec<String>,
    command_rules: Vec<String>,
    key_patterns: Vec<String>,
    channel_patterns: Vec<String>,
    /// Redis 7.2+ selector，每条为 SETUSER 括号内规则串（如 `-@all +set ~key2`）
    selectors: Vec<String>,
});

// ACL LOG 条目结构（字段顺序与 Redis ACL LOG 文档一致）
api_model!(
    #[derive(Default)]
    AclLogEntry {
        count: u64,
        reason: String,
        context: String,
        object: String,
        username: String,
        age_seconds: f64,
        client_info: String,
        entry_id: u64,
        timestamp_created: u64,
        timestamp_last_updated: u64,
    }
);

/// u64 ↔ 十进制字符串（SCAN 游标会超过 JS 安全整数）
mod u64_as_string {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(v: &u64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&v.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
        String::deserialize(d)?
            .parse()
            .map_err(serde::de::Error::custom)
    }
}

//~~~~~ 自定义Vec<u8>序列化为Base64字符串
mod v8_base64 {
    use base64::Engine;
    use base64::prelude::BASE64_STANDARD;
    use serde::de::Error;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let base64_string = BASE64_STANDARD.encode(bytes);
        serializer.serialize_str(&base64_string)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let base64_string = String::deserialize(deserializer)?;
        let bytes = BASE64_STANDARD
            .decode(base64_string.as_bytes())
            .map_err(|e| Error::custom(format!("Base64 decode error: {}", e)))?;
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_minimal_mode_reads_ui_mode() {
        let mut conf = ConnConfig::default();
        assert!(!conf.is_minimal_mode());
        conf.meta
            .insert("uiMode".into(), ConnMetaValue::String("minimal".into()));
        assert!(conf.is_minimal_mode());
        conf.meta
            .insert("uiMode".into(), ConnMetaValue::String("normal".into()));
        assert!(!conf.is_minimal_mode());
    }
}
