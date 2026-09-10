<script setup lang="ts">
/**
 * 官网 TLS 证书脚本助手：复用 genOpensslCertScript，与 Redis Docker 安装页分开。
 * 仅生成 openssl 命令文本，不在浏览器内签发证书。
 */
import { useData } from 'vitepress'
import { computed, reactive } from 'vue'

import type { RedisCertLabels } from '../../../../src/utils/redis-install-gen'
import { genOpensslCertScript } from '../../../../src/utils/redis-install-gen'

const { lang } = useData()
const isZh = computed(() => lang.value.startsWith('zh'))

const ZH = {
  sans: 'SAN',
  sansPlaceholder: 'IP 或域名，分号/逗号/空白分隔',
  cn: '证书 CN',
  days: '有效天数',
  scriptTitle: 'Redis TLS 自签证书（推荐 OpenSSL >= 3.2，默认签发 X.509 v3）',
  scriptOutput: '产出: ca.key ca.crt redis.key redis.crt',
  step1Title: '第一步：生成 CA（ca.key + ca.crt）',
  step2Title: '第二步：生成服务器私钥与 CSR（含 SAN）',
  step3Title: '第三步：CA 签发服务器证书',
  step4Title: '第四步：验证',
}

const EN = {
  sans: 'SAN',
  sansPlaceholder: 'IPs or hostnames, separated by semicolons/commas/spaces',
  cn: 'Cert CN',
  days: 'Valid Days',
  scriptTitle: 'Redis TLS (OpenSSL >= 3.2 recommended; X.509 v3 by default)',
  scriptOutput: 'Output: ca.key ca.crt redis.key redis.crt',
  step1Title: 'Step 1: Generate CA (ca.key + ca.crt)',
  step2Title: 'Step 2: Generate server key and CSR (with SAN)',
  step3Title: 'Step 3: Sign server certificate with CA',
  step4Title: 'Step 4: Verify',
}

const t = computed(() => (isZh.value ? ZH : EN))

const form = reactive({ sansText: '127.0.0.1;localhost', certCn: 'redis', certDays: 36500 })

function parseSans(text: string): string[] {
  const list = text.split(/[;,，\s]+/).filter(s => s.trim().length > 0)
  return list.length > 0 ? list : ['127.0.0.1', 'localhost']
}

const labels = computed<RedisCertLabels>(() => ({
  scriptTitle: t.value.scriptTitle,
  scriptOutput: t.value.scriptOutput,
  step1Title: t.value.step1Title,
  step2Title: t.value.step2Title,
  step3Title: t.value.step3Title,
  step4Title: t.value.step4Title,
}))

const script = computed(() =>
  genOpensslCertScript({
    sans: parseSans(form.sansText),
    certDays: Number(form.certDays) || 36500,
    certCn: form.certCn.trim() || 'redis',
    labels: labels.value,
  }),
)
</script>

<template>
  <div class="me-tool tc-tool">
    <div class="tc-form">
      <span class="tc-label">{{ t.sans }}</span>
      <input
        v-model="form.sansText"
        type="text"
        :placeholder="t.sansPlaceholder"
        spellcheck="false" />

      <span class="tc-label">{{ t.cn }}</span>
      <input v-model="form.certCn" type="text" spellcheck="false" />

      <span class="tc-label">{{ t.days }}</span>
      <input v-model.number="form.certDays" type="number" min="1" max="36500" />
    </div>

    <!-- 结构对齐 VitePress Markdown 代码块，复制走官方 useCopyCode -->
    <div class="language-bash">
      <button title="Copy code" data-copied="Copied" class="copy" />
      <span class="lang">bash</span>
      <pre tabindex="0"><code>{{ script }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.tc-tool {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 1rem 0 0;
}

.tc-form {
  display: grid;
  grid-template-columns: 6.2rem 1fr;
  gap: 10px 10px;
  align-items: center;
  max-width: 520px;
}

.tc-label {
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.3;
}
</style>
