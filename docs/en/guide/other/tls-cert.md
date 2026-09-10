---
aside: false
---

<script setup>
import TlsCertTool from '../../../.vitepress/theme/components/TlsCertTool.vue'
</script>

# TLS Certificate

Generate an OpenSSL script for a Redis TLS **self-signed** certificate (for reference only). OpenSSL >= 3.2 is recommended (X.509 v3 by default).

Output: `ca.key` `ca.crt` `redis.key` `redis.crt`.

Use with [Redis Docker Setup](./redis-install): copy the files into the `/data/redis-*/cert` directory noted in the install script.

<TlsCertTool />
