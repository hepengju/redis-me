# 26. 自定义传输层（ConnectionDialer）— 总设计

> **状态：设计已封板（2026-09-08）。** 目标、分期、fork API 不再改。实施中只修实现 bug，或按 27 §二.1 漏项补 fork 后 bump。不要再为「还可以更优雅」改方案。  
> **实施顺序**：**27 fork → 28 SSH 全模式 → 29 代理**
>
> - [`27_connection-dialer-fork.md`](./27_connection-dialer-fork.md) — redis-rs fork 基建（SSH 与代理共用）
> - [`28_ssh-dialer.md`](./28_ssh-dialer.md) — `SshDialer`：SSH 支持单机 / 集群 / 哨兵
> - [`29_proxy-http-socks5.md`](./29_proxy-http-socks5.md) — 网络代理（手动四类型 + 系统代理）
>   **关联**：`22_tls-x509-v1-compat.md`（同一 redis-rs fork）、`src-tauri/src/utils/ssh_tunnel.rs`、`src-tauri/src/utils/conn.rs`、`src/views/conn/ConnSave.vue`  
>   **backlog**：`docs/zh/changelog/future.md`（网络代理；SSH 隧道支持集群和哨兵）

---

## 一、目标（钉死）

就是这两件，不另缩范围：

| 项   | 结论                                                                       |
| ---- | -------------------------------------------------------------------------- |
| SSH  | 单机 / 集群 / 哨兵都能走隧道                                               |
| 代理 | 手动：HTTP / HTTPS / SOCKS5 / SOCKS5H；另支持「使用系统代理」              |
| 覆盖 | 两种能力都覆盖单机 / 集群 / 哨兵，可与 Redis `rediss://` 叠加              |
| 原则 | **达成目标、尽量简单可靠**：能复用现有路径就不新造；能配置解决就不写状态机 |
| UI   | 对齐现有 `ConnSave`：模式勾选 + 展开区块；**不**搬 TinyRDM 左侧 Tab        |

HTTPS **代理** = 先对代理服务器做 TLS，再 CONNECT（企业 SSL 解密代理）。这和 Redis 的 `rediss://` 不是一回事，两者都要做。

SSH 与代理互斥：同一连接不能同时勾选（跳板 vs 代理二选一）。

### 1.1 简单可靠（实施时遵守）

- **无 Dialer = 零行为变化**。不要实现 DirectDialer。
- **fork 只开建连口**：`impl RedisStream for TcpStream` 写在 redis crate 内；Custom TLS 单开结构，不改原 `TcpRustlsConnection`。
- **SSH**：keepalive 用 russh `Config`。`dial` 发现会话已断时，持锁重连 **一次** 再开 channel；仍失败则返回错误（上层已有重连）。不要心跳线程、不要 MaxSessions 专用枚举。
- **MeSingle 不必另存 Dialer**：`Client` 已持有。`MeCluster` subscribe/monitor 从 `ClusterClient` 取同一 `Arc`（fork 提供 getter），避免双份所有权。
- **系统代理**：只认环境变量 + 系统**静态**代理（Windows `ProxyEnable/ProxyServer`，macOS 能读到的非 PAC 设置）。**不解析 PAC**（半吊子比没有更不可靠）；PAC-only 环境显示未检测到并直连。
- **SOCKS**：自写握手（协议短），不为此加依赖，除非能明显少错。
- **系统代理 UI**：勾选时检测一次即可，不必「刷新」按钮。

### 1.2 有意不做

只列**不是上述两项目标**的东西（实现细节见各实施计划，不在这里当砍功能）：

- 单独的「代理服务器管理」页、代理配置导入/导出（连接里的代理字段仍随连接导入）
- 代理性能监控/统计
- 向上游 redis-rs 提 PR（fork 先行）
- 异步 Dialer（等 RedisME 切 redis-rs async）
- SOCKS5 UDP ASSOCIATE（Redis 是 TCP）
- 代理自动发现（K8s / WPAD 增强等）
- SSH 经代理再跳转（与互斥一致）

### 1.3 为何不选「本地端口 + `node_address_map`」

redis-rs 1.7 已有 `ClusterClientBuilder::node_address_map`（原为 TLS 证书域名 remap）。用「每节点本地转发 + NAT 映射」**不 fork 也能做 SSH 集群**，但每种代理都要再写一遍 listener，和现有 `ssh_tunnel.rs` 同一套扩展性瓶颈。Dialer 在建连入口注入，集群子连接自动走隧道，一次抽象覆盖 SSH / HTTP / SOCKS。

---

## 二、现状（阻塞点）

现有 SSH 是**本地 TCP 代理**：RedisME → `127.0.0.1:随机端口` → russh `direct_tcpip` → 种子节点。每个入站 TCP 新建一条 SSH 会话；独立 Tokio Runtime。

| 问题           | 原因                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| SSH 仅单机     | `get_client_cluster` / 哨兵路径直接 `ClusterNotSupported` / `SentinelNotSupported` |
| 集群节点不可达 | `CLUSTER SLOTS` 后 redis-rs 对每个节点再 `ActualConnection::new`，直连内网 IP      |
| 代理无法复用   | 隧道逻辑写死在 `ssh_tunnel.rs`                                                     |
| 会话不复用     | `handle_connection` 每次 `connect_and_auth`                                        |

独立 Runtime **不是浪费**：同步 redis-rs 跑在 Tauri 的 tokio worker 上，在已有 runtime 里 `block_on` 会 panic/死锁。SSH 侧必须继续用专用 runtime。

集群 subscribe / monitor 走 `get_client_single(&self.conf)`（`impl_cluster.rs`），不走 `ClusterClient`。SSH Dialer 从 `ClusterClient::dialer()` 取出再传入这条旁路（28），不要在 MeCluster 上另存一份。

---

## 三、核心契约

### 3.1 两个 trait（fork 内）

超时是**每条连接**的（`verify_single_connection` 会 `set_read_timeout`；订阅会设 `None`）。不能挂在共享的 Dialer 上。

```rust
pub trait RedisStream: Read + Write + Send {
    /// 与 TcpStream 一致：&self。
    fn set_read_timeout(&self, dur: Option<Duration>) -> io::Result<()>;
    fn set_write_timeout(&self, dur: Option<Duration>) -> io::Result<()>;
}

pub trait ConnectionDialer: Send + Sync + 'static {
    /// host 是 ConnectionAddr 里的原始字符串，禁止先 ToSocketAddrs。
    fn dial(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> RedisResult<Box<dyn RedisStream>>;
}
```

| 决策            | 选择                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| 返回流          | `Box<dyn RedisStream>`，不是裸 `Read + Write`                                                  |
| 同步            | 与现有 `Connection` 一致                                                                       |
| `Send + Sync`   | 集群多线程共享 `Arc<dyn ConnectionDialer>`                                                     |
| host 不预解析   | SOCKS5H / 跳板侧 DNS 才成立；有 Dialer 时**不要**走现有 `to_socket_addrs` 再 `connect_timeout` |
| 无 Dialer       | 原 `connect_tcp` / `connect_tcp_timeout` / `tcp_settings` / IPv6 多地址，行为不变              |
| Unix / wildcard | Unix 忽略 Dialer；wildcard（`0.0.0.0` / `::`）仍拒绝                                           |
| TLS             | Dialer 返回明文流；redis-rs 按 `rediss` 在流上包 rustls                                        |

`impl RedisStream for TcpStream` 写在 redis crate 内。SSH channel 必须实现超时（禁止 no-op），否则 PING/命令会挂死。

### 3.2 注入点（漏改则集群等于没接上）

```text
ConnectionInfo.set_dialer(Arc<dyn ConnectionDialer>)
        │
        ├── Client::get_connection* → connect() → ActualConnection::new
        │
        ├── ClusterParams.dialer
        │       └── get_connection_info(node, params)  ← 每个节点/重连都要拷 Dialer
        │
        └── SentinelClientBuilder
                ├── 连 sentinel 节点
                └── 连发现的 master
```

上游 `ActualConnection::new(addr, timeout, tcp_settings)` **没有** `ConnectionInfo`。要么改签名带上 `Option<&dyn ConnectionDialer>`，要么在 `connect()` 里先分叉。`TcpRustlsConnection` 写死 `StreamOwned<_, TcpStream>`，**不能**复用；Custom TLS 用 `StreamOwned<_, Box<dyn RedisStream>>`。

`ConnectionInfo` 字段已是 `pub(crate)`：对外只用 setter（`set_dialer` / `ClusterClientBuilder::dialer` / `Client::set_dialer`）。`Debug` 跳过 Dialer。

Fork 叠在 `hepengju/redis-rs` 的 **`redis-me`** 分支上（已含 X.509 v1），不要另开 Cargo `patch` 分支。

### 3.3 TLS 叠加

```text
dialer.dial(host, port, timeout)
    → 若 addr 为 TcpTls：rustls wrap → ActualConnection::CustomTls
    → 否则：ActualConnection::Custom
无 dialer → 原 Tcp / TcpTls / Unix
```

| 场景                     | Dialer 流                 | 再包 TLS       |
| ------------------------ | ------------------------- | -------------- |
| SSH + `redis://`         | SSH channel               | 否             |
| SSH + `rediss://`        | SSH channel               | 是             |
| HTTP/SOCKS + `redis://`  | 代理隧道 TCP              | 否             |
| HTTP/SOCKS + `rediss://` | 代理隧道 TCP              | 是             |
| HTTPS 代理 + `redis://`  | TLS-to-proxy 后再 CONNECT | 否             |
| HTTPS 代理 + `rediss://` | TLS-to-proxy 后再 CONNECT | 是（对 Redis） |
| 直连                     | —                         | 原逻辑         |

SNI 仍用目标 `host`（Redis TLS）。HTTPS 代理自己的 TLS 在 Dialer 内完成，与 redis-rs 叠加的 Redis TLS 分层。现有连接一律 `#insecure`，证书/主机名校验已放宽。

---

## 四、RedisME 侧约定

### 4.1 数据模型

与 `ssh` + `SshOption` 同构：总开关 + 选项对象。`proxy_mode` 区分系统 / 手动（`proxy = false` 时忽略）。

```rust
ConnConfig {
    ssh: bool,
    ssh_option: SshOption,
    #[serde(default)]
    proxy: bool,
    #[serde(default)]
    proxy_option: ProxyOption,
}

ProxyOption {
    proxy_mode: String, // "system" | "manual"（proxy=false 时无意义）
    proxy_type: String, // "http" | "https" | "socks5" | "socks5h"（manual 必填）
    host: String,       // manual 必填
    port: u16,
    username: String,
    password: String,
}
```

`api_model!` 无结构级 `#[serde(default)]`，新字段必须字段级 `#[serde(default)]`。前端 `conn-compat.ts` 补默认 `proxyOption`，与 `sshOption` 相同。

### 4.2 优先级与互斥

1. `ssh` → `SshDialer`（**28 之前**仍走 `ssh_tunnel.rs`）
2. 否则 `proxy`：`system` 则检测系统代理后建 Dialer（检不到则直连并提示）；`manual` 则按 `proxy_type` 建 `HttpDialer`（http/https）或 `Socks5Dialer`（**29 才接线**）
3. 否则直连（`dialer = None`）

`ssh && proxy`：前端勾选互斥 + 后端 `bail!`。

### 4.3 UI

`ConnSave.vue` 模式勾选区增加「代理」，展开区块：系统代理 / 手动配置。手动时显示类型（HTTP / HTTPS / SOCKS5 / SOCKS5H）+ 主机 + 端口 + 用户名 + 密码。系统代理时隐藏手动项，显示检测到的静态/环境变量代理，或「未检测到，将直连」。勾选时检测一次。校验：手动模式下主机、端口必填。

### 4.4 Dialer 所有权

| 类型                  | 状态   | 所有权                                                                                        |
| --------------------- | ------ | --------------------------------------------------------------------------------------------- |
| SSH                   | 有会话 | `Client` / `ClusterClient` 持有 `Arc`；集群旁路用 getter 取出再传入 `get_client_single`（28） |
| HTTP/SOCKS/HTTPS 代理 | 无会话 | 按 `ConnConfig` 新建（29）；不必存 Me 客户端上                                                |

HTTP/SOCKS 的 `TcpStream::connect_timeout` 只接受 `&SocketAddr`：先解析**代理地址**，再超时连接；**目标** host 按类型处理（SOCKS5 本地解析 / SOCKS5H 把域名发给代理 / HTTP CONNECT 把 host 字符串写入请求）。IPv6 CONNECT 用 `[host]:port`。

### 4.5 错误与导入

新增 `AppError`（代理类型不支持、CONNECT 非 200、SOCKS 握手失败、SSH+代理互斥等），走现有 `code` + i18n。企业代理常只允许 CONNECT 443，连 6379 失败时文案要能看懂。

TinyRDM 导入（29）：映射系统/手动及 HTTP/HTTPS/SOCKS5/SOCKS5H；`ssh && proxy` 时保留 SSH、丢弃代理。

---

## 五、SSH 会话模型（28 实施，此处只钉原则）

- **专用 Tokio Runtime** 继续保留，不接到 Tauri 主 runtime。
- 一条 SSH 会话、每条 Redis 连接一个 `direct_tcpip` channel。
- russh `Handle` 可 Clone 则 `Arc<Handle>`，禁止持锁 `block_on`。
- keepalive 用 russh `Config`；`dial` 若发现会话已断，最多重连一次。
- `MaxSessions` 打满：把 russh 错误原文给用户，连接文档提一句即可。
- **28 之前**：`ssh_tunnel.rs` 行为不变。

---

## 六、实施切分

**设计一次写清**（本文 + 契约）：SSH 与代理共用 Dialer、TLS 叠加、集群/哨兵透传、互斥。  
**实现按用户价值分期**：先把 SSH 做全，再加代理。27 是两者的公共地基，不是产品功能。

| 计划 | 用户可见 | 依赖   | 交付                                                                         |
| ---- | -------- | ------ | ---------------------------------------------------------------------------- |
| 27   | 否       | 无     | fork：trait、Custom/CustomTls、Client/集群/哨兵透传；RedisME 只 bump git rev |
| 28   | 是       | 27     | `SshDialer` 替换本地隧道；SSH + 单机/集群/哨兵                               |
| 29   | 是       | 27、28 | 手动 HTTP/HTTPS/SOCKS5/SOCKS5H + 系统代理；与 SSH 勾选互斥                   |

每阶段：实现 → 静态检查 → 手测验收 → 单独 commit。27 在 `hepengju/redis-rs` 提交后再改 RedisME 的 patch rev。

28 只做 `get_client_*` 注入；29 只加 `proxy` 分支。不要再改集群透传。

**两仓库约定**：27 一次开齐公开 API（见 27 §二.1）并冻结；28/29 只 bump rev、禁止为接线回头改 fork。漏项只允许补 27 再 bump，不要在 RedisME 功能分支上改 redis-rs。

---

## 七、总验收（三阶段全部完成后）

| #   | 场景                                                  | 期望                             |
| --- | ----------------------------------------------------- | -------------------------------- |
| 1   | 直连                                                  | 与改造前一致                     |
| 2   | **28 完成后**：SSH + 单机 / 集群 / 哨兵               | 一会话多 channel；旁路不新开会话 |
| 3   | **29 完成后**：HTTP / HTTPS 代理 + 单机/集群/`rediss` | 读写正常；命令超时仍生效         |
| 4   | SOCKS5 / SOCKS5H + 单机 / 集群                        | 读写正常                         |
| 5   | 系统代理（已配置静态/环境变量时）                     | 走代理；未检测到则直连并提示     |
| 6   | SSH + 代理同时开                                      | 前端互斥 + 后端报错              |
| 7   | 旧配置无 `proxy` 字段                                 | 能打开、视为未开代理             |
| 8   | 命令日志                                              | Dialer 不影响上层                |

---

## 八、风险

| 风险                        | 缓解                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| fork 与上游漂移             | 改动集中在建连入口、`get_connection_info`、match 分支；定期 rebase |
| Custom 流超时无效           | 契约强制 `RedisStream`；28/29 验收含命令超时                       |
| SSH `block_on` 嵌套 runtime | 专用 runtime，禁止接到 Tauri 主 runtime                            |
| `MaxSessions`               | 透传 russh 错误；文档提示跳板加大 `MaxSessions`                    |
| HTTP CONNECT 被拒（非 443） | 错误里带状态码                                                     |
| 系统代理 PAC                | **不解析**；只认环境变量 + 静态代理；否则直连并提示                |

---

## 附录 A：竞品（摘要）

| 客户端            | SSH                 | 网络代理                        | 集群 SSH |
| ----------------- | ------------------- | ------------------------------- | -------- |
| RedisInsight      | 无（建议 `ssh -L`） | 无                              | —        |
| TinyRDM           | 本地 TCP 代理       | HTTP/HTTPS/SOCKS5/5H            | 否       |
| AnotherRDM        | 本地 TCP 代理       | 无                              | 否       |
| RedisME（完成后） | Dialer（fork）      | HTTP/HTTPS/SOCKS5/5H + 系统代理 | 是       |

## 附录 B：trait 备选（已否决）

| 备选                            | 结论                                               |
| ------------------------------- | -------------------------------------------------- |
| `dial() -> TcpStream`           | 无法表达 SSH channel                               |
| 超时方法放在 `ConnectionDialer` | Dialer 共享、超时按连接；RedisME 会挂死            |
| 泛型 `Dialer<S>`                | 类型传到 `ActualConnection` 过重                   |
| 默认 `DirectDialer`             | 必抄漏 DNS/IPv6/`tcp_settings`；无 Dialer 走原路径 |
| 复用 `TcpRustlsConnection`      | 内层写死 `TcpStream`                               |
