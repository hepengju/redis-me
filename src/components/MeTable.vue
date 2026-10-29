<script setup lang="ts">
// 说明: 虚拟滚动表（el-table-v2）：连续滚动、无分页，千行级以上的大数据表（内存分析、命令日志等）不卡顿。
// 列描述 columns 为单一来源：同时驱动渲染、排序、导出矩阵与具名插槽（cell-${key} / header-${key}）。
// showOverflowTooltip 开时单元格/气泡用全文（溢出 disabled 按格在 MeOverflowText）；关时进 DOM 才截断。
// 排序与 el-table 的 default-sort、列 sortable / sort-method / sort-by 一致；
// sortable="custom" 时不改行顺序，由父组件在 sort-change 中自行更新 :data。
// 未显式指定 sortable 的数据列（有 prop/formatter、非勾选/序号列）默认可排序，免去逐列手写。
// 列描述 filterable 声明列头筛选：MeTable 自动按列 prop 从 data 去重生成选项、渲染面板并在排序前内部过滤（页面无需胶水）；
// 带筛选的列自动关排序（v2 整格点击热区会劫持筛选下拉点击）。filterOptions 可手动覆盖选项（枚举源非行字段原值时）。
// 列描述 searchable + 顶层 keyword prop 声明关键词搜索：MeTable 在排序前列筛选前按展示文本（含 formatter）包含匹配，页面直接传全量 data 即可。
// 顶层 filter prop 传入行谓词：承接「全部/差异」「分类下拉」等对同一批行的业务预筛；配合 data 传全量，总数默认取 data.length，页面无需再传 total。
// 表头点击三态循环 asc → desc → 无（对齐 el-table）；v2 原生仅 asc↔desc，取消态由本组件拦下。
// 表内 footer 固定行：总数 + 可选 #footer-center（居中摘要）+ #footer 插槽（调用方主动作，右侧紧邻导出）+「…」导出菜单贴右。
import type { TableV2Instance } from 'element-plus'
import { orderBy } from 'element-plus/es/components/table/src/util.mjs'
import type { StyleValue } from 'vue'
import { computed, ref, toRaw, useAttrs, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  buildExportFileName,
  copyTableHtml,
  matrixToCsv,
  matrixToHtml,
  matrixToJson,
  matrixToMarkdown,
  matrixToTsv,
  saveTableTextFile,
  saveTableXlsxFile,
} from '@/utils/export'
import { meCopy, meErr } from '@/utils/util'

import {
  type MeColumn,
  type MeFilterValue,
  exportableColumns,
  exportMatrixFromColumns,
  isExportableColumn,
  toCellText,
  truncateCellDisplay,
} from './me-table-column'
import MeOverflowText from './MeOverflowText.vue'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

// #region props、attrs
const props = withDefaults(
  defineProps<{
    data?: unknown[]
    /** 列描述：渲染、排序、导出与插槽名的单一来源 */
    columns: MeColumn[]
    /** 导出文件名中段，同时作为 Excel 工作表名（如 info → RedisME_info_时间.xlsx 的表「info」） */
    exportName?: string
    /** 底部总数覆盖：默认取 data.length；与筛选后数量不一致时 footer 显示「共 筛选 / 总数 条」 */
    total?: number
    /** 底部总数文案完全覆盖：调用方自算（如键值页「共 总数 条，已加载 N，筛选 M」）；传了就不再由 total 推导 */
    totalText?: string
    /** 空态文案（ElEmpty description）；不传用 EP 默认「暂无数据」 */
    emptyText?: string
    /** 自定义行类：如差异行着色标记；与内置 stripe 类组合 */
    rowClass?: (row: unknown, rowIndex: number) => string
    /** 关键词：配合列描述 searchable 列，MeTable 在排序/列筛选前自动按展示文本包含匹配过滤（页面无需写 filterDataList） */
    keyword?: string
    /** 行谓词：如「全部/差异」「分类下拉」等业务预筛；在关键词/列头筛选前先过一遍，页面据此把全量 data 交给 MeTable 而不必自行 reduce */
    filter?: (row: unknown, index: number) => boolean
    /**
     * 溢出悬停提示（对齐 el-table show-overflow-tooltip）。默认开；
     * 值区字段表关：大值靠双击/点行进 FieldSet 看，避免 MB 级气泡。
     */
    showOverflowTooltip?: boolean
  }>(),
  { data: () => [], exportName: 'table', keyword: '', showOverflowTooltip: true },
)

const attrs = useAttrs()
// #endregion

// #region 数据过滤（关键词 searchable + 列头 filterable：均在排序前由 MeTable 内部完成）
// 列头筛选选中态：列 key → 已选值数组；不向外暴露（页面只管传 filterable 列，过滤在此完成）
const colFilters = ref<Record<string, MeFilterValue[]>>({})

function colFilterable(col: MeColumn): boolean {
  return !!col.filterable || !!col.filterOptions
}

// filterable 列自动去重选项：缓存为 computed（随 data/colFilters 变化各算一次、多列共享一遍遍历），
// 避免模板内按列直调使实时流每次刷新对每列各做 O(n) 扫描 + 排序。
// 同时把「已选但当前不在数据里」的值并入：清空/换视角后面板仍可见可取消，不会退化成空列表却图标高亮、静默吞行。
const autoFilterOptions = computed(() => {
  const map: Record<string, { text: string; value: MeFilterValue }[]> = {}
  for (const col of props.columns) {
    if (!col.filterable || col.filterOptions) continue
    const key = col.prop ?? col.key
    const set = new Set<MeFilterValue>()
    for (const row of props.data) {
      const v = (row as Record<string, unknown>)?.[key]
      if (v != null && v !== '') set.add(v as MeFilterValue)
    }
    for (const v of colFilters.value[col.key] ?? []) set.add(v)
    map[col.key] = [...set]
      .sort((a, b) =>
        typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)),
      )
      .map(v => ({ text: String(v), value: v }))
  }
  return map
})

// filterable 列的选项：filterOptions 优先（手动覆盖），否则取上面缓存的自动去重结果
function colFilterOptions(col: MeColumn): { text: string; value: MeFilterValue }[] {
  return col.filterOptions ?? autoFilterOptions.value[col.key] ?? []
}

function updateColFilter(key: string, vals: MeFilterValue[]): void {
  colFilters.value = { ...colFilters.value, [key]: vals }
}

// 关键词搜索列（searchable）
const searchableCols = computed(() => props.columns.filter(c => c.searchable))

// 生效中的筛选列（已选非空）：无则下方 filteredData 直接返回原数组，不给实时流多拷一次
const activeFilterCols = computed(() =>
  props.columns.filter(c => colFilterable(c) && (colFilters.value[c.key]?.length ?? 0) > 0),
)

const filteredData = computed(() => {
  const key = props.keyword.toLowerCase().trim()
  const sCols = searchableCols.value
  const cols = activeFilterCols.value
  const fn = props.filter
  const needKw = !!key && sCols.length > 0
  // 无外部谓词、无关键词、无列筛选：直接返回原数组引用（不触发虚拟列表重渲染）
  if (!fn && !needKw && !cols.length) return props.data
  return props.data.filter((row, i) => {
    // 页面谓词（filter）：业务预筛先于关键词/列筛选套用
    if (fn && !fn(row, i)) return false
    // 关键词：任一 searchable 列的展示文本命中即保留
    if (needKw && !sCols.some(c => cellText(c, row, i).toLowerCase().includes(key))) return false
    // 列头筛选：每个生效列均需命中
    return cols.every(c =>
      colFilters.value[c.key].includes(
        (row as Record<string, unknown>)[c.prop ?? c.key] as MeFilterValue,
      ),
    )
  })
})
// #endregion

// #region 排序（default-sort 初值 + 表头点击，整表 orderBy 与 EP 列行为一致）
const sortProp = ref<string | null>(null)
const sortOrder = ref<'ascending' | 'descending' | null>(null)

// 当前排序列：排序方式全由列描述决定（sortable: 'custom' 不动行序、sortMethod 自定义比较器）
const sortCol = computed(() => props.columns.find(c => (c.prop ?? c.key) === sortProp.value))

// default-sort 只是为对齐 el-table 习惯的透传项（v2 无此概念），故从 attrs 读而不进 props
const defaultSort = computed(() => {
  const ds = attrs.defaultSort as { prop?: string; order?: 'ascending' | 'descending' } | undefined
  if (!ds?.prop || !ds.order) return null
  return ds
})

// 调用方多传字面量对象（每次渲染都是新引用），故比值不比引用：
// 只在 prop/order 真变了才回到默认排序，否则父组件无关重渲染会把用户点出来的排序冲掉
watch(
  defaultSort,
  (ds, prev) => {
    if (ds?.prop === prev?.prop && ds?.order === prev?.order) return
    sortProp.value = ds?.prop ?? null
    sortOrder.value = ds?.order ?? null
  },
  { immediate: true },
)

const sortedData = computed(() => {
  const col = sortCol.value
  const prop = sortProp.value
  const order = sortOrder.value
  // custom 列只回传 sort-change，行序由父组件自行更新 :data
  if (!col || !prop || !order || col.sortable === 'custom') return filteredData.value
  return orderBy(
    [...filteredData.value] as never,
    prop,
    order,
    (col.sortMethod ?? null) as never,
    null as never, // 不用 EP 的 sortBy（多字段排序），列描述只提供 sortMethod
  ) as unknown[]
})
// #endregion

// #region 底部状态：总数与导出菜单（空表也常显，方便官网等底栏入口）
// totalText 优先（调用方自算文案）；否则传了 total 覆盖且与筛选后数量不一致时显示「共 筛选 / 总数 条」
const footerTotalText = computed(() => {
  if (props.totalText) return props.totalText
  const filtered = sortedData.value.length
  // 默认总数取传入全量 data 长度：页面把未过滤数据交给 MeTable 后无需再显式传 total
  const total = props.total ?? props.data.length
  if (total !== filtered) return t('meTable.totalFiltered', { filtered, total })
  return t('meTable.total', { total })
})
// #endregion

// #region 列映射、行 key 注入、排序桥接
const v2Ref = ref<TableV2Instance>()

// 行高/表头高/表内 footer 固定行高：全应用统一，与 el-table 默认行高对齐
const V2_ROW_HEIGHT = 40

// v2 的 rowKey 只支持指定字段名：给行对象注入不可枚举的 symbol 内部键（稳定唯一，且不出现在 RAW 导出 JSON 里）
const V2_ROW_KEY = Symbol('meTableRowKey')
let rowKeySeed = 0

const v2Data = computed(() => {
  const rows = sortedData.value
  for (const row of rows) {
    const raw = toRaw(row)
    if (raw && typeof raw === 'object' && !(V2_ROW_KEY in raw)) {
      Object.defineProperty(raw, V2_ROW_KEY, { value: ++rowKeySeed })
    }
  }
  return rows
})

// 列是否可排序：显式 sortable 优先；带列头筛选的列恒关（v2 整格点击热区会劫持筛选下拉点击，
// 且留着可见排序箭头会误导）；未指定时数据列默认开启（勾选列/序号列/纯插槽列无数据源，跳过）
function isColumnSortable(col: MeColumn): boolean {
  if (colFilterable(col)) return false
  if (col.sortable !== undefined) return Boolean(col.sortable)
  if (col.selection || col.index) return false
  return Boolean(col.prop || col.formatter)
}

const v2Columns = computed(() =>
  props.columns.map(col => ({
    key: col.key,
    dataKey: col.prop ?? col.key,
    title: col.title ?? '',
    headerTip: col.headerTip,
    // 弹性列以 minWidth 为基准宽、按 grow 分配剩余宽度；固定宽列不参与拉伸
    width: col.width ?? col.minWidth ?? 120,
    flexGrow: col.width ? 0 : (col.grow ?? 1),
    fixed: col.fixed,
    align: col.align,
    sortable: isColumnSortable(col),
    class: col.className,
    headerClass: col.headerClassName,
  })),
)

// v2 默认流体布局：列宽 flexShrink=1 会随容器压缩；总列宽超出容器时须开 fixed
// （列宽不收缩、主体展宽出横向滚动，与 el-table 溢出行为一致）；fixed 会禁用 flexGrow 拉伸，故按总宽动态开
const v2ColumnsTotalWidth = computed(() =>
  props.columns.reduce((sum, col) => sum + (col.width ?? col.minWidth ?? 120), 0),
)

// v2 排序箭头仅展示（sortState），实际排序仍走 MeTable 的 orderBy（保留 sortMethod 能力）
const v2SortState = computed(() => {
  if (!sortCol.value || !sortOrder.value) return {}
  return { [sortCol.value.key]: sortOrder.value === 'ascending' ? 'asc' : 'desc' }
})

// v2 的 #footer 为表内固定行：高度从主体扣除；空表也保留，底栏入口（官网等）始终可点
const v2FooterHeight = V2_ROW_HEIGHT

// v2 原生只有 asc/desc 两态；在 desc 后下一次点击（v2 循环回 asc）视为第三次点击，取消排序，对齐 el-table 三态；
// 对外按 el-table 的 sort-change 签名回传，order 可为 null
function handleV2ColumnSort({ key, order }: { key: string; order?: 'asc' | 'desc' }): void {
  const col = props.columns.find(c => c.key === key)
  if (!col) return
  const prop = col.prop ?? col.key
  // 当前列已 descending、v2 又发 asc（即循环回头）→ 取消排序
  const cancel = sortProp.value === prop && sortOrder.value === 'descending' && order === 'asc'
  sortProp.value = cancel ? null : prop
  sortOrder.value = cancel ? null : order === 'desc' ? 'descending' : 'ascending'

  const onSortChange = attrs.onSortChange as
    | ((p: { column: MeColumn; prop: string; order: string | null }) => void)
    | undefined
  onSortChange?.({ column: col, prop, order: sortOrder.value })
}

// 行类：调用方 rowClass（如差异行标记）与内置 stripe 组合（0 起奇数行加浅色底，与 el-table stripe 对齐）
function v2RowClass({ rowIndex, rowData }: { rowIndex: number; rowData: unknown }): string {
  const custom = props.rowClass?.(rowData, rowIndex) ?? ''
  return rowIndex % 2 === 1 ? `${custom} me-v2-stripe`.trim() : custom
}

// #region 勾选列：v2 无内置 selection，自渲染复选框并维护选中态；selection-change 经 attrs 回传行对象数组（与 el-table 签名一致）
const selectedSeeds = ref<Set<number>>(new Set())

function rowSeed(row: unknown): number | undefined {
  if (row && typeof row === 'object') return (toRaw(row) as Record<symbol, number>)[V2_ROW_KEY]
  return undefined
}

const selectedRows = computed(() =>
  sortedData.value.filter(row => {
    const seed = rowSeed(row)
    return seed !== undefined && selectedSeeds.value.has(seed)
  }),
)

const isAllSelected = computed(
  () => sortedData.value.length > 0 && selectedRows.value.length === sortedData.value.length,
)
const isSomeSelected = computed(() => selectedRows.value.length > 0 && !isAllSelected.value)

function emitSelectionChange(): void {
  const fn = attrs.onSelectionChange as ((rows: unknown[]) => void) | undefined
  fn?.(selectedRows.value)
}

function isRowSelected(row: unknown): boolean {
  const seed = rowSeed(row)
  return seed !== undefined && selectedSeeds.value.has(seed)
}

function toggleRowSelected(row: unknown, checked: boolean): void {
  const seed = rowSeed(row)
  if (seed === undefined) return
  const next = new Set(selectedSeeds.value)
  if (checked) next.add(seed)
  else next.delete(seed)
  selectedSeeds.value = next
  emitSelectionChange()
}

function toggleSelectAll(checked: boolean): void {
  const next = new Set<number>()
  if (checked) {
    for (const row of sortedData.value) {
      const seed = rowSeed(row)
      if (seed !== undefined) next.add(seed)
    }
  }
  selectedSeeds.value = next
  emitSelectionChange()
}

// 数据刷新后裁剪不存在的选中项（与 el-table 数据重置后 selection-change 一致）
watch(sortedData, rows => {
  const alive = new Set(rows.map(rowSeed).filter((s): s is number => s !== undefined))
  const pruned = new Set([...selectedSeeds.value].filter(s => alive.has(s)))
  if (pruned.size !== selectedSeeds.value.size) {
    selectedSeeds.value = pruned
    emitSelectionChange()
  }
})
// #endregion

// #region 行事件桥接：调用方经 attrs 传 onRowClick / onRowDblclick（签名 (row, rowIndex, event)），转 v2 row-event-handlers（键为 vnode 事件名）
type RowEventListener = (row: unknown, rowIndex: number, event: Event) => void

const v2RowEventHandlers = computed(() => {
  const handlers: Record<
    string,
    (payload: { event: Event; rowData: unknown; rowIndex: number }) => void
  > = {}
  const click = attrs.onRowClick as RowEventListener | undefined
  if (click) handlers.onClick = ({ event, rowData, rowIndex }) => click(rowData, rowIndex, event)
  const dblclick = attrs.onRowDblclick as RowEventListener | undefined
  if (dblclick)
    handlers.onDblclick = ({ event, rowData, rowIndex }) => dblclick(rowData, rowIndex, event)
  return handlers
})
// #endregion

function meColumnOf(key: unknown): MeColumn | undefined {
  return props.columns.find(c => c.key === key)
}

// 纯插槽列（操作列等无取值源、不进导出的列）：包裹层撑满单元格但不裁剪（el-table 的 .cell 也不裁溢出内容），
// 插槽内靠 space-between / space-evenly 铺满整格的布局（操作图标）与旧版一致
function isPlainSlotColumn(key: unknown): boolean {
  const col = meColumnOf(key)
  return !!col && !isExportableColumn(col)
}

// 单元格文本统一取法：formatter 优先，否则按 prop 取值（复用已取好的 cellData）；导出与关键词过滤走全文
function cellText(
  col: MeColumn | undefined,
  row: unknown,
  index: number,
  cellData?: unknown,
): string {
  // 序号列：显示与导出一致（rowIndex + 1）
  if (col?.index) return String(index + 1)
  if (col?.formatter) return col.formatter(row, index)
  const value =
    cellData !== undefined
      ? cellData
      : col?.prop
        ? (row as Record<string, unknown>)?.[col.prop]
        : ''
  return toCellText(value)
}

// 仅 showOverflowTooltip=false 时截断进 DOM（无悬停全文可看，大值靠详情）；开 tooltip 时保持全文，避免气泡/单元格被截成「假缺失」
function displayCellText(
  col: MeColumn | undefined,
  row: unknown,
  index: number,
  cellData?: unknown,
): string {
  const full = cellText(col, row, index, cellData)
  return props.showOverflowTooltip ? full : truncateCellDisplay(full)
}
// 溢出 tooltip 的 disabled 在 MeOverflowText 内按格维护，避免全表共用 ref 悬停刷可见格
// #endregion

// #region 导出：RAW 直接序列化数据；其余格式由列描述从数据层计算矩阵，不渲染 DOM
// 导出菜单项：RAW 项永远可用，其余格式需列描述能算出矩阵
const exportMenuItems = computed(() => {
  const withMatrix = exportableColumns(props.columns).length > 0
  return [
    { command: 'copyRawJson', label: t('meTable.copyRawJson'), divided: false },
    ...(withMatrix
      ? [
          { command: 'copyJson', label: t('meTable.copyJson'), divided: false },
          { command: 'copyCsv', label: t('meTable.copyCsv'), divided: false },
          { command: 'copyTsv', label: t('meTable.copyTsv'), divided: false },
          { command: 'copyHtml', label: t('meTable.copyHtml'), divided: false },
          { command: 'copyMarkdown', label: t('meTable.copyMarkdown'), divided: false },
        ]
      : []),
    { command: 'exportRawJson', label: t('meTable.exportRawJson'), divided: true },
    ...(withMatrix
      ? [
          { command: 'exportJson', label: t('meTable.exportJson'), divided: false },
          { command: 'exportCsv', label: t('meTable.exportCsv'), divided: false },
          { command: 'exportTsv', label: t('meTable.exportTsv'), divided: false },
          { command: 'exportHtml', label: t('meTable.exportHtml'), divided: false },
          { command: 'exportMarkdown', label: t('meTable.exportMarkdown'), divided: false },
          { command: 'exportExcel', label: t('meTable.exportExcel'), divided: false },
        ]
      : []),
  ]
})

function exportFileName(ext: string): string {
  return buildExportFileName(props.exportName, ext)
}

// 原始数据 JSON：直接序列化 sortedData（不受展示格式化/截断影响）
function rawJsonText(): string {
  return JSON.stringify(sortedData.value, null, 2)
}

async function handleExportCommand(command: string): Promise<void> {
  if (!sortedData.value.length) {
    meErr(t('meTable.exportEmpty'))
    return
  }

  // 原始 JSON 直接序列化数据，不受列描述影响
  if (command === 'copyRawJson') {
    meCopy(rawJsonText())
    return
  }
  if (command === 'exportRawJson') {
    await saveTableTextFile(rawJsonText(), exportFileName('json'), ['json'])
    return
  }

  // 其余格式：由列描述计算展示文本（与界面列定义单一来源）
  const { headers, rows } = exportMatrixFromColumns(props.columns, sortedData.value)

  switch (command) {
    case 'copyJson':
      meCopy(matrixToJson(headers, rows))
      break
    case 'copyCsv':
      meCopy(matrixToCsv(headers, rows))
      break
    case 'copyTsv':
      meCopy(matrixToTsv(headers, rows))
      break
    case 'copyHtml':
      await copyTableHtml(headers, rows)
      break
    case 'copyMarkdown':
      meCopy(matrixToMarkdown(headers, rows))
      break
    case 'exportJson':
      await saveTableTextFile(matrixToJson(headers, rows), exportFileName('json'), ['json'])
      break
    case 'exportCsv':
      await saveTableTextFile(matrixToCsv(headers, rows), exportFileName('csv'), ['csv'])
      break
    case 'exportTsv':
      await saveTableTextFile(matrixToTsv(headers, rows), exportFileName('tsv'), ['tsv'])
      break
    case 'exportExcel':
      await saveTableXlsxFile(headers, rows, exportFileName('xlsx'), props.exportName)
      break
    case 'exportHtml':
      await saveTableTextFile(matrixToHtml(headers, rows), exportFileName('html'), ['html'])
      break
    case 'exportMarkdown':
      await saveTableTextFile(matrixToMarkdown(headers, rows), exportFileName('md'), ['md'])
      break
  }
}

defineExpose({
  scrollTo(top: number, left?: number) {
    v2Ref.value?.scrollTo({ scrollTop: top, scrollLeft: left ?? 0 })
  },
})
// #endregion
</script>

<template>
  <div class="me-table" :class="attrs.class" :style="attrs.style as StyleValue">
    <div class="me-table-main">
      <el-auto-resizer>
        <template #default="{ width, height }">
          <el-table-v2
            ref="v2Ref"
            class="me-table-v2"
            :columns="v2Columns"
            :data="v2Data"
            :width="width"
            :height="height"
            :fixed="v2ColumnsTotalWidth > width"
            :row-height="V2_ROW_HEIGHT"
            :header-height="V2_ROW_HEIGHT"
            :row-key="V2_ROW_KEY"
            :sort-state="v2SortState"
            :footer-height="v2FooterHeight"
            :row-class="v2RowClass"
            :row-event-handlers="v2RowEventHandlers"
            @column-sort="handleV2ColumnSort">
            <template #cell="{ column, cellData, rowData, rowIndex }">
              <el-checkbox
                v-if="meColumnOf(column.key)?.selection"
                :model-value="isRowSelected(rowData)"
                @change="(v: boolean) => toggleRowSelected(rowData, v)" />
              <div v-else-if="isPlainSlotColumn(column.key)" class="me-cell-slot">
                <slot
                  :name="`cell-${String(column.key)}`"
                  :row="rowData"
                  :index="rowIndex"
                  :value="cellData" />
              </div>
              <!-- 开 tooltip：全文进 DOM/气泡；disabled 按格隔离。具名插槽须自带回退文本（空 slot 传给子组件时其子默认插槽不生效） -->
              <me-overflow-text
                v-else-if="showOverflowTooltip"
                :content="cellText(meColumnOf(column.key), rowData, rowIndex, cellData)">
                <slot
                  :name="`cell-${String(column.key)}`"
                  :row="rowData"
                  :index="rowIndex"
                  :value="cellData">
                  {{ cellText(meColumnOf(column.key), rowData, rowIndex, cellData) }}
                </slot>
              </me-overflow-text>
              <div v-else class="me-cell-ellipsis">
                <slot
                  :name="`cell-${String(column.key)}`"
                  :row="rowData"
                  :index="rowIndex"
                  :value="cellData">
                  {{ displayCellText(meColumnOf(column.key), rowData, rowIndex, cellData) }}
                </slot>
              </div>
            </template>
            <template #header-cell="{ column }">
              <el-checkbox
                v-if="meColumnOf(column.key)?.selection"
                :model-value="isAllSelected"
                :indeterminate="isSomeSelected"
                @change="(v: boolean) => toggleSelectAll(v)" />
              <slot v-else :name="`header-${String(column.key)}`" :column="meColumnOf(column.key)">
                <!-- 三者互斥：有 filterOptions 只渲染筛选面板（含标题），否则回退标题（可选 headerTip） -->
                <me-column-filter
                  v-if="meColumnOf(column.key) && colFilterable(meColumnOf(column.key)!)"
                  :title="column.title"
                  :center="meColumnOf(column.key)?.filterCenter"
                  :options="colFilterOptions(meColumnOf(column.key)!)"
                  :model-value="colFilters[String(column.key)] ?? []"
                  @update:model-value="updateColFilter(String(column.key), $event)" />
                <el-tooltip
                  v-else-if="column.headerTip"
                  :content="column.headerTip"
                  placement="top">
                  <span>{{ column.title }}</span>
                </el-tooltip>
                <span v-else>{{ column.title }}</span>
              </slot>
            </template>
            <!-- 空态描述可定制（未传时用 EP 默认 ElEmpty 文案）；总数与右区（#footer 插槽主动作 + 导出）进表格自带 #footer（固定行，高度从主体扣除） -->
            <template #empty>
              <el-empty :description="emptyText" />
            </template>
            <template #footer>
              <div class="me-table-footer" :class="{ 'has-center': !!$slots['footer-center'] }">
                <span class="me-table-total">{{ footerTotalText }}</span>
                <!-- 居中摘要：有内容时总数与右侧操作不再抢中间空位 -->
                <div v-if="$slots['footer-center']" class="me-table-footer-center">
                  <slot name="footer-center" />
                </div>
                <div class="me-table-footer-right">
                  <!-- 主动作区：调用方经 #footer 插槽注入（如键值页「加载更多 / 加载全部」），右侧紧邻导出菜单 -->
                  <div class="me-table-footer-actions">
                    <slot name="footer" />
                  </div>
                  <!-- 空表禁用：避免点开复制/导出再提示无数据 -->
                  <el-dropdown
                    class="me-table-more-wrap"
                    :disabled="!sortedData.length"
                    trigger="click"
                    placement="top-end"
                    @command="handleExportCommand">
                    <me-icon
                      icon="el-icon-more-filled"
                      class="me-table-more"
                      :class="{ 'icon-btn': !!sortedData.length }" />
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="item in exportMenuItems"
                          :key="item.command"
                          :command="item.command"
                          :divided="item.divided">
                          {{ item.label }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
          </el-table-v2>
        </template>
      </el-auto-resizer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.me-table {
  height: 100%;
  display: flex;
  flex-direction: column;

  .me-table-main {
    flex: 1;
    height: 0;
    // 外框挂 main 上（v2 根自身的 border/outline 会被内部绝对定位网格与子背景盖住、或挤内容盒）；
    // main 内容盒相应缩 2px，resizer 量到的恰是内尺寸，width 取值刚好；
    // --el-table-border 仅定义在 .el-table-v2 根节点作用域，祖先元素取不到，故直接用其指向的同源全局变量
    border: 1px solid var(--el-border-color-lighter);
  }

  // 表内 footer（#footer 插槽的固定行）：撑满行高，左右留白与单元格内边距对齐
  .me-table-footer {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    // 顶边划出与表体的边界（末行底线已去掉，不补这里就看不出分界）
    border-top: var(--el-table-border);
    // v2 footer 默认透明而表体刷 --el-bg-color，弹框内叠底底色不同会出色差带，对齐表体
    background-color: var(--el-bg-color);

    .me-table-total {
      flex: 1;
      min-width: 0;
    }

    // 有居中摘要时，总数和右区按内容收缩，中间槽占满剩余宽度并居中省略
    &.has-center {
      .me-table-total,
      .me-table-footer-right {
        flex: 0 0 auto;
      }
    }

    .me-table-footer-center {
      flex: 1;
      min-width: 0;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    // 主动作区：图标簇紧凑 8px（官网 / 原文等）；字号继承表格（14px）不另设
    .me-table-footer-actions {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    // 右区：主动作 + 导出「更多」贴右，间距同 8px；无主动作时导出照旧贴右
    .me-table-footer-right {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .me-table-more-wrap {
      flex-shrink: 0;
      font-size: 16px;
      line-height: 1;

      &.is-disabled .me-table-more {
        opacity: 0.45;
      }
    }
  }
}

// 与 el-table（stripe + border）的视觉对齐
.me-table-v2 {
  // 行文字色对齐 el-table（v2 行单元格不设 color，会继承页面主文字色而偏亮一档）
  color: var(--el-table-text-color);

  // 单元格内边距与 el-table 的 .cell 一致；列间竖线模拟 border 表
  :deep(.el-table-v2__header-cell),
  :deep(.el-table-v2__row-cell) {
    padding: 0 12px;
  }

  :deep(.el-table-v2__header-cell + .el-table-v2__header-cell),
  :deep(.el-table-v2__row-cell + .el-table-v2__row-cell) {
    border-left: var(--el-table-border);
  }

  // 固定列由 v2 单独渲染在左/右独立网格（主网格只留占位单元格），相邻选择器的列间线接不过去：
  // 接缝处补线（右固定首列加左边、左固定末列加右边），与 el-table border 表的固定列边缘一致
  :deep(.el-table-v2__right .el-table-v2__header-cell:first-child),
  :deep(.el-table-v2__right .el-table-v2__row-cell:first-child) {
    border-left: var(--el-table-border);
  }

  :deep(.el-table-v2__left .el-table-v2__header-cell:last-child),
  :deep(.el-table-v2__left .el-table-v2__row-cell:last-child) {
    border-right: var(--el-table-border);
  }

  // 行分隔线与 hover 底色 EP 已有等价默认样式；此处仅去掉末行线，表底线交由外框承担（否则与外框底线双线）
  :deep(.el-table-v2__row:last-child) {
    border-bottom: none;
  }

  // 行底色统一经 --me-row-bg 下发，覆盖优先级对齐 el-table：hover > 行级高亮 > 斑马纹；
  // 页面级高亮（如当前编辑行）在各自样式里只设该变量，不再与内置底色比选择器特异性
  :deep(.el-table-v2__row) {
    background-color: var(--me-row-bg, transparent);
  }

  :deep(.me-v2-stripe) {
    --me-row-bg: var(--el-fill-color-lighter);
  }

  // 行类重复一次抬高特异性：页面级高亮变量规则在父组件样式（注入晚于本组件），
  // 不压过它 hover 就会被高亮吞掉（el-table 里 hover 恒最优先）
  :deep(.el-table-v2__row.el-table-v2__row:hover),
  :deep(.el-table-v2__row.el-table-v2__row.is-hovered) {
    --me-row-bg: var(--el-table-row-hover-bg-color);
  }

  // 单元格内容单行省略（截断检测与 el-table show-overflow-tooltip 一致）；
  // 包裹节点属本组件模板，scoped 即可，自定义单元格插槽内容也被它包裹
  .me-cell-ellipsis {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 纯插槽列包裹层：撑满单元格供插槽内容整格布局，不裁剪（溢出内边距区由单元格边界兜底）
  .me-cell-slot {
    width: 100%;
  }
}
</style>
