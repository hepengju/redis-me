import { describe, expect, it } from 'vite-plus/test'

import { attrsNormalizedEqual, parseAttrsInput, parseVectorInput } from '@/utils/redis/vector'

describe('parseVectorInput', () => {
  it('空文本是空向量', () => {
    expect(parseVectorInput('')).toEqual({ ok: true, nums: [] })
    expect(parseVectorInput('  \n')).toEqual({ ok: true, nums: [] })
    expect(parseVectorInput('[]')).toEqual({ ok: true, nums: [] })
  })

  it('空白或逗号分隔，以及 JSON5 数组', () => {
    expect(parseVectorInput('1 2,  3')).toEqual({ ok: true, nums: [1, 2, 3] })
    expect(parseVectorInput('[1, 2,]')).toEqual({ ok: true, nums: [1, 2] })
    expect(parseVectorInput('[-1.5, 0]')).toEqual({ ok: true, nums: [-1.5, 0] })
  })

  it('非数组、非数字、非法 JSON 失败', () => {
    expect(parseVectorInput('{"a":1}')).toEqual({ ok: false })
    expect(parseVectorInput('[1, "a"]')).toEqual({ ok: false })
    expect(parseVectorInput('1 Infinity')).toEqual({ ok: false })
    expect(parseVectorInput('[')).toEqual({ ok: false })
    expect(parseVectorInput('[1, 2')).toEqual({ ok: false })
  })
})

describe('parseAttrsInput', () => {
  it('空文本合法，对象收成紧凑 JSON', () => {
    expect(parseAttrsInput('')).toEqual({ ok: true, json: '' })
    expect(parseAttrsInput('  ')).toEqual({ ok: true, json: '' })
    expect(parseAttrsInput('{a:1,}')).toEqual({ ok: true, json: '{"a":1}' })
  })

  it('数组、null、标量和非法 JSON 失败', () => {
    expect(parseAttrsInput('[]')).toEqual({ ok: false })
    expect(parseAttrsInput('null')).toEqual({ ok: false })
    expect(parseAttrsInput('"s"')).toEqual({ ok: false })
    expect(parseAttrsInput('1')).toEqual({ ok: false })
    expect(parseAttrsInput('{')).toEqual({ ok: false })
  })
})

describe('attrsNormalizedEqual', () => {
  it('书写差异不算脏', () => {
    expect(attrsNormalizedEqual(' { a: 1 } ', '{"a":1}')).toBe(true)
    expect(attrsNormalizedEqual('', '  ')).toBe(true)
  })

  it('内容不同，或一边解析失败时按 trim 后原文比较', () => {
    expect(attrsNormalizedEqual('{"a":1}', '{"a":2}')).toBe(false)
    expect(attrsNormalizedEqual('foo', ' foo ')).toBe(true)
    expect(attrsNormalizedEqual('foo', 'bar')).toBe(false)
    expect(attrsNormalizedEqual('{"a":1}', 'not-json')).toBe(false)
  })
})
