// 应用级通用工具；以下 `// #region` / `// #endregion` 可在 VS Code / Cursor 中折叠浏览。
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useClipboard, useDark } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ElMessageBoxOptions } from 'element-plus'
import JSON5 from 'json5'
import { applyEdits, format } from 'jsonc-parser'
import { sampleSize } from 'lodash'
import mitt from 'mitt'
import { computed } from 'vue'

import i18n from '@/locales'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { invalidateKeyMemory } from '@/utils/key-memory-cache'
import { invalidateKeyType } from '@/utils/key-type-cache'
import { formatSpectaErrorForUser, meCommands, meErr, meLog } from '@/utils/me-commands'

export { formatSpectaErrorForUser, meCommands, meErr, meLog }

/** 全局 `bus` 事件载荷（与 `bus.emit` / `bus.on` 一致） */
export type MeBusEvents = {
  KEY_DELETE: RedisKey_Deserialize
  /** 重命名成功：oldKey 为改名前快照，newKey 为服务端返回；用于刷新键树 / 收藏 */
  KEY_RENAME: { oldKey: RedisKey_Deserialize; newKey: RedisKey_Deserialize }
  /** 载荷未使用；监听器应 `() => refreshKey()` 包装，避免与多参函数签名冲突 */
  KEY_REFRESH: undefined
  /** Hash/JSON 键详情预填的 FT.CREATE。搜索页可能尚未挂载，配合 takeSearchCreateDraft */
  SEARCH_CREATE: string
  INFO_REFRESH: boolean | undefined
  CONN_REFRESH: void
  /** 打开设置弹窗：顶部栏设置图标 emit，KeyHeader（挂载 AppSetting）监听 */
  OPEN_SETTING: void
  /** 终端里 SELECT 成功：终端 emit（载荷为切到的库号），KeyMain 监听后重载键区 */
  DB_SWITCH: number
}

// #region 全局总线与常量
// 全局事件总线：setup 直接导入，app 全局属性也添加
export const bus = mitt<MeBusEvents>()

// 常量
export const KEY_DELETE = 'KEY_DELETE'
export const KEY_RENAME = 'KEY_RENAME'
export const KEY_REFRESH = 'KEY_REFRESH'
export const SEARCH_CREATE = 'SEARCH_CREATE'

/** 搜索页还没挂载时先记下草稿，挂载后再打开新建索引。 */
let searchCreateDraft: string | null = null

export function requestSearchCreate(draft: string): void {
  searchCreateDraft = draft
  bus.emit(SEARCH_CREATE, draft)
}

export function takeSearchCreateDraft(): string | null {
  const draft = searchCreateDraft
  searchCreateDraft = null
  return draft
}

export const INFO_REFRESH = 'INFO_REFRESH'
export const CONN_REFRESH = 'CONN_REFRESH'
export const OPEN_SETTING = 'OPEN_SETTING'
export const DB_SWITCH = 'DB_SWITCH'
export const CONN_LIST_WINDOWS_SYNC = 'CONN_LIST_WINDOWS_SYNC'
export const TREE_KEY_ID_PREFIX = '_TREE_KEY_ID_PREFIX_'

// 预设颜色
export const PREDEFINE_COLORS = [
  '#409eff', // primary
  '#67c23a', // success
  '#e6a23c', // warning
  '#f56c6c', // danger
  '#909399', // info
] as const

// 图表多折线专用色板（与连接颜色选择器解耦，节点数多时循环取色）
export const CHART_COLORS: string[] = [
  '#409eff', // blue
  '#67c23a', // green
  '#e6a23c', // amber
  '#f56c6c', // red
  '#13c2c2', // cyan
  '#9254de', // purple
  '#eb2f96', // pink
  '#faad14', // gold
  '#52c41a', // lime
  '#2f54eb', // geekblue
  '#fa541c', // volcano
  '#73d13d', // grass
]
// #endregion

// #region 界面语言、暗色主题
const t = i18n.global.t

// 是否是中文模式
export const isZh = computed(() => {
  const language =
    meTauri.settings.language === 'system' ? meTauri.systemLanguage : meTauri.settings.language
  return language?.startsWith('zh') ?? false
})

// 是否黑色主题
export const isDark = useDark()
// #endregion

// #region Element Plus 提示、确认框、剪贴板
export const DoNothing = (): void => {}

export function meOk(
  message: string,
  isAlert = false,
  title = '',
  options: Record<string, unknown> = {},
): void {
  if (isAlert) {
    const finalOptions = { type: 'success' as const, draggable: true, ...options }
    void ElMessageBox.alert(message, title || t('info'), finalOptions).then(DoNothing)
  } else {
    ElMessage.success(message)
  }
}

export function meWarn(message: string): void {
  ElMessage.warning(message)
}

/** 错误弹窗（HTML 换行，用于自定义编解码测试等） */
export function meErrHtml(message: string, title: string = t('error')): void {
  void ElMessageBox.alert(message, title, {
    type: 'error',
    draggable: true,
    dangerouslyUseHTMLString: true,
  }).then(DoNothing)
}

export function meConfirm(
  message: string,
  thenFun: () => void | Promise<void>,
  boxOptions: ElMessageBoxOptions = {},
): void {
  ElMessageBox.confirm(message, boxOptions?.type === 'info' ? t('info') : t('warn'), {
    type: 'warning',
    ...boxOptions,
  })
    .then(thenFun)
    .catch(DoNothing)
}

export function mePrompt(
  message: string,
  options: ElMessageBoxOptions,
  thenFun: (result: { value: string }) => void | Promise<void>,
): void {
  ElMessageBox.prompt(message, options).then(thenFun).catch(DoNothing)
}

// 复制文本
export function meCopy(text: string, hintContent?: string, hint = true): void {
  void useClipboard({ legacy: true }).copy(text)
  if (hint) {
    meOk(hintContent || t('copyOk'))
  }
}

/** 打开外部链接：Tauri opener → 原生 window.open（非 Tauri 环境）→ 降级复制网址 + 提示 */
export function meOpenUrl(url: string): void {
  void (async () => {
    if (isTauri()) {
      try {
        await openUrl(url)
        return
      } catch (e) {
        meLog('打开链接失败:', url, e)
      }
    } else if (window.open(url, '_blank')) {
      return
    }
    meCopy(url, '', false) // 静默复制，便于用户手动粘贴打开
    meWarn(`${t('util.openUrlFail')}${url}`)
  })()
}
// #endregion

// #region 随机串、可读数量/时间、表格列过滤
const CHAR_ARRAY = Array.from('abcdefghigklmnopqrstuvwxyz0123456789')
export function meRandomString(n: number): string {
  return sampleSize(CHAR_ARRAY, n).join('')
}

const humanUnits = [
  { threshold: 1, symbol: 'B' },
  { threshold: 1024, symbol: 'K' },
  { threshold: 1024 ** 2, symbol: 'M' },
  { threshold: 1024 ** 3, symbol: 'G' },
  { threshold: 1024 ** 4, symbol: 'T' },
] as const

/** MEMORY USAGE 不可用时的 String 键内存粗估：键名 + 值字节 + Redis 对象/SDS 固定开销 */
export function estimateStringMemory(key: string, valueByteLen: number): number {
  const keyBytes = new TextEncoder().encode(key).length
  const OVERHEAD = 56
  return keyBytes + valueByteLen + OVERHEAD
}

export function meHumanSize(size: number, zeroShow = '0B', fractionDigits = 2): string {
  if (!size) return zeroShow || ''

  for (let i = humanUnits.length - 1; i >= 0; i--) {
    const u = humanUnits[i]!
    if (size >= u.threshold) {
      const value = size / u.threshold
      return value.toFixed(fractionDigits) + u.symbol
    }
  }

  return size + 'B'
}

const humanNums = [
  { threshold: 1, symbol: '' },
  { threshold: 1000, symbol: 'K' },
  { threshold: 1000 ** 2, symbol: 'M' },
  { threshold: 1000 ** 3, symbol: 'B' },
] as const

export function meHumanNums(size: number, zeroShow = '0', fractionDigits = 2): string {
  if (!size) return zeroShow || ''

  for (let i = humanNums.length - 1; i >= 0; i--) {
    const u = humanNums[i]!
    if (size >= u.threshold) {
      const value = size / u.threshold
      return value.toFixed(fractionDigits) + u.symbol
    }
  }

  return String(size)
}

export function meHumanSeconds(seconds: number | undefined | null): string | number {
  if (seconds === undefined || seconds === null) return '-'
  if (seconds <= 0) return seconds

  let rest = seconds
  const days = Math.floor(rest / (3600 * 24))
  rest %= 3600 * 24

  const hours = Math.floor(rest / 3600)
  rest %= 3600

  const minutes = Math.floor(rest / 60)
  rest %= 60

  const formattedHours = String(hours).padStart(2, '0')
  const formattedMinutes = String(minutes).padStart(2, '0')
  const formattedSeconds = String(rest).padStart(2, '0')

  let result = `${formattedHours}:${formattedMinutes}:${formattedSeconds}`
  if (days > 0) {
    result = `${days}${t('util.days', days)} ${result}`
  }
  return result
}

export { meTtlSeconds } from './ttl'
// #endregion

// #region Redis 键：删除（组合确认框与 meCommands）

export function meDeleteKey(id: string, redisKey: RedisKey_Deserialize, thenFn?: () => void): void {
  meConfirm(t('util.deleteKey', { key: redisKey.key }), async () => {
    await meCommands.del(id, redisKey)
    invalidateKeyType(id, redisKey)
    invalidateKeyMemory(id, redisKey)
    bus.emit(KEY_DELETE, redisKey)
    meOk(t('deleteOk'))
    thenFn?.()
  })
}

// #endregion

// #region sleep、JSON 格式化与解析
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function meJsonFormat(jsonString: string): string {
  return applyEdits(jsonString, format(jsonString, undefined, { insertSpaces: true, tabSize: 2 }))
}

/** 单字段/字符串值的展示格式化（与 RedisValue isPretty 规则对齐） */
export function meFormatDisplayValue(raw: string, pretty: boolean): string {
  if (!pretty || !raw) return raw
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      // jsonc format 是容错格式化器，对 `[server]` 这类「以 [ 开头的非 JSON」（ini/日志等）
      // 不报错反而会插换行破坏内容，保存时会固化损坏。先 JSON5.parse 验证确为合法 JSON 再美化。
      JSON5.parse(trimmed)
      return meJsonFormat(raw)
    } catch {
      return raw
    }
  }
  return raw
}

export function meJsonParse(jsonString: string | null | undefined): unknown {
  if (!jsonString) return null
  if (jsonString === 'undefined') return null
  if (jsonString === 'null') return null
  return JSON5.parse(jsonString)
}

export function meJsonNormal(jsonString: string): string {
  return JSON.stringify(JSON5.parse(jsonString), null, 2)
}
// #endregion
