/** 顶栏页签的注册表、可用性判断与可见集合清洗（纯函数，便于单测） */
// 注册顺序同时决定页签栏与下拉菜单的顺序；可见集合只决定哪些页签显示
import { defaultSettings } from '@/utils/app/settings-defaults'

export const TAB_NAMES = [
  'info',
  'value',
  'terminal',
  'memory',
  'slow',
  'pubsub',
  'chart',
  'acl',
  'config',
  'search',
  'workbench',
  'client',
  'notify',
  'monitor',
] as const

export type TabName = (typeof TAB_NAMES)[number]

/** 决定哪些页签在当前连接下可用（与 TabMain 的渲染条件一致） */
export interface TabAvailabilityCtx {
  /** 极简模式：只保留键值、终端、工作台 */
  minimal: boolean
  infoSupported: boolean
  searchSupported: boolean
  memorySupported: boolean
  /** 服务端支持 ACL（客户端/配置只看 INFO，ACL 还要这一位） */
  aclSupported: boolean
}

export function isTabName(value: unknown): value is TabName {
  return typeof value === 'string' && (TAB_NAMES as readonly string[]).includes(value)
}

export function isTabAvailable(name: TabName, ctx: TabAvailabilityCtx): boolean {
  // 键值、终端、工作台：极简模式也保留
  if (name === 'value' || name === 'terminal' || name === 'workbench') return true
  if (ctx.minimal) return false
  if (name === 'info' || name === 'chart' || name === 'client' || name === 'config') {
    return ctx.infoSupported
  }
  if (name === 'acl') return ctx.infoSupported && ctx.aclSupported
  if (name === 'search') return ctx.searchSupported
  if (name === 'memory') return ctx.memorySupported
  // 慢日志、命令监控、发布订阅、键通知
  return true
}

/** 清洗持久化的可见集合：去未知名称、去重复、按注册顺序排列；为空时用默认值 */
export function normalizeTabsVisible(value: unknown, fallback: readonly TabName[]): TabName[] {
  const list = Array.isArray(value) ? value.filter(isTabName) : []
  const visible = TAB_NAMES.filter(name => list.includes(name))
  return visible.length ? visible : [...fallback]
}

/** 默认可见集合：按注册顺序排好，供「恢复默认」与设置项兜底 */
export const DEFAULT_TABS_VISIBLE: TabName[] = normalizeTabsVisible(
  defaultSettings.tabsVisible,
  TAB_NAMES,
)

/** 从持久化设置里取清洗后的可见集合（默认集合兜底），AppMain / TabMain / 启动归一化共用 */
export function resolveTabsVisible(saved: unknown): TabName[] {
  return normalizeTabsVisible(saved, DEFAULT_TABS_VISIBLE)
}

/** 连上后落到"可见集合里注册顺序最靠前的可用页签"，都不会命中时回落到第一个可用页签 */
export function firstAvailableTab(visible: readonly TabName[], ctx: TabAvailabilityCtx): TabName {
  return (
    TAB_NAMES.find(name => visible.includes(name) && isTabAvailable(name, ctx)) ??
    TAB_NAMES.find(name => isTabAvailable(name, ctx)) ??
    'value'
  )
}
