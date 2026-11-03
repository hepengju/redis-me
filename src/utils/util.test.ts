import { describe, expect, it } from 'vite-plus/test'

import { meFormatDisplayValue } from '@/utils/util'

describe('meFormatDisplayValue', () => {
  it('合法 JSON：紧凑对象展开为多行缩进', () => {
    const out = meFormatDisplayValue('{"a":1,"b":[2,3]}', true)
    expect(out).toContain('\n')
    expect(out).toMatch(/"a":\s*1/)
  })

  it('回归：以 [ 开头的 ini 不被容错格式化破坏（] 不得被换行）', () => {
    const ini = '[server]\n; 服务器基本配置\nhost = 127.0.0.1\nport = 8080\n'
    expect(meFormatDisplayValue(ini, true)).toBe(ini)
  })

  it('以 [ 开头的日志/非 JSON 原样返回', () => {
    const log = '[2026-10-27] something happened\nnext line'
    expect(meFormatDisplayValue(log, true)).toBe(log)
  })

  it('pretty=false 一律原样', () => {
    expect(meFormatDisplayValue('{"a":1}', false)).toBe('{"a":1}')
  })

  it('Fastjson Set[...]：首尾成对即可美化，并保留 Set 标记', () => {
    const raw = '{"@type":"com.example.Foo","accountSet":Set[{"orgCode":"03017"}],}'
    const out = meFormatDisplayValue(raw, true)
    expect(out).toContain('\n')
    expect(out).toContain('Set[')
    expect(out).toMatch(/"orgCode":\s*"03017"/)
  })

  it('以 { 开头但不以 } 结尾的文本原样返回', () => {
    const raw = '{"a":1} trailing'
    expect(meFormatDisplayValue(raw, true)).toBe(raw)
  })

  it('短字符串与空白原样返回，不抛错', () => {
    expect(meFormatDisplayValue('', true)).toBe('')
    expect(meFormatDisplayValue(' ', true)).toBe(' ')
    expect(meFormatDisplayValue('1', true)).toBe('1')
    expect(meFormatDisplayValue('{', true)).toBe('{')
    expect(meFormatDisplayValue('[', true)).toBe('[')
  })
})
