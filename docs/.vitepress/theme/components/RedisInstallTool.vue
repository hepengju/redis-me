<script setup lang="ts">
/**
 * 官网 Redis Docker 安装助手：复用 src/utils/redis-install-gen.ts，原生表单 + 可复制产物。
 * 与桌面端 RedisInstall.vue 字段对齐；外链与 TLS 证书入口放在 Markdown 正文。
 */
import { useData } from 'vitepress'
import { computed, reactive, ref, watch } from 'vue'

import type {
  RedisInstallLabels,
  RedisInstallMode,
  RedisInstallOptions,
} from '../../../../src/utils/redis-install-gen'
import { genInstallDefaultPort, genRedisInstall } from '../../../../src/utils/redis-install-gen'
import ComboInput from './ComboInput.vue'

const { lang } = useData()
const isZh = computed(() => lang.value.startsWith('zh'))

const ZH = {
  mode: '部署模式',
  modeSingle: '单机',
  modeCluster: '集群',
  modeSentinel: '哨兵',
  image: '镜像',
  alpine: 'Alpine',
  ips: '节点 IP',
  ipsPlaceholder: '多机用分号分隔，如 192.168.1.10;192.168.1.11',
  basePort: '基准端口',
  port: '端口',
  password: '密码',
  passwordPlaceholder: '留空则无密码',
  clusterMasters: '主节点数',
  clusterReplicas: '每主从数',
  sentinelReplicas: '从节点数',
  sentinelCount: '哨兵数',
  mountData: '数据外置',
  mountConf: '配置外置',
  ssl: 'TLS 加密',
  timezone: '时区',
  tzPlaceholder: '选择或输入',
  tabGuide: '分步指南',
  tabCommands: 'Docker Run',
  tabCompose: 'Docker Compose',
  machine: '机器',
  stepEnv: '环境准备',
  stepConf: '写入配置文件',
  stepCert: '准备 TLS 证书',
  stepStart: '启动容器',
  stepCluster: '初始化集群',
  stepVerify: '验证',
  composeFile: 'compose 文件',
  reviewCompose: '如需调整请先编辑',
}

const EN = {
  mode: 'Deploy Mode',
  modeSingle: 'Single',
  modeCluster: 'Cluster',
  modeSentinel: 'Sentinel',
  image: 'Image',
  alpine: 'Alpine',
  ips: 'Node IPs',
  ipsPlaceholder: 'Separate multiple IPs with semicolons, e.g. 192.168.1.10;192.168.1.11',
  basePort: 'Base Port',
  port: 'Port',
  password: 'Password',
  passwordPlaceholder: 'Empty for no password',
  clusterMasters: 'Masters',
  clusterReplicas: 'Repl./Master',
  sentinelReplicas: 'Replicas',
  sentinelCount: 'Sentinels',
  mountData: 'Mount Data',
  mountConf: 'Volume Conf',
  ssl: 'TLS',
  timezone: 'Timezone',
  tzPlaceholder: 'Select or type',
  tabGuide: 'Step Guide',
  tabCommands: 'Docker Run',
  tabCompose: 'Docker Compose',
  machine: 'Machine',
  stepEnv: 'Prepare Environment',
  stepConf: 'Write Config Files',
  stepCert: 'Prepare TLS Certificates',
  stepStart: 'Start Containers',
  stepCluster: 'Initialize Cluster',
  stepVerify: 'Verify',
  composeFile: 'compose file',
  reviewCompose: 'Review and adjust if needed',
}

const t = computed(() => (isZh.value ? ZH : EN))

const form = reactive({
  mode: 'single' as RedisInstallMode,
  image: 'redis:8',
  alpine: false,
  ipsText: '',
  basePort: 6379,
  password: '',
  clusterMasters: 3,
  clusterReplicasPerMaster: 1,
  sentinelReplicas: 1,
  sentinelCount: 3,
  mountData: true,
  mountConf: true,
  ssl: false,
  timezone: 'Asia/Shanghai',
})

watch(
  () => form.mode,
  mode => {
    form.basePort = genInstallDefaultPort(mode)
    // 哨兵必须挂载 sentinel.conf，禁用开关时保持勾选以免和实际产物不一致
    if (mode === 'sentinel') form.mountConf = true
  },
)

const ips = computed(() => form.ipsText.split(/[;,，\s]+/).filter(ip => ip.trim().length > 0))

const options = computed<RedisInstallOptions>(() => ({
  mode: form.mode,
  image: form.image.trim() || 'redis:8',
  alpine: form.alpine,
  ips: form.mode === 'single' ? [] : ips.value,
  basePort: Number(form.basePort) || genInstallDefaultPort(form.mode),
  password: form.password,
  clusterMasters: Number(form.clusterMasters) || 1,
  clusterReplicasPerMaster: Math.max(0, Number(form.clusterReplicasPerMaster) || 0),
  sentinelReplicas: Math.max(0, Number(form.sentinelReplicas) || 0),
  sentinelCount: Number(form.sentinelCount) || 1,
  mountData: form.mountData,
  mountConf: form.mountConf,
  ssl: form.ssl,
  timezone: form.timezone,
}))

const labels = computed<RedisInstallLabels>(() => ({
  machine: t.value.machine,
  stepEnv: t.value.stepEnv,
  stepConf: t.value.stepConf,
  stepCert: t.value.stepCert,
  stepStart: t.value.stepStart,
  stepCluster: t.value.stepCluster,
  stepVerify: t.value.stepVerify,
  composeFile: t.value.composeFile,
  reviewCompose: t.value.reviewCompose,
}))

const output = computed(() => genRedisInstall(options.value, labels.value))
const activeTab = ref('guide')

/** 多机时 compose / docker run 各有一块，官网拼在一起避免只看到第一台 */
function joinSteps(steps: { title: string; code: string }[]): string {
  if (steps.length <= 1) return steps[0]?.code ?? ''
  return steps.map(s => `# === ${s.title} ===\n${s.code}`).join('\n\n')
}

const tabs = computed(() => [
  { name: 'guide', label: t.value.tabGuide, lang: 'bash', code: output.value.guide[0]?.code ?? '' },
  {
    name: 'compose',
    label: t.value.tabCompose,
    lang: 'yaml',
    code: joinSteps(output.value.compose),
  },
  {
    name: 'commands',
    label: t.value.tabCommands,
    lang: 'bash',
    code: joinSteps(output.value.commands),
  },
])

const currentTab = computed(
  () => tabs.value.find(tab => tab.name === activeTab.value) ?? tabs.value[0],
)

const imageOptions = [
  { value: 'redis:8' },
  { value: 'redis:7' },
  { value: 'redis:6' },
  { value: 'valkey/valkey:9' },
  { value: 'valkey/valkey:8' },
]
const timezoneOptions = [
  { value: 'Asia/Shanghai', hint: 'UTC+8' },
  { value: 'Asia/Tokyo', hint: 'UTC+9' },
  { value: 'Asia/Singapore', hint: 'UTC+8' },
  { value: 'UTC', hint: 'UTC+0' },
  { value: 'Europe/London', hint: 'UTC+0' },
  { value: 'Europe/Paris', hint: 'UTC+1' },
  { value: 'America/New_York', hint: 'UTC-5' },
  { value: 'America/Los_Angeles', hint: 'UTC-8' },
]
</script>

<template>
  <div class="me-tool ri-tool">
    <div class="ri-side">
      <div class="ri-form">
        <span class="ri-label">{{ t.mode }}</span>
        <div class="ri-seg" role="group">
          <button
            type="button"
            :class="{ on: form.mode === 'single' }"
            @click="form.mode = 'single'">
            {{ t.modeSingle }}
          </button>
          <button
            type="button"
            :class="{ on: form.mode === 'cluster' }"
            @click="form.mode = 'cluster'">
            {{ t.modeCluster }}
          </button>
          <button
            type="button"
            :class="{ on: form.mode === 'sentinel' }"
            @click="form.mode = 'sentinel'">
            {{ t.modeSentinel }}
          </button>
        </div>

        <span class="ri-label">{{ t.image }}</span>
        <div class="ri-image-row">
          <ComboInput v-model="form.image" :options="imageOptions" />
          <label class="ri-check">
            <input v-model="form.alpine" type="checkbox" />
            {{ t.alpine }}
          </label>
        </div>

        <template v-if="form.mode !== 'single'">
          <span class="ri-label">{{ t.ips }}</span>
          <input
            v-model="form.ipsText"
            type="text"
            :placeholder="t.ipsPlaceholder"
            spellcheck="false" />
        </template>

        <span class="ri-label">{{ form.mode === 'single' ? t.port : t.basePort }}</span>
        <input v-model.number="form.basePort" type="number" min="1024" max="45000" />

        <span class="ri-label">{{ t.password }}</span>
        <input
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          :placeholder="t.passwordPlaceholder" />

        <template v-if="form.mode === 'cluster'">
          <span class="ri-label">{{ t.clusterMasters }}</span>
          <input v-model.number="form.clusterMasters" type="number" min="1" max="20" />
          <span class="ri-label">{{ t.clusterReplicas }}</span>
          <input v-model.number="form.clusterReplicasPerMaster" type="number" min="0" max="3" />
        </template>

        <template v-if="form.mode === 'sentinel'">
          <span class="ri-label">{{ t.sentinelReplicas }}</span>
          <input v-model.number="form.sentinelReplicas" type="number" min="0" max="5" />
          <span class="ri-label">{{ t.sentinelCount }}</span>
          <input v-model.number="form.sentinelCount" type="number" min="1" max="9" />
        </template>

        <span class="ri-label">{{ t.mountData }}</span>
        <label class="ri-check">
          <input v-model="form.mountData" type="checkbox" />
        </label>

        <span class="ri-label">{{ t.mountConf }}</span>
        <label class="ri-check">
          <input v-model="form.mountConf" type="checkbox" :disabled="form.mode === 'sentinel'" />
        </label>

        <span class="ri-label">{{ t.ssl }}</span>
        <label class="ri-check">
          <input v-model="form.ssl" type="checkbox" />
        </label>

        <span class="ri-label">{{ t.timezone }}</span>
        <ComboInput
          v-model="form.timezone"
          :options="timezoneOptions"
          :placeholder="t.tzPlaceholder" />
      </div>
    </div>

    <div class="ri-main">
      <div class="ri-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.name"
          type="button"
          :class="{ on: activeTab === tab.name }"
          @click="activeTab = tab.name">
          {{ tab.label }}
        </button>
      </div>
      <!-- 结构对齐 VitePress Markdown 代码块，复制走官方 useCopyCode -->
      <div :class="'language-' + currentTab.lang">
        <button title="Copy code" data-copied="Copied" class="copy" />
        <span class="lang">{{ currentTab.lang }}</span>
        <pre tabindex="0"><code>{{ currentTab.code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ri-tool {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 1rem 0 0;
  align-items: stretch;
}

.ri-side {
  flex: 1 1 260px;
  max-width: 340px;
  overflow: visible;
}

.ri-main {
  flex: 1 1 360px;
  min-width: 0;
}

.ri-form {
  display: grid;
  grid-template-columns: 6.2rem 1fr;
  gap: 10px 10px;
  align-items: center;
}

.ri-label {
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.3;
}

.ri-seg {
  display: flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}

.ri-seg button {
  flex: 1;
  margin: 0;
  padding: 5px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 13px;
  cursor: pointer;
}

.ri-seg button + button {
  border-left: 1px solid var(--vp-c-divider);
}

.ri-seg button.on {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.ri-image-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ri-image-row :deep(.ri-combo) {
  flex: 1;
}

.ri-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  color: var(--vp-c-text-2);
  cursor: pointer;
  white-space: nowrap;
}

.ri-check:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.7;
}

.ri-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.ri-tabs button {
  margin: 0;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 13px;
  cursor: pointer;
}

.ri-tabs button.on {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

@media (max-width: 959px) {
  .ri-side {
    max-width: none;
  }
}
</style>
