import { afterEach, describe, expect, it } from 'vite-plus/test'

import i18n from '@/locales'

import { formatTtlExpireTooltip, pinFieldExpireAt } from './helpers'

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
