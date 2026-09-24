import dayjs from 'dayjs'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import i18n from '@/locales'

import {
  formatFieldTtlCell,
  formatFieldTtlTooltip,
  formatTtlExpireTooltip,
  normalizeTsRangeBound,
  pinFieldExpireAt,
  removeScannedFieldRow,
  type ValueTableRow,
} from './helpers'

describe('formatTtlExpireTooltip', () => {
  const realNow = Date.now

  afterEach(() => {
    Date.now = realNow
    i18n.global.locale.value = 'en'
  })

  it('永久或空值：无内容', () => {
    expect(formatTtlExpireTooltip(-1)).toBe('')
    expect(formatTtlExpireTooltip(undefined)).toBe('')
    expect(formatTtlExpireTooltip(null)).toBe('')
  })

  it('已到期：提示已过期', () => {
    i18n.global.locale.value = 'en'
    expect(formatTtlExpireTooltip(0)).toBe('Key expired')
    expect(formatTtlExpireTooltip(0, null, 'Field expired')).toBe('Field expired')
  })

  it('有 TTL：本地时刻、UTC、秒数', () => {
    i18n.global.locale.value = 'en'
    Date.now = () => Date.UTC(2026, 8, 5, 14, 27, 15)
    const html = formatTtlExpireTooltip(83535)
    expect(html).toContain('UTC: 2026-09-06 13:39:30')
    expect(html).toContain('TTL: 83535 Seconds')
    expect(html).toMatch(/Expires at: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d/)
  })

  it('传入 expireAtMs 时用钉死时刻', () => {
    i18n.global.locale.value = 'en'
    Date.now = () => Date.UTC(2026, 8, 5, 20, 0, 0)
    const html = formatTtlExpireTooltip(10, Date.UTC(2026, 8, 6, 13, 39, 30))
    expect(html).toContain('UTC: 2026-09-06 13:39:30')
    expect(html).toContain('TTL: 10 Seconds')
  })
})

describe('formatFieldTtlCell', () => {
  it('永久或空值', () => {
    i18n.global.locale.value = 'en'
    expect(formatFieldTtlCell(-1)).toBe('Forever')
    expect(formatFieldTtlCell(undefined)).toBe('-')
    expect(formatFieldTtlCell(null)).toBe('-')
  })

  it('有过期时刻则显示本地时刻', () => {
    const ms = Date.UTC(2026, 8, 6, 13, 39, 30)
    expect(formatFieldTtlCell(10, ms)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('formatFieldTtlTooltip', () => {
  const realNow = Date.now

  afterEach(() => {
    Date.now = realNow
    i18n.global.locale.value = 'en'
  })

  it('永久无内容，到期提示字段已过期', () => {
    expect(formatFieldTtlTooltip(-1)).toBe('')
    i18n.global.locale.value = 'en'
    expect(formatFieldTtlTooltip(0, null, 'Field expired')).toBe('Field expired')
  })

  it('悬停时按墙上时钟给出剩余时分秒、秒数和 UTC', () => {
    i18n.global.locale.value = 'en'
    const html = formatFieldTtlTooltip(
      10,
      Date.UTC(2026, 8, 6, 13, 39, 30),
      undefined,
      Date.UTC(2026, 8, 6, 13, 39, 20),
    )
    expect(html).toContain('Remaining: 00:00:10')
    expect(html).toContain('TTL: 10 Seconds')
    expect(html).toContain('UTC: 2026-09-06 13:39:30')
    expect(html).not.toContain('Expires at:')
  })
})

describe('pinFieldExpireAt', () => {
  const realNow = Date.now

  afterEach(() => {
    Date.now = realNow
  })

  it('正数 TTL 钉到整秒过期时刻', () => {
    Date.now = () => Date.UTC(2026, 8, 6, 6, 0, 0, 800)
    const row: { ttl: number; expireAtMs?: number | null } = { ttl: 10 }
    pinFieldExpireAt(row)
    expect(row.expireAtMs).toBe(Date.UTC(2026, 8, 6, 6, 0, 10, 0))
  })

  it('永久或非正数不钉', () => {
    const row = { ttl: -1, expireAtMs: 1 }
    pinFieldExpireAt(row)
    expect(row.expireAtMs).toBeNull()
  })
})

describe('removeScannedFieldRow', () => {
  it('Hash 按字段名摘掉，其余行保留', () => {
    const rows = [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]
    expect(removeScannedFieldRow(rows, 'hash', { key: 'a' })).toBe(true)
    expect(rows).toEqual([{ key: 'b', value: '2' }])
  })

  it('Set 按成员摘掉裸字符串', () => {
    const rows = ['a', 'b', 'c']
    expect(removeScannedFieldRow(rows, 'set', { value: 'b' })).toBe(true)
    expect(rows).toEqual(['a', 'c'])
  })

  it('ZSet 按成员摘掉', () => {
    const rows = [
      { value: 'a', score: 1 },
      { value: 'b', score: 2 },
    ]
    expect(removeScannedFieldRow(rows, 'zset', { value: 'b' })).toBe(true)
    expect(rows).toEqual([{ value: 'a', score: 1 }])
  })

  it('Stream 按 ID 摘掉', () => {
    const rows = [
      { id: '1-0', value: { a: '1' } },
      { id: '2-0', value: { b: '2' } },
    ]
    expect(removeScannedFieldRow(rows, 'stream', { id: '1-0' })).toBe(true)
    expect(rows.map(r => r.id)).toEqual(['2-0'])
  })

  it('List 摘掉后后续 Redis 下标前移', () => {
    const rows: ValueTableRow[] = [
      { index: 0, value: 'a' },
      { index: 2, value: 'c' },
      { index: 5, value: 'f' },
    ]
    expect(removeScannedFieldRow(rows, 'list', { index: 2 })).toBe(true)
    expect(rows).toEqual([
      { index: 0, value: 'a' },
      { index: 4, value: 'f' },
    ])
  })

  it('Array 摘掉后其它下标不变', () => {
    const rows: ValueTableRow[] = [
      { index: 0, value: 'a' },
      { index: 2, value: 'c' },
      { index: 5, value: 'f' },
    ]
    expect(removeScannedFieldRow(rows, 'array', { index: 2 })).toBe(true)
    expect(rows).toEqual([
      { index: 0, value: 'a' },
      { index: 5, value: 'f' },
    ])
  })

  it('VectorSet 按元素名摘掉', () => {
    const rows = [
      { name: 'a', vector: '[1]', attrs: '' },
      { name: 'b', vector: '[2]', attrs: '{}' },
    ]
    expect(removeScannedFieldRow(rows, 'vectorset', { value: 'a' })).toBe(true)
    expect(rows).toEqual([{ name: 'b', vector: '[2]', attrs: '{}' }])
  })

  it('TimeSeries 按 timestamp(key) 摘掉', () => {
    const rows = [
      { key: '1000', value: '1.5' },
      { key: '900', value: '2' },
    ]
    expect(removeScannedFieldRow(rows, 'timeseries', { key: '1000' })).toBe(true)
    expect(rows).toEqual([{ key: '900', value: '2' }])
  })

  it('找不到则不改行', () => {
    const rows = [{ key: 'a', value: '1' }]
    expect(removeScannedFieldRow(rows, 'hash', { key: 'missing' })).toBe(false)
    expect(rows).toEqual([{ key: 'a', value: '1' }])
  })
})

describe('normalizeTsRangeBound', () => {
  it('空 / 边界符 / 纯数字原样', () => {
    expect(normalizeTsRangeBound('')).toBe('')
    expect(normalizeTsRangeBound('  ')).toBe('')
    expect(normalizeTsRangeBound('-')).toBe('-')
    expect(normalizeTsRangeBound('+')).toBe('+')
    expect(normalizeTsRangeBound('1600000000000')).toBe('1600000000000')
  })

  it('可读时间转本地 ms', () => {
    expect(normalizeTsRangeBound('2020-09-13 23:13:18')).toBe(
      String(dayjs('2020-09-13 23:13:18', 'YYYY-MM-DD HH:mm:ss', true).valueOf()),
    )
    expect(normalizeTsRangeBound('2020-09-13 23:13:18.000')).toBe(
      String(dayjs('2020-09-13 23:13:18.000', 'YYYY-MM-DD HH:mm:ss.SSS', true).valueOf()),
    )
    expect(normalizeTsRangeBound('2020-09-13')).toBe(
      String(dayjs('2020-09-13', 'YYYY-MM-DD', true).valueOf()),
    )
  })

  it('无法解析则原样交 Redis', () => {
    expect(normalizeTsRangeBound('not-a-date')).toBe('not-a-date')
  })
})
