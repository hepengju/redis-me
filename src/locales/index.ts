import { createI18n } from 'vue-i18n'

import en from './lang/en'
import zhCN from './lang/zh-cn'

export type AppLocale = 'zhCN' | 'en'

/** BCP-47 / POSIX 系统 locale → 应用 i18n 键；macOS 常见 zh-Hans-CN，不能只 replace 第一个 '-' */
export function normalizeAppLocale(raw: string | null | undefined): AppLocale {
  if (!raw) return 'en'
  const tag = raw.trim().replace(/_/g, '-').toLowerCase()
  if (tag.startsWith('zh')) return 'zhCN'
  return 'en'
}

// 创建 i18n
const i18n = createI18n({
  legacy: false,
  globalInjection: false, // 不注入 $t，组件内统一用 useI18n() 的 t
  locale: 'en',
  fallbackLocale: 'en',
  messages: { zhCN, en },
  warnHtmlMessage: false, // 关闭html警告
})

export default i18n
