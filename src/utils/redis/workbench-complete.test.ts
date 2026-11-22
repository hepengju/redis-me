import { describe, expect, it } from 'vite-plus/test'

import type { TerminalKeyHintEntry } from '@/utils/redis/terminal-key-hints'

import { completionMatchRanges, workbenchCompletionAt } from './workbench-complete'

const commands = [
  { key: 'GET', summary: 'get' },
  { key: 'HGET', summary: 'hash get' },
  { key: 'HGETALL', summary: 'hash get all' },
  { key: 'CONFIG', summary: 'config' },
  { key: 'CONFIG GET', summary: 'config get' },
  { key: 'CONFIG SET', summary: 'config set' },
  { key: 'MSET', summary: 'mset' },
]

const detail = { scanned: '已扫描键', favorite: '收藏键' }

const keys: TerminalKeyHintEntry[] = [
  { name: 'user:1', source: 'scanned' },
  { name: 'fav', source: 'favorite' },
  { name: 'a b', source: 'scanned' },
]

describe('workbenchCompletionAt', () => {
  it('单词按包含匹配，短的排在前面', () => {
    const hit = workbenchCompletionAt('hg', 2, commands, keys, detail)
    expect(hit?.options.map(option => option.label)).toEqual(['HGET', 'HGETALL'])
    expect(hit?.from).toBe(0)
    expect(hit?.to).toBe(2)
    expect(hit?.options[0]?.apply).toBe('HGET ')
  })

  it('光标在命令词中间时，替换整词', () => {
    const hit = workbenchCompletionAt('HGET', 2, commands, keys, detail)
    expect(hit?.from).toBe(0)
    expect(hit?.to).toBe(4)
  })

  it('换行当空格，多词子命令按前缀匹配', () => {
    const doc = 'CONFIG\nG'
    const hit = workbenchCompletionAt(doc, doc.length, commands, keys, detail)
    expect(hit?.options.map(option => option.label)).toEqual(['CONFIG GET'])
    expect(hit?.from).toBe(0)
    expect(hit?.to).toBe(doc.length)
  })

  it('光标停在子命令前面时，把已经写上的子命令也换掉', () => {
    const doc = 'CONFIG GET'
    const hit = workbenchCompletionAt(doc, 7, commands, keys, detail)
    expect(hit?.options.map(option => option.label)).toContain('CONFIG GET')
    expect(hit?.to).toBe(doc.length)
  })

  it('命令名后面的参数不进替换范围', () => {
    const hit = workbenchCompletionAt('HGET key', 4, commands, keys, detail)
    expect(hit?.from).toBe(0)
    expect(hit?.to).toBe(4)
    expect(hit?.options.map(option => option.label)).toContain('HGET')
  })

  it('键槽用扫描键和收藏键，收藏靠前，带空格的键加引号', () => {
    const hit = workbenchCompletionAt('HGET ', 5, commands, keys, detail)
    expect(hit?.from).toBe(5)
    expect(hit?.to).toBe(5)
    expect(hit?.options.map(option => option.label)).toEqual(['fav', 'a b', 'user:1'])
    expect(hit?.options[0]?.detail).toBe('收藏键')
    expect(hit?.options.find(option => option.label === 'a b')?.apply).toBe('"a b" ')
  })

  it('带空格的键替换整段引号，不只换最后一个词', () => {
    const doc = 'HGET "a b'
    const hit = workbenchCompletionAt(doc, doc.length, commands, keys, detail)
    expect(hit?.from).toBe(doc.indexOf('"'))
    expect(hit?.to).toBe(doc.length)
    expect(hit?.options.find(option => option.label === 'a b')?.apply).toBe('"a b" ')
  })

  it('光标在引号键中间时，闭合引号后面的参数留着', () => {
    const doc = 'HGET "a b" tail'
    const pos = doc.indexOf('a') + 1
    const hit = workbenchCompletionAt(doc, pos, commands, keys, detail)
    expect(hit?.from).toBe(doc.indexOf('"'))
    expect(hit?.to).toBe(doc.indexOf(' tail'))
  })

  it('换行后的键前缀和空格一样', () => {
    const doc = 'HGET\nuser'
    const hit = workbenchCompletionAt(doc, doc.length, commands, keys, detail)
    expect(hit?.options.map(option => option.label)).toEqual(['user:1'])
    expect(hit?.from).toBe(5)
    expect(hit?.to).toBe(doc.length)
  })

  it('没有键名单时，键槽不再退回命令列表', () => {
    expect(workbenchCompletionAt('HGET ', 5, commands, [], detail)).toBeNull()
  })

  it('MSET 的 value 位不提示', () => {
    expect(workbenchCompletionAt('MSET k1 v1', 10, commands, keys, detail)).toBeNull()
  })

  it('空文档不提示', () => {
    expect(workbenchCompletionAt('', 0, commands, keys, detail)).toBeNull()
    expect(workbenchCompletionAt('  \n', 3, commands, keys, detail)).toBeNull()
  })
})

describe('completionMatchRanges', () => {
  it('多词分别画下划线', () => {
    expect(completionMatchRanges('CONFIG GET', ['config', 'g'])).toEqual([0, 6, 7, 8])
    expect(completionMatchRanges('HGET', ['get'])).toEqual([1, 4])
  })
})
