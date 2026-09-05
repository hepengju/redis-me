import { describe, expect, it } from 'vite-plus/test'

import type { RedisKeySize_Serialize } from '@/types/tauri-specta'
import { mergeMemoryHits } from '@/utils/memory-scan'

function row(key: string, size: number): RedisKeySize_Serialize {
  return { key, bytes: '', type: 'string', size }
}

describe('mergeMemoryHits', () => {
  it('按 size 降序合并并去重', () => {
    const merged = mergeMemoryHits([row('a', 10)], [row('b', 30), row('a', 10)])
    expect(merged.map(r => r.key)).toEqual(['b', 'a'])
  })

  it('空 incoming 保持原列表顺序（已排序）', () => {
    const existing = [row('b', 30), row('a', 10)]
    expect(mergeMemoryHits(existing, []).map(r => r.key)).toEqual(['b', 'a'])
  })
})
