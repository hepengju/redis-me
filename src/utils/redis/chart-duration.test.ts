import { describe, expect, it } from 'vite-plus/test'

import { chartDurationUnit, formatChartDurationAmount } from '@/utils/redis/chart-duration'

describe('chartDurationUnit', () => {
  it('最短柱不到 1 秒时保持毫秒', () => {
    expect(chartDurationUnit(48)).toBe('ms')
    expect(chartDurationUnit(999)).toBe('ms')
    expect(chartDurationUnit(0)).toBe('ms')
  })

  it('按最短柱仍 ≥ 1 的最大单位升档', () => {
    expect(chartDurationUnit(1_000)).toBe('s')
    expect(chartDurationUnit(59_999)).toBe('s')
    expect(chartDurationUnit(60_000)).toBe('min')
    expect(chartDurationUnit(1_733_596)).toBe('min')
    expect(chartDurationUnit(3_600_000)).toBe('h')
    expect(chartDurationUnit(86_400_000)).toBe('d')
  })
})

describe('formatChartDurationAmount', () => {
  it('毫秒取整，短时间运行的图保持原样', () => {
    expect(formatChartDurationAmount(10_031, 'ms')).toBe('10031')
    expect(formatChartDurationAmount(48, 'ms')).toBe('48')
  })

  it('分钟档把累计毫秒收成可读数字', () => {
    expect(formatChartDurationAmount(46_632_716, 'min')).toBe('777')
    expect(formatChartDurationAmount(1_733_596, 'min')).toBe('28.9')
    expect(formatChartDurationAmount(4_052_219, 'min')).toBe('67.5')
  })
})
