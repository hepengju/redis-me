/** Redis 展示元数据：键类型 Tag/简称，以及集群节点列表 enrich */
import { sortBy } from 'lodash'

import i18n from '@/locales'
import type { EnrichedRedisNode, KeyTypeListItem } from '@/types/me-interface'
import type { RedisNode } from '@/types/tauri-specta'

const t = i18n.global.t

/** value：界面展示名（驼峰）；SCAN/新建键经 toRedisTypeName 转 Redis TYPE */
export const KEY_TYPE_LIST: KeyTypeListItem[] = [
  { short: 'S', value: 'String', type: 'primary' },
  { short: 'H', value: 'Hash', type: 'success' },
  { short: 'L', value: 'List', type: 'info' },
  { short: 'A', value: 'Array', type: 'info' }, // Redis 8.8；与 List 同色，紧挨 List
  { short: 'E', value: 'Set', type: 'warning' },
  { short: 'Z', value: 'SortedSet', type: 'warning' },
  { short: 'V', value: 'VectorSet', type: 'warning' }, // Redis 8.4+；与 *Set 同色，紧挨 SortedSet
  { short: 'X', value: 'Stream', type: 'danger' },
  { short: 'J', value: 'Json', type: 'danger' },
  { short: 'T', value: 'TimeSeries', type: 'danger' }, // RedisTimeSeries；TYPE=TSDB-TYPE；列表垫底
]

const keyTypeMap = new Map(KEY_TYPE_LIST.map(item => [item.value, item.type]))
const keyShortMap = new Map(KEY_TYPE_LIST.map(item => [item.value, item.short]))

/** Redis TYPE / 旧大写名 / 展示名 → 列表 value（如 zset→SortedSet） */
export function toKeyTypeLabel(keyType: string | undefined | null): string {
  if (!keyType) return ''
  switch (keyType.toLowerCase()) {
    case 'zset':
    case 'sortedset':
      return 'SortedSet'
    case 'vectorset':
      return 'VectorSet'
    case 'rejson-rl':
    case 'json':
      return 'Json'
    case 'string':
      return 'String'
    case 'hash':
      return 'Hash'
    case 'list':
      return 'List'
    case 'set':
      return 'Set'
    case 'stream':
      return 'Stream'
    case 'array':
      return 'Array'
    case 'tsdb-type':
    case 'timeseries':
      return 'TimeSeries'
    default:
      return (
        KEY_TYPE_LIST.find(i => i.value.toLowerCase() === keyType.toLowerCase())?.value ?? keyType
      )
  }
}

/** 展示名或杂糅输入 → Redis TYPE 小写（SCAN / fieldAdd） */
export function toRedisTypeName(displayOrRedis: string): string {
  switch (displayOrRedis.toLowerCase()) {
    case 'sortedset':
    case 'zset':
      return 'zset'
    // 展示名 TimeSeries → IPC/SCAN 用 timeseries（后端再换成 TSDB-TYPE）
    case 'timeseries':
      return 'timeseries'
    default:
      return displayOrRedis.toLowerCase()
  }
}

/** 键类型：el-text, el-tag 的 type */
export function meType(keyType: string | undefined | null): string {
  if (!keyType) return 'info'
  return keyTypeMap.get(toKeyTypeLabel(keyType)) || 'info'
}

/** 键类型短：避免 String、Set 的简称都是 S */
export function meKeyShort(keyType: string | undefined | null, defaultValue = '?'): string {
  if (!keyType) return defaultValue
  return keyShortMap.get(toKeyTypeLabel(keyType)) || defaultValue
}

/**
 * 将 node_list 接口数据排序并补充与 UI 一致的字段。
 * 展示顺序：M1/M2/… 在上，同编号的 S1/S2/… 在下。
 */
export function enrichNodeList(rawList: RedisNode[] | null | undefined): EnrichedRedisNode[] {
  if (!rawList?.length) return []
  const sorted = sortBy(rawList, 'node') as EnrichedRedisNode[]

  let masterIndex = 0
  const masterMap = new Map<string, { idx: number; slots: string | null }>()
  sorted.forEach(item => {
    item.isMaster = item.flags?.includes('master') ?? false
    item.isSlave = item.flags?.includes('slave') ?? false
    if (item.isMaster) {
      masterIndex++
      item.shortLabel = 'M' + masterIndex
      masterMap.set(item.node, { idx: masterIndex, slots: item.slots })
    }
  })
  sorted.forEach(item => {
    if (item.isSlave && item.slaveOfNode) {
      const master = masterMap.get(item.slaveOfNode)
      if (master) {
        item.shortLabel = 'S' + master.idx
        item.masterSlots = master.slots
      }
    }

    if (item.isMaster && item.slots) {
      item.slotsTooltip = t('nodeList.slotsTooltip', { slots: item.slots })
    } else if (item.isSlave && item.masterSlots) {
      item.slotsTooltip = t('nodeList.slotsReplicaTooltip', { slots: item.masterSlots })
    } else {
      item.slotsTooltip = ''
    }

    if (!item.shortLabel) {
      item.shortLabel = item.flags?.slice(0, 1).toUpperCase() || 'F'
    }
  })

  return sorted.sort((a, b) => {
    const rank = (item: EnrichedRedisNode) => (item.isMaster ? 0 : item.isSlave ? 1 : 2)
    const num = (label: string) => {
      const m = /^[MS](\d+)$/.exec(label)
      return m ? Number(m[1]) : 999
    }
    return (
      rank(a) - rank(b) || num(a.shortLabel) - num(b.shortLabel) || a.node.localeCompare(b.node)
    )
  })
}
