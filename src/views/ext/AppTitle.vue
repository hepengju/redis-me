<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { type as getOsType } from '@tauri-apps/plugin-os'
import { computed, ref } from 'vue'

import { meOk } from '@/utils/util'

const appWindow = getCurrentWindow()
const isFullScreen = ref(false)
const isMaximized = ref(false)

appWindow.onResized(async () => {
  isMaximized.value = await appWindow.isMaximized()
  isFullScreen.value = await appWindow.isFullscreen()
})

// MacOS 左侧留出红绿灯按钮 + 圆角空间
const isMacOS = getOsType() === 'macos'
const marginLeft = computed(() => {
  if (isFullScreen.value) return '5px'
  return isMacOS ? '80px' : '5px'
})

// 点击图标切换主题
const toggleIcon = () => {
  const nowTheme =
    meTauri.settings.theme === 'system' ? meTauri.systemTheme : meTauri.settings.theme
  const newTheme = nowTheme === 'light' ? 'dark' : 'light'
  meTauri.settings.theme = newTheme
  meOk(newTheme)
}

// 点击名称切换语言或未来其他功能的快速测试验证
const toggleName = () => {
  const nowLanguage =
    meTauri.settings.language === 'system' ? meTauri.systemLanguage : meTauri.settings.language
  const newLanguage = nowLanguage === 'en' ? 'zhCN' : 'en'
  meTauri.settings.language = newLanguage
  meOk(newLanguage)
}
</script>

<template>
  <div data-tauri-drag-region class="title-bar me-flex">
    <div class="me-flex" style="align-items: center" :style="{ marginLeft }">
      <me-icon
        icon="me-icon-redis-me"
        class="icon-btn"
        style="font-size: 16px"
        @click="toggleIcon" />
      <div style="margin-left: 5px; font-size: 12px" @click="toggleName">RedisME</div>
    </div>
    <div style="font-size: 12px" v-if="!isMacOS">
      <me-icon
        icon="me-icon-window-minimize"
        class="title-button normal-btn"
        @click="appWindow.minimize()" />
      <me-icon
        icon="me-icon-window-maximize"
        class="title-button normal-btn"
        @click="appWindow.toggleMaximize()"
        v-show="!isMaximized" />
      <me-icon
        icon="me-icon-window-restore"
        class="title-button normal-btn"
        @click="appWindow.toggleMaximize()"
        v-show="isMaximized" />
      <me-icon
        icon="me-icon-window-close"
        class="title-button danger-btn"
        @click="appWindow.close()" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.title-bar {
  height: 30px;
  user-select: none;

  .title-button {
    width: 40px;
    height: 30px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    user-select: none;
    -webkit-user-select: none;
  }

  .normal-btn:hover {
    background: var(--el-color-info-light-7);
  }

  .danger-btn:hover {
    background: var(--el-color-danger);
  }
}
</style>
