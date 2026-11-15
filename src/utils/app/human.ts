/** 随机串、可读数量/时间 */
import { sampleSize } from 'lodash'

import i18n from '@/locales'

const t = i18n.global.t

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

export { meTtlSeconds } from '@/utils/redis/ttl'
