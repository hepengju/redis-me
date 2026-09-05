import { encode } from '@msgpack/msgpack'
import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vite-plus/test'

import {
  detectViewFormat,
  detectViewFormatAuto,
  detectedViewLabel,
  peelGzipWire,
} from '@/utils/detect-view-format'

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

describe('detectViewFormat', () => {
  it('空值 → utf8', () => {
    expect(detectViewFormat('')).toBe('utf8')
  })

  it('ACED JdkSerial', () => {
    // java.util.TreeSet 样例（与 javaserial 单测同源）
    const b64 = 'rO0ABXNyABFqYXZhLnV0aWwuVHJlZVNldN2YUJOV7YdbAwAAeHBwdwQAAAACdAABYXQAAWJ4'
    expect(detectViewFormat(b64)).toBe('javaserial')
  })

  it('截断 ACED 试解失败 → 不认 JdkSerial', () => {
    expect(detectViewFormat(bytesToBase64(new Uint8Array([0xac, 0xed, 0x00, 0x05])))).toBe('hex')
  })

  it('Pickle PROTO4 dict', () => {
    expect(detectViewFormat('gASVFwAAAAAAAAB9lCiMAWGUSwGMAWKUXZQoSwFLAmV1Lg==')).toBe('pickle')
  })

  it('截断 PROTO 试解失败 → 不认 Pickle', () => {
    expect(detectViewFormat(bytesToBase64(new Uint8Array([0x80, 0x04])))).toBe('hex')
  })

  it('Pickle PROTO2 不被 MsgPack 误判', () => {
    expect(detectViewFormat('gAJ9cQBYAQAAAGtxAVgBAAAAdnECcy4=')).toBe('pickle')
  })

  it('PhpSerial 数组 / 对象', () => {
    expect(detectViewFormat(utf8ToBase64('a:1:{s:1:"a";i:1;}'))).toBe('phpserial')
    expect(detectViewFormat(utf8ToBase64('O:4:"User":1:{s:4:"name";s:3:"Bob";}'))).toBe('phpserial')
  })

  it('PhpSerial 标量根不参与 Auto → utf8', () => {
    expect(detectViewFormat(utf8ToBase64('s:5:"hello";'))).toBe('utf8')
    expect(detectViewFormat(utf8ToBase64('i:123;'))).toBe('utf8')
  })

  it('截断 PhpSerial 试解失败 → 不认', () => {
    expect(detectViewFormat(utf8ToBase64('a:1:{i:0;'))).toBe('utf8')
  })

  it('a 开头普通文本不被误判为 PhpSerial', () => {
    expect(detectViewFormat(utf8ToBase64('apricot and apple'))).toBe('utf8')
  })

  it('MsgPack 空 map(0x80) 不是 Pickle', () => {
    expect(detectViewFormat(bytesToBase64(new Uint8Array([0x80])))).toBe('msgpack')
  })

  it('MsgPack map', () => {
    expect(detectViewFormat(bytesToBase64(encode({ a: 1, b: 'x' })))).toBe('msgpack')
  })

  it('MsgPack array', () => {
    expect(detectViewFormat(bytesToBase64(encode([1, 2, 3])))).toBe('msgpack')
  })

  it('普通 JSON 文本 → utf8（不是 StrJson）', () => {
    expect(detectViewFormat(utf8ToBase64('{"a":1}'))).toBe('utf8')
  })

  it('双层 StrJson', () => {
    const wire = JSON.stringify(JSON.stringify({ a: 1 }))
    expect(detectViewFormat(utf8ToBase64(wire))).toBe('strjson')
  })

  it('普通 UTF-8 文本', () => {
    expect(detectViewFormat(utf8ToBase64('hello 你好'))).toBe('utf8')
  })

  it('非法 UTF-8 → hex', () => {
    expect(detectViewFormat(bytesToBase64(new Uint8Array([0xff, 0xfe, 0xfd])))).toBe('hex')
  })

  it('非法 base64 → hex', () => {
    expect(detectViewFormat('!!!not-base64!!!')).toBe('hex')
  })

  it('短 UTF-8 不被 MsgPack 误判', () => {
    expect(detectViewFormat(utf8ToBase64('hello'))).toBe('utf8')
    expect(detectViewFormat(utf8ToBase64('a'))).toBe('utf8')
  })

  it('预览截断在汉字中间 → utf8（未标 truncated 仍为 hex）', () => {
    const bytes = new TextEncoder().encode('你好世界')
    const cut = bytes.subarray(0, 5) // 「你」3 字节 + 「好」被切 2 字节
    expect(detectViewFormat(bytesToBase64(cut))).toBe('hex')
    expect(detectViewFormat(bytesToBase64(cut), { truncated: true })).toBe('utf8')
  })

  it('预览截断在 emoji 中间 → utf8', () => {
    const bytes = new TextEncoder().encode('hi👋')
    const cut = bytes.subarray(0, 4) // hi + emoji 前 2 字节
    expect(detectViewFormat(bytesToBase64(cut), { truncated: true })).toBe('utf8')
  })

  it('预览截断且字符完整 → utf8', () => {
    expect(detectViewFormat(utf8ToBase64('你好'), { truncated: true })).toBe('utf8')
  })

  it('预览截断的非法 UTF-8 仍为 hex', () => {
    expect(
      detectViewFormat(bytesToBase64(new Uint8Array([0xff, 0xfe, 0xfd])), { truncated: true }),
    ).toBe('hex')
  })
})

function gzipBase64(bytes: Uint8Array): string {
  return bytesToBase64(gzipSync(bytes))
}

describe('peelGzipWire / detectViewFormatAuto', () => {
  it('非 Gzip 原样返回', () => {
    const wire = utf8ToBase64('hello')
    expect(peelGzipWire(wire)).toEqual({ gzip: false, wire })
    expect(detectViewFormatAuto(wire)).toEqual({ view: 'utf8', gzip: false, wire })
  })

  it('Gzip + UTF8', () => {
    const inner = new TextEncoder().encode('hello gzip 你好')
    const auto = detectViewFormatAuto(gzipBase64(inner))
    expect(auto.gzip).toBe(true)
    expect(auto.view).toBe('utf8')
    expect(auto.wire).toBe(bytesToBase64(inner))
    expect(detectedViewLabel(auto.view, auto.gzip)).toBe('Gzip · UTF8')
  })

  it('Gzip + 普通 JSON → UTF8（不是 StrJson）', () => {
    const inner = new TextEncoder().encode('{"a":1}')
    const auto = detectViewFormatAuto(gzipBase64(inner))
    expect(auto).toMatchObject({ gzip: true, view: 'utf8' })
  })

  it('Gzip + 双层 StrJson', () => {
    const inner = new TextEncoder().encode(JSON.stringify(JSON.stringify({ a: 1 })))
    expect(detectViewFormatAuto(gzipBase64(inner))).toMatchObject({ gzip: true, view: 'strjson' })
  })

  it('Gzip + JdkSerial', () => {
    const innerB64 = 'rO0ABXNyABFqYXZhLnV0aWwuVHJlZVNldN2YUJOV7YdbAwAAeHBwdwQAAAACdAABYXQAAWJ4'
    const inner = Uint8Array.from(atob(innerB64), c => c.charCodeAt(0))
    const auto = detectViewFormatAuto(gzipBase64(inner))
    expect(auto.gzip).toBe(true)
    expect(auto.view).toBe('javaserial')
    expect(auto.wire).toBe(innerB64)
    expect(detectedViewLabel(auto.view, auto.gzip)).toBe('Gzip · JdkSerial')
  })

  it('Gzip + Pickle', () => {
    const innerB64 = 'gASVFwAAAAAAAAB9lCiMAWGUSwGMAWKUXZQoSwFLAmV1Lg=='
    const inner = Uint8Array.from(atob(innerB64), c => c.charCodeAt(0))
    expect(detectViewFormatAuto(gzipBase64(inner))).toMatchObject({ gzip: true, view: 'pickle' })
  })

  it('Gzip + PhpSerial', () => {
    const inner = new TextEncoder().encode('a:1:{s:1:"a";i:1;}')
    expect(detectViewFormatAuto(gzipBase64(inner))).toMatchObject({ gzip: true, view: 'phpserial' })
  })

  it('Gzip + MsgPack', () => {
    const inner = encode({ a: 1, b: 'x' })
    expect(detectViewFormatAuto(gzipBase64(inner))).toMatchObject({ gzip: true, view: 'msgpack' })
  })

  it('Gzip + 非法 UTF-8 → Hex', () => {
    const inner = new Uint8Array([0xff, 0xfe, 0xfd])
    expect(detectViewFormatAuto(gzipBase64(inner))).toMatchObject({ gzip: true, view: 'hex' })
  })

  it('只剥一层：Gzip(Gzip(utf8)) 内层仍是 Gzip → Hex', () => {
    const utf8 = new TextEncoder().encode('nested')
    const innerGz = gzipSync(utf8)
    const auto = detectViewFormatAuto(gzipBase64(innerGz))
    expect(auto.gzip).toBe(true)
    expect(auto.view).toBe('hex')
    expect(auto.wire).toBe(bytesToBase64(innerGz))
  })

  it('魔数对但解压失败 → 不当壳', () => {
    const junk = new Uint8Array([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3])
    const wire = bytesToBase64(junk)
    expect(peelGzipWire(wire)).toEqual({ gzip: false, wire })
    expect(detectViewFormatAuto(wire).gzip).toBe(false)
  })

  it('截断 Gzip 跳过剥壳', () => {
    const gz = gzipSync(new TextEncoder().encode('hello-truncated'))
    const cut = gz.subarray(0, Math.max(10, gz.length - 8))
    const auto = detectViewFormatAuto(bytesToBase64(cut), { truncated: true })
    expect(auto.gzip).toBe(false)
  })

  it('不经 Auto 的 detectViewFormat 不剥壳（Gzip 原始字节 → hex）', () => {
    const gz = gzipSync(new TextEncoder().encode('hello'))
    expect(detectViewFormat(bytesToBase64(gz))).toBe('hex')
  })
})
