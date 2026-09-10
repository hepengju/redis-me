# 27. redis-rs fork：ConnectionDialer 基建 + 集群/哨兵透传

> **类型**：实施计划（已实施）  
> **总设计**：[`26_custom-connection-dialer.md`](./26_custom-connection-dialer.md)  
> **下一阶段**：[`28_ssh-dialer.md`](./28_ssh-dialer.md)（SSH 全模式；代理见 29）  
> **仓库**：`hepengju/redis-rs` 分支 `redis-me`（RedisME 专用 fork，已含 X.509 v1；**不要**新开 Cargo patch 分支）  
> **RedisME**：本阶段只 bump `src-tauri/Cargo.toml` 的 git rev，行为应与现在完全一致

---

## 一、本阶段目标

在 redis-rs **同步**路径注入 `ConnectionDialer`：有 Dialer 时用其建连并可选叠加 TLS；无 Dialer 时行为与上游一致。`Client` / `ClusterClient` / `SentinelClient` 子连接透传同一个 `Arc<dyn ConnectionDialer>`。

**不做**：任何 Dialer 实现（含 DirectDialer）、RedisME 代理/SSH UI、async 路径。

---

## 二、契约（按 26 §三 实现，勿改语义）

```rust
pub trait RedisStream: Read + Write + Send {
    /// 与 TcpStream / ActualConnection 一致，用 &self（不要 &mut self，否则要改现有 set_*_timeout 签名）。
    fn set_read_timeout(&self, dur: Option<Duration>) -> io::Result<()>;
    fn set_write_timeout(&self, dur: Option<Duration>) -> io::Result<()>;
}

pub trait ConnectionDialer: Send + Sync + 'static {
    /// timeout 与 connect() 一致：get_connection() 会传 None。
    fn dial(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> RedisResult<Box<dyn RedisStream>>;
}
```

- `host` = `ConnectionAddr` 原始字符串，**禁止**先 `ToSocketAddrs`。
- Unix：忽略 Dialer；wildcard 仍拒绝。
- **aio 不接 Dialer**（RedisME 只用同步路径）。28/29 禁止为 aio 回头改 fork。

`impl RedisStream for TcpStream` 写在 redis crate 内。超时方法是 `&self`，与 `TcpStream::set_read_timeout` 一致，不必 newtype。

---

## 二.1 公开 API 冻结（28/29 只用这些，本阶段一次开齐）

少任何一个，RedisME 接线就会再 bump fork。**本阶段做完后 fork 不再为 Dialer 加方法。**

| API                                                                          | 形态                                                                                      | 28/29 用法                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- |
| `ConnectionInfo::set_dialer(self, Arc<dyn ConnectionDialer>) -> Self`        | 消费 setter                                                                               | 测试 / 少用                            |
| `ConnectionInfo::dialer(&self) -> Option<Arc<dyn ConnectionDialer>>`         | getter                                                                                    | 单测透传                               |
| `Client::set_dialer(self, Arc<dyn ConnectionDialer>) -> Self`                | **open / build_with_tls 之后链式**                                                        | 单机 SSH/代理                          |
| `Client::dialer(&self) -> Option<Arc<dyn ConnectionDialer>>`                 | getter                                                                                    | 少用（单机 subscribe 已是同一 Client） |
| `ClusterClientBuilder::dialer(self, Arc<dyn ConnectionDialer>) -> Self`      | builder                                                                                   | 集群                                   |
| `ClusterClient::dialer(&self) -> Option<Arc<dyn ConnectionDialer>>`          | getter                                                                                    | 集群 subscribe/monitor 旁路            |
| `SentinelClientBuilder::set_dialer(self, Arc<dyn ConnectionDialer>) -> Self` | **同时**写入 sentinel 节点 `ConnectionInfo` **和** `SentinelNodeConnectionInfo`（master） | 哨兵；只写一边等于没接上               |
| `pub use` `ConnectionDialer`、`RedisStream`                                  | `lib.rs`                                                                                  | RedisME `use redis::{...}`             |

错误：Dialer 用 `RedisError::from(io::Error::new(...))` 即可，**不要**再加 RedisError 变体。

`get_connection()` 传 `timeout: None`；`get_connection_with_timeout` / 集群 `connect` 传 `Some`。SshDialer 在 `None` 时用自己 `connect()` 时记下的超时开 channel。

---

## 二.2 漏改就会逼 RedisME 回头的内部点

对照当前 fork 源码，这些必须在 **27 一次改完**：

| 位置                                                                                         | 现状                                                          | 27 必须                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`（`connection.rs` ~1310）                                                         | 只把 `addr/timeout/tcp_settings` 交给 `ActualConnection::new` | **从 `connection_info` 取出 dialer 传入**，否则 Client 上 set 了等于没 set                                                      |
| `ActualConnection::new`                                                                      | 无 dialer 参数                                                | 有 Dialer 且 Tcp/TcpTls 则 `dial(host,port,timeout)`，再按是否 TLS wrap                                                         |
| `get_connection_info`（`cluster_handling/mod.rs`）                                           | 字面量无 dialer                                               | 拷贝 `cluster_params.dialer`；集群 `create_initial_connections` 走 `connect(&addr)`→这里，**不**走 seed URL 上的 ConnectionInfo |
| `BuilderParams` + `ClusterParams::from`                                                      | 无该字段                                                      | builder.dialer → params；`ClusterParams` 已是 `Clone`，`Arc` 可 Clone                                                           |
| `SentinelNodeConnectionInfo::create_connection_info`                                         | 字面量三字段                                                  | 带上 dialer，否则 `master_for` → `Client::open` 的 master **直连**                                                              |
| `SentinelClientBuilder::build` 里 sentinel 的 `ConnectionInfo { addr, redis, tcp_settings }` | 同上                                                          | 带上 dialer，否则查 SENTINEL 的连接直连                                                                                         |
| `inner_build_with_tls`                                                                       | 只改 `addr`                                                   | 字段赋值会保留 dialer；RedisME 也可 **先** `build_with_tls` **再** `set_dialer`（推荐，不必改 tls.rs）                          |
| 所有 `ConnectionInfo { ... }` 字面量                                                         | 三字段                                                        | 加 `dialer: None`（编译器会列全，含 URL 解析与单测）                                                                            |
| `ConnectionInfo` / `Client` 的 `#[derive(Debug)]`                                            | Dialer 不是 Debug                                             | **手写** ConnectionInfo 的 Debug（dialer 打 `Some`/`None`），否则 Client Debug 编不过                                           |

`ActualConnection::set_read_timeout` / `set_write_timeout` 现签名是 **`&self`**。Custom 分支调 `RedisStream` 也必须 `&self`。握手结束会 `set_*_timeout(None)`，Custom 必须支持取消超时（订阅依赖）。

---

## 三、改动文件（fork）

以当前 fork 目录为准（上游 1.x 布局可能是 `redis/src/...`）：

| 文件                                                   | 改动                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.rs`                                        | 两 trait；`ConnectionInfo.dialer` + setter；`ActualConnection::Custom` / `CustomTls`；建连分叉；所有 match（`send_bytes` / `read_response` / `set_*_timeout` / `check_connection` / `is_open`） |
| `client.rs`                                            | `Client` 透传 Dialer；`set_dialer` / `dialer()` getter；`get_connection*` 带上                                                                                                                  |
| `cluster_handling/mod.rs`                              | **`get_connection_info` 拷贝 `cluster_params.dialer`**（漏改则集群白做）                                                                                                                        |
| `cluster_handling/client.rs`（或 `cluster_client.rs`） | `ClusterParams.dialer`；`ClusterClientBuilder::dialer()`；`ClusterClient::dialer()` getter                                                                                                      |
| `sentinel.rs`                                          | `SentinelClientBuilder::set_dialer`；sentinel 节点字面量 + `create_connection_info` 都带 dialer                                                                                                 |
| `lib.rs`                                               | `pub use` `ConnectionDialer`、`RedisStream`                                                                                                                                                     |

`ActualConnection::new` 现签名是 `(addr, timeout, tcp_settings)`。改为额外接收 `Option<&dyn ConnectionDialer>`（由 `connect()` 从 `ConnectionInfo` 传入）。有 Dialer 且 addr 为 Tcp/TcpTls 时：`dial(host, port, timeout)`（`timeout` 保持 `Option`，不要 `unwrap_or` 造默认值）。

**CustomTls**：新建结构，内层 `StreamOwned<rustls::ClientConnection, Box<dyn RedisStream>>`。**禁止**复用 `TcpRustlsConnection`。TLS 配置复用现有 rustls 路径。`set_*_timeout` 经 **`get_ref()`**（`&self`）调到内层 `RedisStream`，不要改成 `get_mut`。

无 Dialer：一行都不改现有 TCP/TLS/Unix 逻辑（含 `to_socket_addrs` 多地址尝试、`tcp_settings`）。

---

## 四、单测（fork 内，本阶段验收主力）

1. **无 Dialer 回归**：现有相关测试仍过。
2. **Mock Dialer**：记录 `(host, port)`；断言传入的是 hostname 字符串；`set_read_timeout` 打到流上。
3. **集群透传**：单测 `get_connection_info` 带同一 `Arc` 即可，不必拉真集群。
4. **哨兵**：`set_dialer` 后，sentinel 节点 ConnectionInfo **和** `create_connection_info`（master）都带同一 `Arc`。
5. **connect 透传**：mock 设在 Client 上后 `get_connection_with_timeout` 会调用 `dial`（证明不是只写在 ConnectionInfo 却没进 `connect()`）。

不必单测 Unix、不必完整 CLUSTER SLOTS 假服务（过重）。

---

## 五、RedisME 侧（本阶段仅对接）

1. fork 推到 `redis-me`。
2. RedisME `cargo update -p redis`（或改 git rev）后 `cargo check`。
3. **不改** `conn.rs` / `ssh_tunnel.rs` / 前端。直连与现有 SSH 单机必须仍可用（手测或现有流程）。

---

## 六、验收

| #   | 项                                                                             | 期望           |
| --- | ------------------------------------------------------------------------------ | -------------- |
| 1   | fork `cargo test`（同步 connection/cluster/sentinel 相关）                     | 通过           |
| 2   | Mock Dialer：host 未预解析、超时打到流上、集群 `get_connection_info` 带 Dialer | 通过           |
| 3   | RedisME bump 后 `cargo check`                                                  | 通过           |
| 4   | RedisME 直连 + 现有 SSH 单机                                                   | 与 bump 前一致 |

---

## 七、提交

- **redis-rs fork**：一行标题，例如 `feat: add ConnectionDialer for custom transports`
- **RedisME**：一行标题，例如 `chore: bump redis-rs fork for ConnectionDialer`（仅 lock/rev 时）

完成后在本文件头部把状态改为已实施，再开工 **28（SSH）**，不要先做代理。
