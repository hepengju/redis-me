# 29. RedisME 网络代理（手动 + 系统）

> **类型**：实施计划（待实施）  
> **总设计**：[`26_custom-connection-dialer.md`](./26_custom-connection-dialer.md)  
> **前置**：[`27_connection-dialer-fork.md`](./27_connection-dialer-fork.md)、[`28_ssh-dialer.md`](./28_ssh-dialer.md) 已合入（Dialer 注入与 SSH 全模式已在）

---

## 一、本阶段目标

在 28 已接好的 `get_client_*` Dialer 上增加代理，覆盖单机 / 集群 / 哨兵，可与 `rediss://` 叠加：

| 能力                  | 说明                                                    |
| --------------------- | ------------------------------------------------------- |
| 手动 HTTP             | 明文连代理，`CONNECT`                                   |
| 手动 HTTPS            | **先对代理做 TLS**，再 `CONNECT`（≠ Redis 的 `rediss`） |
| 手动 SOCKS5 / SOCKS5H | 本地 DNS vs 代理侧 DNS                                  |
| 使用系统代理          | 运行时检测；检不到则直连并提示                          |

SSH 已由 28 的 `SshDialer` 覆盖，本阶段**不要**改回 `ssh_tunnel.rs`。`ssh && proxy` 前端 + 后端互斥。

---

## 二、数据模型

`ConnConfig` 增补（`api_model!` 字段必须 `#[serde(default)]`）：

```rust
#[serde(default)]
proxy: bool,
#[serde(default)]
proxy_option: ProxyOption,
```

```rust
api_model!(
    #[derive(Default)]
    ProxyOption {
        proxy_mode: String, // "system" | "manual"
        proxy_type: String, // "http" | "https" | "socks5" | "socks5h"
        host: String,
        port: u16,
        username: String,
        password: String,
    }
);
```

`src/utils/conn-compat.ts` 为旧连接补 `proxy: false` 与空 `proxyOption`。specta 按现有流程更新。

---

## 三、Dialer 实现（`src-tauri/src/utils/`）

新建例如 `proxy_dialer.rs` + `system_proxy.rs`，保持扁平。

### 3.1 共用

- 实现 fork 的 `ConnectionDialer`。HTTP/SOCKS 返回 `Box::new(tcp) as Box<dyn RedisStream>`（27 已 `impl RedisStream for TcpStream`）。
- HTTPS 代理：对代理 TLS 后流不是裸 `TcpStream`，在 RedisME 里薄封装并 `impl RedisStream`（`set_*_timeout` 转到内层 `TcpStream`），**不要**为此改 fork。
- 连**代理服务器**：解析代理 host → `TcpStream::connect_timeout(&SocketAddr, timeout)`。多地址依次试。
- `set_nodelay(true)`，握手阶段带 socket 超时。
- 空用户名 → 无认证；非空 → 带密码。
- `dial(..., timeout: Option)`：`None` 时用表单/建连超时（Dialer 自身存一份 Duration）。

### 3.2 HttpDialer（`http` / `https`）

1. TCP 连代理。
2. **`https`**：对**代理主机名**做 TLS（SNI=代理 host），再在 TLS 流上发 CONNECT。
3. `CONNECT host:port HTTP/1.1` + `Host:`；IPv6 目标写成 `[host]:port`。
4. 可选 `Proxy-Authorization: Basic`。
5. 读到 `\r\n\r\n`，状态码必须 200。
6. 407 / 非 200 → 明确 `AppError`；文案可提「部分网关只允许 CONNECT 到 443」。

Redis 的 `rediss://` 仍由 redis-rs 叠在 Dialer 流上，不要在 HttpDialer 里对 Redis 再包 TLS。

### 3.3 Socks5Dialer

- `socks5`：目标 host 本地 DNS，IPv4/IPv6 ATYP。
- `socks5h`：ATYP=域名，把原始 host 发给代理（依赖 27 不预解析）。
- 握手：方法选择 → 可选 RFC1929 → CONNECT。失败映射 `AppError`。

可自写握手，不为此加 `socks` crate。

### 3.4 系统代理检测

`detect_system_proxy(target_host, target_port) -> Option<(proxy_type, host, port, auth?)>`：

1. `no_proxy` / `NO_PROXY` 命中则 `None`。精确匹配、`.suffix`、`*` 即可，CIDR 有现成再做。
2. **环境变量**（所有平台）：`https_proxy` > `http_proxy` > `all_proxy`（及大写）。
3. **Windows 静态**：`ProxyEnable` + `ProxyServer`。**不解析 PAC / AutoConfigURL**。
4. **macOS**：能读到的非 PAC 系统代理；否则回退环境变量。

检不到（含仅 PAC）：直连并提示，不要报错。勾选时代理区块检测一次，不要「刷新」按钮。

认证：代理 URL 里带的用 URL；手动/系统表单可选 username/password。

### 3.5 `conn.rs` 接线（接在 28 的 Dialer 参数上）

优先级与 26 一致：`ssh` 仍走已有 `SshDialer`；否则 `proxy` 才 `build_proxy_dialer`。**只用 27 冻结 API**（`Client::set_dialer` / `ClusterClientBuilder::dialer` / `SentinelClientBuilder::set_dialer`）。

- `ssh && proxy` → `SshAndProxyMutuallyExclusive`
- 仅 `proxy`：`system` → 检测到则建 Dialer，否则 `None`；`manual` → 按 type 建；非法 type/mode → 对应 `AppError`
- 目标 Redis URL **仍用 `conf.host:conf.port`**
- 哨兵：与 28 相同，`get_client_sentinel(conf, Some(proxy_dialer))`，不要先 open 再丢掉
- 集群 subscribe/monitor：28 已传入 SSH Dialer；仅代理时 `get_client_single` 按 conf 新建代理 Dialer（无会话）

**禁止**在 29 再改 redis-rs。

---

## 四、前端（对齐 SSH 区块）

`ConnSave.vue`：

- 模式勾选区「SSH」旁增加「代理」+ 短 tip。
- `v-show="form.proxy"`：单选「使用系统代理」/「手动配置」。
  - 系统：只读提示当前静态/环境变量代理，或「未检测到，将直连」。
  - 手动：HTTP / HTTPS / SOCKS5 / SOCKS5H + 主机 + 端口 + 用户名 + 密码。
- 校验：手动时 host/port 必填。
- `watch`：`ssh && proxy` 时警告并关掉后勾的那一项（新 i18n 键）。
- **不要**恢复 SSH ↔ 集群/哨兵互斥（28 已放开）。

默认手动 `proxyType: 'http'`、`port: 8080`；提示 SOCKS 常见 1080。

---

## 五、导入与兼容

`src/utils/rdm.ts` + `rdm.test.ts`：TinyRDM 系统/手动及四类型都映射；同时开 SSH 与代理则保留 SSH、`proxy=false`。AnotherRDM / Insight 无字段则默认关。

---

## 六、验收

| #   | 场景                              | 期望                                   |
| --- | --------------------------------- | -------------------------------------- |
| 1   | 旧连接无 proxy 字段               | 能打开；未开代理                       |
| 2   | 直连、28 的 SSH 单机/集群/哨兵    | 回归                                   |
| 3   | HTTP CONNECT + 单机 / 集群 / 哨兵 | 正常；命令超时仍生效                   |
| 4   | HTTPS 代理 + 单机（及 `rediss`）  | 对代理 TLS + CONNECT；Redis TLS 再叠加 |
| 5   | SOCKS5 / SOCKS5H + 单机 / 集群    | 正常                                   |
| 6   | 系统代理已配                      | 走代理                                 |
| 7   | 系统代理未配置                    | 直连并提示，不是报错                   |
| 8   | SSH + 代理同时勾选                | 前端互斥；后端绕过 UI 则报错           |
| 9   | CONNECT 被拒 / 407                | 可读错误                               |
| 10  | TinyRDM 导入含代理                | 字段映射正确                           |
| 11  | 命令日志                          | 仍记录                                 |

静态：`cargo check`；改了 TS 则 `vp check`。

---

## 七、提交

一行标题，例如 `feat: add HTTP HTTPS SOCKS5 and system proxy`。

changelog / 连接文档写清四种手动类型 + 系统代理（环境变量与静态设置；不支持 PAC）。`future.md` 勾掉「网络代理」。
