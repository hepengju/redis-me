import { describe, expect, it } from 'vite-plus/test'

import { formatPhpSerialDisplay, phpSerialBase64ToValue } from '@/utils/codec/phpserial'

/** PHP 序列化文本 → UTF-8 字节 → base64（样例字节长度需与 s:/O: 声明一致） */
function b64(payload: string): string {
  const bytes = new TextEncoder().encode(payload)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

describe('phpSerialBase64ToValue', () => {
  it('标量：null / bool / int / float / string', () => {
    expect(phpSerialBase64ToValue(b64('N;'))).toBeNull()
    expect(phpSerialBase64ToValue(b64('b:1;'))).toBe(true)
    expect(phpSerialBase64ToValue(b64('b:0;'))).toBe(false)
    expect(phpSerialBase64ToValue(b64('i:25;'))).toBe(25)
    expect(phpSerialBase64ToValue(b64('d:1.5;'))).toBe(1.5)
    expect(phpSerialBase64ToValue(b64('s:5:"hello";'))).toBe('hello')
  })

  it('字符串长度按字节计数：中文 UTF-8 多字节不截断', () => {
    expect(phpSerialBase64ToValue(b64('s:6:"中文";'))).toBe('中文')
  })

  it('关联数组 → 对象；连续整数键 → 数组', () => {
    expect(phpSerialBase64ToValue(b64('a:2:{s:4:"name";s:5:"Alice";s:3:"age";i:25;}'))).toEqual({
      name: 'Alice',
      age: 25,
    })
    expect(phpSerialBase64ToValue(b64('a:2:{i:0;s:1:"a";i:1;s:1:"b";}'))).toEqual(['a', 'b'])
  })

  it('嵌套数组与混合值', () => {
    const payload = 'a:2:{s:4:"list";a:2:{i:0;i:1;i:1;i:2;}s:4:"flag";b:0;}'
    expect(phpSerialBase64ToValue(b64(payload))).toEqual({ list: [1, 2], flag: false })
  })

  it('O: 对象 → $class + 属性（私有/保护前缀剥离）', () => {
    const payload =
      'O:4:"User":3:{s:4:"name";s:3:"Bob";s:12:"\u0000User\u0000secret";s:3:"shh";s:7:"\u0000*\u0000prot";i:1;}'
    expect(phpSerialBase64ToValue(b64(payload))).toEqual({
      $class: 'User',
      name: 'Bob',
      secret: 'shh',
      prot: 1,
    })
  })

  it('C: 自定义序列化 → 仅保留 $class', () => {
    expect(phpSerialBase64ToValue(b64('C:8:"SplStack":4:{abcd}'))).toEqual({ $class: 'SplStack' })
  })

  it('超大整数 → bigint，展示为字符串', () => {
    const value = phpSerialBase64ToValue(b64('i:99999999999999999999;'))
    expect(typeof value).toBe('bigint')
    expect(formatPhpSerialDisplay(value)).toBe('99999999999999999999')
  })

  it('非法输入抛错', () => {
    expect(() => phpSerialBase64ToValue(b64('x:1;'))).toThrow()
    expect(() => phpSerialBase64ToValue(b64('a:1:{i:0;'))).toThrow()
    expect(() => phpSerialBase64ToValue(b64('s:9:"hi";'))).toThrow()
  })
})

describe('formatPhpSerialDisplay', () => {
  it('顶层字符串原样返回', () => {
    expect(formatPhpSerialDisplay('hello')).toBe('hello')
  })

  it('对象美化 JSON', () => {
    expect(formatPhpSerialDisplay({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})
