import { describe, expect, it } from 'vite-plus/test'

import { capResultLines, workbenchTitle } from './workbench-script'

describe('workbench script', () => {
  it('标题把换行收成一行并截断', () => {
    expect(workbenchTitle('FT.SEARCH idx *\nLIMIT 0 20')).toBe('FT.SEARCH idx * LIMIT 0 20')
    expect(workbenchTitle('x'.repeat(60)).endsWith('…')).toBe(true)
  })

  it('结果只留前若干行', () => {
    expect(capResultLines('a\nb\nc', 2)).toEqual({ text: 'a\nb', truncated: true })
    expect(capResultLines('a\nb', 2).truncated).toBe(false)
  })
})
