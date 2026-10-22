/** 文件导出：保存对话框、MeTable 矩阵格式转换、连接/表单等文本导出 */

import { save, type DialogFilter } from '@tauri-apps/plugin-dialog'
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import dayjs from 'dayjs'
import {
  calculateColumnWidth,
  measureValueWidth,
  writeXlsxStream,
  type CellStyle,
} from 'hucre/xlsx'

import i18n from '@/locales'
import { meCopy, meErr, meOk } from '@/utils/util'

const { t } = i18n.global

// #region 文件名与保存对话框

/** `prefix_YYYYMMDDHHmmss.ext`；MeFileInput、KeyBatch 导出路径 */
export function buildTimestampedFileName(prefix: string, ext: string, sep = '_'): string {
  return `${prefix}${sep}${dayjs().format('YYYYMMDDHHmmss')}.${ext}`
}

/** `RedisME_{name}_YYYYMMDDHHmmss.ext`；MeTable、TabConn 导出连接 */
export function buildExportFileName(namePart: string, ext: string): string {
  return buildTimestampedFileName(`RedisME_${namePart}`, ext)
}

/** 打开保存对话框；saveTextExport / saveBinaryExport 内部 */
export async function pickSavePath(
  defaultPath: string,
  extensions: string[],
  filterName?: string,
): Promise<string | null> {
  const filters: DialogFilter[] = [
    { name: filterName ?? extensions[0]?.toUpperCase() ?? 'File', extensions },
  ]
  return save({ defaultPath, filters })
}

type ExportMessages = { ok: string; err: string }

/** 选路径并写入文本；TabConn 导出 .mec */
export async function saveTextExport(
  content: string,
  defaultPath: string,
  extensions: string[],
  messages: ExportMessages = { ok: t('meTable.exportOk'), err: t('meTable.exportErr') },
  filterName?: string,
): Promise<void> {
  const path = await pickSavePath(defaultPath, extensions, filterName)
  if (!path) return
  try {
    await writeTextFile(path, content)
    meOk(messages.ok)
  } catch (e: unknown) {
    meErr(e instanceof Error ? e : String(e), messages.err)
  }
}

/** 选路径并写入二进制；data 可以是整块，也可以是字节流（xlsx 流式写出） */
export async function saveBinaryExport(
  data: Uint8Array | ReadableStream<Uint8Array> | (() => ReadableStream<Uint8Array>),
  defaultPath: string,
  extensions: string[],
  messages: ExportMessages = { ok: t('meTable.exportOk'), err: t('meTable.exportErr') },
  filterName?: string,
): Promise<void> {
  const path = await pickSavePath(defaultPath, extensions, filterName)
  if (!path) return
  try {
    // 流在用户确认路径之后才创建，取消保存时不扫列宽、不开始压缩
    const bytes = typeof data === 'function' ? data() : data
    await writeFile(path, bytes)
    meOk(messages.ok)
  } catch (e: unknown) {
    meErr(e instanceof Error ? e : String(e), messages.err)
  }
}

// #endregion

// #region MeTable：矩阵格式转换

/** MeTable 导出矩阵：表头 + 文本矩阵（由列描述生成） */
export type TableExportMatrix = { headers: string[]; rows: string[][] }

export function matrixToJson(headers: string[], rows: string[][]): string {
  const objects = rows.map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((header, index) => {
      obj[header || `column${index + 1}`] = row[index] ?? ''
    })
    return obj
  })
  return JSON.stringify(objects, null, 2)
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function matrixToCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))]
  return `\ufeff${lines.join('\n')}`
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTableHtml(headers: string[], rows: string[][]): string {
  // 表头不换行：避免浏览器自动布局把短内容列（如「只读」）挤压成竖排
  const headerHtml = headers
    .map(h => `        <th style="white-space:nowrap">${htmlEscape(h)}</th>`)
    .join('\n')
  const bodyHtml = rows
    .map(row => `      <tr>${row.map(cell => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`)
    .join('\n')
  return [
    '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;">',
    '  <thead>',
    '    <tr>',
    headerHtml,
    '    </tr>',
    '  </thead>',
    '  <tbody>',
    bodyHtml,
    '  </tbody>',
    '</table>',
  ].join('\n')
}

function mdEscapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function matrixToMarkdown(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.map(mdEscapeCell).join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const bodyRows = rows.map(row => {
    const cells = headers.map((_, index) => mdEscapeCell(row[index] ?? ''))
    return `| ${cells.join(' | ')} |`
  })
  return [headerRow, separator, ...bodyRows].join('\n')
}

/** Tab 分隔文本：单元格内 Tab/换行替换为空格；带 BOM 便于 Excel 识别 UTF-8 */
export function matrixToTsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => v.replace(/[\t\r\n]/g, ' ')
  const lines = [
    headers.map(esc).join('\t'),
    ...rows.map(row => headers.map((_, index) => esc(row[index] ?? '')).join('\t')),
  ]
  return `\ufeff${lines.join('\n')}`
}

/** 复制 HTML 表格：text/html 富文本表格（Word/Excel 渲染）+ text/plain HTML 源码 */
export async function copyTableHtml(headers: string[], rows: string[][]): Promise<void> {
  const html = buildTableHtml(headers, rows)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([html], { type: 'text/plain' }),
      }),
    ])
    meOk(t('copyOk'))
  } catch {
    meCopy(html)
  }
}

export function matrixToHtml(headers: string[], rows: string[][]): string {
  const table = buildTableHtml(headers, rows)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
${table}
</body>
</html>`
}

/** Excel 工作表名上限；非法字符与 Excel 一致：\ / ? * [ ] : */
const EXCEL_SHEET_NAME_MAX = 31
const EXCEL_SHEET_NAME_INVALID = /[\\/?*[\]:]/g

/**
 * 工作表名：去掉非法字符、去掉首尾引号、截到 31 字符。
 * 空结果退回 Sheet1。导出名（如 info）原样可用。
 */
export function excelSheetName(name: string): string {
  const cleaned = name
    .replace(EXCEL_SHEET_NAME_INVALID, '')
    .replace(/^'+|'+$/g, '')
    .trim()
  return cleaned.slice(0, EXCEL_SHEET_NAME_MAX) || 'Sheet1'
}

// 标题/数据样式对齐 ExcelUtil：等线、标题加粗居中灰底、四边细线、冻结首行
const EXCEL_FONT = '等线'
const EXCEL_BORDER_SIDE = { style: 'thin' as const, color: { rgb: '000000' } }
const EXCEL_BORDER = {
  top: EXCEL_BORDER_SIDE,
  right: EXCEL_BORDER_SIDE,
  bottom: EXCEL_BORDER_SIDE,
  left: EXCEL_BORDER_SIDE,
}
const excelBodyStyle: CellStyle = { font: { name: EXCEL_FONT, size: 11 }, border: EXCEL_BORDER }
const excelTitleStyle: CellStyle = {
  font: { name: EXCEL_FONT, size: 11, bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { rgb: 'C0C0C0' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: EXCEL_BORDER,
}

/** 列宽下限（字符）；短标题不挤成一条缝 */
const EXCEL_COL_MIN_WIDTH = 8
/**
 * 列宽上限（字符）。超长单元格不再把列撑到 Excel 的 255。
 * 单元格里仍是全文，只是显示宽度到此为止。
 */
const EXCEL_COL_MAX_WIDTH = 60
/** 列宽只看表头和前 10 行数据，后面的长文本不参与 */
const EXCEL_COL_WIDTH_SAMPLE_ROWS = 10

function tableColumnCount(headers: string[], rows: string[][]): number {
  let count = headers.length
  for (const row of rows) {
    if (row.length > count) count = row.length
  }
  return count
}

/** 表头 + 前 10 行里每列最宽的单元格，再换成 Excel 列宽并夹在上下限里 */
function tableColumnWidths(headers: string[], rows: string[][], colCount: number): number[] {
  const widest: string[] = Array.from({ length: colCount }, () => '')
  const widestUnits: number[] = Array.from({ length: colCount }, () => 0)
  const sampleCount = Math.min(rows.length, EXCEL_COL_WIDTH_SAMPLE_ROWS)
  for (let rowIndex = 0; rowIndex < sampleCount; rowIndex++) {
    const row = rows[rowIndex]!
    for (let index = 0; index < colCount; index++) {
      const text = row[index] ?? ''
      const units = measureValueWidth(text)
      if (units > widestUnits[index]!) {
        widestUnits[index] = units
        widest[index] = text
      }
    }
  }
  return Array.from({ length: colCount }, (_, index) => {
    const headerWidth = calculateColumnWidth([headers[index] ?? ''], {
      font: { name: EXCEL_FONT, size: 11, bold: true },
      minWidth: EXCEL_COL_MIN_WIDTH,
      maxWidth: EXCEL_COL_MAX_WIDTH,
    })
    const bodyWidth = widestUnits[index]
      ? calculateColumnWidth([widest[index]!], {
          font: { name: EXCEL_FONT, size: 11 },
          minWidth: EXCEL_COL_MIN_WIDTH,
          maxWidth: EXCEL_COL_MAX_WIDTH,
        })
      : EXCEL_COL_MIN_WIDTH
    return Math.max(headerWidth, bodyWidth)
  })
}

function* tableXlsxRows(
  headers: string[],
  rows: string[][],
  colCount: number,
): Generator<Array<string | { value: string; style: CellStyle }>> {
  yield Array.from({ length: colCount }, (_, index) => ({
    value: headers[index] ?? '',
    style: excelTitleStyle,
  }))
  for (const row of rows) {
    yield Array.from({ length: colCount }, (_, index) => row[index] ?? '')
  }
}

/**
 * MeTable 矩阵 → xlsx 字节流。
 * 列宽只按表头和前 10 行估计，再用 writeXlsxStream 按行拉出。
 * 字符串内联写入，不建共享字符串表。sheetName 用导出名（文件名中段，如 info）。
 */
export function tableXlsxStream(
  headers: string[],
  rows: string[][],
  sheetName = 'Sheet1',
): ReadableStream<Uint8Array> {
  const colCount = tableColumnCount(headers, rows)
  const widths = colCount > 0 ? tableColumnWidths(headers, rows, colCount) : []
  return writeXlsxStream(tableXlsxRows(headers, rows, colCount), {
    name: excelSheetName(sheetName),
    freezePane: colCount > 0 ? { rows: 1 } : undefined,
    columns: colCount > 0 ? widths.map(width => ({ width, style: excelBodyStyle })) : undefined,
    // 默认就是内联；写明是为了大表不把全部不同字符串再攒进一张表
    inlineStrings: true,
  })
}

async function concatByteStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** MeTable 矩阵 → xlsx。测试读回用；界面保存走 tableXlsxStream，不再先拼一整块 */
export async function matrixToXlsxBytes(
  headers: string[],
  rows: string[][],
  sheetName = 'Sheet1',
): Promise<Uint8Array> {
  return concatByteStream(tableXlsxStream(headers, rows, sheetName))
}

/** MeTable 导出 json/csv/html/md */
export async function saveTableTextFile(
  content: string,
  defaultPath: string,
  extensions: string[],
): Promise<void> {
  await saveTextExport(content, defaultPath, extensions)
}

/** MeTable 导出 xlsx；sheetName 为工作表名（导出名，如 info） */
export async function saveTableXlsxFile(
  headers: string[],
  rows: string[][],
  defaultPath: string,
  sheetName?: string,
): Promise<void> {
  await saveBinaryExport(
    () => tableXlsxStream(headers, rows, sheetName),
    defaultPath,
    ['xlsx'],
    undefined,
    'XLSX',
  )
}

// #endregion
