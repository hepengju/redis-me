import { describe, expect, it } from 'vite-plus/test'

import {
  formatUtcOffset,
  meTtlAlignAt,
  meTtlFromAt,
  meTtlSeconds,
  meTtlSplit,
  meTtlToAt,
} from '@/utils/ttl'

describe('meTtlSeconds', () => {
  it('永久与各单位换算', () => {
    expect(meTtlSeconds(-1, 'day')).toBe(-1)
    expect(meTtlSeconds(10, 'second')).toBe(10)
    expect(meTtlSeconds(1, 'minute')).toBe(60)
    expect(meTtlSeconds(1, 'hour')).toBe(3600)
    expect(meTtlSeconds(1, 'day')).toBe(86400)
  })
})

describe('meTtlSplit', () => {
  it('按可整除的最大单位回填', () => {
    expect(meTtlSplit(-1)).toEqual({ amount: -1, unit: 'second' })
    expect(meTtlSplit(1)).toEqual({ amount: 1, unit: 'second' })
    expect(meTtlSplit(60)).toEqual({ amount: 1, unit: 'minute' })
    expect(meTtlSplit(61)).toEqual({ amount: 61, unit: 'second' })
    expect(meTtlSplit(3600)).toEqual({ amount: 1, unit: 'hour' })
    expect(meTtlSplit(7200)).toEqual({ amount: 2, unit: 'hour' })
    expect(meTtlSplit(86400)).toEqual({ amount: 1, unit: 'day' })
    expect(meTtlSplit(90)).toEqual({ amount: 90, unit: 'second' })
  })
})

describe('meTtlFromAt', () => {
  it('按提交时刻换算剩余秒', () => {
    const now = Date.UTC(2026, 8, 6, 6, 0, 0)
    expect(meTtlFromAt(now + 3600_000, now)).toBe(3600)
    expect(meTtlFromAt(now - 1000, now)).toBe(-1)
  })

  it('跨毫秒时按墙上整秒差，避免四舍五入早 1 秒', () => {
    const now = Date.UTC(2026, 8, 6, 6, 0, 0, 600)
    const at = Date.UTC(2026, 8, 6, 6, 0, 10, 0)
    expect(meTtlFromAt(at, now)).toBe(10)
  })
})

describe('meTtlToAt', () => {
  it('丢掉当前毫秒，与秒级展示对齐', () => {
    const now = Date.UTC(2026, 8, 6, 6, 0, 0, 800)
    const at = meTtlToAt(10, now)
    expect(at.getTime()).toBe(Date.UTC(2026, 8, 6, 6, 0, 10, 0))
  })
})

describe('meTtlAlignAt', () => {
  it('过期时刻对齐到整秒', () => {
    const ms = Date.UTC(2026, 8, 6, 6, 0, 10, 800)
    expect(meTtlAlignAt(ms).getTime()).toBe(Date.UTC(2026, 8, 6, 6, 0, 10, 0))
  })
})

describe('formatUtcOffset', () => {
  it('整点与半时区', () => {
    expect(formatUtcOffset(0, 480)).toBe('UTC+8')
    expect(formatUtcOffset(0, -330)).toBe('UTC-5:30')
  })
})
