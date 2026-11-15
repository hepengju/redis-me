import { readXlsx } from 'hucre/xlsx'
import { describe, expect, it } from 'vite-plus/test'

import {
  buildExportFileName,
  buildTimestampedFileName,
  excelSheetName,
  matrixToCsv,
  matrixToHtml,
  matrixToJson,
  matrixToMarkdown,
  matrixToTsv,
  matrixToXlsxBytes,
} from '@/utils/app/export'

const headers = ['name', 'note']
const rows = [
  ['plain', 'a,b'],
  ['say "hi"', 'x\ny'],
]

describe('export file names', () => {
  it('时间戳文件名', () => {
    expect(buildTimestampedFileName('pre', 'json')).toMatch(/^pre_\d{14}\.json$/)
    expect(buildTimestampedFileName('pre', 'txt', '-')).toMatch(/^pre-\d{14}\.txt$/)
    expect(buildExportFileName('Conn', 'mec')).toMatch(/^RedisME_Conn_\d{14}\.mec$/)
  })
})

describe('matrix export', () => {
  it('JSON：空表头用 columnN，缺单元格为空串', () => {
    expect(JSON.parse(matrixToJson(['', 'name'], [['v']]))).toEqual([{ column1: 'v', name: '' }])
  })

  it('CSV 转义逗号、引号和换行，并带 BOM', () => {
    const csv = matrixToCsv(headers, rows)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('name,note\nplain,"a,b"\n"say ""hi""","x\ny"')
  })

  it('HTML 转义并包成完整文档', () => {
    const html = matrixToHtml(['a&b'], [['<x>']])
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<th style="white-space:nowrap">a&amp;b</th>')
    expect(html).toContain('<td>&lt;x&gt;</td>')
    expect(matrixToHtml(['q'], [['a"b']])).toContain('<td>a&quot;b</td>')
    expect(html).not.toContain('<x>')
  })

  it('Markdown 转义竖线和反斜杠，单元格内换行变空格', () => {
    expect(matrixToMarkdown(['a|b', 'c'], [['x\\y\nz', '']])).toBe(
      '| a\\|b | c |\n| --- | --- |\n| x\\\\y z |  |',
    )
  })

  it('TSV 把 Tab 和换行换成空格，并带 BOM', () => {
    const tsv = matrixToTsv(['a', 'b'], [['x\ty', 'z']])
    expect(tsv.charCodeAt(0)).toBe(0xfeff)
    expect(tsv.slice(1)).toBe('a\tb\nx y\tz')
  })

  it('xlsx 能读回同一张表，标题有样式且工作表名用导出名', async () => {
    const bytes = await matrixToXlsxBytes(headers, [['plain', 'a,b']], 'info')
    const book = await readXlsx(bytes, { readStyles: true })
    const sheet = book.sheets[0]!
    expect(sheet.name).toBe('info')
    expect(sheet.rows).toEqual([headers, ['plain', 'a,b']])
    expect(sheet.freezePane).toEqual({ rows: 1 })

    const title = sheet.cells?.get('0,0')?.style
    expect(title?.font?.bold).toBe(true)
    expect(title?.font?.name).toBe('等线')
    expect(title?.alignment?.horizontal).toBe('center')
    expect(title?.alignment?.vertical).toBe('center')
    expect(title?.fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { rgb: 'C0C0C0' },
    })
    expect(title?.border?.top?.style).toBe('thin')
    expect(title?.border?.bottom?.style).toBe('thin')
    expect(title?.border?.left?.style).toBe('thin')
    expect(title?.border?.right?.style).toBe('thin')

    const body = sheet.cells?.get('1,0')?.style
    expect(body?.font?.bold).toBeFalsy()
    expect(body?.font?.name).toBe('等线')
    expect(body?.border?.top?.style).toBe('thin')
    expect(body?.fill).toBeUndefined()
  })

  it('列宽只看前 10 行，超长列停在 60', async () => {
    const early = await matrixToXlsxBytes(['k', 'value'], [['ab', 'x'.repeat(500)]], 'info')
    const earlyCols = (await readXlsx(early)).sheets[0]?.columns
    expect(earlyCols?.[0]?.width).toBeLessThan(60)
    expect(earlyCols?.[1]?.width).toBe(60)

    const rows = Array.from({ length: 12 }, (_, index) => [index < 10 ? 'ab' : 'x'.repeat(500)])
    const later = await matrixToXlsxBytes(['k'], rows, 'info')
    const laterWidth = (await readXlsx(later)).sheets[0]?.columns?.[0]?.width
    expect(laterWidth).toBeLessThan(60)
    expect(laterWidth).toBeLessThan(earlyCols?.[1]?.width ?? 0)

    const tenth = Array.from({ length: 12 }, (_, index) => [index === 9 ? 'x'.repeat(500) : 'ab'])
    const tenthWidth = (await readXlsx(await matrixToXlsxBytes(['k'], tenth, 'info'))).sheets[0]
      ?.columns?.[0]?.width
    expect(tenthWidth).toBe(60)
  })
})

describe('excel sheet name', () => {
  it('保留合法导出名，清掉非法字符并截断', () => {
    expect(excelSheetName('info')).toBe('info')
    expect(excelSheetName('search-indexes')).toBe('search-indexes')
    expect(excelSheetName('a/b?c*[d]:e\\f')).toBe('abcdef')
    expect(excelSheetName(`'info'`)).toBe('info')
    expect(excelSheetName('')).toBe('Sheet1')
    expect(excelSheetName('***')).toBe('Sheet1')
    expect(excelSheetName('n'.repeat(40))).toHaveLength(31)
  })

  it('写入时工作表名按同样规则清洗', async () => {
    const bytes = await matrixToXlsxBytes(['a'], [['1']], 'bad/name?')
    const book = await readXlsx(bytes)
    expect(book.sheets[0]?.name).toBe('badname')
  })
})
