# 28. SshDialer：SSH 支持单机 / 集群 / 哨兵

> **类型**：实施计划（已实施）  
> **总设计**：[`26_custom-connection-dialer.md`](./26_custom-connection-dialer.md)（SSH 与代理同一套 Dialer，本阶段只落地 SSH）  
> **前置**：[`27_connection-dialer-fork.md`](./27_connection-dialer-fork.md) 已合入  
> **下一阶段**：[`29_proxy-http-socks5.md`](./29_proxy-http-socks5.md)

---

## 一、本阶段目标

用 `SshDialer` 替换 `ssh_tunnel.rs` 本地监听：一条 SSH 会话、每条 Redis 连接一个 `direct_tcpip` channel。**SSH 可用于单机 / 集群 / 哨兵。** subscribe / monitor / `ConnConfig::masters` 复用同一会话。

**本阶段不做代理**（字段、UI、HttpDialer 全部留给 29）。接线时预留 `Option<Arc<dyn ConnectionDialer>>`，29 只加 `proxy` 分支。

**也不做**：SSH 经代理再跳转；砍专用 Runtime。

---

## 二、SshDialer 原则（相对旧隧道）

| 旧 `SshTunnel`                               | 新 `SshDialer`                                        |
| -------------------------------------------- | ----------------------------------------------------- |
| 绑定 `127.0.0.1:0`，目标写死为种子 host:port | `dial(host, port)` 时才 `channel_open_direct_tcpip`   |
| 每个本地 TCP **新建 SSH 会话**               | `connect()` 一次认证，会话复用                        |
| 独立 `Runtime`                               | **仍独立 Runtime**（Tauri worker 上 `block_on` 会炸） |
| `MeSingle.ssh_tunnel` 保活                   | Dialer 在 `Client` 内；单机 subscribe 用同一 Client   |
| 集群/哨兵直接 bail                           | 放开；前端去掉 `sshModeTip` 互斥                      |

russh `Handle` 若 `Clone + Send`：用 `Arc<Handle>`，**不要**在持锁期间 `block_on`。`dial()` 在专用 runtime 上开 channel，包成 `RedisStream`（必须实现超时，禁止 no-op）。

`check_server_key` 仍接受全部（与现网一致）；不扩 known_hosts。

---

## 三、所有权与 `get_client_*` 签名

`MeSingle` 已有 `client`，Dialer 在 Client 里，**不要**再加 `ssh_dialer` 字段。`MeCluster` 用 `cluster_client.dialer()` 传给旁路 `get_client_single`。

```text
单机：Client::open / build_with_tls 后 .set_dialer(d)
      subscribe/monitor → self.client.get_connection_with_timeout（同一 Client，不必再取 dialer）
集群：ClusterClient::builder(...).dialer(d)
      subscribe/monitor → get_client_single(..., cluster_client.dialer())
哨兵：SentinelClientBuilder::set_dialer(d) 后 get_client()
      禁止先 Client::open 再丢掉换成 sentinel（现 get_client_single 就是这样，28 必须改掉）
```

```rust
pub fn get_client_single(
    conf: &ConnConfig,
    connect_timeout: Duration,
    verify: bool,
    existing: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<(Client, Option<Arc<dyn ConnectionDialer>>)>;
```

接线（只用 27 已冻结的 API，禁止再改 fork）：

- `existing` 为 Some → 用它；否则 `conf.ssh` → `SshDialer::connect`。
- **非哨兵**：`Client::open(url)` 或 `build_with_tls(url, tls)`，再 `.set_dialer(d)`（TLS 先 build 再 set，不必动 `inner_build_with_tls`）。
- **哨兵**：`get_client_sentinel(conf, Some(d))` → `SentinelClientBuilder::set_dialer` → `build()?.get_client()`。**不要**先建一个无 Dialer 的 Client 再覆盖。
- **集群**：`ClusterClient::builder(urls).dialer(d)`（seed URL 上不必 set dialer；节点走 `get_connection_info`）。
- URL 用真实 `conf.host:conf.port`，不要改写 `127.0.0.1`。
- 返回的第二段 Arc 给 `MeCluster` 旁路用；单机可只靠 Client。
- `dial(host, port, timeout: Option)`：`None` 时 SshDialer 用 `connect()` 时记下的超时。

`SshDialer` 错误：`RedisError::from(io::Error::new(...))`。keepalive 只设 russh `Config`；会话已断则 `dial` 持锁重连一次。

调用点：`conn.rs`（`get_client_sentinel` 增加 dialer 参数）、`impl_single.rs`、`impl_cluster.rs`、`client/mod.rs` 测试、`ConnConfig::test` / `masters`。本阶段无 `proxy` 字段。

**禁止**在 28 再改 redis-rs。缺 API 只允许回补 27 后 bump，不要在 RedisME 分支上改 fork。

---

## 四、删除与前端

| 删除 / 放开                                                          | 说明                                     |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `ssh_tunnel.rs`                                                      | 手测通过后删除；逻辑迁到 `ssh_dialer.rs` |
| `MeSingle.ssh_tunnel`                                                | 删除；Dialer 在 `Client` 内              |
| `AppError::ClusterNotSupported` / `SentinelNotSupported` 的 SSH 用法 | 仅用于 SSH 则删枚举 + i18n               |
| `ConnSave.vue` 三处 SSH ↔ 集群/哨兵 `watch`                          | 删除；`sshModeTip` 可删                  |
| 代理勾选                                                             | **不要加**（29）                         |

`ConnConfig::test` 注释「集群模式不支持 SSH」一并改掉。手测通过后再删 `ssh_tunnel.rs`。

---

## 五、验收

| #   | 场景                              | 期望                                         |
| --- | --------------------------------- | -------------------------------------------- |
| 1   | SSH + 单机读写                    | 与旧隧道等价；密码/私钥两种登录              |
| 2   | SSH + `rediss`                    | channel 上再 TLS                             |
| 3   | SSH + 集群                        | 节点均经 SSH；读写/槽路由正常                |
| 4   | SSH + 哨兵                        | 发现 master 并读写；`masters()` 自动发现可用 |
| 5   | 会话复用                          | 命令 + subscribe 或 monitor 仍一条 SSH 会话  |
| 6   | 集群 subscribe / monitor 指定节点 | 不新开 SSH 会话（日志里「SSH 认证」只一次）  |
| 7   | 命令超时 / 建连超时               | 仍生效，不挂死                               |
| 8   | 直连                              | 回归                                         |
| 9   | 旧配置仅 `ssh: true`              | 无需新字段即可连                             |

静态：`cargo check`。changelog / 连接文档：SSH 支持集群和哨兵。`future.md` 勾掉「SSH 隧道支持集群和哨兵」。

---

## 六、提交

一行标题，例如 `feat: SSH tunnel via SshDialer for cluster and sentinel`。
