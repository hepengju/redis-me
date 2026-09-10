<script setup lang="ts">
// #region 导入
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RedisInstallLabels, RedisInstallOptions } from '@/utils/redis-install-gen'
import { genInstallDefaultPort, genInstallSans, genRedisInstall } from '@/utils/redis-install-gen'
import { meOpenUrl } from '@/utils/util'
import TlsCertGen from '@/views/ext/TlsCertGen.vue'
// #endregion

// #region 核心状态
const { t } = useI18n()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
// 组件由父组件 v-if 控制，创建即意味着要展示
const visible = ref(true)
const activeTab = ref('guide')

// 表单状态（默认值即推荐配置：host 网络、持久化与配置外置默认开）
const form = reactive({
  mode: 'single' as RedisInstallOptions['mode'],
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

// 证书生成弹框引用
const certGenRef = ref<InstanceType<typeof TlsCertGen>>()

// 弹框关闭时通知父组件卸载（v-if 销毁 → 下次打开自动全新实例）
watch(visible, v => {
  if (!v) emit('update:modelValue', false)
})
// #endregion

// #region 生成器入参与产物
// 节点 IP：单输入框分号/逗号/空白分隔多机
const ips = computed(() => form.ipsText.split(/[;,，\s]+/).filter(ip => ip.trim().length > 0))

const options = computed<RedisInstallOptions>(() => ({
  mode: form.mode,
  image: form.image,
  alpine: form.alpine,
  // 单机部署在本机，无需 IP 输入
  ips: form.mode === 'single' ? [] : ips.value,
  basePort: form.basePort,
  password: form.password,
  clusterMasters: form.clusterMasters,
  clusterReplicasPerMaster: form.clusterReplicasPerMaster,
  sentinelReplicas: form.sentinelReplicas,
  sentinelCount: form.sentinelCount,
  mountData: form.mountData,
  mountConf: form.mountConf,
  ssl: form.ssl,
  timezone: form.timezone,
}))

const labels = computed<RedisInstallLabels>(() => ({
  machine: t('redisInstall.machine'),
  stepEnv: t('redisInstall.stepEnv'),
  stepConf: t('redisInstall.stepConf'),
  stepCert: t('redisInstall.stepCert'),
  stepStart: t('redisInstall.stepStart'),
  stepCluster: t('redisInstall.stepCluster'),
  stepVerify: t('redisInstall.stepVerify'),
  composeFile: t('redisInstall.composeFile'),
  reviewCompose: t('redisInstall.reviewCompose'),
}))

const output = computed(() => genRedisInstall(options.value, labels.value))

// 切换模式或 TLS 时跟随推荐起始端口（明文 6379/7001/7701，TLS 6380/8001/8801）
watch(
  () => [form.mode, form.ssl] as const,
  ([mode, ssl]) => {
    form.basePort = genInstallDefaultPort(mode, ssl)
  },
)

// 证书 SAN（传给证书生成弹框）
const sans = computed(() => genInstallSans(options.value))

const tabs = computed(() => [
  { name: 'guide', label: t('redisInstall.tabGuide'), steps: output.value.guide },
  { name: 'compose', label: t('redisInstall.tabCompose'), steps: output.value.compose },
  { name: 'commands', label: t('redisInstall.tabCommands'), steps: output.value.commands },
])
// #endregion

// #region 下拉选项
const imageOptions = ['redis:8', 'redis:7', 'redis:6', 'valkey/valkey:9', 'valkey/valkey:8']
const timezoneOptions = [
  { name: 'Asia/Shanghai', offset: 'UTC+8' },
  { name: 'Asia/Tokyo', offset: 'UTC+9' },
  { name: 'Asia/Singapore', offset: 'UTC+8' },
  { name: 'UTC', offset: 'UTC+0' },
  { name: 'Europe/London', offset: 'UTC+0' },
  { name: 'Europe/Paris', offset: 'UTC+1' },
  { name: 'America/New_York', offset: 'UTC-5' },
  { name: 'America/Los_Angeles', offset: 'UTC-8' },
]
// #endregion
</script>

<template>
  <me-dialog
    v-model="visible"
    :title="t('redisInstall.title')"
    icon="me-icon-redis"
    width="85%"
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    class="redis-install-dialog">
    <!-- 标题栏外链：官方镜像仓库 / 官方安装文档 -->
    <template #header-extra>
      <div class="ri-header-links">
        <el-link underline="never" @click="meOpenUrl('https://hub.docker.com/_/redis')">
          {{ t('redisInstall.dockerHub') }}
        </el-link>
        <div>|</div>
        <el-link
          underline="never"
          @click="
            meOpenUrl(
              'https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/docker/',
            )
          ">
          {{ t('redisInstall.installDoc') }}
        </el-link>
      </div>
    </template>

    <div class="ri-body">
      <!-- 左侧表单 -->
      <div class="ri-form">
        <el-form label-position="right" label-width="110">
          <el-form-item :label="t('redisInstall.mode')">
            <el-radio-group v-model="form.mode">
              <el-radio-button value="single">{{ t('redisInstall.modeSingle') }}</el-radio-button>
              <el-radio-button value="cluster">{{ t('redisInstall.modeCluster') }}</el-radio-button>
              <el-radio-button value="sentinel">{{
                t('redisInstall.modeSentinel')
              }}</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item :label="t('redisInstall.ssl')">
            <div class="ri-ssl-row">
              <el-switch v-model="form.ssl" />
              <el-button v-if="form.ssl" link type="primary" @click="certGenRef?.open()">
                {{ t('redisInstall.genCert') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item :label="t('redisInstall.image')">
            <div class="ri-image-row">
              <el-select
                v-model="form.image"
                filterable
                allow-create
                default-first-option
                class="ri-image-select">
                <el-option v-for="img in imageOptions" :key="img" :label="img" :value="img" />
              </el-select>
              <el-switch v-model="form.alpine" :active-text="t('redisInstall.alpine')" />
            </div>
          </el-form-item>

          <el-form-item v-if="form.mode !== 'single'" :label="t('redisInstall.ips')">
            <el-input v-model="form.ipsText" :placeholder="t('redisInstall.ipsPlaceholder')" />
          </el-form-item>

          <el-form-item
            :label="form.mode === 'single' ? t('redisInstall.port') : t('redisInstall.basePort')">
            <el-input-number v-model="form.basePort" :min="1024" :max="45000" />
          </el-form-item>

          <el-form-item :label="t('redisInstall.password')">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              clearable
              :placeholder="t('redisInstall.passwordPlaceholder')" />
          </el-form-item>

          <template v-if="form.mode === 'cluster'">
            <el-form-item :label="t('redisInstall.clusterMasters')">
              <el-input-number v-model="form.clusterMasters" :min="1" :max="20" />
            </el-form-item>
            <el-form-item :label="t('redisInstall.clusterReplicas')">
              <el-input-number v-model="form.clusterReplicasPerMaster" :min="0" :max="3" />
            </el-form-item>
          </template>

          <template v-if="form.mode === 'sentinel'">
            <el-form-item :label="t('redisInstall.sentinelReplicas')">
              <el-input-number v-model="form.sentinelReplicas" :min="0" :max="5" />
            </el-form-item>
            <el-form-item :label="t('redisInstall.sentinelCount')">
              <el-input-number v-model="form.sentinelCount" :min="1" :max="9" />
            </el-form-item>
          </template>

          <el-form-item :label="t('redisInstall.mountData')">
            <el-switch v-model="form.mountData" />
          </el-form-item>

          <el-form-item :label="t('redisInstall.mountConf')">
            <el-switch v-model="form.mountConf" :disabled="form.mode === 'sentinel'" />
          </el-form-item>

          <el-form-item :label="t('redisInstall.timezone')">
            <el-select
              v-model="form.timezone"
              filterable
              clearable
              allow-create
              default-first-option
              :placeholder="t('redisInstall.tzPlaceholder')">
              <el-option v-for="tz in timezoneOptions" :key="tz.name" :value="tz.name">
                <span style="display: flex; justify-content: space-between; width: 100%">
                  <span>{{ tz.name }}</span>
                  <span style="color: var(--el-text-color-secondary)">{{ tz.offset }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <!-- 右侧产物 -->
      <div class="ri-output">
        <el-tabs v-model="activeTab" class="ri-tabs">
          <el-tab-pane v-for="tab in tabs" :key="tab.name" :label="tab.label" :name="tab.name">
            <me-code
              :model-value="tab.steps[0].code"
              :mode="tab.steps[0].lang"
              copyable
              style="height: 100%" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 证书生成弹框（独立工具，仅接收自动 SAN） -->
    <TlsCertGen ref="certGenRef" :sans="sans" />
  </me-dialog>
</template>

<style scoped lang="scss">
.ri-body {
  display: flex;
  height: 100%;
  gap: 12px;
}

.ri-form {
  margin-top: 10px;
  width: 360px;
  flex-shrink: 0;
  overflow-y: auto;
  padding-right: 8px;

  :deep(.el-form-item__label) {
    white-space: nowrap;
  }

  .ri-image-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;

    .ri-image-select {
      flex: 1;
    }
  }

  .ri-ssl-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.ri-header-links {
  display: flex;
  gap: 10px;
  margin-left: auto;
  margin-right: 16px;
  align-items: baseline;
}

.ri-output {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ri-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    flex-shrink: 0;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  :deep(.el-tab-pane) {
    height: 100%;
  }
}
</style>

<!-- append-to-body 的 dialog 脱离组件作用域，需全局样式覆盖 -->
<style lang="scss">
.redis-install-dialog .me-dialog-body {
  height: 80vh;
}
</style>
