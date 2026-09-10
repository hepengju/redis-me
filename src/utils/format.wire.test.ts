import { describe, expect, it } from 'vite-plus/test'

import {
  IPC_WIRE_FORMAT,
  base64WireToUtf8Display,
  decodeErrTitle,
  fieldViewOptions,
  isViewDecodeError,
  meFormatViewValue,
  meJavaSerialBase64ToDisplay,
  meViewToWire,
  toWireFormat,
  utf8TextToBase64,
} from '@/utils/format'

describe('format wire=base64 display-only', () => {
  it('toWireFormat 恒 base64', () => {
    expect(toWireFormat('utf8')).toBe(IPC_WIRE_FORMAT)
    expect(toWireFormat('strjson')).toBe('base64')
    expect(toWireFormat('hex')).toBe('base64')
  })

  it('utf8 展示/写回 roundtrip', () => {
    const text = 'hello 你好'
    const wire = utf8TextToBase64(text)
    expect(meFormatViewValue(wire, 'utf8')).toBe(text)
    expect(meViewToWire(text, 'utf8')).toBe(wire)
    expect(base64WireToUtf8Display(wire)).toBe(text)
  })

  it('strjson 展示/写回 roundtrip', () => {
    const display = JSON.stringify({ a: 1 }, null, 2)
    const wire = meViewToWire(display, 'strjson')
    expect(meFormatViewValue(wire, 'strjson')).toBe(display)
    expect(base64WireToUtf8Display(wire)).toBe(JSON.stringify(JSON.stringify({ a: 1 })))
  })

  it('空值', () => {
    expect(meFormatViewValue('', 'utf8')).toBe('')
    expect(meViewToWire('', 'utf8')).toBe('')
    expect(meFormatViewValue('', 'hex')).toBe('')
  })

  it('hex roundtrip 经 base64 wire', () => {
    const wire = utf8TextToBase64('AB')
    const hex = meFormatViewValue(wire, 'hex')
    expect(hex).toMatch(/^[0-9a-f]+$/)
    expect(meViewToWire(hex, 'hex')).toBe(wire)
  })

  it('fieldViewOptions：Auto 置顶，内置项固定顺序（JdkSerial 展示名）', () => {
    const labels = fieldViewOptions().map(o => o.label)
    expect(labels[0]).toBe('Auto')
    expect(labels.slice(1)).toEqual([
      'UTF8',
      'StrJson',
      'JdkSerial',
      'Pickle',
      'PhpSerial',
      'MsgPack',
      'Hex',
      'Binary',
      'Base64',
    ])
  })

  it('JdkSerial 解码失败：标题 + Reason + Base64', () => {
    const wire = utf8TextToBase64('Line01\nLine02\nLinu03')
    const text = meJavaSerialBase64ToDisplay(wire)
    expect(text.startsWith(decodeErrTitle('JdkSerial'))).toBe(true)
    expect(text).toContain('Reason:')
    expect(text).toContain(`Base64: ${wire}`)
    expect(isViewDecodeError(text)).toBe(true)
  })
})
