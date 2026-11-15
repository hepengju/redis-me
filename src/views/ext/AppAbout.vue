<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { meOpenUrl } from '@/utils/app/util'

const { t } = useI18n()
const visible = ref(false)
const appVersion = ref('')

function open() {
  visible.value = true
}

defineExpose({ open })
getVersion()
  .then(res => (appVersion.value = res))
  .catch(() => {})

function openSourceCode(): void {
  meOpenUrl('https://github.com/hepengju/redis-me')
}

function openOfficialWebsite(): void {
  meOpenUrl('https://www.hepengju.com')
}
</script>

<template>
  <el-dialog v-model="visible" width="400" align-center draggable>
    <div class="app-info">
      <me-icon icon="me-icon-redis-me" class="app-icon" />
      <div class="app-name">RedisME</div>
      <div class="app-version">v{{ appVersion }}</div>
      <div class="app-site">
        <el-link underline="never" @click="openSourceCode">{{ t('about.sourceCode') }}</el-link>
        <div class="sep"></div>
        <el-link underline="never" @click="openOfficialWebsite">{{
          t('about.officialWebsite')
        }}</el-link>
      </div>
      <div class="app-copyright">Copyright © 2025 hepengju.com All Rights Reserved</div>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.app-info {
  margin: 0 auto;
  height: 220px;
  text-align: center;

  .app-icon {
    justify-content: center;
    font-size: 70px;
    margin-top: 10px;
  }

  .app-name {
    font-size: 20px;
    font-weight: bold;
    margin-top: 30px;
  }

  .app-version {
    margin-top: 20px;
    font-size: 16px;
  }

  .app-site {
    margin: 10px;
    display: flex;
    justify-content: center;

    .sep {
      margin: 0 10px;
      border: 0.5px solid var(--el-color-info);
    }
  }

  .app-copyright {
    font-size: 12px;
    color: var(--el-color-info);
  }
}
</style>
