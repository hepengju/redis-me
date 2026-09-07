---
aside: false
---

<script setup>
import RedisInstallTool from '../../../.vitepress/theme/components/RedisInstallTool.vue'
</script>

# Redis Docker 安装

按目标环境填表，生成可复制到 **Linux** 服务器执行的 Docker 脚本。与 RedisME 客户端内「Redis 安装帮助」使用同一套生成器。

仅覆盖 Docker（`docker run` / Compose），不做裸机、systemd 或 Kubernetes。集群与哨兵使用 host 网络，请填写宿主机可达 IP。开启 TLS 后请到 [TLS 证书](./tls-cert) 生成 openssl 脚本。

参考：[Docker Hub](https://hub.docker.com/_/redis) · [官方安装文档](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/docker/)

<RedisInstallTool />
