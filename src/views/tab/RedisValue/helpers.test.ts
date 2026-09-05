import { afterEach, describe, expect, it } from 'vite-plus/test'

import i18n from '@/locales'

import { formatTtlExpireTooltip } from './helpers'

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

  it('有 TTL：本地时刻、UTC、秒数', () => {
    i18n.global.locale.value = 'en'
    Date.now = () => Date.UTC(2026, 8, 5, 14, 27, 15)
    const html = formatTtlExpireTooltip(83535)
    expect(html).toContain('UTC: 2026-09-06 13:39:30')
    expect(html).toContain('TTL: 83535 Seconds')
    expect(html).toMatch(/Expires at: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d/)
  })
})
