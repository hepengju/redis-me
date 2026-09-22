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

### 场景与分工

SSH 和代理都是「本机直连不到 Redis」时的绕路，但中间人不同：

|        | SSH 隧道（28）                        | 网络代理（29）                             |
| ------ | ------------------------------------- | ------------------------------------------ |
| 中间人 | 能 SSH 登录、且能摸到 Redis 的跳板机  | HTTP/SOCKS 代理（公司网关、Clash、Squid…） |
| 凭证   | SSH 用户名 / 密码 / 私钥              | 代理账号（经常无认证）                     |
| 卡点   | 目标 Redis 对公网不可达（VPC / 内网） | 本机不允许或无法直连任意 TCP               |

一句话：**有跳板、Redis 在内网 → SSH；没有跳板、只有公司/本地代理 → 代理。** 同一连接二选一（不做「先代理再 SSH」）。

**要解决的问题**（直连 `host:port` 出不去；TinyRDM 已有，属 P0 生产接入缺口）：

1. **公司出口策略**：只允许走指定 HTTP/SOCKS 代理，6379 / 26379 被防火墙挡掉（连 Redis Cloud、公网 VPS、对端机房都会失败）。
2. **本机已有 Clash / Surge / 系统代理**：浏览器和 curl 已走代理，桌面端不会自动跟随。「使用系统代理」让连接勾一下即可，不必每条连接再填代理地址。
3. **主机名只在代理侧能解析**：本机 DNS 解析不到或 split-horizon 解析错。SOCKS5H / HTTP CONNECT 把域名原文交给代理；SOCKS5 则本机先解析再让代理连 IP。
4. **TinyRDM 迁移**：本阶段**不**从竞品导入映射代理（缺字段视为未开）。
5. **企业 HTTPS 代理（相对少）**：先对**代理本身**做 TLS，再 CONNECT。与 Redis 的 `rediss://` 是两层，都要做。

**四种手动类型**：

| 类型    | 行为                                 | 典型来源                                    |
| ------- | ------------------------------------ | ------------------------------------------- |
| HTTP    | 明文连代理，`CONNECT host:port`      | Clash 7890、多数公司正向代理                |
| HTTPS   | 先 TLS 到代理，再 CONNECT            | 要求 TLS-to-proxy 的企业网关（≠ Redis TLS） |
| SOCKS5  | 本机解析 Redis 主机名，代理只转发 IP | 本机 DNS 可信时                             |
| SOCKS5H | 不在本机解析，ATYP=域名交给代理      | 内网 DNS、防 DNS 泄漏                       |

系统代理：用户已在 OS / 环境变量里配过，不想在 RedisME 再维护一份。检不到（含只配了 PAC）则直连并提示。

**明确不解决**：Redis 只在 VPC、外面没有代理入口 → 仍用 SSH / VPN；公司代理只允许 CONNECT **443** → 报清楚状态码，解不了对方策略；先过代理再 SSH、PAC / WPAD、单独的代理管理页、检查更新等非 Redis 流量走连接代理。

**已知限制**（实施时写入连接文档）：

- 集群 / 哨兵发现出的节点若是内网 IP（`CLUSTER SLOTS` / 哨兵返回 `10.x`），公司 **HTTP 出口代理**往往 CONNECT 不过去。SSH 跳板通常能到这些 IP，代理这条路不一定能。属网络策略限制，不是实现漏了。
- Linux「使用系统代理」只认环境变量，不读 GNOME/KDE 设置面板。

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

`detect_system_proxy() -> Option<(proxy_type, host, port, auth?)>`：

1. **环境变量**（所有平台）：`https_proxy` > `http_proxy` > `all_proxy`（及大写）。
2. **Windows 静态**：`ProxyEnable` + `ProxyServer`。**不解析 PAC / AutoConfigURL**。
3. **macOS**：能读到的非 PAC 系统代理；否则回退环境变量。

检不到（含仅 PAC）：直连并提示，不要报错。勾选时代理区块检测一次，不要「刷新」按钮。不按目标主机做 loopback / NO_PROXY 绕过。

认证：代理 URL 里带的用 URL。系统模式不露认证框。

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
  - 系统：只读提示当前静态/环境变量代理，或「未检测到，将直连」。不露认证框。
  - 手动：类型 / 主机 / 端口同一行，用户名与密码下一行。
- 校验：手动时 host/port 必填。
- `watch`：`ssh && proxy` 时警告并关掉后勾的那一项（新 i18n 键）。
- **不要**恢复 SSH ↔ 集群/哨兵互斥（28 已放开）。

默认系统模式；手动时 `proxyType: 'http'`、`port: 8080`；提示 SOCKS 常见 1080。

---

## 五、导入与兼容

旧连接由 `conn-compat.ts` 补 `proxy: false` 与默认 `proxyOption`。
RedisME 自身 `.mec` / JSON **原样保留** `proxy` / `proxyOption`。
竞品导入**不映射代理**（TinyRDM / Another / Insight 一律未开代理），避免半套字段把原可直连的连接搞挂。

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
| 10  | 竞品导入                          | 不映射代理，连接为未开代理             |
| 10b | RedisME `.mec` 导入               | 保留 `proxy` / `proxyOption`           |
| 11  | 命令日志                          | 仍记录                                 |

静态：`cargo check`；改了 TS 则 `vp check`。

---

## 七、已确认（实施按此）

1. 系统代理勾选即检测/使用，**不按**目标主机做 loopback / `NO_PROXY` 绕过；连本机 Redis 时请自行关掉代理。
2. 系统模式不露用户名/密码框；URL 里带的认证照用。
3. Linux 只认环境变量，不读 GNOME/KDE。
4. 集群内网 IP + HTTP 出口代理：接受限制，连接文档写明。
5. 竞品导入不映射代理；RedisME 自身 `.mec` 原样保留代理字段。

代理只作用于该 Redis 连接；系统模式每次建连实时检测。

---

## 八、提交

一行标题，例如 `feat: add HTTP HTTPS SOCKS5 and system proxy`。

changelog / 连接文档写清四种手动类型 + 系统代理（环境变量与静态设置；不支持 PAC）。`future.md` 勾掉「网络代理」。
