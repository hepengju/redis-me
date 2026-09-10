---
aside: false
---

<script setup>
import RedisInstallTool from '../../../.vitepress/theme/components/RedisInstallTool.vue'
</script>

# Redis Docker Setup

Fill in the target environment to generate Docker scripts you can copy onto a **Linux** host. This page uses the same generator as RedisME's in-app Redis Install helper.

Docker only (`docker run` / Compose) — not bare-metal, systemd, or Kubernetes. Cluster and Sentinel use host networking; enter a reachable host IP. For TLS, generate an openssl script on [TLS Certificate](./tls-cert).

See also: [Docker Hub](https://hub.docker.com/_/redis) · [Official Install Doc](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/docker/)

<RedisInstallTool />
