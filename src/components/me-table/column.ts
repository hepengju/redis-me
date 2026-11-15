// MeTable 统一列描述：一份定义同时驱动渲染（el-table-v2 Column）、排序、导出矩阵与具名插槽，
// 避免界面列与导出列两份描述靠人肉同步。
import type { TableExportMatrix } from '@/utils/export'

/** 列头筛选备选值：与行字段值全等比对（由 MeTable 内置的 MeColumnFilter 渲染筛选面板） */
export type MeFilterValue = string | number | boolean

export type MeColumn<T = any> = {
  /** 唯一键；决定具名插槽名 cell-${key} / header-${key}，同时用作 v2 column.key */
  key: string
  /** 取值字段（v2 的 dataKey）；纯插槽列可省 */
  prop?: string
  /** 表头文字；有 header-${key} 插槽时可省 */
  title?: string
  /** 表头悬浮提示（如原始字段说明）；不传无提示 */
  headerTip?: string
  /** 固定宽度（px）；缺省按 120 兜底 */
  width?: number
  /** 弹性列：映射为 width=minWidth + flexGrow=grow */
  minWidth?: number
  /** flexGrow 权重，默认 1 */
  grow?: number
  fixed?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  /** 是否可排序；未指定时数据列（有 prop 或 formatter，且非勾选/序号列）默认可排序 */
  sortable?: boolean | 'custom'
  /** 自定义比较器；只在 MeTable 内部排序（orderBy），不交给表格组件 */
  sortMethod?: (a: T, b: T) => number
  /** 序号列：内容 = rowIndex + 1 */
  index?: boolean
  /** 勾选列：MeTable 自渲染复选框（表头全选），selection-change 经 attrs 回传行对象数组；不进导出矩阵 */
  selection?: boolean
  className?: string
  headerClassName?: string
  /** 展示/导出文本计算，优先于 prop 取值 */
  formatter?: (row: T, index: number) => string
  /** 列头筛选开关：置 true 则 MeTable 自动按本列 prop 从传入 data 去重生成选项、渲染筛选面板并内部过滤（无需页面写任何胶水）；带筛选的列自动关排序 */
  filterable?: boolean
  /** 关键词搜索列：置 true 则 MeTable 根据 `keyword` prop 在排序/列筛选前自动过滤本列（比对展示文本，含 formatter/tip）；页面无需再写 filterDataList */
  searchable?: boolean
  /** 列头筛选备选项手动覆盖：枚举源不是行字段原值（如需自定义 text 映射）时才用；不传且 filterable 时 MeTable 自动去重 */
  filterOptions?: { text: string; value: MeFilterValue }[]
  /** 筛选面板标题与图标居中（配合 align=center 的列） */
  filterCenter?: boolean
}

/** 单元格值 → 展示文本：字符串原样、对象序列化、null/undefined 空串 */
export function toCellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  // 对象/数组序列化展示；symbol/function 无展示意义回落空串
  return typeof value === 'object' ? JSON.stringify(value) : ''
}

/**
 * 关溢出 tooltip 时进 DOM 的展示上限（字符）。超出只截前缀 + …，避免 MB 级全文进文本节点。
 * 开 tooltip 时不要截：悬停应能看到完整溢出内容。导出矩阵始终走 formatter/prop 全文。
 */
export const CELL_DISPLAY_MAX_CHARS = 1024

/** 仅配合 showOverflowTooltip=false；自定义 #cell-* 插槽在关 tooltip 时若自行拼长文本也应走此函数 */
export function truncateCellDisplay(text: string, max = CELL_DISPLAY_MAX_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

/** 能算出导出文本的列：跳过勾选列与无取值源的纯插槽列（如操作列） */
export function isExportableColumn(col: MeColumn): boolean {
  return !col.selection && (col.index || !!col.formatter || !!col.prop)
}

export function exportableColumns(columns: MeColumn[]): MeColumn[] {
  return columns.filter(isExportableColumn)
}

/** 由列描述生成导出矩阵：序号列表头为 #，单元格取 formatter 或 prop 值 */
export function exportMatrixFromColumns(columns: MeColumn[], rows: unknown[]): TableExportMatrix {
  const cols = exportableColumns(columns)
  const headers = cols.map(col => (col.index ? '#' : (col.title ?? col.key)))
  const matrixRows = rows.map((row, rowIndex) =>
    cols.map(col => {
      if (col.formatter) return col.formatter(row, rowIndex)
      if (col.index) return String(rowIndex + 1)
      return toCellText(col.prop ? (row as Record<string, unknown>)?.[col.prop] : '')
    }),
  )
  return { headers, rows: matrixRows }
}
