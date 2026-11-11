/** TTL 时长 ↔ 秒、过期时刻换算（MeTTL / EXPIRE 提交共用） */

export const TTL_UNITS = ['second', 'minute', 'hour', 'day'] as const
export type TtlUnit = (typeof TTL_UNITS)[number]
export type TtlMode = 'duration' | 'at'

export function meTtlSeconds(intValue: number, unit: string): number {
  if (intValue === -1) return -1
  if (unit === 'second') return intValue
  if (unit === 'minute') return intValue * 60
  if (unit === 'hour') return intValue * 60 * 60
  if (unit === 'day') return intValue * 60 * 60 * 24
  return intValue
}

/** 把秒数拆成可整除的最大单位，便于回填输入框（不能整除则保持秒） */
export function meTtlSplit(seconds: number): { amount: number; unit: TtlUnit } {
  if (seconds === -1) return { amount: -1, unit: 'second' }
  if (seconds > 0 && seconds % 86400 === 0) return { amount: seconds / 86400, unit: 'day' }
  if (seconds > 0 && seconds % 3600 === 0) return { amount: seconds / 3600, unit: 'hour' }
  if (seconds > 0 && seconds % 60 === 0) return { amount: seconds / 60, unit: 'minute' }
  return { amount: seconds, unit: 'second' }
}

/** 过期时刻 → 剩余秒（按墙上整秒相减，避免四舍五入比选择器早 1 秒）；已过期则为 0 或负数 */
export function meTtlFromAt(at: Date | number, now = Date.now()): number {
  const ms = typeof at === 'number' ? at : at.getTime()
  return Math.floor(ms / 1000) - Math.floor(now / 1000)
}

/** 批量 PTTL（毫秒）收成列表缓存：-1 永久，正数记下到期时刻，其余（不存在 / 已到期）无展示 */
export function pttlToEntry(pttlMs: number, now = Date.now()): KeyTtlEntry {
  if (pttlMs === -1) return { kind: 'forever' }
  if (pttlMs > 0) return { kind: 'until', at: now + pttlMs }
  return { kind: 'none' }
}

export type KeyTtlEntry = { kind: 'forever' } | { kind: 'until'; at: number } | { kind: 'none' }

/**
 * 键列表剩余时间，查出或重绘的那一刻算一次，不倒计时。
 * 不足 1 分钟用秒，否则只保留一个单位：3m / 2h / 5d。已过期为空串。
 */
export function formatKeyTtlRemain(expireAtMs: number, now = Date.now()): string {
  if (expireAtMs > now && meTtlFromAt(expireAtMs, now) <= 0) return '1s'
  const sec = meTtlFromAt(expireAtMs, now)
  if (sec <= 0) return ''
  if (sec >= 86400) return `${Math.floor(sec / 86400)}d`
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h`
  if (sec >= 60) return `${Math.floor(sec / 60)}m`
  return `${sec}s`
}

/** 剩余秒 → 过期时刻；在读取 TTL 的当下钉到整秒，之后展示/弹窗共用这个绝对时间 */
export function meTtlToAt(seconds: number, now = Date.now()): Date {
  return new Date(Math.floor(now / 1000) * 1000 + seconds * 1000)
}

/** 过期时刻对齐到整秒（给日期选择器，避免毫秒四舍五入） */
export function meTtlAlignAt(at: Date | number): Date {
  const ms = typeof at === 'number' ? at : at.getTime()
  return new Date(Math.floor(ms / 1000) * 1000)
}

/** 本地时区偏移，如 UTC+8 / UTC-5:30 */
export function formatUtcOffset(
  ms: number,
  utcOffsetMinutes = new Date(ms).getTimezoneOffset() * -1,
): string {
  const sign = utcOffsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(utcOffsetMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${pad(m)}`
}
