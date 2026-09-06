# redis-rs 本地 patch（RedisME）

- **上游版本**：crates.io `redis` 1.7.0
- **原因**：兼容 X.509 v1 客户端证书（CentOS 7 / OpenSSL 1.0.2 等），见 `zzz/00_plans/22_tls-x509-v1-compat.md`
- **相对上游仅改 1 个源码文件**（另加本说明）：
  - `src/connection.rs` → `create_rustls_config`：客户端证改用 `CertifiedKey::new` + `with_client_cert_resolver`，避免 `with_client_auth_cert` 经 webpki 拒绝 v1

> 集群/哨兵服务端 v1 握手、v1 CA 跳过 trust store 等逻辑在 **RedisME** `src-tauri/src/utils/conn.rs` / `tls_cert.rs`，不在此 patch 内。

## 如何查看改了什么

在仓库根目录执行（Windows Git Bash / Linux 均可）：

```bash
# 与 crates.io 已下载的 redis 1.7.0 对比（需本地 cargo 曾拉过 redis）
diff -u \
  ~/.cargo/registry/src/*/redis-1.7.0/src/connection.rs \
  src-tauri/third-party/redis-rs/src/connection.rs

# 或只看 patch 目录相对上游的差异文件列表
diff -rq ~/.cargo/registry/src/*/redis-1.7.0 src-tauri/third-party/redis-rs \
  | grep -v target
```

应只有 `PATCH.md`（新增）和 `src/connection.rs`（修改）。

## 升级 redis-rs 时

1. 用新版本覆盖 `third-party/redis-rs/`
2. 按上面 `diff` 思路把 `create_rustls_config` 中客户端证分支重新合并
3. `cargo check` + CentOS7 v1 三文件手测
