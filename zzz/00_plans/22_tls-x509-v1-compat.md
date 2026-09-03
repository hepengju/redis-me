# 22. TLS 兼容服务端 X.509 v1 证书

> **类型**：设计文档（已实施，待手测验收）  
> **关联 backlog**：`docs/zh/changelog/future.md`（TLS X.509 v1 兼容）  
> **关联**：`21_redis-service-install.md`（CentOS 7 / OpenSSL 1.0.2 自签 v1 场景）、`src-tauri/src/utils/conn.rs`  
> **日期**：2026-09-03

---

## 一、目标（钉死）

| 项       | 结论                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 用户目标 | **服务端**使用 X.509 **v1** 证书（常见于 CentOS 7 + OpenSSL 1.0.2 默认签发）时，RedisME **能正常连上**       |
| 非目标   | OpenSSH 证书认证（`xxx-cert.pub`）；要求用户/server 侧升级证书；切 `tls-native-tls` 拆掉现有 mTLS 三文件能力 |
| 原则     | **怎么简单怎么来**，少动打包链、少动连接 UI                                                                  |

---

## 二、背景：CentOS 7 典型失败

安装帮助脚本在 **OpenSSL 1.0.2**（CentOS 7 自带）上执行时，未显式写扩展项时默认产出 **X.509 v1**（`Version: 1 (0x0)`）。Redis 进程能加载 PEM 并启动，但 RedisME 连接报 **SSL 建立失败**。

Redis 默认 `tls-auth-clients yes`，连接侧通常勾选 SSL 并填写：

- 公钥 `redis.crt`
- 私钥 `redis.key`
- CA `ca.crt`

三文件在旧环境往往**全是 v1**。

---

## 三、根因（rustls / webpki，非 Redis 配置）

RedisME 使用 `redis` crate **`tls-rustls`** + **`tls-rustls-insecure`**（`#insecure` 片段）。

| 层级            | 行为                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `rustls-webpki` | 解析/校验证书时 **只允许 X.509 v3**（ASN.1 version = 2）；v1 报 `UnsupportedCertVersion`                              |
| `redis-rs` mTLS | `TlsCertificates` / `build_with_tls` / 集群 `certs()` / 哨兵 `set_client_to_*_certificates` **仅实现于 `tls-rustls`** |
| RedisME SSL     | 凡勾选 SSL 即 `url.set_fragment(Some("insecure"))`，服务端主机名/链校验已放宽                                         |

### 失败点拆解（CentOS 7 三文件 v1）

| 阶段                    | v1 对象          | 当前行为                                                  | 是否阻塞连接 |
| ----------------------- | ---------------- | --------------------------------------------------------- | ------------ |
| 加载 trust store        | `ca.crt` (v1)    | `RootCertStore::add` → webpki 解析失败                    | **是**       |
| 加载客户端证            | `redis.crt` (v1) | `with_client_auth_cert`（rustls ≥0.23.23）解析客户端证    | **是**       |
| TLS 握手（服务端回 v1） | 服务端证书       | `#insecure` → `NoCertificateVerification`，**一般不解析** | 通常 **否**  |

结论：用户感知的「服务端 v1 连不上」，多数是 **客户端加载 CA/客户端证** 阶段就失败，而不一定是握手验服务端证失败。

---

## 四、已排除方案

### 4.1 纯换 `tls-native-tls`

| 点       | 说明                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 优点     | 系统 OpenSSL/SChannel 对 v1 更宽容                                                                                      |
| 致命缺点 | `redis-rs` **未**为 native-tls 暴露 `TlsCertificates` / `build_with_tls` / 集群·哨兵 mTLS；仅 `rediss://` + `#insecure` |
| 影响     | 连接页 **公钥/私钥/CA 三文件**、Redis 默认 mTLS、集群/哨兵自定义证 **全部失效**                                         |
| 结论     | **不采用**（除非产品放弃 mTLS 三文件，与现状不符）                                                                      |

### 4.2 Pin `rustls = 0.23.22`

动机：[rustls#2364](https://github.com/rustls/rustls/issues/2364) — 0.23.22 的 `with_client_auth_cert` 对 v1 客户端证「碰巧能加载」，0.23.23 起故意收紧。

**实测（2026-09-03，本仓库 `cargo check`）**：

```
error[E0599]: no variant named `NotValidForNameContext` found for enum `CertificateError`
  --> redis-1.6.0/src/connection.rs:760
```

`redis` **1.6.0** 已依赖较新 rustls API（`CertificateError::NotValidForNameContext`），与 **0.23.22 不兼容**。

| 点   | 说明                                                                                          |
| ---- | --------------------------------------------------------------------------------------------- |
| 结论 | **不可行**；与「redis-rs 最新 + 项目内 rustls 0.23.43 + reqwest/tauri 同树」冲突              |
| 备注 | 即便强行降级 rustls，还有 `hyper-rustls` / `tokio-rustls` / `tauri-plugin-updater` 等同树依赖 |

### 4.3 客户端侧把 v1 PEM「重签成 v3」

| 点   | 说明                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| 问题 | v1 → v3 必须 **重新签名**；CA 签发的 `redis.crt` 需要 **ca.key**，连接 UI **不提供** |
| 结论 | 无法作为通用方案；仅适用于「自签 + 用户手头有私钥」的窄场景                          |

### 4.4 等 webpki 官方支持 v1

[rustls/webpki#29](https://github.com/rustls/webpki/issues/29) 已 **关闭拒绝**（2023）；维护方认为 v1 多为错误默认、收益不足。

### 4.5 私有 fork `rustls-webpki` 放开 v1

可行但 **长期维护成本高**，与「怎么简单怎么来」不符，作备选不上线。

---

## 五、推荐方案（保留 rustls + 最小补丁）

分两档：**必做（RedisME 内）** + **客户端 v1 证（需动 redis-rs 或等价绕开解析）**。

### 5.1 必做：v1 的 CA 不装入 `RootCertStore`

**位置**：`get_tls_certs()`（`conn.rs` 或抽出 `tls_cert.rs`）

**逻辑**：

1. 读取 `ssl_option.ca` PEM
2. 若判定为 **X.509 v1** → **`root_cert = None`**，打 `info!` 日志（不报错）
3. 仍传递 `client_tls`（cert + key）

**依据**：

- 已 `#insecure`，本来就不严格验服务端链；省略 v1 CA **不改变**现有安全模型
- 避免 `RootCertStore::add` 在配置阶段就 `UnsupportedCertVersion`
- mTLS 仍成立：Redis **服务端**用 CA 验 **客户端证**；客户端不必把 v1 CA 塞进 rustls trust store 也能发客户端证

**版本检测**：用 **`x509-parser`**（纯 Rust，无 OpenSSL 原生依赖，利于 Tauri 跨平台编译），或极小 PEM→DER + version 字段解析；**不要**为只读检测引入 `openssl/vendored`（拖慢 CI）。

### 5.2 客户端 v1 证：绕开 `with_client_auth_cert` 的 webpki 解析

rustls 官方建议（[rustls#1918 评论](https://github.com/rustls/rustls/issues/1918#issuecomment-2232945160)）：用 **`with_client_cert_resolver`** + 实现 `ResolvesClientCert`，**原样提供 DER/PEM 字节**，不让 webpki 在加载阶段解析 v1。

**问题**：`redis-rs` 1.6.0 在 `create_rustls_config` 里写死 `with_client_auth_cert`（`connection.rs` ~1200 行），**无配置开关**。

**可选实现路径**（按推荐顺序）：

| 路径                                        | 工作量      | 说明                                                                                                                     |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A. `[patch.crates-io]` 极小 patch redis** | 中          | fork / 本地 vendor 改 `create_rustls_config`：客户端证走 `with_client_cert_resolver`；或 v1 时走 resolver、v3 仍走原路径 |
| **B. 上游 PR redis-rs**                     | 高 + 等发布 | 长期正确，短期不解决 CentOS 7                                                                                            |
| **C. RedisME 自管 TLS 建连**                | 高          | 绕过 `redis` 内置 TLS，重复连接/集群/哨兵逻辑，**不采用**                                                                |

**推荐 A 的 patch 要点**（设计级，实施时再落代码）：

```text
retrieve_tls_certificates()  // 仍可 PEM → CertificateDer / PrivateKeyDer（仅解码，不 webpki 验版本）
create_rustls_config()
  若存在 client_tls_params:
    - 现：with_client_auth_cert(chain, key)  // 0.23.23+ 会 parse v1 失败
    - 改：with_client_cert_resolver(Arc<StaticClientCertResolver { chain, key }>)
  root_cert_store:
    - 保持；RedisME 侧已对 v1 CA 不传 root（见 5.1）
  insecure:
    - 保持 NoCertificateVerification（已有）
```

**风险**：resolver 路径不做「公钥与私钥是否匹配」预检（rustls 0.23.11+ 在 `with_client_auth_cert` 才做）；错配时握手失败、错误信息更晦涩 — 可接受，与旧版 rustls 行为一致。

### 5.3 服务端 v1 握手

在 5.1 + 5.2 完成后，**单机** `#insecure` 已跳过 webpki。  
**集群/哨兵**须用 `TlsMode::Insecure`（不可用 `Secure` + `danger_accept_invalid_hostnames`：后者仍走 `WebPkiServerVerifier`，v1 服务端证报 `UnsupportedCertVersion`）。  
另：`ClusterClientBuilder::certs()` 会在 `tls` 未设时强制 `TlsMode::Secure`，须在 `certs()` 前先 `.tls(TlsMode::Insecure)`。

---

## 六、不涉及 / 文档修正

| 项                                  | 处理                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `future.md`「旧版 SSH 证书 x509v1」 | 改为 **TLS X.509 v1 兼容**，与 SSH 无关                                       |
| 证书生成脚本                        | 已要求 OpenSSL ≥1.1.1 / 推荐 3.x 产出 v3；**不**为兼容 v1 回退脚本            |
| 连接 UI                             | **不改**（仍三文件 PEM）                                                      |
| `Cargo.toml` rustls 版本            | **显式** `0.23.43`（与 redis 1.6 API 及 dependency 树统一；不可 pin 0.23.22） |

---

## 七、实施步骤（建议顺序）

1. **探测 + 省略 v1 CA**（仅 RedisME）
   - 新增 `is_x509_v1_pem()` + 改 `get_tls_certs()`
   - 单测：v1/v3 PEM 样本各一
2. **patch redis-rs**（`[patch.crates-io]` 指向 fork 分支，或 `src-tauri/vendor/redis`）
   - `create_rustls_config` 客户端证改 `with_client_cert_resolver`
   - 注释标明：兼容 X.509 v1 客户端证，对齐 rustls#1918 / #2364
3. **`cargo check` 全平台** + 手测 CentOS 7 三文件 v1
4. **回归**：v3 三文件、仅 SSL 无文件、`#insecure`、集群/哨兵 SSL
5. **changelog** + 从 `future.md` 移除或标完成

---

## 八、验收标准

| #   | 场景                                                                  | 期望                               |
| --- | --------------------------------------------------------------------- | ---------------------------------- |
| 1   | CentOS 7 脚本生成的 v1 `ca.crt` + `redis.crt` + `redis.key`，单机 SSL | 测试连接 + 正常读写                |
| 2   | 仅勾选 SSL、不填三文件，服务端 v1                                     | 能连（insecure）                   |
| 3   | 现有 v3 三文件（脚本 `-addext` 产出）                                 | 与现网行为一致                     |
| 4   | 集群 / 哨兵 + SSL + 三文件 v1                                         | 能连（同 patch 路径）              |
| 5   | pin rustls 0.23.22                                                    | **不**作为依赖策略（已证编译失败） |

---

## 九、风险与回滚

| 风险                      | 缓解                                                           |
| ------------------------- | -------------------------------------------------------------- |
| patch redis-rs 与上游漂移 | patch 尽量小（仅 resolver 分支）；发版前对照 redis 新版本 diff |
| 客户端证/私钥不匹配       | 文档/错误提示说明；不阻塞 v1 兼容主路径                        |
| 省略 v1 CA + insecure     | 与当前产品选择一致；不在本文扩大安全承诺                       |

回滚：去掉 `[patch.crates-io]` + 还原 `get_tls_certs` 即可恢复现行为。

---

## 十、决策摘要

| 决策               | 选择                                             |
| ------------------ | ------------------------------------------------ |
| TLS 后端           | **继续 rustls**（`tls-rustls`）                  |
| native-tls         | **否**                                           |
| pin rustls 0.23.22 | **否**（与 redis 1.6 API 不兼容，已实测）        |
| v1 CA              | **不装入** root store（insecure 下）             |
| v1 客户端证        | **patch redis-rs** → `with_client_cert_resolver` |
| 服务端 v1 握手     | 依赖现有 `#insecure`，5.1+5.2 后验证             |

---

## 附录：Pin rustls 0.23.22 实测记录

```text
# Cargo.toml 临时改为 rustls = { version = "=0.23.22", ... }
cargo check
→ redis v1.6.0 编译失败：CertificateError::NotValidForNameContext 不存在于 0.23.22
```

当前 lock：`rustls v0.23.43`，与 `redis`、`reqwest`、`tauri-plugin-updater` 同树。
