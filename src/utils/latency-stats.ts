/** INFO latencystats → 命令延迟分位，以及多主节点取最大值。
 * 值是微秒，表示单次延迟的分布（样本从该进程启动起累计），不是把耗时加总。
 * 分位集合由 latency-tracking-info-percentiles 决定，各行不必一样齐；没有的分位不放键，不当成 0。
 * 百分位不能相加或平均。多节点时每个分位只取主节点里的最大值，并记下是哪些节点打成的。
 */

import { readUptimeSeconds, type MasterStatSource } from '@/utils/command-stats'

export type LatencyStatRow = {
  command: string
  /** 分位名（p50、p99.9）→ 微秒。没有该分位则没有这个键 */
  usec: Record<string, number>
}

export type LatencyStatsParsed = {
  /** INFO 里有没有 `# Latencystats` 段。Redis 7 以前没有 */
  sectionPresent: boolean
  /** Server 段的 redis_version；没有则为 null */
  redisVersion: string | null
  /** 出现过的分位，按分位数值从小到大 */
  percentiles: string[]
  /** 已按最高分位降序排好；缺该分位的行靠后 */
  rows: LatencyStatRow[]
}

const PREFIX = 'latency_percentiles_usec_'
const PERCENTILE = /^p\d+(?:\.\d+)?$/

function parseFields(value: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of value.split(',')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function percentileValue(name: string): number {
  const n = Number(name.slice(1))
  return Number.isFinite(n) ? n : 0
}

function readRedisVersion(info: string): string | null {
  for (const rawLine of info.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    if (line.slice(0, index).trim() !== 'redis_version') continue
    const version = line.slice(index + 1).trim()
    return version || null
  }
  return null
}

/** 只读 `# Latencystats` 段。命令名保留前缀之后的原文（含 `command|info` 这类子命令）。 */
export function parseLatencyStats(info: string): LatencyStatsParsed {
  const byCommand = new Map<string, LatencyStatRow>()
  const percentileSet = new Set<string>()
  let sectionPresent = false
  let inSection = false

  for (const rawLine of info.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      inSection = line.slice(1).trim().toLowerCase() === 'latencystats'
      if (inSection) sectionPresent = true
      continue
    }
    if (!inSection) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    if (!key.startsWith(PREFIX)) continue
    const command = key.slice(PREFIX.length)
    if (!command) continue
    const usec: Record<string, number> = {}
    for (const [name, raw] of parseFields(line.slice(index + 1))) {
      if (!PERCENTILE.test(name)) continue
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      usec[name] = n
      percentileSet.add(name)
    }
    if (!Object.keys(usec).length) continue
    byCommand.set(command, { command, usec })
  }

  const percentiles = [...percentileSet].sort((a, b) => percentileValue(a) - percentileValue(b))
  const rank = [...percentiles].reverse()
  const rows = [...byCommand.values()].sort((a, b) => {
    for (const name of rank) {
      const av = a.usec[name]
      const bv = b.usec[name]
      if (av == null && bv == null) continue
      if (av == null) return 1
      if (bv == null) return -1
      if (av !== bv) return bv - av
    }
    return a.command.localeCompare(b.command)
  })

  return { sectionPresent, redisVersion: readRedisVersion(info), percentiles, rows }
}

export type LatencyMaxCell = {
  usec: number
  /** 打成该最大值的节点标签，按传入顺序 */
  labels: string[]
}

export type LatencyMasterRow = {
  command: string
  /** 分位名 → 各主节点中的最大值。没有节点上报该分位则没有这个键 */
  cells: Record<string, LatencyMaxCell>
}

export type LatencyMasterNode = {
  label: string
  node: string
  uptimeSeconds: number | null
  /** 空 INFO，不参与最大值 */
  missing: boolean
  sectionPresent: boolean
  redisVersion: string | null
  /** INFO 回来了，但这台没有任何延迟分位 */
  noSamples: boolean
}

function sortByPercentile<T extends { command: string }>(
  rows: T[],
  percentiles: string[],
  read: (row: T, name: string) => number | undefined,
): T[] {
  const rank = [...percentiles].reverse()
  return rows.sort((a, b) => {
    for (const name of rank) {
      const av = read(a, name)
      const bv = read(b, name)
      if (av == null && bv == null) continue
      if (av == null) return 1
      if (bv == null) return -1
      if (av !== bv) return bv - av
    }
    return a.command.localeCompare(b.command)
  })
}

/** 按命令名对齐，每个分位取最大值。空 INFO 的节点只出现在 nodes 里。 */
export function aggregateMasterLatencyStats(sources: MasterStatSource[]): {
  percentiles: string[]
  rows: LatencyMasterRow[]
  nodes: LatencyMasterNode[]
} {
  const byCommand = new Map<string, LatencyMasterRow>()
  const percentileSet = new Set<string>()
  const nodes: LatencyMasterNode[] = sources.map(source => {
    const info = source.info.trim()
    if (!info) {
      return {
        label: source.label,
        node: source.node,
        uptimeSeconds: null,
        missing: true,
        sectionPresent: false,
        redisVersion: null,
        noSamples: false,
      }
    }
    const parsed = parseLatencyStats(info)
    for (const row of parsed.rows) {
      let acc = byCommand.get(row.command)
      if (!acc) {
        acc = { command: row.command, cells: {} }
        byCommand.set(row.command, acc)
      }
      for (const [name, usec] of Object.entries(row.usec)) {
        percentileSet.add(name)
        const cur = acc.cells[name]
        if (!cur || usec > cur.usec) acc.cells[name] = { usec, labels: [source.label] }
        else if (usec === cur.usec) cur.labels.push(source.label)
      }
    }
    return {
      label: source.label,
      node: source.node,
      uptimeSeconds: readUptimeSeconds(info),
      missing: false,
      sectionPresent: parsed.sectionPresent,
      redisVersion: parsed.redisVersion,
      noSamples: parsed.rows.length === 0,
    }
  })

  const percentiles = [...percentileSet].sort((a, b) => percentileValue(a) - percentileValue(b))
  const rows = sortByPercentile(
    [...byCommand.values()],
    percentiles,
    (row, name) => row.cells[name]?.usec,
  )
  return { percentiles, rows, nodes }
}
