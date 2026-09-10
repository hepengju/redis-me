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
import type { MeCommands } from '@/types/me-interface'
import { commands as spectaCommands } from '@/types/tauri-specta'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { invalidateKeyType } from '@/utils/key-type-cache'

/** 全局 `bus` 事件载荷（与 `bus.emit` / `bus.on` 一致） */
export type MeBusEvents = {
  KEY_DELETE: RedisKey_Deserialize
  /** 重命名成功：oldKey 为改名前快照，newKey 为服务端返回；用于刷新键树 / 收藏 */
  KEY_RENAME: { oldKey: RedisKey_Deserialize; newKey: RedisKey_Deserialize }
  /** 载荷未使用；监听器应 `() => refreshKey()` 包装，避免与多参函数签名冲突 */
  KEY_REFRESH: undefined
  INFO_REFRESH: boolean | undefined
  CONN_REFRESH: void
}

// #region 本文件内部类型（Specta / 应用错误载荷）
type SpectaResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: unknown }

interface AppErrorPayload {
  code: string
  [key: string]: unknown
}
// #endregion

// #region 全局总线与常量
// 全局事件总线：setup 直接导入，app 全局属性也添加
export const bus = mitt<MeBusEvents>()

// 常量
export const KEY_DELETE = 'KEY_DELETE'
export const KEY_RENAME = 'KEY_RENAME'
export const KEY_REFRESH = 'KEY_REFRESH'
export const INFO_REFRESH = 'INFO_REFRESH'
export const CONN_REFRESH = 'CONN_REFRESH'
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
// #endregion

// #region 开发日志、界面语言、暗色主题
const isDev = import.meta.env.DEV
const t = i18n.global.t

// 打印日志（仅开发环境）
export function meLog(...args: unknown[]): void {
  if (isDev) {
    console.log(...args)
  }
}

// 是否是中文模式
export const isZh = computed(() => {
  const language =
    meTauri.settings.language === 'system' ? meTauri.systemLanguage : meTauri.settings.language
  return language?.startsWith('zh') ?? false
})

// 是否黑色主题
export const isDark = useDark()
// #endregion

// #region Specta 命令包装（meCommands）
// 流程：Specta Result → 解包 → 成功则记日志并重置 EOF 计数；失败则 EOF 有限重试，否则弹窗（可静默）并抛出字符串化错误。
const SPECTA_EOF_MESSAGE = 'unexpected end of file'
/** 与原先 `spectaEofRetries <= 3` 一致：最多额外重试 4 次 */
const SPECTA_EOF_MAX_RETRY = 3

let spectaEofRetryCount = 0

function errString(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return Object.prototype.toString.call(e)
  }
}

/** 若 `errorStr` 为带 `code` 的应用错误 JSON 则走 i18n，否则原样返回（供弹窗） */
function formatSpectaErrorForUser(errorStr: string): string {
  try {
    const parsed = JSON.parse(errorStr) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('code' in parsed) ||
      typeof (parsed as AppErrorPayload).code !== 'string'
    ) {
      return errorStr
    }
    const { code, ...params } = parsed as AppErrorPayload
    const key = `errors.${code}`
    const message = t(key, params as Record<string, unknown>)
    return message === key ? `${code}: ${JSON.stringify(params)}` : message
  } catch {
    return errorStr
  }
}

function unwrapSpecta<T>(raw: SpectaResult<T>): T {
  if (raw.status === 'ok') return raw.data
  throw raw.error
}

async function invokeSpectaCommand<T>(
  name: string,
  args: readonly unknown[],
  run: () => Promise<SpectaResult<T>>,
  alert: boolean,
): Promise<T> {
  const t0 = Date.now()
  try {
    const data = unwrapSpecta(await run())
    meLog(`命令：${name}, 耗时：${Date.now() - t0}ms, 参数：`, args, '结果：', data)
    spectaEofRetryCount = 0
    return data
  } catch (e) {
    const msg = errString(e)
    if (msg === SPECTA_EOF_MESSAGE && spectaEofRetryCount <= SPECTA_EOF_MAX_RETRY) {
      spectaEofRetryCount++
      meLog(`第${spectaEofRetryCount}次重试：${name}`)
      return invokeSpectaCommand(name, args, run, alert)
    }
    if (alert) {
      const title = t('error') + (isDev ? ': ' + name : '')
      meErr(formatSpectaErrorForUser(msg), title)
    }
    meLog(`命令：${name}, 耗时：${Date.now() - t0}ms, 参数:`, args, `, 错误：${msg}`)
    throw msg
  }
}

type SpectaCommandFn = (...a: unknown[]) => Promise<SpectaResult<unknown>>

/** 与 Specta `commands` 同键；末尾多传 `false` 时失败不弹窗 */
function bindMeCommand(name: string, fn: unknown): unknown {
  if (typeof fn !== 'function') return fn
  const spectaFn = fn as SpectaCommandFn
  return (...args: unknown[]) => {
    const silent = args.length > 0 && args[args.length - 1] === false
    const pass = silent ? args.slice(0, -1) : args
    return invokeSpectaCommand(String(name), pass, () => spectaFn(...pass), !silent)
  }
}

export const meCommands = Object.fromEntries(
  Object.entries(spectaCommands).map(([name, fn]) => [name, bindMeCommand(name, fn)]),
) as MeCommands
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

export function meErr(message: unknown, title: string = t('error')): void {
  const raw =
    message instanceof Error
      ? message.message
      : typeof message === 'string'
        ? message
        : errString(message)
  const text = formatSpectaErrorForUser(raw)
  void ElMessageBox.alert(text, title, { type: 'error', draggable: true }).then(DoNothing)
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

export function meFilterHandler<T extends Record<string, unknown>>(
  value: unknown,
  row: T,
  column: { property?: string },
): boolean {
  const property = column.property
  if (!property) return false
  return row[property] === value
}
// #endregion

// #region Redis 键：删除（组合确认框与 meCommands）

export function meDeleteKey(id: string, redisKey: RedisKey_Deserialize, thenFn?: () => void): void {
  meConfirm(t('util.deleteKey', { key: redisKey.key }), async () => {
    await meCommands.del(id, redisKey)
    invalidateKeyType(id, redisKey)
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
