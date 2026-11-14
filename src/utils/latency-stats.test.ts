import { describe, expect, it } from 'vite-plus/test'

import { aggregateMasterLatencyStats, parseLatencyStats } from '@/utils/latency-stats'

const REDIS7 = `
# Server
redis_version:7.2.4
# Commandstats
cmdstat_get:calls=10,usec=100,usec_per_call=10.00
# Latencystats
latency_percentiles_usec_get:p50=1.003,p99=8.047,p99.9=12.031
latency_percentiles_usec_command|info:p50=0.001,p99=1.003,p99.9=3.007
latency_percentiles_usec_FT.LIST:p50=2,p99=9,p99.9=9
latency_percentiles_usec_set:p50=4,p99=4
`

const REDIS6 = `
# Server
redis_version:6.2.14
# Commandstats
cmdstat_get:calls=5,usec=50,usec_per_call=10.00
`

const TRACKING_OFF = `
# Server
redis_version:7.0.15
# Latencystats
`

describe('parseLatencyStats', () => {
  it('只读 Latencystats，保留子命令名，分位按数值从小到大', () => {
    const parsed = parseLatencyStats(REDIS7)
    expect(parsed.sectionPresent).toBe(true)
    expect(parsed.redisVersion).toBe('7.2.4')
    expect(parsed.percentiles).toEqual(['p50', 'p99', 'p99.9'])
    expect(parsed.rows.map(row => row.command)).toEqual(['get', 'FT.LIST', 'command|info', 'set'])
    expect(parsed.rows[0].usec).toEqual({ p50: 1.003, p99: 8.047, 'p99.9': 12.031 })
    expect(parsed.rows[3].usec.p99).toBe(4)
    expect(parsed.rows[3].usec['p99.9']).toBeUndefined()
  })

  it('Redis 7 以前没有这段', () => {
    const parsed = parseLatencyStats(REDIS6)
    expect(parsed.sectionPresent).toBe(false)
    expect(parsed.redisVersion).toBe('6.2.14')
    expect(parsed.rows).toEqual([])
    expect(parsed.percentiles).toEqual([])
  })

  it('段在但没有命令行时不当成 0', () => {
    const parsed = parseLatencyStats(TRACKING_OFF)
    expect(parsed.sectionPresent).toBe(true)
    expect(parsed.rows).toEqual([])
  })

  it('没有合法分位的行丢掉', () => {
    const info = `
# Latencystats
latency_percentiles_usec_get:calls=1
latency_percentiles_usec_set:p50=1.5
`
    const parsed = parseLatencyStats(info)
    expect(parsed.rows.map(row => row.command)).toEqual(['set'])
    expect(parsed.rows[0].usec).toEqual({ p50: 1.5 })
  })
})

const M1 = `
# Server
redis_version:7.2.4
uptime_in_seconds:90061
# Latencystats
latency_percentiles_usec_get:p50=1,p99=8,p99.9=12
latency_percentiles_usec_set:p50=4,p99=4
`

const M2 = `
# Server
redis_version:7.2.4
uptime_in_seconds:3600
# Latencystats
latency_percentiles_usec_get:p50=3,p99=8,p99.9=20
latency_percentiles_usec_set:p50=1,p99=9
`

describe('aggregateMasterLatencyStats', () => {
  it('每个分位取最大值，并列时按传入顺序标出节点', () => {
    const aggregated = aggregateMasterLatencyStats([
      { label: 'M1', node: 'a:7001', info: M1 },
      { label: 'M2', node: 'b:7002', info: M2 },
    ])
    expect(aggregated.percentiles).toEqual(['p50', 'p99', 'p99.9'])
    const get = aggregated.rows.find(row => row.command === 'get')
    expect(get?.cells.p50).toEqual({ usec: 3, labels: ['M2'] })
    expect(get?.cells.p99).toEqual({ usec: 8, labels: ['M1', 'M2'] })
    expect(get?.cells['p99.9']).toEqual({ usec: 20, labels: ['M2'] })
    const set = aggregated.rows.find(row => row.command === 'set')
    expect(set?.cells.p99).toEqual({ usec: 9, labels: ['M2'] })
    expect(set?.cells['p99.9']).toBeUndefined()
    expect(aggregated.rows.map(row => row.command)).toEqual(['get', 'set'])
    expect(aggregated.nodes.map(node => node.uptimeSeconds)).toEqual([90061, 3600])
  })

  it('空 INFO 排除，没有采样的节点不当成 0', () => {
    const aggregated = aggregateMasterLatencyStats([
      { label: 'M1', node: 'a:7001', info: M1 },
      { label: 'M2', node: 'b:7002', info: '   ' },
      { label: 'M3', node: 'c:7003', info: TRACKING_OFF },
    ])
    expect(aggregated.rows.find(row => row.command === 'get')?.cells['p99.9']).toEqual({
      usec: 12,
      labels: ['M1'],
    })
    expect(aggregated.nodes.map(node => [node.label, node.missing, node.noSamples])).toEqual([
      ['M1', false, false],
      ['M2', true, false],
      ['M3', false, true],
    ])
  })
})
