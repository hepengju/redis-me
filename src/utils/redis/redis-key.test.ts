import { describe, expect, it } from 'vite-plus/test'

import { utf8TextToBase64 } from '@/utils/codec/format'
import { redisKeyId, redisKeyWireBase64, sameRedisKey } from '@/utils/redis/redis-key'

describe('sameRedisKey', () => {
  it('双方省略 bytes：比 key', () => {
    expect(sameRedisKey({ key: 'a', bytes: '' }, { key: 'a', bytes: '' })).toBe(true)
    expect(sameRedisKey({ key: 'a', bytes: '' }, { key: 'b', bytes: '' })).toBe(false)
  })

  it('双方有 bytes：比 bytes', () => {
    expect(sameRedisKey({ key: 'x', bytes: 'YQ==' }, { key: 'y', bytes: 'YQ==' })).toBe(true)
    expect(sameRedisKey({ key: 'x', bytes: 'YQ==' }, { key: 'x', bytes: 'Yg==' })).toBe(false)
  })

  it('旧收藏有 bytes、新扫描省略：UTF-8 可互通', () => {
    const wire = utf8TextToBase64('user:1')
    expect(sameRedisKey({ key: 'user:1', bytes: wire }, { key: 'user:1', bytes: '' })).toBe(true)
    expect(sameRedisKey({ key: 'user:1', bytes: '' }, { key: 'user:1', bytes: wire })).toBe(true)
  })

  it('二进制 bytes 与无关 UTF-8 key 不相等', () => {
    // 0xff 非法 UTF-8
    expect(sameRedisKey({ key: '', bytes: '/w==' }, { key: '\ufffd', bytes: '' })).toBe(false)
  })
})

describe('redisKeyId / redisKeyWireBase64', () => {
  it('UTF-8 有无 bytes 归一为同一 id', () => {
    const wire = utf8TextToBase64('a')
    expect(redisKeyId({ key: 'a', bytes: '' })).toBe('k\0a')
    expect(redisKeyId({ key: 'a', bytes: wire })).toBe('k\0a')
  })

  it('非法 UTF-8 仍用 b: 前缀', () => {
    expect(redisKeyId({ key: '', bytes: '/w==' })).toBe('b\0/w==')
  })

  it('wire：空 bytes 时用 key 的 base64', () => {
    expect(redisKeyWireBase64({ key: 'ab', bytes: '' })).toBe(utf8TextToBase64('ab'))
    expect(redisKeyWireBase64({ key: 'x', bytes: 'YQ==' })).toBe('YQ==')
  })
})
