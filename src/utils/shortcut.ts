/** 快捷键：展示格式、连接按键匹配、各页快捷键列表 */

import type { ComposerTranslation } from 'vue-i18n'

import type { ConnShortcutAction } from '@/types/me-interface'

/** 快捷键按键 token；`mod`/`shift`/`alt` 由 MeShortcut 按平台渲染；`[shift]` 表示可选 Shift */
export type ShortcutKey = 'mod' | 'shift' | 'alt' | '[shift]' | (string & {})

/** MeShortcut 列表项；各 get*Shortcuts 返回此结构 */
export interface ShortcutItem {
  /** 可点击项的动作 id（ConnEmpty 点击行时 emit） */
  id?: string
  label: string
  keys: ShortcutKey[]
  /** 与上一项之间加大间距，用于分组 */
  gapBefore?: boolean
}

export function isOptionalShortcutKey(key: ShortcutKey): boolean {
  return key === '[shift]'
}

/** 单键展示文案；MeShortcut 渲染 kbd 时调用 */
export function displayShortcutKey(key: ShortcutKey, isMacOS: boolean): string {
  if (key === 'mod') return isMacOS ? '⌘' : 'Ctrl'
  if (key === 'shift') return isMacOS ? '⇧' : 'Shift'
  if (key === '[shift]') return isMacOS ? '⇧' : 'Shift'
  if (key === 'alt') return isMacOS ? '⌥' : 'Alt'
  if (key === ',') return ','
  if (key === '?') return '?'
  if (key.length === 1 && /[a-zA-Z]/.test(key)) return key.toUpperCase()
  return key
}

/** kbd 样式类名；MeShortcut 渲染按键时调用 */
export function shortcutKbdClass(key: ShortcutKey, index: number, total: number): string {
  if (isOptionalShortcutKey(key)) return 'kbd-mod kbd-optional'
  if (key === 'mod' || key === 'shift' || key === 'alt') return 'kbd-mod'
  if (key.length > 1) return 'kbd-mod'
  if (index === total - 1 && /^[a-zA-Z0-9]$/.test(key)) return 'kbd-last'
  return 'kbd-mod'
}

/** 连接快捷键动作；AppMain.runConnAction、TabConn 分发 */
export type { ConnShortcutAction }

/** 焦点在输入框/可编辑区时不响应连接快捷键；matchConnShortcutAction 内部使用 */
export function isConnHotkeyBlocked(e: KeyboardEvent): boolean {
  const target = e.target
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.cm-editor, .t-container')) return true
  return !!target.closest('input, textarea, [contenteditable="true"]')
}

/** Ctrl+[,] 切换设置弹窗；Shift 可选，标点以 e.code 为准 */
function matchSettingShortcut(e: KeyboardEvent): boolean {
  if (e.altKey) return false
  return e.code === 'Comma' || e.key === ',' || e.key === '，'
}

/** Ctrl+? 切换快捷键弹窗；展示为 ?，Shift 可选，匹配 / 键 */
function matchShortcutTips(e: KeyboardEvent): boolean {
  if (e.altKey) return false
  return e.code === 'Slash' || e.key === '/' || e.key === '?' || e.key === '？'
}

/** 全局连接快捷键匹配；AppMain document keydown → runConnAction（标点键用 e.code）。与 getConnGlobalShortcuts 按键一致 */
export function matchConnShortcutAction(e: KeyboardEvent): ConnShortcutAction | null {
  if (!(e.ctrlKey || e.metaKey)) return null

  // 设置/快捷键 Tips 在输入框内也响应（与 VS Code 等一致），且优先于 isConnHotkeyBlocked
  if (matchSettingShortcut(e)) return 'setting'
  if (matchShortcutTips(e)) return 'shortcuts'

  if (e.altKey || isConnHotkeyBlocked(e)) return null

  if (e.shiftKey && (e.code === 'KeyN' || e.key === 'n' || e.key === 'N')) return 'add'
  if (e.shiftKey && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) return 'import'
  if (e.shiftKey && (e.code === 'KeyW' || e.key === 'w' || e.key === 'W')) return 'newWindow'
  return null
}

/** F11 全屏应用；AppMain 全局 keydown 匹配 */
export function matchAppFullscreenHotkey(e: KeyboardEvent): boolean {
  return e.key === 'F11' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
}

/** Editor / Terminal / Chart 自行处理 F11 时不触发窗口全屏 */
export function isAppFullscreenHotkeyBlocked(
  e: KeyboardEvent,
  ctx?: { tabName?: string },
): boolean {
  const target = e.target
  if (target instanceof HTMLElement) {
    if (target.closest('.cm-editor')) return true
    if (target.closest('.t-container')) return true
  }

  if (ctx?.tabName === 'chart') return true

  const fs = document.fullscreenElement
  if (fs instanceof HTMLElement) {
    if (fs.classList.contains('cm-editor') || fs.classList.contains('charts')) return true
  }

  return false
}

/** 连接页/设置页全局快捷键列表；ConnEmpty、Setting → MeShortcut */
export function getConnGlobalShortcuts(t: ComposerTranslation): ShortcutItem[] {
  return [
    { id: 'fullscreen', label: t('setting.appFullscreen'), keys: ['F11'] },
    { id: 'add', label: t('conn.add'), keys: ['mod', 'shift', 'N'] },
    { id: 'import', label: t('conn.import'), keys: ['mod', 'shift', 'O'] },
    { id: 'newWindow', label: t('conn.emptyNewWindow'), keys: ['mod', 'shift', 'W'] },
    { id: 'setting', label: t('conn.emptyAppSetting'), keys: ['mod', '[shift]', ','] },
    { id: 'shortcuts', label: t('setting.shortcutTips'), keys: ['mod', '[shift]', '?'] },
  ]
}

/** 键值页编辑器快捷键列表；RedisValue 快捷键弹窗 → MeShortcut */
export function getValueShortcuts(t: ComposerTranslation): ShortcutItem[] {
  return [
    { label: t('redisValue.keyShort.fullscreen'), keys: ['F11'] },
    { label: t('redisValue.keyShort.toggleWrap'), keys: ['mod', 'B'] },
    { label: t('redisValue.keyShort.toggleLineNumbers'), keys: ['mod', 'N'] },
    { label: t('redisValue.keyShort.fontIncrease'), keys: ['mod', '='], gapBefore: true },
    { label: t('redisValue.keyShort.fontDecrease'), keys: ['mod', '-'] },
    { label: t('redisValue.keyShort.fontReset'), keys: ['mod', '0'] },
    { label: t('redisValue.keyShort.find'), keys: ['mod', 'F'], gapBefore: true },
    { label: t('redisValue.keyShort.findNext'), keys: ['mod', 'G'] },
    { label: t('redisValue.keyShort.undo'), keys: ['mod', 'Z'] },
    { label: t('redisValue.keyShort.redo'), keys: ['mod', 'Y'] },
  ]
}

/** 终端页快捷键列表；RedisTerminal 快捷键弹窗 → MeShortcut */
export function getTerminalShortcuts(t: ComposerTranslation): ShortcutItem[] {
  return [
    { label: t('redisTerminal.keyShort.fullscreen'), keys: ['F11'] },
    { label: t('redisTerminal.keyShort.execute'), keys: ['Enter'] },
    { label: t('redisTerminal.keyShort.complete'), keys: ['Tab'] },
    { label: t('redisTerminal.keyShort.history'), keys: ['↑', '↓'] },
    { label: t('redisTerminal.keyShort.clearScreen'), keys: ['mod', 'L'], gapBefore: true },
    { label: t('redisTerminal.keyShort.clearInput'), keys: ['mod', 'C'] },
    { label: t('redisTerminal.keyShort.cursorStart'), keys: ['mod', 'A'] },
    { label: t('redisTerminal.keyShort.cursorEnd'), keys: ['mod', 'E'] },
    { label: t('redisTerminal.keyShort.toggleWrap'), keys: ['mod', 'B'] },
    { label: t('redisTerminal.keyShort.cmdClear'), keys: ['clear'], gapBefore: true },
    { label: t('redisTerminal.keyShort.cmdHelp'), keys: ['help'] },
    { label: t('redisTerminal.keyShort.cmdOpen'), keys: ['open'] },
  ]
}
