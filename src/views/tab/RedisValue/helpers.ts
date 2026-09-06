// RedisValue 域内共享：类型、键类型能力、扫描/表格纯函数（有状态编排在 index.vue）
import dayjs from 'dayjs'

import i18n from '@/locales'
import type { FieldScanResult } from '@/types/tauri-specta'
import { formatUtcOffset, meTtlAlignAt, meTtlToAt } from '@/utils/ttl'

const t = i18n.global.t

// 类型与行工具

// newValue：null 未编辑，'' 表示用户主动保存空串
export type FieldScanViewState = FieldScanResult & { newValue: string | null }

// 值表格行（fieldScan 各类型字段混合）
export type ValueTableRow = Record<string, unknown> & {
  key?: string
  value?: unknown
  id?: string
  score?: number
  ttl?: number
  /** 扫描/刷新时钉死的字段过期时刻，避免 hover 用 now+剩余秒往后漂 */
  expireAtMs?: number | null
  index?: number // List 行真实 Redis 索引
  vector?: string // VectorSet 向量 JSON 字符串
  attrs?: string // VectorSet 属性 JSON 字符串
}

// fieldScan 的 value 在 Specta 中为联合类型，表格/拼接按行数组处理
export function fieldValueRows(v: unknown): unknown[] {
  return v as unknown[]
}

export function toViewState(data: FieldScanResult): FieldScanViewState {
  if (data.type === 'hash') pinHashRowsExpireAt(data.value)
  return { ...data, newValue: null }
}

/** 字段 TTL 在扫描当下钉过期时刻（表格不倒计时，剩余秒会过时） */
export function pinFieldExpireAt(
  row: { ttl?: number; expireAtMs?: number | null },
  now = Date.now(),
) {
  if (typeof row.ttl === 'number' && row.ttl > 0) {
    row.expireAtMs = meTtlToAt(row.ttl, now).getTime()
  } else {
    row.expireAtMs = null
  }
}

export function pinHashRowsExpireAt(value: unknown, now = Date.now()) {
  if (!Array.isArray(value)) return
  for (const row of value) {
    if (row && typeof row === 'object' && 'ttl' in row) {
      pinFieldExpireAt(row as ValueTableRow, now)
    }
  }
}

export function listRowRedisIndex(row: ValueTableRow): number {
  return typeof row.index === 'number' ? row.index : -1
}

export function parseListIndexInput(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

// Stream ID（毫秒时间戳-序号）→ 可读时间；非法则空串
export function streamIdToDate(id: string): string {
  try {
    const timestamp = Number.parseInt(id.split('-')[0]!, 10)
    if (!Number.isFinite(timestamp)) return ''
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')
  } catch {
    return ''
  }
}

const DATETIME_FMT = 'YYYY-MM-DD HH:mm:ss'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatUtcDateTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}

/** TTL 悬停 HTML：过期时刻（本地+偏移）/ UTC / 剩余秒；永久或无效则空串（不展示 tooltip）。
 * expireAtMs：键页倒计时钉死的过期时刻；有则用它，避免 now+ttl 再算一次差 1 秒。
 * expiredText：ttl=0 时的提示（键/字段已过期）。 */
export function formatTtlExpireTooltip(
  ttl: number | undefined | null,
  expireAtMs?: number | null,
  expiredText?: string,
): string {
  if (ttl == null || ttl < 0) return ''
  if (!(ttl > 0)) return expiredText ?? t('redisValue.ttlExpired')
  const ms =
    expireAtMs != null && expireAtMs > 0
      ? meTtlAlignAt(expireAtMs).getTime()
      : meTtlToAt(ttl).getTime()
  return [
    t('redisValue.ttlExpireAt', {
      time: dayjs(ms).format(DATETIME_FMT),
      offset: formatUtcOffset(ms),
    }),
    t('redisValue.ttlUtc', { time: formatUtcDateTime(ms) }),
    t('redisValue.ttlSeconds', { n: ttl, unit: t('timeUnit.second', ttl) }),
  ].join('<br/>')
}

// 键类型能力

// Hash/Set/ZSet/Array/VectorSet：支持服务端扫描或精确勾选（Array→ARGET；VectorSet→VISMEMBER，无 MATCH）
export function supportsFieldServerScan(type: string | undefined) {
  return (
    type === 'hash' || type === 'set' || type === 'zset' || type === 'array' || type === 'vectorset'
  )
}

// 支持表格视图的类型（与底部 segmented 可见条件一致）
export function supportsTableView(type: string | undefined) {
  return (
    type === 'hash' ||
    type === 'list' ||
    type === 'set' ||
    type === 'zset' ||
    type === 'stream' ||
    type === 'array' ||
    type === 'vectorset'
  )
}

// field_get 可单行刷新的表格类型
export function supportsFieldRowRefresh(type: string | undefined) {
  return (
    type === 'hash' ||
    type === 'list' ||
    type === 'zset' ||
    type === 'array' ||
    type === 'vectorset'
  )
}

// string / json：仅 JSON 编辑器，无表格/字段扫描
export function isStringLikeType(type: string | undefined) {
  return type === 'string' || type === 'json'
}

// 非精确扫描时是否自动连续拉取（pattern 扫描或 List/Stream 前端分页）
export function shouldFieldScanAuto(type: string | undefined, exact: boolean) {
  if (exact || !type) return false
  return supportsFieldServerScan(type) || type === 'list' || type === 'stream'
}

// 命令帮助分组：键类型 → Redis 命令文档 group
export const KEY_TYPE_TO_GROUP: Record<string, string> = {
  string: 'string',
  hash: 'hash',
  list: 'list',
  set: 'set',
  zset: 'sorted-set',
  stream: 'stream',
  json: 'json',
  array: 'array',
  vectorset: 'vector_set',
}

// 扫描纯函数

// 「加载更多」：新一页追加到已有 redisValue.value；true=已 merge，false=应整包替换
export function mergeFieldScanPage(
  prev: FieldScanViewState,
  data: FieldScanResult,
  includeMeta: boolean,
): boolean {
  if (!supportsTableView(data.type)) return false
  if (data.type === 'hash') pinHashRowsExpireAt(data.value)
  const merged: unknown[] = [...fieldValueRows(prev.value), ...fieldValueRows(data.value)]
  ;(prev as { value: unknown }).value = merged
  if (includeMeta) {
    prev.length = data.length
    prev.ttl = data.ttl
    prev.size = data.size
    prev.logicalLength = data.logicalLength
    prev.vectorDim = data.vectorDim
  }
  return true
}

// Specta 应用错误 JSON（`{"code":"key_not_found",...}`）
export function isAppErrorCode(e: unknown, code: string): boolean {
  const raw = typeof e === 'string' ? e : e instanceof Error ? e.message : ''
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as { code?: unknown }
    return parsed?.code === code
  } catch {
    return false
  }
}
