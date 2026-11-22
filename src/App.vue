<script setup lang="ts">
import { type as getOsType } from '@tauri-apps/plugin-os'
import { provide, reactive, shallowReactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  appProvideKey,
  shareProvideKey,
  type AppMainInject,
  type AppMainShare,
  type UiConn,
} from '@/types/me-interface'
import { isDark } from '@/utils/app/util'
import AppResize from '@/views/app/AppResize.vue'
import AppTitle from '@/views/app/AppTitle.vue'
import AppMain from '@/views/AppMain.vue'

const { locale: i18nLocale } = useI18n()

// 共享数据：AppMain 与顶部栏 AppTitle 是兄弟组件，统一在本父组件创建并 provide
const share = reactive<AppMainShare>({
  conn: null,
  connList: meTauri.connList as UiConn[],
  nodeList: [],
  loading: false,
  color: 'var(--el-color-primary)',
  readonly: false,
  redisKey: null,
  tabName: 'info',
  dbSizeMap: {},

  exportImporting: false,
  exportImportingTip: '',
  exportImportingPercentage: 0,

  capabilities: {
    version: '',
    isValkey: false,
    infoSupported: false,
    aclSupported: false,
    aclDryrunSupported: false,
    aclSelectorSupported: false,
    httlSupported: false,
    clusterDbSupported: false,
    redisSearchSupported: false,
    memoryUsageSupported: false,
  },
})
provide(shareProvideKey, share)

// 更新状态同样放在父组件：标题栏要在已有新版本时显示「更新」按钮，AppMain 负责检查与下载
// shallowReactive：Update 含私有字段，deep reactive 会解成普通对象
const app = shallowReactive<AppMainInject>({
  update: null,
  downloading: false,
  downloadPercentage: 0,
})
provide(appProvideKey, app)

/** 供 CSS 按平台作用：Linux WebKitGTK 字体补丁等（非 WebView 自动注入） */
const osType = getOsType()
document.documentElement.setAttribute('data-platform', osType)

// 主题切换
watch(
  () => meTauri.settings.theme,
  newValue => {
    const newTheme = newValue === 'system' ? meTauri.systemTheme : newValue
    isDark.value = newTheme === 'dark'
  },
  { immediate: true },
)

const locale = shallowRef<Record<string, unknown> | undefined>(undefined)
watch(
  () => meTauri.settings.language,
  newValue => {
    const language = String(newValue === 'system' ? meTauri.systemLanguage : (newValue ?? 'en'))
    const map = window.ElementPlusLanguageMap as Record<string, Record<string, unknown>> | undefined
    locale.value = map?.[language] as Record<string, unknown> | undefined
    i18nLocale.value = language
  },
  { immediate: true },
)

/** 设置里的字体栈 → CSS；未选择返回空，由 App.css :root 兜底 */
function fontStackToCss(v: string | string[] | undefined): string {
  if (v == null || v === '') return ''
  if (Array.isArray(v)) return v.filter(Boolean).join(', ')
  return v
}

function applyCssVar(name: string, value: string) {
  if (value) document.documentElement.style.setProperty(name, value)
  else document.documentElement.style.removeProperty(name)
}

// 字体切换：有选择才覆盖，否则沿用 App.css --ui-font / --code-font
watch(
  () => fontStackToCss(meTauri.settings.uiFont),
  v => applyCssVar('--ui-font', v),
  { immediate: true },
)
watch(
  () => fontStackToCss(meTauri.settings.codeFont),
  v => applyCssVar('--code-font', v),
  { immediate: true },
)
</script>

<template>
  <el-config-provider :locale>
    <AppTitle />
    <AppResize />
    <AppMain />
  </el-config-provider>
</template>

<style lang="scss">
#app {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;
}
</style>
