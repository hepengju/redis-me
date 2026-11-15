import { describe, expect, it } from 'vite-plus/test'

import {
  formatPickleDisplay,
  normalizePickleObject,
  pickleBase64ToValue,
} from '@/utils/codec/pickle'

/** 由 Python pickle.dumps 生成的固定样例（protocol 4，除非另行注明） */
const SAMPLES = {
  str: 'gASVCQAAAAAAAACMBWhlbGxvlC4=',
  dict: 'gASVFwAAAAAAAAB9lCiMAWGUSwGMAWKUXZQoSwFLAmV1Lg==',
  list: 'gAWVDAAAAAAAAABdlChLAYwBeJSIZS4=',
  proto2: 'gAJ9cQBYAQAAAGtxAVgBAAAAdnECcy4=',
  bytes: 'gASVBwAAAAAAAABDA2FiY5Qu',
  set: 'gASVCwAAAAAAAACPlChLAUsCSwOQLg==',
  tuple: 'gASVBwAAAAAAAABLAUsChpQu',
  none: 'gAROLg==',
  int: 'gARLKi4=',
  /** __main__.Point(1, 2) */
  point: 'gASVKgAAAAAAAACMCF9fbWFpbl9flIwFUG9pbnSUk5QpgZR9lCiMAXiUSwGMAXmUSwJ1Yi4=',
  /** datetime.date(2024, 6, 1) */
  date: 'gASVIAAAAAAAAACMCGRhdGV0aW1llIwEZGF0ZZSTlEMEB+gGAZSFlFKULg==',
  /** datetime.time(14, 30, 0) */
  time: 'gASVIgAAAAAAAACMCGRhdGV0aW1llIwEdGltZZSTlEMGDh4AAAAAlIWUUpQu',
  /** datetime.datetime(2024,1,2,3,4,5) */
  datetime: 'gASVKgAAAAAAAACMCGRhdGV0aW1llIwIZGF0ZXRpbWWUk5RDCgfoAQIDBAUAAACUhZRSlC4=',
  /** decimal.Decimal('12345.6789') */
  decimal: 'gASVKAAAAAAAAACMB2RlY2ltYWyUjAdEZWNpbWFslJOUjAoxMjM0NS42Nzg5lIWUUpQu',
  /** 含 __module__/__name__ 键的普通 dict，不能误判为代理 */
  dictLikeProxy: 'gASVKwAAAAAAAAB9lCiMCl9fbW9kdWxlX1+UjAF4lIwIX19uYW1lX1+UjAF5lIwBYZRLAXUu',
  /** bytearray(b'xyz') */
  bytearray: 'gASVJAAAAAAAAACMCGJ1aWx0aW5zlIwJYnl0ZWFycmF5lJOUQwN4eXqUhZRSlC4=',
  /** complex(1, 2) */
  complex: 'gASVLgAAAAAAAACMCGJ1aWx0aW5zlIwHY29tcGxleJSTlEc/8AAAAAAAAEdAAAAAAAAAAIaUUpQu',
} as const

describe('pickle', () => {
  it('normalize 循环引用不栈溢出', () => {
    const a: Record<string, unknown> = { $class: 'A' }
    const b: Record<string, unknown> = { $class: 'B' }
    a.b = b
    b.a = a
    const out = normalizePickleObject(a) as Record<string, unknown>
    expect(out.$class).toBe('A')
    expect((out.b as Record<string, unknown>).$class).toBe('B')
    expect((out.b as Record<string, unknown>).a).toEqual({ $ref: 'circular' })
  })

  it('顶层 str 为纯文本', () => {
    expect(pickleBase64ToValue(SAMPLES.str)).toBe('hello')
    expect(formatPickleDisplay(pickleBase64ToValue(SAMPLES.str))).toBe('hello')
  })

  it('解码常见容器与标量', () => {
    expect(pickleBase64ToValue(SAMPLES.dict)).toEqual({ a: 1, b: [1, 2] })
    expect(pickleBase64ToValue(SAMPLES.list)).toEqual([1, 'x', true])
    expect(pickleBase64ToValue(SAMPLES.proto2)).toEqual({ k: 'v' })
    expect(pickleBase64ToValue(SAMPLES.set)).toEqual([1, 2, 3])
    expect(pickleBase64ToValue(SAMPLES.tuple)).toEqual([1, 2])
    expect(pickleBase64ToValue(SAMPLES.none)).toBeNull()
    expect(pickleBase64ToValue(SAMPLES.int)).toBe(42)
  })

  it('bytes → value 字节数组', () => {
    expect(pickleBase64ToValue(SAMPLES.bytes)).toEqual({ $type: 'bytes', value: [97, 98, 99] })
  })

  it('自定义类 → $class + 属性', () => {
    expect(pickleBase64ToValue(SAMPLES.point)).toEqual({ $class: 'Point', x: 1, y: 2 })
  })

  it('datetime.date/time/datetime → ISO value', () => {
    expect(pickleBase64ToValue(SAMPLES.date)).toEqual({
      $type: 'datetime.date',
      value: '2024-06-01',
    })
    expect(pickleBase64ToValue(SAMPLES.time)).toEqual({ $type: 'datetime.time', value: '14:30:00' })
    expect(pickleBase64ToValue(SAMPLES.datetime)).toEqual({
      $type: 'datetime.datetime',
      value: '2024-01-02T03:04:05',
    })
  })

  it('decimal.Decimal → 字符串 value', () => {
    expect(pickleBase64ToValue(SAMPLES.decimal)).toEqual({
      $type: 'decimal.Decimal',
      value: '12345.6789',
    })
  })

  it('含 __module__/__name__ 的 dict 不当成代理', () => {
    expect(pickleBase64ToValue(SAMPLES.dictLikeProxy)).toEqual({
      __module__: 'x',
      __name__: 'y',
      a: 1,
    })
  })

  it('bytearray / complex 友好展示', () => {
    expect(pickleBase64ToValue(SAMPLES.bytearray)).toEqual({
      $type: 'bytearray',
      value: [120, 121, 122],
    })
    expect(pickleBase64ToValue(SAMPLES.complex)).toEqual({
      $type: 'complex',
      value: { real: 1, imag: 2 },
    })
  })

  it('format 保留 NaN/Infinity 字面量', () => {
    expect(formatPickleDisplay(Number.NaN)).toContain('NaN')
    expect(formatPickleDisplay(Number.POSITIVE_INFINITY)).toContain('Infinity')
  })
})
