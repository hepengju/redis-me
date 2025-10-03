#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::api_model;
use serde::{Deserialize, Serialize};

api_model!( RedisInfo {
    node: String,
    info: String,
});

// 集群节点
api_model!( RedisNode {
    id: String,
    node: String,
    is_master: bool,
    slave_of_node: Option<String>
});

// 扫描参数
api_model!( ScanParam {
    pattern: String,
    count: u64,
    scan_type: Option<String>,

    cursor: ScanCursor,
    load_all: bool,
});

// 扫描游标
api_model!( ScanCursor {
    ready_nodes: Vec<String>,
    now_node: String,
    now_cursor: u64,
    finished: bool,
});

// 扫描结果
api_model!( ScanResult {
    key_list: Vec<RedisKey>,
    cursor: ScanCursor,
});

// Redis键: 由于键是字节存储的，考虑转换为utf-8字符串显示后可能会丢失信息，因此封装为对象
api_model!( RedisKey {
    key: String,    // 显示
    bytes: Vec<u8>, // 修改、删除等依据
});

// Redis值
api_model!( RedisValue {
    #[serde(rename = "type")]
    key_type: String,
    ttl: i64,
    value: serde_json::Value,
});

// Zset条目
api_model!( RedisZetItem {
    value: String,
    score: f64,
});

// 字段新增
api_model!( RedisFieldAdd {
    key: String,     // 新增键时输入key
    bytes: Vec<u8>,  // 键已经存在时，新增字段时输入旧键的bytes
    mode: String,    // key-新增键, field-新增字段

    #[serde(rename = "type")]
    key_type: String,
    ttl: i64,
    value: String, // 字段类型为String时的值

    list_push_method: String, // lpush, rpush
    field_value_list: Vec<RedisFieldValue>,
});

// 字段修改
api_model!( RedisFieldSet {
    bytes: Vec<u8>,
    src_field_key: String,
    src_field_value: String,
    field_index: isize,
    field_key: String,
    field_value: String,
    field_score: f64,
});

// 字段值
api_model!( RedisFieldValue {
    field_key: String,
    field_value: String,
    field_score: f64,
});

// 字段删除
api_model!( RedisFieldDel {
    bytes: Vec<u8>,
    field_index: isize,
    field_key: String,
    field_value: String,
});

// 执行命令
api_model!( RedisCommand {
    command: String,
    node: Option<String>,
    auto_broadcast: bool,
});

// 慢日志
api_model!( RedisSlowLog {
    node: String,
    id: u64,
    time: String,
    client: String,
    command: String,
    cost: f64,
    client_name: String
});

// 内存分析参数
api_model!( RedisMemoryParam {
    pattern: Option<String>, // 匹配模式

    size_limit: u64,   // 大小限制, 推荐: 100kb 即102400
    count_limit: u64,  // 数量限制, 推荐: 1000
    scan_count: u64,   // 每次扫描, 推荐: 1000
    scan_total: u64,   // 扫描数量限制, 推荐: 10000
    sleep_millis: u64, // 扫描间隔, 推荐: 1000
});

// 内存分析结果
api_model!( RedisKeySize {
    key: String,    // 显示
    bytes: Vec<u8>, // 修改、删除等依据

    #[serde(rename = "type")]
    key_type: String ,  // 类型
    size: u64,        // 大小
});

// 客户端
api_model!( RedisClientInfo {
    id: Option<String>,             // 唯一的 64 位客户端 ID
    addr: Option<String>,           // 客户端的地址/端口
    laddr: Option<String>,          // 客户端连接到的本地地址/端口（绑定地址）
    fd: Option<String>,             // 对应于套接字的文件描述符
    name: Option<String>,           // 客户端使用 CLIENT SETNAME 设置的名称
    age: Option<String>,            // 连接的总持续时间（秒）
    idle: Option<String>,           // 连接的空闲时间（秒）
    flags: Option<String>,          // 客户端标志（见下文）
    db: Option<String>,             // 当前数据库 ID
    sub: Option<String>,            // 频道订阅数
    psub: Option<String>,           // 模式匹配订阅数
    ssub: Option<String>,           // 分片频道订阅数。在 Redis 7.0.3 中添加
    multi: Option<String>,          // MULTI/EXEC 上下文中的命令数
    watch: Option<String>,          // 此客户端当前正在监视的键数。在 Redis 7.4 中添加
    qbuf: Option<String>,           // 查询缓冲区长度（0 表示没有待处理的查询）
    qbufFree: Option<String>,       // 查询缓冲区的可用空间（0 表示缓冲区已满）
    argvMem: Option<String>,        // 下一个命令的不完整参数（已从查询缓冲区中提取）
    multiMem: Option<String>,       // 缓冲的多命令使用的内存。在 Redis 7.0 中添加
    obl: Option<String>,            // 输出缓冲区长度
    oll: Option<String>,            // 输出列表长度（当缓冲区满时，回复在此列表中排队）
    omem: Option<String>,           // 输出缓冲区内存使用情况
    totMem: Option<String>,         // 此客户端在其各种缓冲区中消耗的总内存
    events: Option<String>,         // 文件描述符事件（见下文）
    cmd: Option<String>,            // 执行的最后一条命令
    user: Option<String>,           // 客户端的已认证用户名
    redir: Option<String>,          // 当前客户端跟踪重定向的客户端 id
    resp: Option<String>,           // 客户端 RESP 协议版本。在 Redis 7.0 中添加
    rbp: Option<String>,            // 客户端连接以来其读取缓冲区的峰值大小。在 Redis 7.0 中添加
    rbs: Option<String>,            // 客户端读取缓冲区当前大小（字节）。在 Redis 7.0 中添加
    ioThread: Option<String>,       // 分配给客户端的 I/O 线程 ID。在 Redis 8.0 中添加
});