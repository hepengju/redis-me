import { describe, expect, it } from 'vite-plus/test'

import {
  buildLocalFilterPattern,
  buildScanPattern,
  compileRedisGlobFilter,
  redisGlobToRegExp,
} from '@/utils/redis-glob'

function match(pattern: string, s: string): boolean {
  const fn = compileRedisGlobFilter(pattern)
  if (!fn) throw new Error('empty pattern')
  return fn(s)
}

describe('compileRedisGlobFilter', () => {
  it('空 pattern 不过滤', () => {
    expect(compileRedisGlobFilter('')).toBeNull()
  })

  it('*ME* 命中含斜杠的键（Redis MATCH 语义）', () => {
    expect(match('*ME*', '/abc/ME/word')).toBe(true)
    expect(match('*ME*', 'RedisME')).toBe(true)
    expect(match('*ME*', 'redis-me-mock:foo')).toBe(true)
    expect(match('*ME*', 'abc:ME:word')).toBe(true)
    expect(match('*ME*', 'hello')).toBe(false)
  })

  it('大小写不敏感', () => {
    expect(match('*me*', '/abc/ME/word')).toBe(true)
    expect(match('*ME*', 'redisme')).toBe(true)
  })

  it('foo*bar 跨斜杠', () => {
    expect(match('foo*bar', 'foo/x/bar')).toBe(true)
    expect(match('foo*bar', 'foobar')).toBe(true)
    expect(match('foo*bar', 'foo')).toBe(false)
  })

  it('? 匹配单个字符含 /', () => {
    expect(match('h?llo', 'hello')).toBe(true)
    expect(match('a?b', 'a/b')).toBe(true)
    expect(match('a?b', 'ab')).toBe(false)
  })

  it('字符类 [ae] / [^e] / [a-c]', () => {
    expect(match('h[ae]llo', 'hello')).toBe(true)
    expect(match('h[ae]llo', 'hallo')).toBe(true)
    expect(match('h[ae]llo', 'hillo')).toBe(false)
    expect(match('h[^e]llo', 'hallo')).toBe(true)
    expect(match('h[^e]llo', 'hello')).toBe(false)
    expect(match('h[a-c]llo', 'hallo')).toBe(true)
    expect(match('h[a-c]llo', 'hdllo')).toBe(false)
  })

  it('未闭合 [ 当字面量', () => {
    expect(match('foo[bar', 'foo[bar')).toBe(true)
    expect(match('foo[bar', 'fooXbar')).toBe(false)
  })

  it('精确字面：无通配则全等', () => {
    expect(match('RedisME', 'RedisME')).toBe(true)
    expect(match('RedisME', 'redisme')).toBe(true)
    expect(match('RedisME', 'xRedisME')).toBe(false)
  })

  it('精确转义后的 * 不当通配', () => {
    const p = buildLocalFilterPattern('foo*bar', true, '*foo*bar*')
    expect(match(p, 'foo*bar')).toBe(true)
    expect(match(p, 'fooXbar')).toBe(false)
  })
})

describe('buildScanPattern / buildLocalFilterPattern', () => {
  it('无 glob 前后补 *', () => {
    expect(buildScanPattern('ME', false)).toBe('*ME*')
    expect(buildLocalFilterPattern('ME', false, '*ME*')).toBe('*ME*')
  })

  it('输入已是 glob 不再包一层', () => {
    expect(buildScanPattern('*ME*', false)).toBe('*ME*')
    expect(buildScanPattern('ME*', false)).toBe('ME*')
  })
})

describe('前缀 / 后缀 glob', () => {
  it('ME* 仅匹配 ME 开头，*ME 仅匹配 ME 结尾', () => {
    expect(match('ME*', 'MEfoo')).toBe(true)
    expect(match('ME*', 'RedisME')).toBe(false)
    expect(match('ME*', '/abc/ME/word')).toBe(false)
    expect(match('*ME', 'RedisME')).toBe(true)
    expect(match('*ME', '/abc/ME/word')).toBe(false)
  })
})

describe('redisGlobToRegExp', () => {
  it('* 编译为可匹配斜杠', () => {
    const re = redisGlobToRegExp('*ME*')
    expect(re.test('/abc/ME/word')).toBe(true)
    expect(re.source.includes('[^/]')).toBe(false)
  })
})
