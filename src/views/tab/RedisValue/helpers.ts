// RedisValue 域内共享：类型、键类型能力、扫描/表格纯函数（有状态编排在 index.vue）
import dayjs from 'dayjs'

import i18n from '@/locales'
import type { FieldScanResult } from '@/types/tauri-specta'
import { meHumanSeconds } from '@/utils/app/util'
import { formatUtcOffset, meTtlAlignAt, meTtlFromAt, meTtlToAt } from '@/utils/redis/ttl'

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

function scannedRowObject(item: unknown): ValueTableRow | null {
  if (!item || typeof item !== 'object') return null
  return item as ValueTableRow
}

/** 在 fieldScan 原始行里定位要删的那一条（与表格 dataList 的映射一致） */
function findScannedFieldRowIndex(rows: unknown[], type: string, row: ValueTableRow): number {
  if (type === 'set') {
    const member = row.value
    return rows.findIndex(item => item === member)
  }
  if (type === 'vectorset') {
    const v = row.value
    const name = typeof v === 'string' || typeof v === 'number' ? String(v) : ''
    return rows.findIndex(item => scannedRowObject(item)?.name === name)
  }
  if (type === 'hash') {
    const key = row.key ?? ''
    return rows.findIndex(item => scannedRowObject(item)?.key === key)
  }
  if (type === 'zset') {
    const member = row.value
    return rows.findIndex(item => scannedRowObject(item)?.value === member)
  }
  if (type === 'stream') {
    const id = row.id ?? ''
    return rows.findIndex(item => scannedRowObject(item)?.id === id)
  }
  // TimeSeries：样本行 key=timestamp 明文
  if (type === 'timeseries') {
    const ts = row.key ?? ''
    return rows.findIndex(item => scannedRowObject(item)?.key === ts)
  }
  if (type === 'list' || type === 'array') {
    const index = listRowRedisIndex(row)
    return rows.findIndex(item => scannedRowObject(item)?.index === index)
  }
  return -1
}

/**
 * 删除成功后从已扫描行里摘掉这一条，避免整表刷新清掉扫描条件、本地过滤和排序。
 * List：LREM 会让后续下标前移；Array：ARDEL 留空洞，其它下标不变。
 * 原地修改 rows，返回是否摘掉。
 */
export function removeScannedFieldRow(rows: unknown[], type: string, row: ValueTableRow): boolean {
  const idx = findScannedFieldRowIndex(rows, type, row)
  if (idx < 0) return false

  if (type === 'list') {
    const removedIndex = listRowRedisIndex(scannedRowObject(rows[idx]) ?? {})
    rows.splice(idx, 1)
    if (removedIndex >= 0) {
      for (const item of rows) {
        const next = scannedRowObject(item)
        if (next && typeof next.index === 'number' && next.index > removedIndex) {
          next.index -= 1
        }
      }
    }
    return true
  }

  rows.splice(idx, 1)
  return true
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

/** TimeSeries 毫秒 timestamp（十进制字符串）→ 本地可读时间；非法则空串 */
export function tsTimestampToDate(ts: string): string {
  try {
    const n = Number(ts)
    if (!Number.isFinite(n) || n <= 0) return ''
    return dayjs(n).format('YYYY-MM-DD HH:mm:ss.SSS')
  } catch {
    return ''
  }
}

/** 工具栏时间戳区间：数字 ms / `-`/`+` 原样；可读时间转本地 ms 字符串；空串保持空 */
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

function fieldExpireMs(ttl: number, expireAtMs?: number | null): number | null {
  if (expireAtMs != null && expireAtMs > 0) return meTtlAlignAt(expireAtMs).getTime()
  if (ttl > 0) return meTtlToAt(ttl).getTime()
  return null
}

/** Hash 字段 TTL 单元格：钉死的过期时刻（不倒计时）；永久/无值/-到期无时刻则兜底 */
export function formatFieldTtlCell(
  ttl: number | undefined | null,
  expireAtMs?: number | null,
): string {
  if (ttl == null) return '-'
  if (ttl === -1) return t('redisValue.ttlForever')
  const ms = fieldExpireMs(ttl, expireAtMs)
  if (ms == null) return '00:00:00'
  return dayjs(ms).format(DATETIME_FMT)
}

/** Hash 字段 TTL 悬停：按 nowMs 算剩余（秒 + 时分秒）和 UTC；由 tooltip 内时钟传入，表格不跑 timer */
export function formatFieldTtlTooltip(
  ttl: number | undefined | null,
  expireAtMs?: number | null,
  expiredText?: string,
  nowMs = Date.now(),
): string {
  if (ttl == null || ttl < 0) return ''
  const remain = expireAtMs != null && expireAtMs > 0 ? meTtlFromAt(expireAtMs, nowMs) : ttl
  if (!(remain > 0)) return expiredText ?? t('redisValue.ttlFieldExpired')
  const ms = fieldExpireMs(ttl, expireAtMs)
  const lines = [
    t('meTtl.previewRemain', { text: meHumanSeconds(remain) }),
    t('redisValue.ttlSeconds', { n: remain, unit: t('timeUnit.second', remain) }),
  ]
  if (ms != null) lines.push(t('redisValue.ttlUtc', { time: formatUtcDateTime(ms) }))
  return lines.join('<br/>')
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
    type === 'vectorset' ||
    type === 'timeseries'
  )
}

// field_get 可单行刷新的表格类型（TimeSeries 无 field_get；改后整表 refresh）
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

// 非精确扫描时是否自动连续拉取（pattern 扫描或 List/Stream/TimeSeries 前端分页）
export function shouldFieldScanAuto(type: string | undefined, exact: boolean) {
  if (exact || !type) return false
  return (
    supportsFieldServerScan(type) || type === 'list' || type === 'stream' || type === 'timeseries'
  )
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
  timeseries: 'timeseries',
}

// 扫描纯函数

/** 续扫合并的去重身份：两侧均为 fieldScan 原始行（Set 为裸字符串成员）；无身份返回 undefined 即不去重 */
function scannedRowMergeKey(type: string, item: unknown): unknown {
  if (type === 'set') return item
  const row = scannedRowObject(item)
  if (!row) return undefined
  switch (type) {
    case 'hash':
    case 'timeseries':
      return row.key
    case 'zset':
      return row.value
    case 'stream':
      return row.id
    case 'vectorset':
      return row.name
    case 'list':
    case 'array':
      return row.index
    default:
      return undefined
  }
}

// 「加载更多」：新一页追加到已有 redisValue.value；true=已 merge，false=应整包替换
// 按行身份去重：游标与已加载页重叠时（扫描条件变更后的残留游标等）不重复追加
export function mergeFieldScanPage(
  prev: FieldScanViewState,
  data: FieldScanResult,
  includeMeta: boolean,
): boolean {
  if (!supportsTableView(data.type)) return false
  if (data.type === 'hash') pinHashRowsExpireAt(data.value)
  const prevRows = fieldValueRows(prev.value)
  const seen = new Set(prevRows.map(row => scannedRowMergeKey(data.type, row)))
  const fresh = fieldValueRows(data.value).filter(row => {
    const key = scannedRowMergeKey(data.type, row)
    return key === undefined || !seen.has(key)
  })
  ;(prev as { value: unknown }).value = [...prevRows, ...fresh]
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
