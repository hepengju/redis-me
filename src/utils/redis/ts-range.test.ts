import dayjs from 'dayjs'
import { describe, expect, it } from 'vite-plus/test'

import { normalizeTsRangeBound } from '@/utils/redis/ts-range'

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
