import { describe, expect, it } from 'vite-plus/test'

import { capResultLines, commandAt, splitWorkbenchScript, workbenchTitle } from './workbench-script'

describe('splitWorkbenchScript', () => {
  it('引号外换行拆成两条，引号内换行仍是一条', () => {
    const source = 'GET a\nSET k "hello\nworld"\nGET b'
    const commands = splitWorkbenchScript(source)
    expect(commands.map(command => command.text)).toEqual([
      'GET a',
      'SET k "hello\nworld"',
      'GET b',
    ])
  })

  it('空行和整行注释跳过', () => {
    const commands = splitWorkbenchScript('# skip\n\n  GET a\n  # note\nGET b')
    expect(commands.map(command => command.text)).toEqual(['GET a', 'GET b'])
  })

  it('光标在命令末尾仍算这条，空行上没有命令', () => {
    const source = 'GET a\n\nGET b'
    const commands = splitWorkbenchScript(source)
    expect(commandAt(commands, 5)?.text).toBe('GET a')
    expect(commandAt(commands, 6)).toBeNull()
    expect(commandAt(commands, 7)?.text).toBe('GET b')
  })

  it('光标在引号里的换行上，跑的是整条命令', () => {
    const source = 'SET k "a\nb"'
    const commands = splitWorkbenchScript(source)
    expect(commands).toHaveLength(1)
    expect(commandAt(commands, source.indexOf('\n'))?.text).toBe('SET k "a\nb"')
  })

  it('双引号里的转义引号不截断', () => {
    expect(splitWorkbenchScript('SET k "a\\"b"\nGET c').map(command => command.text)).toEqual([
      'SET k "a\\"b"',
      'GET c',
    ])
  })

  it('标题压成一行并截断', () => {
    expect(workbenchTitle('GET\n  a')).toBe('GET a')
    expect(workbenchTitle('x'.repeat(60)).endsWith('…')).toBe(true)
  })

  it('结果只留前若干行', () => {
    expect(capResultLines('a\nb\nc', 2)).toEqual({ text: 'a\nb', truncated: true })
    expect(capResultLines('a\nb', 2).truncated).toBe(false)
  })
})
