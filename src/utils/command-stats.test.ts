import { describe, expect, it } from 'vite-plus/test'

import {
  aggregateMasterCommandStats,
  commandStatRows,
  parseCommandStats,
  readUptimeSeconds,
} from '@/utils/command-stats'

const REDIS7 = `
# Server
uptime_in_seconds:90061
# Commandstats
cmdstat_get:calls=10,usec=100,usec_per_call=10.00,rejected_calls=1,failed_calls=2
cmdstat_command|info:calls=3,usec=30,usec_per_call=10.00,rejected_calls=0,failed_calls=0
cmdstat_FT.LIST:calls=4,usec=40,usec_per_call=10.00,rejected_calls=0,failed_calls=0
# Latencystats
latency_percentiles_usec_get:p50=1.0
`

const REDIS6 = `
# Server
uptime_in_seconds:120
# Commandstats
cmdstat_get:calls=5,usec=50,usec_per_call=10.00
cmdstat_set:calls=1,usec=7,usec_per_call=7.00
`

describe('parseCommandStats', () => {
  it('只读 Commandstats，保留子命令名，并带上 Redis 7 的拒绝和失败', () => {
    const rows = parseCommandStats(REDIS7)
    expect(rows.map(row => row.command)).toEqual(['get', 'command|info', 'FT.LIST'])
    expect(rows[0]).toMatchObject({ calls: 10, usec: 100, rejected: 1, failed: 2 })
    expect(readUptimeSeconds(REDIS7)).toBe(90061)
  })

  it('Redis 7 以前没有拒绝和失败，留空而不是 0', () => {
    const rows = parseCommandStats(REDIS6)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ command: 'get', rejected: null, failed: null })
  })

  it('平均耗时用总耗时除以次数，并按总耗时从高到低排', () => {
    const rows = commandStatRows(parseCommandStats(REDIS7))
    expect(rows.map(row => row.command)).toEqual(['get', 'FT.LIST', 'command|info'])
    expect(rows[0]?.avg).toBe(10)
  })
})

describe('aggregateMasterCommandStats', () => {
  it('主节点次数和耗时相加，平均不取各节点平均', () => {
    const { rows, nodes } = aggregateMasterCommandStats([
      { label: 'M1', node: '10.0.0.1:7001', info: REDIS7 },
      {
        label: 'M2',
        node: '10.0.0.2:7002',
        info: `
# Server
uptime_in_seconds:3600
# Commandstats
cmdstat_get:calls=5,usec=50,usec_per_call=10.00,rejected_calls=2,failed_calls=0
cmdstat_set:calls=1,usec=7,usec_per_call=7.00,rejected_calls=0,failed_calls=0
`,
      },
    ])
    const get = rows.find(row => row.command === 'get')
    const set = rows.find(row => row.command === 'set')
    expect(get).toMatchObject({ calls: 15, usec: 150, rejected: 3, failed: 2 })
    expect(set).toMatchObject({ calls: 1, usec: 7, rejected: 0, failed: 0 })
    expect(commandStatRows([get!])[0]?.avg).toBe(10)
    expect(nodes.map(node => node.uptimeSeconds)).toEqual([90061, 3600])
  })

  it('有一台缺拒绝或失败字段时，这两列整列留空', () => {
    const { rows } = aggregateMasterCommandStats([
      { label: 'M1', node: 'a', info: REDIS7 },
      { label: 'M2', node: 'b', info: REDIS6 },
    ])
    expect(rows.find(row => row.command === 'get')).toMatchObject({
      calls: 15,
      usec: 150,
      rejected: null,
      failed: null,
    })
  })

  it('没有命令行的节点不把别的节点的拒绝次数清空', () => {
    const { rows } = aggregateMasterCommandStats([
      { label: 'M1', node: 'a', info: REDIS7 },
      { label: 'M2', node: 'b', info: '# Server\nuptime_in_seconds:10\n# Commandstats\n' },
    ])
    expect(rows.find(row => row.command === 'get')).toMatchObject({ rejected: 1, failed: 2 })
  })

  it('INFO 没回来的主节点不参加合计，并标成缺失', () => {
    const { rows, nodes } = aggregateMasterCommandStats([
      { label: 'M1', node: 'a', info: REDIS7 },
      { label: 'M2', node: 'b', info: '   ' },
    ])
    expect(rows.find(row => row.command === 'get')).toMatchObject({ calls: 10, usec: 100 })
    expect(nodes[1]).toMatchObject({ label: 'M2', missing: true, uptimeSeconds: null })
  })
})
