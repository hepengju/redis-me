import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { effectScope } from 'vue'

import { createRealtimeStream, filterByKeyword } from '@/utils/realtime-stream'

interface Row {
  k: string
}

function runIn<T>(fn: () => T): T {
  return effectScope().run(fn) as T
}

describe('createRealtimeStream', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('批量缓冲：一条一批不立即入列，到 flushMs 才并入', () => {
    runIn(() => {
      const s = createRealtimeStream<Row>({ maxRows: 100, flushMs: 200 })
      s.push({ k: 'a' })
      expect(s.list.value).toEqual([])
      vi.advanceTimersByTime(199)
      expect(s.list.value).toEqual([])
      vi.advanceTimersByTime(1)
      expect(s.list.value).toEqual([{ k: 'a' }])
    })
  })

  it('同批多次 push 只调度一次 flush', () => {
    runIn(() => {
      const s = createRealtimeStream<Row>({ maxRows: 100, flushMs: 200 })
      s.push({ k: 'a' })
      s.push({ k: 'b' })
      s.push({ k: 'c' })
      vi.advanceTimersByTime(200)
      // 新→旧：最后到达的排最前
      expect(s.list.value.map(r => r.k)).toEqual(['c', 'b', 'a'])
    })
  })

  it('flush 立即收尾并清空缓冲，不再重复入列', () => {
    runIn(() => {
      const s = createRealtimeStream<Row>({ maxRows: 100, flushMs: 200 })
      s.push({ k: 'a' })
      s.flush()
      expect(s.list.value).toEqual([{ k: 'a' }])
      vi.advanceTimersByTime(200)
      expect(s.list.value).toEqual([{ k: 'a' }])
    })
  })

  it('超过 maxRows 丢弃尾部最旧数据', () => {
    runIn(() => {
      const s = createRealtimeStream<Row>({ maxRows: 3, flushMs: 200 })
      for (let i = 0; i < 5; i++) s.push({ k: `${i}` })
      s.flush()
      // 保留最新 3 条，倒序
      expect(s.list.value.map(r => r.k)).toEqual(['4', '3', '2'])
    })
  })

  it('clear 同时清缓冲与列表', () => {
    runIn(() => {
      const s = createRealtimeStream<Row>({ maxRows: 100, flushMs: 200 })
      s.push({ k: 'a' })
      s.flush()
      s.push({ k: 'b' })
      s.clear()
      expect(s.list.value).toEqual([])
      vi.advanceTimersByTime(200)
      expect(s.list.value).toEqual([])
    })
  })
})

describe('filterByKeyword', () => {
  const match = (row: Row, key: string) => row.k.toLowerCase().indexOf(key) > -1

  it('空关键字复用同一数组引用（不新建副本）', () => {
    const list: Row[] = [{ k: 'a' }, { k: 'b' }]
    expect(filterByKeyword(list, '', match)).toBe(list)
  })

  it('有关键字时忽略大小写过滤，返回新数组', () => {
    const list: Row[] = [{ k: 'Apple' }, { k: 'banana' }]
    const out = filterByKeyword(list, 'APPLE', match)
    expect(out).toEqual([{ k: 'Apple' }])
    expect(out).not.toBe(list)
  })
})
