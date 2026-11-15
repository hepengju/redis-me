import { describe, expect, it } from 'vite-plus/test'

import i18n from '@/locales'
import type { RedisNode } from '@/types/tauri-specta'
import {
  KEY_TYPE_LIST,
  enrichNodeList,
  meKeyShort,
  meType,
  toKeyTypeLabel,
  toRedisTypeName,
} from '@/utils/redis/redis-display'

function node(
  name: string,
  flags: string,
  extra: Partial<Pick<RedisNode, 'slots' | 'slaveOfNode'>> = {},
): RedisNode {
  return {
    id: name,
    node: name,
    flags,
    slots: extra.slots ?? null,
    slaveOfNode: extra.slaveOfNode ?? null,
  }
}

describe('toKeyTypeLabel', () => {
  it('空值', () => {
    expect(toKeyTypeLabel(undefined)).toBe('')
    expect(toKeyTypeLabel(null)).toBe('')
    expect(toKeyTypeLabel('')).toBe('')
  })

  it('Redis TYPE、旧名、展示名归一到列表 value', () => {
    expect(toKeyTypeLabel('string')).toBe('String')
    expect(toKeyTypeLabel('HASH')).toBe('Hash')
    expect(toKeyTypeLabel('list')).toBe('List')
    expect(toKeyTypeLabel('set')).toBe('Set')
    expect(toKeyTypeLabel('zset')).toBe('SortedSet')
    expect(toKeyTypeLabel('sortedset')).toBe('SortedSet')
    expect(toKeyTypeLabel('vectorset')).toBe('VectorSet')
    expect(toKeyTypeLabel('stream')).toBe('Stream')
    expect(toKeyTypeLabel('rejson-rl')).toBe('Json')
    expect(toKeyTypeLabel('JSON')).toBe('Json')
    expect(toKeyTypeLabel('array')).toBe('Array')
    expect(toKeyTypeLabel('tsdb-type')).toBe('TimeSeries')
    expect(toKeyTypeLabel('timeseries')).toBe('TimeSeries')
    expect(toKeyTypeLabel('String')).toBe('String')
  })

  it('未知类型保留原字符串', () => {
    expect(toKeyTypeLabel('FooBar')).toBe('FooBar')
  })
})

describe('toRedisTypeName', () => {
  it('展示名转 SCAN / fieldAdd 用的小写 TYPE', () => {
    expect(toRedisTypeName('SortedSet')).toBe('zset')
    expect(toRedisTypeName('zset')).toBe('zset')
    expect(toRedisTypeName('TimeSeries')).toBe('timeseries')
    expect(toRedisTypeName('Hash')).toBe('hash')
    expect(toRedisTypeName('VectorSet')).toBe('vectorset')
  })

  it('模块原始 TYPE 收成 IPC 名', () => {
    expect(toRedisTypeName('TSDB-TYPE')).toBe('timeseries')
    expect(toRedisTypeName('tsdb-type')).toBe('timeseries')
    expect(toRedisTypeName('ReJSON-RL')).toBe('json')
  })
})

describe('meType / meKeyShort', () => {
  it('列表简称互不冲突，Set 不是 S', () => {
    expect(KEY_TYPE_LIST.map(item => item.short)).toEqual([
      'S',
      'H',
      'L',
      'A',
      'E',
      'Z',
      'V',
      'X',
      'J',
      'T',
    ])
    expect(meKeyShort('set')).toBe('E')
    expect(meKeyShort('string')).toBe('S')
    expect(meKeyShort('zset')).toBe('Z')
    expect(meKeyShort('tsdb-type')).toBe('T')
  })

  it('颜色与空值默认', () => {
    expect(meType('string')).toBe('primary')
    expect(meType('hash')).toBe('success')
    expect(meType('list')).toBe('info')
    expect(meType('array')).toBe('info')
    expect(meType('set')).toBe('warning')
    expect(meType('vectorset')).toBe('warning')
    expect(meType('stream')).toBe('danger')
    expect(meType('json')).toBe('danger')
    expect(meType('timeseries')).toBe('danger')
    expect(meType(null)).toBe('info')
    expect(meType('nope')).toBe('info')
    expect(meKeyShort(null)).toBe('?')
    expect(meKeyShort('', '*')).toBe('*')
    expect(meKeyShort('nope')).toBe('?')
  })
})

describe('enrichNodeList', () => {
  it('空列表', () => {
    expect(enrichNodeList(null)).toEqual([])
    expect(enrichNodeList(undefined)).toEqual([])
    expect(enrichNodeList([])).toEqual([])
  })

  it('主从按节点名编号，展示顺序是全部主节点再全部从节点', () => {
    i18n.global.locale.value = 'en'
    const list = enrichNodeList([
      node('m2', 'master', { slots: '101-200' }),
      node('s-m1', 'slave', { slaveOfNode: 'm1' }),
      node('m1', 'myself,master', { slots: '0-100' }),
      node('s-m2', 'slave', { slaveOfNode: 'm2' }),
      node('other', 'handshake'),
    ])

    expect(list.map(item => `${item.shortLabel}:${item.node}`)).toEqual([
      'M1:m1',
      'M2:m2',
      'S1:s-m1',
      'S2:s-m2',
      'H:other',
    ])
    expect(list[0]?.isMaster).toBe(true)
    expect(list[0]?.slotsTooltip).toBe('Slots: 0-100')
    expect(list[2]?.isSlave).toBe(true)
    expect(list[2]?.masterSlots).toBe('0-100')
    expect(list[2]?.slotsTooltip).toBe("Master's slots: 0-100")
    expect(list[4]?.slotsTooltip).toBe('')
  })

  it('从节点找不到主、主节点没有槽位时不编造提示', () => {
    const list = enrichNodeList([
      node('m', 'master'),
      node('s', 'slave', { slaveOfNode: 'missing' }),
      node('x', ''),
    ])
    expect(list.map(item => item.shortLabel)).toEqual(['M1', 'S', 'F'])
    expect(list.every(item => item.slotsTooltip === '')).toBe(true)
  })

  it('同一主节点的多个从节点共用编号，再按节点名排序', () => {
    const list = enrichNodeList([
      node('m', 'master', { slots: '0' }),
      node('s-b', 'slave', { slaveOfNode: 'm' }),
      node('s-a', 'slave', { slaveOfNode: 'm' }),
    ])
    expect(list.map(item => `${item.shortLabel}:${item.node}`)).toEqual([
      'M1:m',
      'S1:s-a',
      'S1:s-b',
    ])
  })
})
