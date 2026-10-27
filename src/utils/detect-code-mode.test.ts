import { describe, expect, it } from 'vite-plus/test'

import { detectCodeMode } from '@/utils/detect-code-mode'

describe('detectCodeMode', () => {
  it('JSON：花括号/方括号首尾配对即判 json（不要求解析成功）', () => {
    expect(detectCodeMode('{"a": 1}')).toBe('json')
    expect(detectCodeMode('[1, 2, 3]')).toBe('json')
    expect(detectCodeMode('  { "a": 1 }  \n')).toBe('json')
    // 结构不完整的半截 JSON 也按 json 上色（美化/试解失败时观感一致）
    expect(detectCodeMode('{"a": 1')).toBe('json')
  })

  it('YAML：文档头与 key 行特征', () => {
    expect(detectCodeMode('---\nserver:\n  port: 8080\n')).toBe('yaml')
    expect(detectCodeMode('server:\n  host: localhost\n  port: 6379\n')).toBe('yaml')
    expect(detectCodeMode('- name: a\n- name: b\n- name: c\n')).toBe('yaml')
  })

  it('Markdown：标题/围栏/链接等明显特征', () => {
    expect(detectCodeMode('# 标题\n\n## 小节\n\n正文说明文字\n）。')).toBe('markdown')
    expect(
      detectCodeMode('看这里 [文档](https://example.com)。\n\n**加粗** 一\n**加粗** 二\n'),
    ).toBe('markdown')
    expect(detectCodeMode('```js\nconsole.log(1)\n```\n\n> 引用一行\n')).toBe('markdown')
  })

  it('XML：起始 < 即判（报文/配置片段）', () => {
    expect(detectCodeMode('<root><a>1</a></root>')).toBe('xml')
    expect(detectCodeMode('<?xml version="1.0"?>\n<config><db host="x"/></config>')).toBe('xml')
    // 半截 XML 也维持 xml 上色（同 json 的宽松手法）
    expect(detectCodeMode('<note>未闭合')).toBe('xml')
  })

  it('INI：首行段头+key=value 抢在 json 的 [ 规则前判 properties', () => {
    expect(detectCodeMode('[server]\nhost=127.0.0.1\nport=6379\n')).toBe('properties')
    // 仅段头无 kv：更像日志前缀，不抢 json
    expect(detectCodeMode('[warn] something happened')).toBe('json')
  })

  it('纯文本与空内容落到 text', () => {
    expect(detectCodeMode('')).toBe('text')
    expect(detectCodeMode('   \n  ')).toBe('text')
    expect(detectCodeMode('hello world\njust some plain prose\nno structure here')).toBe('text')
  })

  it('歧义取舍：json 优先于 yaml；列表特征同时命中时偏向 yaml', () => {
    // yaml ⊇ json：带配对括号的先判 json
    expect(detectCodeMode('{ port: 6379 }')).toBe('json')
    // 单行 key: 也判 yaml（本身就是合法 yaml；误判代价仅是字符串着色）
    expect(detectCodeMode('note: this is just a line')).toBe('yaml')
  })
})
