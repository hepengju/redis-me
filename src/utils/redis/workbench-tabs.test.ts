import { describe, expect, it } from 'vite-plus/test'

import { applyWorkbenchRun, type WorkbenchResult, type WorkbenchTab } from './workbench-tabs'

function result(title: string): WorkbenchResult {
  return {
    command: title,
    title,
    text: title,
    len: title.length,
    error: false,
    ms: 1,
    truncated: false,
    table: null,
  }
}

function tab(id: string): WorkbenchTab {
  return { ...result(id), id, view: 'text' }
}

describe('applyWorkbenchRun', () => {
  it('已有标签留着，新结果追加到末尾', () => {
    let n = 0
    const applied = applyWorkbenchRun([tab('A')], result('new'), () => `id${++n}`)
    expect(applied.tabs.map(item => item.title)).toEqual(['A', 'new'])
    expect(applied.activeId).toBe('id1')
  })

  it('同一条命令覆盖原标签，不新增', () => {
    let n = 0
    const again = { ...result('get RedisME'), text: 'fresh', ms: 9 }
    const applied = applyWorkbenchRun(
      [tab('get RedisME'), tab('get other')],
      again,
      () => `n${++n}`,
    )
    expect(applied.tabs.map(item => item.id)).toEqual(['get RedisME', 'get other'])
    expect(applied.tabs[0]?.text).toBe('fresh')
    expect(applied.activeId).toBe('get RedisME')
    expect(n).toBe(0)
  })

  it('命令名忽略大小写和多余空格，键名仍区分', () => {
    let n = 0
    const overwritten = applyWorkbenchRun([tab('get Foo')], result('GET  Foo'), () => `n${++n}`)
    const applied = applyWorkbenchRun(overwritten.tabs, result('get foo'), () => `n${++n}`)
    expect(applied.tabs.map(item => [item.id, item.command])).toEqual([
      ['get Foo', 'GET  Foo'],
      ['n1', 'get foo'],
    ])
    expect(applied.activeId).toBe('n1')
  })

  it('有表的新结果默认显示表', () => {
    const table = { columns: ['key'], rows: [['a']], keyColumn: 0, truncated: false }
    let n = 0
    const applied = applyWorkbenchRun([], { ...result('FT.SEARCH idx *'), table }, () => `n${++n}`)
    expect(applied.tabs[0]?.view).toBe('table')
  })

  it('覆盖后还有表就留在表，没有表就回到文本', () => {
    const table = { columns: ['key'], rows: [['a']], keyColumn: 0, truncated: false }
    const prev: WorkbenchTab = { ...tab('FT.SEARCH idx *'), view: 'table', table }
    let n = 0
    const kept = applyWorkbenchRun([prev], { ...result('ft.search idx *'), table }, () => `n${++n}`)
    expect(kept.tabs[0]?.view).toBe('table')
    const back = applyWorkbenchRun(kept.tabs, result('FT.SEARCH idx *'), () => `n${++n}`)
    expect(back.tabs[0]?.view).toBe('text')
    expect(back.tabs[0]?.table).toBeNull()
  })
})
