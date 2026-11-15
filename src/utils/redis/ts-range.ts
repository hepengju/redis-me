/** TimeSeries 范围边界：可读时间 / 毫秒 / +/- 统一成 Redis 可接受的字符串 */
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const TS_RANGE_BOUND_FMTS = [
  'YYYY-MM-DD HH:mm:ss.SSS',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD',
] as const

export function normalizeTsRangeBound(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (s === '-' || s === '+') return s
  if (/^\d+$/.test(s)) return s
  for (const fmt of TS_RANGE_BOUND_FMTS) {
    const d = dayjs(s, fmt, true)
    if (d.isValid()) return String(d.valueOf())
  }
  return s
}
