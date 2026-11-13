/** INFO commandstats → 命令行，以及多节点合计。
 * calls / usec 是各进程启动后的累计，不是当前速率。
 * 副本会把主库同步来的写命令再执行一遍，调用方决定传入哪些节点（信息页只传主节点）。
 * rejected_calls / failed_calls 从 Redis 7 起才有。参与合计的任一节点缺该字段时，整列留空，缺字段不当成 0。
 */

export type CommandStat = {
  command: string
  calls: number
  usec: number
  /** null：这份 INFO 没有 rejected_calls */
  rejected: number | null
  /** null：这份 INFO 没有 failed_calls */
  failed: number | null
}

export type CommandStatRow = CommandStat & {
  /** usec / calls；无调用时为 0 */
  avg: number
}

export type MasterStatSource = {
  label: string
  node: string
  /** 空串表示这台的 INFO 没回来 */
  info: string
}

export type MasterUptime = {
  label: string
  node: string
  uptimeSeconds: number | null
  missing: boolean
}

const PREFIX = 'cmdstat_'

function parseFields(value: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of value.split(',')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function readNum(map: Map<string, string>, key: string): number | null {
  const raw = map.get(key)
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 只读 `# Commandstats` 段。命令名保留 `cmdstat_` 之后的原文（含 `command|info` 这类子命令）。 */
export function parseCommandStats(info: string): CommandStat[] {
  const rows: CommandStat[] = []
  let inSection = false
  for (const rawLine of info.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      inSection = line.slice(1).trim().toLowerCase() === 'commandstats'
      continue
    }
    if (!inSection) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    if (!key.startsWith(PREFIX)) continue
    const command = key.slice(PREFIX.length)
    if (!command) continue
    const fields = parseFields(line.slice(index + 1))
    const calls = readNum(fields, 'calls')
    const usec = readNum(fields, 'usec')
    if (calls == null || usec == null) continue
    rows.push({
      command,
      calls,
      usec,
      rejected: fields.has('rejected_calls') ? readNum(fields, 'rejected_calls') : null,
      failed: fields.has('failed_calls') ? readNum(fields, 'failed_calls') : null,
    })
  }
  return rows
}

/** 展示行。默认按总耗时降序，其次调用次数，命令名只用来稳定次序。 */
export function commandStatRows(stats: CommandStat[]): CommandStatRow[] {
  return stats
    .map(stat => ({ ...stat, avg: stat.calls > 0 ? stat.usec / stat.calls : 0 }))
    .sort((a, b) => b.usec - a.usec || b.calls - a.calls || a.command.localeCompare(b.command))
}

export function readUptimeSeconds(info: string): number | null {
  for (const rawLine of info.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    if (line.slice(0, index).trim() !== 'uptime_in_seconds') continue
    const n = Number(line.slice(index + 1).trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** 有命令行的节点是否都带上该字段。没有命令行的节点不参与判断，避免把别的节点整列清空。 */
function fieldOnEveryRow(groups: CommandStat[][], field: 'rejected' | 'failed'): boolean {
  const known = groups
    .filter(rows => rows.length > 0)
    .map(rows => rows.every(row => row[field] != null))
  return known.length > 0 && known.every(Boolean)
}

/** 按命令名把 calls / usec 相加。平均耗时不在这里算，交给 commandStatRows。 */
export function aggregateMasterCommandStats(sources: MasterStatSource[]): {
  rows: CommandStat[]
  nodes: MasterUptime[]
} {
  const nodes: MasterUptime[] = sources.map(source => {
    const info = source.info.trim()
    if (!info) {
      return { label: source.label, node: source.node, uptimeSeconds: null, missing: true }
    }
    return {
      label: source.label,
      node: source.node,
      uptimeSeconds: readUptimeSeconds(info),
      missing: false,
    }
  })

  const parsed = sources
    .filter(source => source.info.trim())
    .map(source => parseCommandStats(source.info))
  const showRejected = fieldOnEveryRow(parsed, 'rejected')
  const showFailed = fieldOnEveryRow(parsed, 'failed')
  const map = new Map<string, CommandStat>()

  for (const rows of parsed) {
    for (const row of rows) {
      let acc = map.get(row.command)
      if (!acc) {
        acc = {
          command: row.command,
          calls: 0,
          usec: 0,
          rejected: showRejected ? 0 : null,
          failed: showFailed ? 0 : null,
        }
        map.set(row.command, acc)
      }
      acc.calls += row.calls
      acc.usec += row.usec
      if (showRejected && acc.rejected != null && row.rejected != null) {
        acc.rejected += row.rejected
      }
      if (showFailed && acc.failed != null && row.failed != null) {
        acc.failed += row.failed
      }
    }
  }

  return { rows: [...map.values()], nodes }
}
