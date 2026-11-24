<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { type as getOsType, version as getOsVersion } from '@tauri-apps/plugin-os'
import { computed, inject, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'

import { appProvideKey, shareProvideKey } from '@/types/me-interface'
import { meDownloadUpdate } from '@/utils/app/app-update'
import { bus, CHECK_UPDATE, meLog, meOk, meOpenUrl, OPEN_SETTING } from '@/utils/app/util'

const { t } = useI18n()

// 共享数据：与 AppMain 共用 App.vue provide 的同一份
const share = inject(shareProvideKey)!
const app = inject(appProvideKey)!

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
// 应用商店安装由商店负责更新，标题栏不放检查更新入口
const isAppStore = meTauri.isAppStore

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
  effectiveTheme.value === 'dark' ? 'me-icon-moon' : 'el-icon-sunny',
)

// 在浅色 / 深色之间切换（跟随系统时按当前生效主题取反，并写成显式主题）
const toggleTheme = () => {
  const newTheme = effectiveTheme.value === 'light' ? 'dark' : 'light'
  meTauri.settings.theme = newTheme
}

function openGithub(): void {
  meOpenUrl('https://github.com/hepengju/redis-me')
}

// 已有新版本时只显示左侧「更新」按钮；检查更新图标藏起，避免同一图形出现两次
const hasUpdate = computed(() => !!app.update?.version)
const updateTip = computed(() => t('util.updateReady', { version: app.update?.version ?? '' }))
function onCheckUpdate(): void {
  bus.emit(CHECK_UPDATE)
}
function downloadUpdate(): void {
  const update = app.update
  if (!update?.version || app.downloading) return
  void meDownloadUpdate(false, toRaw(update), app)
}

// 点击名称切换语言或未来其他功能的快速测试验证
const toggleName = () => {
  const nowLanguage =
    meTauri.settings.language === 'system' ? meTauri.systemLanguage : meTauri.settings.language
  const newLanguage = nowLanguage === 'en' ? 'zhCN' : 'en'
  meTauri.settings.language = newLanguage
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
      <!-- 已发现新版本：图标组最左侧，点击直接下载；此时藏起检查更新图标 -->
      <div v-if="!isAppStore && hasUpdate" class="update-ready">
        <me-button
          type="primary"
          size="small"
          icon="me-icon-check-update"
          placement="bottom"
          :info="updateTip"
          :disabled="app.downloading"
          @click="downloadUpdate"
          >{{ t('setting.update') }}</me-button
        >
      </div>
      <!-- 功能图标各占 32px 方块并紧挨成组，右侧与窗口按钮背景贴齐 -->
      <div class="title-actions">
        <!-- 只读/可写 -->
        <me-icon
          v-if="share.conn"
          class="action-icon"
          :icon="share.readonly ? 'me-icon-lock' : 'me-icon-unlock'"
          :name="share.readonly ? t('appMain.readonly') : t('appMain.writable')"
          hint
          placement="bottom"
          @click="changeReadonly" />
        <!-- 深浅色：太阳=浅色，月亮=深色 -->
        <me-icon
          class="action-icon"
          :icon="themeIcon"
          :name="t('setting.theme')"
          hint
          placement="bottom"
          @click="toggleTheme" />
        <!-- 检查更新：仅非应用商店版本，且还没有新版本 -->
        <me-icon
          v-if="!isAppStore && !hasUpdate"
          class="action-icon"
          icon="me-icon-check-update"
          :name="t('setting.updateNow')"
          hint
          placement="bottom"
          @click="onCheckUpdate" />
        <!-- GitHub：打开仓库主页 -->
        <me-icon
          class="action-icon"
          icon="me-icon-github"
          name="GitHub"
          hint
          placement="bottom"
          @click="openGithub" />
        <!-- 设置：弹窗挂在 KeyHeader，兄弟组件间经 bus 通知打开。macOS 无窗口按钮，右侧 8px 与页签「更多」等图标字形对齐（内容右缘 8+5=13，再减设置热区比更多宽出的 (32-22)/2） -->
        <me-icon
          class="action-icon"
          icon="el-icon-setting"
          :name="t('setting.title')"
          hint
          placement="bottom"
          :style="isMacOS ? { marginRight: '8px' } : undefined"
          @click="bus.emit(OPEN_SETTING)" />
      </div>
      <div class="title-buttons" v-if="!isMacOS">
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
  height: 32px;
  user-select: none;

  .title-right {
    display: flex;
    align-items: center;
    align-self: stretch;
    gap: 10px;
  }

  /* 窗口按钮拉满标题栏高度，悬停背景与标题栏上下对齐；负边距抵消 gap，与设置图标贴齐 */
  .title-buttons {
    display: flex;
    align-self: stretch;
    height: 100%;
    margin-left: -10px;
    font-size: 12px;
  }

  .title-actions {
    display: flex;
    align-items: center;
    align-self: stretch;
    height: 100%;
  }

  /* 有新版本时的按钮，比 32px 标题栏矮一截，避免贴满整条 */
  .update-ready {
    display: flex;
    align-items: center;

    :deep(.el-button) {
      height: 24px;
      padding: 0 10px;
    }
  }

  /* 顶部栏功能图标（只读锁、深浅色、检查更新、GitHub、设置）：32×32 方块紧挨，悬停背景与窗口按钮同色 */
  .action-icon {
    width: 32px;
    height: 100%;
    flex: 0 0 32px;
    font-size: 16px;
    cursor: pointer;
    color: var(--el-color-info);
    justify-content: center;

    &:hover {
      color: var(--el-color-primary);
      background: var(--el-color-info-light-7);
    }
  }

  .title-button {
    width: 40px;
    height: 100%;
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
