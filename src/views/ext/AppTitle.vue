<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { type as getOsType, version as getOsVersion } from '@tauri-apps/plugin-os'
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import { bus, meLog, meOk, OPEN_SETTING } from '@/utils/util'

const { t } = useI18n()

// 共享数据：与 AppMain 共用 App.vue provide 的同一份
const share = inject(shareProvideKey)!

// 切换只读/可写（顶部栏锁图标）
function changeReadonly(): void {
  share.readonly = !share.readonly
  meOk(share.readonly ? t('appMain.readonlyTip') : t('appMain.writableTip'))
}

const appWindow = getCurrentWindow()
const isFullScreen = ref(false)
const isMaximized = ref(false)

appWindow.onResized(async () => {
  isMaximized.value = await appWindow.isMaximized()
  isFullScreen.value = await appWindow.isFullscreen()
})

// MacOS 左侧留出红绿灯按钮 + 圆角空间；Tahoe (26+) 引入 Liquid Glass 大圆角(约26pt)需更多间距，此前 Big Sur~Sequoia (11~15) 为 10pt 小圆角
const isMacOS = getOsType() === 'macos'
const osVersionRaw = getOsVersion()
const osVersionMajor = parseInt(osVersionRaw, 10)
const isMacOSTahoePlus = isMacOS && osVersionMajor >= 26
meLog(
  '标题栏边距判断: os=',
  getOsType(),
  'version=',
  osVersionRaw,
  'major=',
  osVersionMajor,
  'tahoePlus=',
  isMacOSTahoePlus,
)
const marginLeft = computed(() => {
  if (isFullScreen.value) return '10px'
  if (!isMacOS) return '10px'
  return isMacOSTahoePlus ? '80px' : '70px'
})

// 当前生效主题：跟随系统时用系统主题，否则用设置值
const effectiveTheme = computed(() =>
  meTauri.settings.theme === 'system' ? meTauri.systemTheme : meTauri.settings.theme,
)
// 浅色太阳、深色月亮，表示当前主题
const themeIcon = computed(() =>
  effectiveTheme.value === 'dark' ? 'el-icon-moon' : 'el-icon-sunny',
)

// 在浅色 / 深色之间切换（跟随系统时按当前生效主题取反，并写成显式主题）
const toggleTheme = () => {
  const newTheme = effectiveTheme.value === 'light' ? 'dark' : 'light'
  meTauri.settings.theme = newTheme
  meOk(newTheme === 'dark' ? t('setting.dark') : t('setting.light'))
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
        @click="toggleTheme" />
      <div style="margin-left: 5px; font-size: 12px" @click="toggleName">RedisME</div>
    </div>
    <div class="title-right">
      <!-- 功能图标单独成组，彼此间距大于到窗口按钮的距离 -->
      <div class="title-actions">
        <!-- 只读/可写 -->
        <me-icon
          v-if="share.conn"
          class="action-icon"
          :icon="share.readonly ? 'me-icon-lock' : 'me-icon-unlock'"
          @click="changeReadonly" />
        <!-- 深浅色：太阳=浅色，月亮=深色 -->
        <me-icon class="action-icon" :icon="themeIcon" @click="toggleTheme" />
        <!-- 设置：弹窗挂在 KeyHeader，兄弟组件间经 bus 通知打开 -->
        <me-icon
          class="action-icon"
          icon="el-icon-setting"
          :style="{ marginRight: isMacOS ? '15px' : '-5px' }"
          @click="bus.emit(OPEN_SETTING)" />
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
  </div>
</template>

<style scoped lang="scss">
.title-bar {
  height: 30px;
  user-select: none;

  .title-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  /* 顶部栏功能图标（只读锁、深浅色、设置） */
  .action-icon {
    font-size: 16px;
    cursor: pointer;
    color: var(--el-color-info);

    &:hover {
      color: var(--el-color-primary);
    }
  }

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
