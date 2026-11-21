import { describe, expect, it } from 'vite-plus/test'

import { applyWorkbenchRun, type WorkbenchResult, type WorkbenchTab } from './workbench-tabs'

function result(title: string): WorkbenchResult {
  return { command: title, title, text: title, error: false, ms: 1, truncated: false }
}

function tab(id: string): WorkbenchTab {
  return { ...result(id), id }
}

describe('applyWorkbenchRun', () => {
  it('已有标签留着，新结果追加到末尾', () => {
    let n = 0
    const applied = applyWorkbenchRun([tab('A')], [result('new')], () => `id${++n}`)
    expect(applied.tabs.map(item => item.title)).toEqual(['A', 'new'])
    expect(applied.activeId).toBe('id1')
  })

  it('一轮多条时激活最后一条', () => {
    let n = 0
    const applied = applyWorkbenchRun([tab('A')], [result('1'), result('2')], () => `n${++n}`)
    expect(applied.tabs.map(item => item.id)).toEqual(['A', 'n1', 'n2'])
    expect(applied.activeId).toBe('n2')
  })

  it('没有新结果时不改标签', () => {
    const applied = applyWorkbenchRun([tab('A')], [], () => 'x')
    expect(applied.tabs.map(item => item.id)).toEqual(['A'])
    expect(applied.activeId).toBe('A')
  })

  it('同一条命令覆盖原标签，不新增', () => {
    let n = 0
    const again = { ...result('get RedisME'), text: 'fresh', ms: 9 }
    const applied = applyWorkbenchRun(
      [tab('get RedisME'), tab('get other')],
      [again],
      () => `n${++n}`,
    )
    expect(applied.tabs.map(item => item.id)).toEqual(['get RedisME', 'get other'])
    expect(applied.tabs[0]?.text).toBe('fresh')
    expect(applied.activeId).toBe('get RedisME')
    expect(n).toBe(0)
  })

  it('命令名忽略大小写和多余空格，键名仍区分', () => {
    let n = 0
    const applied = applyWorkbenchRun(
      [tab('get Foo')],
      [result('GET  Foo'), result('get foo')],
      () => `n${++n}`,
    )
    expect(applied.tabs.map(item => [item.id, item.command])).toEqual([
      ['get Foo', 'GET  Foo'],
      ['n1', 'get foo'],
    ])
    expect(applied.activeId).toBe('n1')
  })
})
