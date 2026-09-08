# 26. 自定义传输层（ConnectionDialer）— SSH 隧道 / HTTP 代理 / SOCKS5 统一支持

> **类型**：设计文档（待实施）  
> **关联**：`22_tls-x509-v1-compat.md`（同属 redis-rs fork 改造）、`src-tauri/src/utils/ssh_tunnel.rs`（现有 SSH 隧道实现）、`src-tauri/src/utils/conn.rs`（连接构建入口）  
> **日期**：2026-09-08

---

## 一、目标（钉死）

| 项       | 结论                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 用户目标 | RedisME 通过 **统一的传输层抽象** 支持 SSH 隧道、HTTP 代理、SOCKS5 代理等多种连接方式，且覆盖单机 / 集群 / 哨兵全部模式              |
| 非目标   | 应用内代理配置管理（代理配置文件导入/导出）；SOCKS5 UDP ASSOCIATE；代理服务器发现与管理；向上游 redis-rs 提 PR（短期不做，fork 先行） |
| 原则     | **传输层解耦**：Dialer 只管「怎么到达」，redis-rs 上层（命令/路由/TLS）不感知传输细节                                                |

---

## 二、现状分析

### 2.1 现有 SSH 隧道实现

位置：`src-tauri/src/utils/ssh_tunnel.rs`

架构：**本地 TCP 代理** 模式

```text
RedisME ──TCP──> 127.0.0.1:随机端口 ──[russh SSH channel]──> 目标Redis:6379
```

核心流程：
1. `SshTunnel::start()` 创建独立 Tokio Runtime
2. 绑定 `127.0.0.1:0`（随机端口）本地 TCP 监听
3. 每个新 TCP 连接 → **新建一条 SSH 会话** → 打开 `channel_open_direct_tcpip` → `copy_bidirectional` 双向转发
4. Redis 客户端连接 `127.0.0.1:<local_port>`，数据经 SSH 隧道到达远端

### 2.2 现有问题

| 问题                | 原因                                                                                                              | 影响             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------- |
| SSH 仅支持单机      | `get_client_cluster()` 直接 `bail!(ClusterNotSupported)`；`get_client_single()` 中 SSH+哨兵 `bail!(SentinelNotSupported)` | 集群/哨兵不可用  |
| SSH 会话不复用      | `handle_connection()` 每个 TCP 连接都调用 `connect_and_auth()` 新建 SSH 会话                                      | 性能浪费         |
| 独立 Tokio Runtime  | `Runtime::new()` 创建独立运行时，与主应用隔离                                                                      | 资源浪费         |
| 代理方式不可扩展    | SSH 隧道逻辑硬编码在 `ssh_tunnel.rs`，无法复用给 HTTP 代理等                                                       | 每加一种代理重写 |
| 集群节点地址不可达  | redis-rs 集群模式通过 `CLUSTER SLOTS` 发现节点后直连真实 IP:Port，SSH 隧道另一侧的内网地址从客户端不可达            | 架构性阻塞       |

### 2.3 redis-rs 连接层内部分析

深入 `redis/src/connection.rs` 源码，关键结构：

```text
ConnectionAddr (enum, non_exhaustive)
├── Tcp(String, u16)
├── TcpTls { host, port, insecure, tls_params }
└── Unix(PathBuf)
         │
         ▼
ConnectionInfo { addr: ConnectionAddr, redis: RedisConnectionInfo, tcp_settings: TcpSettings }
         │
         ▼
ActualConnection::new(addr, timeout, tcp_settings)  ← 核心建连函数
├── Tcp → connect_tcp() → TcpStream::connect()     ← 硬编码 TCP
├── TcpTls → connect_tcp() + rustls wrap            ← 硬编码 TCP + TLS
└── Unix → UnixStream::connect()                    ← 硬编码 Unix Socket
         │
         ▼
Connection { con: ActualConnection, parser, db, ... }
```

**核心问题**：`ActualConnection::new()` 中 TCP 建连硬编码为 `TcpStream::connect()`，无法注入自定义传输。

### 2.4 集群连接流程分析

```text
ClusterClient::get_connection()
├── 连接入口节点 → ActualConnection::new()
├── CLUSTER SLOTS / CLUSTER NODES → 获取全部节点 IP:Port
├── 对每个节点建立连接 → ActualConnection::new(node_addr)  ← 直连，不可达
└── 命令路由 → 按 slot 分发到对应节点连接
```

**关键洞察**：集群模式下，redis-rs 会对**每个发现的节点**独立调用 `ActualConnection::new()`。如果 dialer 能透传到这些子连接，所有节点自动走隧道 — 这就是方案二能自然支持集群的原因。

---

## 三、方案设计：ConnectionDialer Trait

### 3.1 核心设计

在 redis-rs fork 中引入 `ConnectionDialer` trait，允许在 `ConnectionInfo` 中注入自定义的连接建立逻辑：

```text
┌─────────────────────────────────────────────────────┐
│                     RedisME                          │
│                                                      │
│  ConnConfig { proxy: bool, proxy_option: ProxyOption }   │
│         │                                            │
│         ▼                                            │
│  ┌──────────────────┐                                │
│  │  DialerFactory   │ ── 根据 proxy/proxy_option 创建 Dialer│
│  └──────┬───────────┘                                │
│         │                                            │
│  ┌──────▼───────────────────────────────────────┐    │
│  │     ConnectionDialer (trait)                 │    │
│  │  fn dial(host, port, timeout) -> Stream      │    │
│  └──────┬──────────────┬──────────────┬─────────┘    │
│         │              │              │               │
│  ┌──────▼───┐   ┌──────▼───┐   ┌─────▼────────┐     │
│  │DirectDial│   │SshDialer │   │HttpDialer    │     │
│  │(默认TCP) │   │(SSH隧道) │   │(HTTP CONNECT)│     │
│  └──────────┘   └──────────┘   └──────────────┘     │
│                                        │              │
│                                 ┌──────▼───────┐     │
│                                 │ Socks5Dialer │ ... │
│                                 └──────────────┘     │
└─────────────────────────────────────────────────────┘
```

### 3.2 Trait 定义（redis-rs fork）

```rust
// redis/src/connection.rs（fork 新增）

/// 自定义连接建立器。
///
/// 实现此 trait 可将 redis-rs 的底层 TCP 建连替换为 SSH 隧道、HTTP 代理等。
/// 必须 Send + Sync：集群模式下 dialer 在多线程中被共享。
pub trait ConnectionDialer: Send + Sync {
    /// 建立一条到 (host, port) 的双向字节流。
    ///
    /// host/port 是 redis-rs 认为的「目标地址」（可能是集群节点的内网 IP），
    /// dialer 实现负责将其映射到实际可达的路径。
    fn dial(
        &self,
        host: &str,
        port: u16,
        timeout: Duration,
    ) -> RedisResult<Box<dyn Read + Write + Send>>;
}
```

**设计要点**：

| 决策             | 选择                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| 返回类型         | `Box<dyn Read + Write + Send>` — 类型擦除，适配 TcpStream、SSH channel、SOCKS 隧道等任意双向流           |
| 同步接口         | redis-rs 的 `Connection` 是同步的（`std::io::Read/Write`），dialer 同步最简单；SSH 内部用 blocking 桥接  |
| `Send + Sync`    | 集群模式下 dialer 被 `Arc` 共享到多线程，必须满足这两个 bound                                            |
| TLS 不在 dialer  | TLS 由 redis-rs 在 dialer 返回的流上叠加（见 §3.5），dialer 只管传输层                                   |

### 3.3 ConnectionInfo 扩展

```rust
// redis/src/connection.rs（fork 修改）

pub struct ConnectionInfo {
    pub addr: ConnectionAddr,
    pub redis: RedisConnectionInfo,
    pub tcp_settings: TcpSettings,
    /// 自定义 dialer；Some 时替代默认 TCP 建连
    pub dialer: Option<Arc<dyn ConnectionDialer>>,  // ← 新增
}
```

**`Arc<dyn ConnectionDialer>`** 而非 `Box`：集群模式下多个连接共享同一个 dialer 实例。

### 3.4 ActualConnection 扩展

```rust
// redis/src/connection.rs（fork 修改）

enum ActualConnection {
    Tcp(TcpConnection),
    #[cfg(feature = "tls-rustls")]
    TcpRustls(Box<TcpRustlsConnection>),
    #[cfg(unix)]
    Unix(UnixConnection),
    /// 自定义 dialer 建立的连接（纯 TCP 透传，无 TLS）
    Custom(CustomConnection),              // ← 新增
    /// 自定义 dialer + TLS 叠加
    #[cfg(feature = "tls-rustls")]
    CustomTls(Box<TcpRustlsConnection>),   // ← 新增（复用 TcpRustlsConnection 结构）
}

struct CustomConnection {
    reader: Box<dyn Read + Write + Send>,
    open: bool,
}
```

**影响范围**：`ActualConnection` 的 match 分支遍布 `send_bytes`、`read_response`、`set_read_timeout`、`set_write_timeout`、`check_connection` 等方法，每处都需增加 `Custom` 和 `CustomTls` 分支。

**`set_read_timeout` / `set_write_timeout`**：`Box<dyn Read + Write>` 不支持设置超时。两种处理：
- **方案 A**：trait 增加可选方法 `fn set_read_timeout(&mut self, _: Duration) -> io::Result<()>`，默认返回 `Ok(())`（no-op）
- **方案 B**：定义 `trait TimeoutAwareStream: Read + Write + Send { fn set_read_timeout... }`，CustomConnection 内部 `downcast` 检测
- **推荐 A**：简单直接，DirectDialer 返回的 TcpStream wrapper 实现超时方法，SSH channel 的 no-op 即可（SSH 有自己的超时机制）

### 3.5 TLS 叠加策略

**核心原则**：dialer 返回原始流 → redis-rs 根据 URL scheme（`redis://` vs `rediss://`）决定是否在上层包 TLS。

```text
┌──────────────────────────────────────────────────┐
│  ActualConnection::new() 修改后流程：             │
│                                                    │
│  if let Some(dialer) = &connection_info.dialer {   │
│      let stream = dialer.dial(host, port, timeout)?│
│      if is_tls {                                   │
│          // 在 dialer 流上包 rustls                │
│          let tls_conn = rustls::ClientConnection::new(...)?; │
│          return CustomTls(StreamOwned::new(tls_conn, stream))│
│      } else {                                      │
│          return Custom(CustomConnection { reader: stream })  │
│      }                                             │
│  } else {                                          │
│      // 原有 TCP / TcpTls / Unix 逻辑（不变）       │
│  }                                                 │
└──────────────────────────────────────────────────┘
```

**场景覆盖**：

| 场景                           | dialer 返回        | redis-rs 叠加 TLS | 说明                                   |
| ------------------------------ | ------------------ | ------------------ | -------------------------------------- |
| SSH + `redis://`               | SSH channel        | 否                 | SSH 本身加密                           |
| SSH + `rediss://`              | SSH channel        | 是                 | SSH 传输 + Redis TLS 双重加密（罕见）  |
| HTTP Proxy + `redis://`        | TCP（CONNECT 隧道）| 否                 | 代理到目标 6379 明文                   |
| HTTP Proxy + `rediss://`       | TCP（CONNECT 隧道）| 是                 | 代理到目标 6379+TLS                    |
| SOCKS5 + `redis://`            | TCP（SOCKS 隧道）  | 否                 | 同 HTTP Proxy                          |
| 直连（无 dialer）              | —                  | —                  | 走原有逻辑，完全不变                   |

### 3.6 集群 / 哨兵透传

**集群**：`ClusterClient` 构建时持有 `Arc<dyn ConnectionDialer>`，发现新节点后创建子连接时**透传同一个 dialer**。

```text
ClusterClient { dialer: Option<Arc<dyn ConnectionDialer>> }
    │
    ├── 连接入口节点 → dialer.dial(entry_host, entry_port)
    ├── CLUSTER SLOTS → 发现 192.168.1.11:7001, 192.168.1.11:7002, ...
    ├── 连接节点 1 → dialer.dial("192.168.1.11", 7001)  ← SSH channel 到节点 1
    ├── 连接节点 2 → dialer.dial("192.168.1.11", 7002)  ← SSH channel 到节点 2
    └── ...
```

**哨兵**：`SentinelClientBuilder` 同理，dialer 透传到 sentinel 连接和最终 master 连接。

**关键改动点**（redis-rs fork）：

| 文件                          | 改动                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `connection.rs`               | trait 定义、ConnectionInfo 扩展、ActualConnection 扩展、建连流程                           |
| `client.rs`                   | `Client` 增加 `dialer` 字段和 setter；`get_connection()` 传递 dialer                      |
| `cluster_handling/mod.rs`     | `ClusterClient` 增加 `dialer` 字段；节点连接透传 dialer                                   |
| `cluster_handling/cluster_client.rs` | `ClusterClientBuilder` 增加 `.dialer()` 方法                                       |
| `sentinel/mod.rs`             | `SentinelClientBuilder` 增加 dialer 透传                                                  |

---

## 四、Dialer 实现方案

### 4.1 DirectDialer（默认，等价现有行为）

```rust
pub struct DirectDialer {
    tcp_settings: TcpSettings,
}

impl ConnectionDialer for DirectDialer {
    fn dial(&self, host: &str, port: u16, timeout: Duration)
        -> RedisResult<Box<dyn Read + Write + Send>>
    {
        let stream = TcpStream::connect_timeout(&(host, port), timeout)?;
        // 应用 tcp_settings（nodelay 等）
        Ok(Box::new(stream))
    }
}
```

### 4.2 SshDialer（SSH 隧道）

```rust
pub struct SshDialer {
    session: Arc<Mutex<russh::client::Handle<ClientHandler>>>,
}

impl SshDialer {
    /// 创建 SSH 会话（一次认证，长连接复用）
    ///
    /// 与现有 `SshTunnel::start()` 的差异：
    /// - `SshTunnel::start(ssh_option, target_host, target_port, timeout)` 需要目标地址（本地代理模式）
    /// - `SshDialer::connect(ssh_option, timeout)` 不需要目标地址（SSH 会话独立于目标，dial() 时指定）
    pub fn connect(ssh_option: &SshOption, timeout: Duration) -> AnyResult<Self> {
        let runtime = /* 共享 runtime 或 blocking 线程 */;
        let session = runtime.block_on(connect_and_auth(ssh_option, timeout))?;
        Ok(Self { session: Arc::new(Mutex::new(session)) })
    }
}

impl ConnectionDialer for SshDialer {
    fn dial(&self, host: &str, port: u16, timeout: Duration)
        -> RedisResult<Box<dyn Read + Write + Send>>
    {
        // 缩小 MutexGuard 作用域：lock 仅覆盖 block_on 调用，避免潜在死锁
        // russh Handle 通过 channel 与后台任务通信，block_on 只等待响应
        // 但如果 russh 内部某些路径需要同一 session 的锁，持有 MutexGuard 期间
        // block_on 可能导致死锁
        let channel = {
            let session = self.session.lock().unwrap();
            session.block_on(channel_open_direct_tcpip(host, port, ...))?
        };
        // MutexGuard 在此释放
        let stream = channel.into_stream();
        // 包装为 sync Read + Write
        Ok(Box::new(SshChannelStream::new(stream)))
    }
}
```

**SSH 会话复用**：所有节点（单机/集群/哨兵）共享同一条 SSH 会话，每个 Redis 连接是一个 SSH channel。

**SSH 会话保活**：
- 增加心跳线程，定期发送 SSH keepalive
- `dial()` 检测到会话断开时自动重连（或返回错误由上层重连逻辑处理）

**russh 的同步桥接**：russh 是 async 库，`SshDialer` 需要内部维护一个 Tokio runtime 用于执行 async 操作。`Handle::block_on()` 可以在同步线程上调用 async 方法。

### 4.3 HttpDialer（HTTP CONNECT 代理）

```rust
pub struct HttpDialer {
    proxy_host: String,
    proxy_port: u16,
    auth: Option<(String, String)>,  // (username, password)
}

impl ConnectionDialer for HttpDialer {
    fn dial(&self, host: &str, port: u16, timeout: Duration)
        -> RedisResult<Box<dyn Read + Write + Send>>
    {
        // 1. TCP 连接到代理服务器
        let mut stream = TcpStream::connect_timeout(
            (&self.proxy_host, self.proxy_port), timeout
        )?;
        stream.set_read_timeout(Some(timeout))?;
        stream.set_write_timeout(Some(timeout))?;

        // 2. 发送 CONNECT 请求
        let mut request = format!(
            "CONNECT {}:{} HTTP/1.1\r\nHost: {}:{}\r\n",
            host, port, host, port
        );
        if let Some((ref user, ref pass)) = self.auth {
            let encoded = BASE64_STANDARD.encode(format!("{}:{}", user, pass));
            request.push_str(&format!("Proxy-Authorization: Basic {}\r\n", encoded));
        }
        request.push_str("\r\n");
        stream.write_all(request.as_bytes())?;

        // 3. 解析 HTTP 响应（期望 200 Connection established）
        parse_http_connect_response(&mut stream)?;

        // 4. 此时 stream 就是透传的字节流
        Ok(Box::new(stream))
    }
}
```

**HTTP CONNECT 协议**：

```text
→ CONNECT redis-server:6379 HTTP/1.1
→ Host: redis-server:6379
→ Proxy-Authorization: Basic dXNlcjpwYXNz
→
← HTTP/1.1 200 Connection established
←
← （此后 stream 透传到 redis-server:6379）
```

### 4.4 Socks5Dialer（SOCKS5 代理）

```rust
pub struct Socks5Dialer {
    proxy_host: String,
    proxy_port: u16,
    auth: Option<(String, String)>,
}

impl ConnectionDialer for Socks5Dialer {
    fn dial(&self, host: &str, port: u16, timeout: Duration)
        -> RedisResult<Box<dyn Read + Write + Send>>
    {
        let mut stream = TcpStream::connect_timeout(
            (&self.proxy_host, self.proxy_port), timeout
        )?;

        // SOCKS5 握手
        // 1. 发送版本 + 认证方法
        // 2. 接收服务端选择的认证方法
        // 3. 如有用户名/密码认证，执行认证
        // 4. 发送 CONNECT 请求（host, port）
        // 5. 接收连接建立响应

        socks5_handshake(&mut stream, &self.auth)?;
        socks5_connect(&mut stream, host, port)?;

        Ok(Box::new(stream))
    }
}
```

**可选依赖**：可参考 `socks` crate 的实现，或自行实现（SOCKS5 协议很简洁，~100 行代码）。

---

## 五、RedisME 侧改动

### 5.1 数据模型扩展（新增，不破坏现有结构）

**设计原则**：与 TinyRDM 一致 — SSH 隧道和网络代理是**两个独立的配置区域**，互不干扰。

现有 `ConnConfig` 采用「开关 + 选项对象」模式：

```rust
// 现有结构（保持不变）
ConnConfig {
    // ...
    ssh: bool,              // ← 不变
    ssh_option: SshOption,  // ← 不变
    // ...
}
```

新增代理选项，照搬同一模式：

```rust
// src-tauri/src/utils/model.rs（新增）

api_model!(
    /// 网络代理配置（HTTP CONNECT / SOCKS5）
    ProxyOption {
        proxy_mode: String,    // "none" / "system" / "manual"
        proxy_type: String,    // "http" / "socks5"（manual 模式必填，system 模式由系统决定）
        host: String,          // manual 模式必填
        port: u16,             // manual 模式必填
        username: String,      // 代理认证用户名（可选）
        password: String,      // 代理认证密码（可选）
    }
);
```

`ConnConfig` 新增字段：

```rust
ConnConfig {
    // ... 现有字段全部不变 ...
    ssh: bool,
    ssh_option: SshOption,

    // 新增：网络代理
    // 注意：api_model! 宏不加 #[serde(default)]，旧配置无此字段会反序列化失败
    // 必须加 #[serde(default)] 保证向后兼容
    #[serde(default)]
    proxy: bool,
    #[serde(default)]
    proxy_option: ProxyOption,

    // ...
}
```

**三种代理模式**：

| 模式         | `proxy_mode` | 行为                                                                                       |
| ------------ | ------------ | ------------------------------------------------------------------------------------------ |
| 不使用代理   | `"none"`     | 直连，等同于 `proxy = false`                                                               |
| 使用系统代理 | `"system"`   | 运行时检测系统代理设置（Windows 注册表 / macOS SystemConfiguration / Linux 环境变量）      |
| 手动配置代理 | `"manual"`   | 使用 `proxy_type` + `host` + `port` 构建 dialer                                            |

**系统代理检测实现**：

```rust
// src-tauri/src/utils/proxy.rs（新增）

use std::env;

/// 检测系统代理设置，返回 (proxy_type, host, port)
pub fn detect_system_proxy(host: &str, port: u16) -> Option<(String, String, u16)> {
    // 1. 检查 no_proxy / NO_PROXY 环境变量（跳过代理的地址列表）
    if is_no_proxy(host, port) {
        return None;  // 目标地址在排除列表中，直连
    }

    // 2. 按平台检测
    #[cfg(windows)]
    { detect_windows_proxy() }

    #[cfg(target_os = "macos")]
    { detect_macos_proxy() }

    #[cfg(target_os = "linux")]
    { detect_linux_proxy() }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        // 非主流平台（FreeBSD 等），尝试读环境变量作为兜底
        detect_linux_proxy()
    }
}

/// Linux: 读取 http_proxy / https_proxy / all_proxy 环境变量
fn detect_linux_proxy() -> Option<(String, String, u16)> {
    // 优先级: https_proxy > http_proxy > all_proxy
    let url = env::var("https_proxy")
        .or_else(|_| env::var("HTTPS_PROXY"))
        .or_else(|_| env::var("http_proxy"))
        .or_else(|_| env::var("HTTP_PROXY"))
        .or_else(|_| env::var("all_proxy"))
        .or_else(|_| env::var("ALL_PROXY"))
        .ok()?;
    parse_proxy_url(&url)
}

/// Windows: 读取注册表 IE 代理设置
fn detect_windows_proxy() -> Option<(String, String, u16)> {
    // HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
    // ProxyEnable (DWORD) + ProxyServer (REG_SZ, 格式 "host:port" 或 "http=host:port;https=host:port")
    // 可用 `winreg` crate 读取
    todo!("实现 Windows 注册表读取")
}

/// macOS: 通过 networksetup 命令或 SystemConfiguration framework
fn detect_macos_proxy() -> Option<(String, String, u16)> {
    // 方案 A: 调用 `networksetup -getwebproxy Wi-Fi` 等命令
    // 方案 B: 使用 core-foundation crate 调用 SCDynamicStore
    todo!("实现 macOS 系统代理检测")
}

/// 检查目标地址是否在 no_proxy 列表中
fn is_no_proxy(host: &str, port: u16) -> bool {
    let no_proxy = env::var("no_proxy")
        .or_else(|_| env::var("NO_PROXY"))
        .unwrap_or_default();
    if no_proxy.is_empty() {
        return false;
    }
    // no_proxy 格式: "localhost,127.0.0.1,.example.com,192.168.0.0/16"
    no_proxy.split(',')
        .map(|s| s.trim())
        .any(|pattern| matches_no_proxy(pattern, host, port))
}

/// 解析代理 URL（如 "http://proxy.example.com:8080"）→ (proxy_type, host, port)
/// 待实现：支持 http/https/socks5 协议前缀，默认端口 80/443/1080
fn parse_proxy_url(url: &str) -> Option<(String, String, u16)> {
    // 伪代码：
    // 1. 解析协议前缀 → proxy_type ("http" / "socks5")
    // 2. 解析 host:port
    // 3. 缺省端口：http→80, https→443, socks5→1080
    todo!("实现代理 URL 解析")
}

/// 匹配 no_proxy 模式
/// 支持：精确匹配、域名后缀（.example.com）、CIDR（192.168.0.0/16）、通配符（*）
/// 推荐：直接使用 `no_proxy` crate 或 `system_proxy` crate 内置实现
fn matches_no_proxy(pattern: &str, host: &str, port: u16) -> bool {
    // 伪代码：
    // 1. pattern == "*" → 匹配所有
    // 2. pattern.starts_with('.') → 域名后缀匹配（host.ends_with(pattern)）
    // 3. pattern.contains('/') → CIDR 匹配（IP 范围）
    // 4. 否则 → 精确匹配（pattern == host 或 pattern == host:port）
    todo!("实现 no_proxy 模式匹配，建议依赖 no_proxy crate")
}
```

**可选依赖**：

| 方案                      | 说明                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `system_proxy` crate      | 跨平台系统代理检测（Windows/macOS/Linux），~200 行，可直接使用                             |
| 自行实现                  | Linux 读环境变量（20 行），Windows 用 `winreg` crate（~50 行），macOS 用 `networksetup`    |
| **推荐**                  | 先用 `system_proxy` crate 快速实现，后续如需精简再替换为自行实现                          |

### 5.2 连接构建改造

```rust
// src-tauri/src/utils/conn.rs（改造后）

pub fn get_client_single(
    conf: &ConnConfig,
    connect_timeout: Duration,
    verify: bool,
) -> AnyResult<(Client, Option<Arc<dyn ConnectionDialer>>)> {
    // 构建 dialer：SSH 优先，其次代理（且 mode != none），否则直连
    let dialer = if conf.ssh {
        Some(Arc::new(SshDialer::connect(&conf.ssh_option, connect_timeout)?) as Arc<dyn ConnectionDialer>)
    } else if conf.proxy && conf.proxy_option.proxy_mode != "none" {
        Some(build_proxy_dialer(&conf.proxy_option, &conf.host, conf.port)?)
    } else {
        None  // 直连，走 redis-rs 原始 TCP
    };

    // 构建 ConnectionInfo，注入 dialer
    let mut info = build_connection_info(conf)?;
    info.dialer = dialer.clone();

    let client = Client::open(info)?;
    // ... 其余逻辑不变
    Ok((client, dialer))
}

fn build_proxy_dialer(
    opt: &ProxyOption,
    target_host: &str,
    target_port: u16,
) -> AnyResult<Arc<dyn ConnectionDialer>> {
    match opt.proxy_mode.as_str() {
        "none" | "" => {
            // 不应到达此处（上层已判断），兜底返回错误
            bail!(AppError::Internal { message: "proxy_mode=none 不应调用 build_proxy_dialer".into() })
        }
        "system" => {
            // 检测系统代理
            match detect_system_proxy(target_host, target_port) {
                Some((proxy_type, host, port)) => {
                    info!("使用系统代理: {} {}:{}", proxy_type, host, port);
                    build_proxy_dialer_from(proxy_type, &host, port, &opt.username, &opt.password)
                }
                None => {
                    info!("系统未配置代理或目标地址在 no_proxy 列表中，直连");
                    bail!(AppError::Internal { message: "系统代理未检测到，应走直连路径".into() })
                }
            }
        }
        "manual" => {
            build_proxy_dialer_from(
                &opt.proxy_type, &opt.host, opt.port, &opt.username, &opt.password,
            )
        }
        other => bail!(AppError::ProxyModeNotSupported { mode: other.into() }),
    }
}

fn build_proxy_dialer_from(
    proxy_type: &str,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> AnyResult<Arc<dyn ConnectionDialer>> {
    let auth = if username.is_empty() {
        None
    } else {
        Some((username.to_string(), password.to_string()))
    };
    match proxy_type {
        "http" | "https" => Ok(Arc::new(HttpDialer::new(host, port, auth))),
        "socks5" | "socks5h" => Ok(Arc::new(Socks5Dialer::new(host, port, auth))),
        other => bail!(AppError::ProxyTypeNotSupported { proxy_type: other.into() }),
    }
}
```

**SSH + 代理互斥校验**（前端表单层 + 后端校验）：

```rust
// conn.rs 中
if conf.ssh && conf.proxy && conf.proxy_option.proxy_mode != "none" {
    bail!(AppError::SshAndProxyMutuallyExclusive);
}
```

**`get_client_cluster` 改造**：

```rust
// src-tauri/src/utils/conn.rs（改造后）

pub fn get_client_cluster(
    conf: &ConnConfig,
    verify: Option<Duration>,
) -> AnyResult<(ClusterClient, Option<Arc<dyn ConnectionDialer>>)> {
    // SSH + 代理互斥校验
    if conf.ssh && conf.proxy && conf.proxy_option.proxy_mode != "none" {
        bail!(AppError::SshAndProxyMutuallyExclusive);
    }

    // 构建 dialer（与 get_client_single 相同逻辑）
    let dialer = if conf.ssh {
        Some(Arc::new(SshDialer::connect(&conf.ssh_option, verify.unwrap_or(CONNECTION_CONNECT_TIMEOUT))?) as Arc<dyn ConnectionDialer>)
    } else if conf.proxy && conf.proxy_option.proxy_mode != "none" {
        Some(build_proxy_dialer(&conf.proxy_option, &conf.host, conf.port)?)
    } else {
        None
    };

    // 构建 ClusterClient，注入 dialer（redis-rs fork 新增 .dialer() 方法）
    let mut builder = ClusterClient::builder(vec![url.to_string()]);
    if let Some(ref d) = dialer {
        builder = builder.dialer(d.clone());  // ← redis-rs fork 新增
    }
    // ... 其余配置不变
    let client = builder.build()?;
    Ok((client, dialer))
}
```

**注意**：`get_client_cluster` 返回类型从 `AnyResult<ClusterClient>` 变为 `AnyResult<(ClusterClient, Option<Arc<dyn ConnectionDialer>>)>`，与 `get_client_single` 保持一致。调用方（`MeCluster::init()`）需要适配。

### 5.3 SSH 隧道代码迁移（阶段四）

`SshDialer` 实现后，现有 SSH 隧道代码可迁移：

| 文件/代码                          | 处理                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `src-tauri/src/utils/ssh_tunnel.rs` | **迁移为 `SshDialer`** — 核心逻辑（russh 连接/认证/channel）复用，去掉本地 TCP 代理层 |
| `MeSingle.ssh_tunnel: Option<SshTunnel>` | **删除** — dialer 生命周期由 `Client` 管理（`ConnectionInfo.dialer` 持有）       |
| `AppError::ClusterNotSupported`（SSH 相关） | **删除** — 集群现在支持 SSH                                                       |
| `AppError::SentinelNotSupported`（SSH 相关）| **删除** — 哨兵现在支持 SSH                                                       |

**注意**：`ssh_tunnel.rs` 的迁移放在阶段四（SshDialer 实现时）再做，阶段一/二/三不影响现有 SSH 功能。

### 5.4 前端连接表单改造

参照 TinyRDM 模式，SSH 隧道和网络代理**分开配置**，新增「网络代理」tab：

```
┌─ 连接配置左侧 Tab 列表 ──────────────┐
│  常规配置                             │
│  高级配置                             │
│  SSL/TLS                              │
│  SSH隧道        ← 现有，保持不变      │
│  哨兵模式                             │
│  集群模式                             │
│  网络代理       ← 新增                │
───────────────────────────────────────┘
```

「网络代理」Tab 内容（对齐 TinyRDM）：

```
┌─ 网络代理 ──────────────────────────┐
│                                        │
│  ○ 不使用代理                          │
│  ○ 使用系统代理设置                    │
│  ● 手动配置代理                        │
│                                        │
│  ── 手动配置代理时显示               │
│  类型: [HTTP ▼]                        │
│    HTTP                                │
│    HTTPS                               │
│    SOCKS5                              │
│    SOCKS5H                             │
│                                        │
│  主机名: [____________] : [端口]       │
│  用户名: [____________]                │
│  密码:   [********]  (代理授权密码)    │
└───────────────────────────────────────┘
```

**UI 交互逻辑**：

| 选择模式         | 显示内容                                     | 后端行为                                         |
| ---------------- | -------------------------------------------- | ------------------------------------------------ |
| 不使用代理       | 隐藏所有配置项                               | `proxy_mode = "none"`，直连                      |
| 使用系统代理设置 | 隐藏手动配置项；显示「当前系统代理」只读提示 | `proxy_mode = "system"`，运行时 `detect_system_proxy()` |
| 手动配置代理     | 显示类型/主机/端口/认证                      | `proxy_mode = "manual"`，使用表单值构建 dialer   |

**系统代理模式下的只读提示**：
- 检测到系统代理时，显示「当前系统代理：HTTP 192.168.1.100:7890」
- 未检测到系统代理时，显示「未检测到系统代理，将直连」
- 检测按钮：「刷新检测」（可选，首次进入 tab 自动检测一次）

**互斥提示**：当 SSH 隧道已启用时，切换到「网络代理」tab 并启用代理，弹出提示「SSH 隧道与网络代理不可同时启用，请先关闭 SSH 隧道」。

**与 TinyRDM 的差异**：
- TinyRDM 区分 HTTP/HTTPS/SOCKS5/SOCKS5H — RedisME 首版均支持（HTTP/HTTPS 共用 CONNECT 逻辑，SOCKS5H 是 SOCKS5 的远程 DNS 解析变体）

---

## 六、redis-rs fork 改动清单

### 6.1 改动文件与影响范围

| 文件                                    | 改动类型 | 说明                                                              |
| --------------------------------------- | -------- | ----------------------------------------------------------------- |
| `redis/src/connection.rs`               | **核心** | trait 定义、ConnectionInfo/ActualConnection 扩展、建连流程改写       |
| `redis/src/client.rs`                   | 中       | Client 增加 dialer 字段和 setter                                    |
| `redis/src/cluster_handling/mod.rs`     | 中       | 集群节点连接透传 dialer                                             |
| `redis/src/cluster_handling/cluster_client.rs` | 中 | ClusterClientBuilder 增加 `.dialer()` 方法                         |
| `redis/src/sentinel/mod.rs`             | 中       | SentinelClientBuilder 透传 dialer                                   |
| `redis/src/lib.rs`                      | 小       | 导出 `ConnectionDialer` trait                                       |

### 6.2 改动原则

- **最小侵入**：仅在 `ActualConnection::new()` 入口处分叉（有 dialer 走 dialer，无 dialer 走原路径），其余代码通过增加 match 分支适配
- **向后兼容**：`ConnectionInfo.dialer` 默认 `None`，不设置时行为与原版完全一致
- **fork 分支管理**：在现有 `x509-v1-client-cert` 分支上新建 `custom-dialer` 分支，或合并到同一分支

### 6.3 同步/异步考量

当前 RedisME 使用 redis-rs 的 **同步** API（`Client::get_connection`、`ClusterClient::get_connection`）。

- 同步 dialer 接口最简单（`fn dial() -> Box<dyn Read + Write>`）
- SSH 内部 async → sync 桥接：`Handle::block_on()` 在同步线程上调用 russh async 方法
- 如果未来 RedisME 切到异步 API，dialer trait 需要增加 async 版本（`async fn dial_async()`），但这是后续事项

---

## 七、实施步骤

### 阶段一：redis-rs fork — ConnectionDialer 基础设施

1. 定义 `ConnectionDialer` trait
2. `ConnectionInfo` 增加 `dialer: Option<Arc<dyn ConnectionDialer>>` 字段
3. `ActualConnection` 增加 `Custom` / `CustomTls` 变体
4. 改写 `ActualConnection::new()` 支持 dialer 分叉（有 dialer 走 dialer，无 dialer 走原路径）
5. 所有 `ActualConnection` match 处增加 `Custom` 分支（`send_bytes`、`read_response`、`set_read_timeout`、`set_write_timeout`、`check_connection`）
6. `Client` 增加 dialer 透传
7. 单测：`DirectDialer` 回归测试（行为等同原 TCP）

### 阶段二：redis-rs fork — 集群 / 哨兵透传

8. `ClusterClient` / `ClusterClientBuilder` 增加 dialer
9. 集群节点连接透传 dialer（核心：`get_connection` 发现节点后用同一 dialer 建连）
10. `SentinelClientBuilder` 透传 dialer
11. 单测：mock dialer 验证集群节点连接走 dialer

### 阶段三：RedisME — 数据模型 + 代理 Dialer + 系统代理检测

12. `ConnConfig` 新增 `proxy` + `proxy_option` 字段（`#[serde(default)]` 向后兼容）
13. 新增 `src-tauri/src/utils/proxy.rs`：`detect_system_proxy()` 跨平台系统代理检测
14. 实现 `HttpDialer`（HTTP CONNECT 协议，支持 HTTP/HTTPS）
15. 实现 `Socks5Dialer`（支持 SOCKS5/SOCKS5H）
16. 改造 `conn.rs`：`build_proxy_dialer()` 根据 `proxy_mode` 选择直连/系统代理/手动代理
17. 前端新增「网络代理」Tab（三种模式单选 + 手动配置表单，与 SSH 隧道 Tab 并列，互斥校验）
18. 回归：HTTP 代理 + 单机/集群、SOCKS5 + 单机/集群、系统代理 + 单机
19. **现有 SSH 功能不受影响**（继续走 `ssh_tunnel.rs` 本地 TCP 代理）

### 阶段四：RedisME — SshDialer 替换现有 SSH 隧道

20. 实现 `SshDialer`（复用 `russh`，共享 SSH 会话，去掉本地 TCP 代理层）
21. `conn.rs` 中 SSH 分支改用 `SshDialer`
22. 删除 `ssh_tunnel.rs`
23. 删除 `MeSingle.ssh_tunnel` 字段
24. 回归：SSH + 单机读写、SSH + 集群、SSH + 哨兵

### 阶段五：收尾

25. 错误信息国际化（代理连接失败、认证失败等）
26. changelog 更新
27. 文档：代理配置说明

---

## 八、验收标准

| #   | 场景                                                | 期望                                        |
| --- | --------------------------------------------------- | ------------------------------------------- |
| 1   | 直连（无代理/无 SSH）                               | 与改造前行为完全一致（回归）                |
| 2   | 现有 SSH 隧道 + 单机（阶段三，未迁移前）            | 与改造前行为完全一致（回归）                |
| 3   | HTTP CONNECT 代理 + 单机                            | 通过代理连接 Redis，读写正常                |
| 4   | HTTP CONNECT 代理 + `rediss://`（TLS）              | 代理隧道 + TLS 叠加，读写正常               |
| 5   | SOCKS5 代理 + 单机                                  | 通过代理连接 Redis，读写正常                |
| 6   | 系统代理模式 + 单机                                 | 检测到系统代理后自动走代理，读写正常        |
| 7   | HTTP/SOCKS5 代理 + 集群                             | 全部节点通过代理可达，读写正常              |
| 8   | SSH 隧道 + 集群（阶段四，SshDialer 迁移后）         | 全部节点通过 SSH channel 可达，读写正常     |
| 9   | SSH 隧道 + 哨兵（阶段四，SshDialer 迁移后）         | 哨兵发现 + master 连接通过 SSH，读写正常    |
| 10  | SSH + 代理同时启用                                  | 后端报错 + 前端提示互斥                     |
| 11  | SSH 会话复用（阶段四）                              | 仅一条 SSH 会话，多个 channel               |
| 12  | 代理 + 命令日志                                     | 命令日志正常记录（dialer 不影响上层）       |

---

## 九、风险与缓解

| 风险                                  | 缓解                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| redis-rs fork 与上游漂移              | dialer 改动集中在 `ActualConnection::new()` 入口和 match 分支，与上游冲突面小；定期 rebase |
| SSH 会话单点故障                      | 增加 keepalive 心跳 + 自动重连；dial() 失败时上层重连逻辑兜底                              |
| `Box<dyn Read + Write>` 性能开销      | trait object 有一次虚函数调用，相对网络 IO 可忽略；如需极致性能可用泛型（但增加复杂度）    |
| 同步/异步桥接（SSH dialer）           | russh `Handle::block_on()` 在专用线程上执行，避免阻塞主线程；超时由 dial() timeout 参数控制 |
| `set_read_timeout` 对 Custom 流无效   | SSH channel 有自己的超时机制；HTTP/SOCKS 隧道返回的是 TcpStream，可设置超时                |
| 集群节点地址解析                      | dialer 接收 redis-rs 传入的原始 host:port（集群节点地址），由 dialer 决定如何路由          |

---

## 十、有意不做（首版）

- 异步 dialer 接口（等 RedisME 整体切 async 后再考虑）
- 代理配置的导入/导出/管理界面（首版仅连接配置内的代理选项）
- 代理连接的性能监控/统计
- 向上游 redis-rs 提 PR（先在 fork 验证方案可行性）
- SOCKS5 UDP ASSOCIATE（Redis 是 TCP 协议，不需要 UDP）
- 代理服务器自动发现（如 K8s service mesh）

---

## 附录 A：竞品 SSH 隧道实现对比

| 客户端              | SSH 实现方式                                    | 网络代理               | 集群支持 | 备注                                |
| ------------------- | ----------------------------------------------- | ---------------------- | -------- | ----------------------------------- |
| RedisInsight        | 无内置 SSH                                      | 无                     | —        | 官方建议用 `ssh -L` 端口转发        |
| TinyRDM             | 本地 TCP 代理（Go `golang.org/x/crypto/ssh`）   | HTTP/HTTPS/SOCKS5/SOCKS5H | 否    | 与 RedisME 现有 SSH 方案类似        |
| AnotherRDM          | 本地 TCP 代理（Node.js `ssh2`）                 | 无                     | 否       | 同上                                |
| RedisRDM (官方)     | 无内置 SSH                                      | 无                     | —        | 不支持                              |
| **RedisME（方案后）** | **自定义 Dialer（redis-rs fork）**              | **HTTP/SOCKS5 + 系统代理** | **是** | **传输层抽象，统一支持全部代理类型** |

## 附录 B：ConnectionDialer trait 设计备选方案

| 备选                          | 优点                       | 缺点                                       | 结论     |
| ----------------------------- | -------------------------- | ------------------------------------------ | -------- |
| `fn dial() -> TcpStream`      | 简单                       | SSH channel 不是 TcpStream，无法适配       | **不采用** |
| `fn dial() -> Box<dyn Stream>`| 灵活                       | 需要定义 Stream trait 或引入第三方          | 过度设计 |
| `fn dial() -> Box<dyn Read+Write+Send>` | 灵活、标准库足够 | 无法 `set_read_timeout`（通过 trait 扩展解决）| **采用** |
| 泛型 `Dialer<S: Read+Write>`  | 零开销                     | 类型传播复杂，`ActualConnection` 需泛型化   | **不采用** |
