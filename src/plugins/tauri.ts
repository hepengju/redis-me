import { Window } from '@tauri-apps/api/window'
import { locale } from '@tauri-apps/plugin-os'
import { LazyStore } from '@tauri-apps/plugin-store'
import { reactive, watch } from 'vue'
import type { App } from 'vue'

import { normalizeAppLocale } from '@/locales'
import { commands } from '@/types/tauri-specta'
import { checkConnList, type ConnFromStore } from '@/utils/conn-compat'
import { defaultSettings } from '@/utils/settings-defaults'
import { meLog } from '@/utils/util'

// 打包后关闭右键菜单
if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', event => event.preventDefault())
}

// 系统主题、语言、存储等
const systemTheme = (await new Window('main').theme()) ?? 'light'
const rawSystemLocale = await locale()
const systemLanguage = normalizeAppLocale(rawSystemLocale)
meLog('系统主题:', systemTheme, '系统语言:', systemLanguage, 'raw:', rawSystemLocale)

// 应用商店安装时禁用内置升级，改由各商店 / 系统更新管道负责
const isAppStore = await commands.isAppStore()
meLog('应用商店安装:', isAppStore)

// 存储及初始化数据读取
const store = new LazyStore('store.json')
const connList = ((await store.get('connList')) as ConnFromStore[] | null | undefined) ?? []
meLog('读取连接:', connList)
checkConnList(connList) // 初始化的时候就检查1次，以便兼容旧版本数据

const rawSettings = await store.get('settings')
meLog('读取设置:', rawSettings)
const storeSettings =
  rawSettings !== null && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
    ? (rawSettings as Record<string, unknown>)
    : {}
const settings = { ...defaultSettings, ...storeSettings }
if (settings.fieldShow !== 'auto' && settings.fieldShow !== 'table') settings.fieldShow = 'auto'
if (settings.fieldShowView !== 'json' && settings.fieldShowView !== 'table')
  settings.fieldShowView = 'table'
if (typeof settings.hashFieldTtl !== 'boolean') settings.hashFieldTtl = false
// delete settings.keyLabel // v3.5+ 移除键名称全称/简称，统一简称
if (!Array.isArray(settings.connGroups)) settings.connGroups = []
if (settings.connShow !== 'flat' && settings.connShow !== 'group') settings.connShow = 'flat'
if (
  !settings.connGroupExpanded ||
  typeof settings.connGroupExpanded !== 'object' ||
  Array.isArray(settings.connGroupExpanded)
) {
  settings.connGroupExpanded = {}
}
if (!Array.isArray(settings.customCodecs)) settings.customCodecs = []
if (typeof settings.codecExecTimeoutSec !== 'number' || settings.codecExecTimeoutSec <= 0) {
  settings.codecExecTimeoutSec = 5
}
if (typeof settings.commandTimeout !== 'number' || settings.commandTimeout <= 0) {
  settings.commandTimeout = 30
} else {
  settings.commandTimeout = Math.min(300, Math.max(5, Math.round(settings.commandTimeout)))
}
if (typeof settings.connectTimeout !== 'number' || settings.connectTimeout <= 0) {
  settings.connectTimeout = 10
} else {
  settings.connectTimeout = Math.min(300, Math.max(5, Math.round(settings.connectTimeout)))
}
// 预览字节设置项暂未开放，旧默认 1000 视为未自定义
if (settings.valuePreviewBytes === 1000) {
  settings.valuePreviewBytes = defaultSettings.valuePreviewBytes
}

/** 全局设置同步 Rust AppState（建连/命令超时等） */
async function syncAppSettings(): Promise<void> {
  await commands.appSettings({
    connectionTimeoutSecs: settings.connectTimeout,
    commandTimeoutSecs: settings.commandTimeout,
  })
}
await syncAppSettings()
const meTauri = reactive({
  // 响应式，自动保存
  connList,
  settings,

  // 纯记录
  systemTheme,
  systemLanguage,
  isAppStore,
})
// 放在Window全局变量中方便使用
window.meTauri = meTauri as MeTauriGlobal

// 配置保存
watch(meTauri, async newValue => {
  meLog('持久化连接和设置')
  await store.set('connList', newValue.connList)
  await store.set('settings', newValue.settings)
  await syncAppSettings()
})

export default function setupTauri(_app: App): void {}
