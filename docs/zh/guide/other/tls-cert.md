---
aside: false
---

<script setup>
import TlsCertTool from '../../../.vitepress/theme/components/TlsCertTool.vue'
</script>

# TLS 证书

生成 Redis TLS **自签证书** 的 OpenSSL 脚本，仅供参考。推荐 OpenSSL >= 3.2（默认签发 X.509 v3）。

产出文件：`ca.key` `ca.crt` `redis.key` `redis.crt`。

配合 [Redis Docker 安装](./redis-install) 使用：将证书拷到生成脚本中注明的 `/data/redis-*/cert` 目录。

<TlsCertTool />
