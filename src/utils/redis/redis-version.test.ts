import { describe, expect, it } from 'vite-plus/test'

import {
  compareVersionLabel,
  pickVersionAtOrBelow,
  sortVersionsDesc,
} from '@/utils/redis/redis-version'

const redisDict = sortVersionsDesc([
  'Redis6.2',
  'Redis7.4',
  'Redis8.0',
  'Redis8.2',
  'Redis8.4',
  'Redis8.6',
  'Redis8.8',
  'Redis8.10',
])

describe('pickVersionAtOrBelow', () => {
  it('选不超过当前服务版本的最新字典', () => {
    expect(pickVersionAtOrBelow('Redis8.10.1', redisDict)).toBe('Redis8.10')
    expect(pickVersionAtOrBelow('Redis8.2.0', redisDict)).toBe('Redis8.2')
    expect(pickVersionAtOrBelow('Redis7.0.15', redisDict)).toBe('Redis6.2')
    expect(pickVersionAtOrBelow('Redis6.2', redisDict)).toBe('Redis6.2')
  })

  it('服务版本低于字典最小项时回退到最旧字典', () => {
    expect(pickVersionAtOrBelow('Redis5.0.14', redisDict)).toBe('Redis6.2')
    expect(pickVersionAtOrBelow('Redis4.0.14', redisDict)).toBe('Redis6.2')
  })

  it('空列表返回空串', () => {
    expect(pickVersionAtOrBelow('Redis5.0.14', [])).toBe('')
  })
})

describe('compareVersionLabel', () => {
  it('按主.次数值比较，避免 8.10 排在 8.2 前', () => {
    expect(compareVersionLabel('Redis8.10', 'Redis8.2')).toBeGreaterThan(0)
    expect(compareVersionLabel('Redis5.0.14', 'Redis6.2')).toBeLessThan(0)
  })
})
