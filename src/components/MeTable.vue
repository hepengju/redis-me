<script setup lang="ts">
// 说明: 前端分页表，用于数据量比较大的场景（比如内存分析等），进行前端分页，避免卡顿。
// 在分页前对整表排序：与 el-table 的 default-sort、列 sortable / sort-method / sort-by 一致；
// sortable="custom" 时不改行顺序，由父组件在 sort-change 中自行更新 :data。
// 分页条右侧「…」菜单：RAW 项直接序列化数据永远可用；其余格式由 exportRows
// 从数据层计算矩阵（不渲染 DOM），未提供 exportRows 时仅显示 RAW 项。
import type { TableInstance } from 'element-plus'
import { orderBy } from 'element-plus/es/components/table/src/util.mjs'
import { computed, ref, useAttrs, watch } from 'vue'
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
  type TableExportMatrix,
} from '@/utils/export'
import { meCopy, meErr } from '@/utils/util'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

// #region 其他：props、attrs、分页状态（排序变更会重置页码，故放在排序之前）
const props = withDefaults(
  defineProps<{
    data?: unknown[]
    layout?: string
    /** 仅一页时是否隐藏分页条；默认 false（始终显示） */
    hideOnSinglePage?: boolean
    /** 导出文件名前缀 */
    exportName?: string
    /** 隐藏分页条右侧扩展菜单 */
    hideExport?: boolean
    /** 导出数据计算：由行数据直接生成表头/文本矩阵（不渲染 DOM）；未提供时菜单仅显示 RAW 项 */
    exportRows?: (data: unknown[]) => TableExportMatrix
  }>(),
  {
    data: () => [],
    layout: 'total, sizes, prev, pager, next, jumper',
    hideOnSinglePage: false,
    exportName: 'table',
    hideExport: false,
  },
)

const attrs = useAttrs()

const currentPage = ref(1)
const pageSize = ref(20)
// #endregion

// #region 排序（default-sort、sort-change、整表 orderBy 与 EP 列行为一致）
// 与 Element Plus sort-change 中 column 对齐的字段（避免深类型依赖）
interface SortColumnLike {
  sortable?: boolean | string
  sortMethod?: (a: unknown, b: unknown) => number
  sortBy?: string | string[] | ((row: unknown, index: number, array?: unknown[]) => unknown)
}

const sortProp = ref<string | null>(null)
const sortOrder = ref<'ascending' | 'descending' | null>(null)
const sortMethod = ref<((a: unknown, b: unknown) => number) | undefined>(undefined)
const sortBy = ref<SortColumnLike['sortBy']>(undefined)
const isCustomSort = ref(false)

function readDefaultSortFromAttrs(): { prop: string; order: 'ascending' | 'descending' } | null {
  const ds = attrs.defaultSort as { prop?: string; order?: string } | undefined
  if (!ds?.prop) return null
  if (ds.order !== 'ascending' && ds.order !== 'descending') return null
  return { prop: ds.prop, order: ds.order }
}

function applyDefaultSortFromAttrs(): void {
  const ds = readDefaultSortFromAttrs()
  if (ds) {
    sortProp.value = ds.prop
    sortOrder.value = ds.order
    sortMethod.value = undefined
    sortBy.value = undefined
    isCustomSort.value = false
  } else {
    sortProp.value = null
    sortOrder.value = null
    sortMethod.value = undefined
    sortBy.value = undefined
    isCustomSort.value = false
  }
}

watch(
  () => attrs.defaultSort,
  () => {
    applyDefaultSortFromAttrs()
  },
  { deep: true, immediate: true },
)

const sortedData = computed(() => {
  const raw = props.data
  if (isCustomSort.value || !sortProp.value || !sortOrder.value) return raw
  return orderBy(
    [...raw] as never,
    sortProp.value,
    sortOrder.value,
    (sortMethod.value ?? null) as never,
    sortBy.value as never,
  ) as unknown[]
})

const elTableAttrs = computed(() => {
  const { onSortChange: _onSortChange, ...rest } = attrs as Record<string, unknown>
  return rest
})

function handleSortChange(payload: {
  column: SortColumnLike | null
  prop: string | null
  order: 'ascending' | 'descending' | null
}): void {
  const { column, prop, order } = payload

  if (column?.sortable === 'custom') {
    isCustomSort.value = true
    sortProp.value = prop
    sortOrder.value = order
    sortMethod.value = undefined
    sortBy.value = undefined
  } else if (order === null) {
    isCustomSort.value = false
    // 与「有 default-sort 的列表」预期一致：取消列排序时回到 default-sort，而不是按 data 插入顺序（例如监控 push 尾部最新）
    if (readDefaultSortFromAttrs()) {
      applyDefaultSortFromAttrs()
    } else {
      sortProp.value = null
      sortOrder.value = null
      sortMethod.value = undefined
      sortBy.value = undefined
    }
  } else {
    isCustomSort.value = false
    sortProp.value = prop
    sortOrder.value = order
    sortMethod.value = column?.sortMethod
    sortBy.value = column?.sortBy
  }

  currentPage.value = 1

  const onSortChange = attrs.onSortChange as ((p: typeof payload) => void) | undefined
  onSortChange?.(payload)
}
// #endregion

// #region 其他：分页数据与分页事件
const pageData = computed(() => {
  return sortedData.value.slice(
    (currentPage.value - 1) * pageSize.value,
    currentPage.value * pageSize.value,
  )
})

// RAW 项不依赖 exportRows 永远可用；其余格式需视图提供 exportRows
const showExportMenu = computed(() => !props.hideExport && sortedData.value.length > 0)

const showPagination = computed(() => {
  if (sortedData.value.length === 0) return false
  if (!props.hideOnSinglePage) return true
  return sortedData.value.length > pageSize.value
})

// 无数据时不显示 footer；有数据时显示分页和/或 …
const showTableFooter = computed(() => showExportMenu.value || showPagination.value)

function handleChange(page: number, size: number): void {
  currentPage.value = page
  pageSize.value = size
}

function updatePageSize(size: number): void {
  currentPage.value = 1
  pageSize.value = size
}

// 行变少后停在仍有数据的页（例如删掉当前页最后一条）
watch(
  () => sortedData.value.length,
  len => {
    const maxPage = Math.max(1, Math.ceil(len / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = maxPage
  },
)
// #endregion

// #region 导出：RAW 直接序列化数据；其余格式由 exportRows 数据层计算，不渲染 DOM
const tableRef = ref<TableInstance>()

function ensureExportRows(): boolean {
  if (sortedData.value.length) return true
  meErr(t('meTable.exportEmpty'))
  return false
}

function exportFileName(ext: string): string {
  return buildExportFileName(props.exportName, ext)
}

// 原始数据 JSON：直接序列化 sortedData（不受展示格式化/截断影响）
function rawJsonText(): string {
  return JSON.stringify(sortedData.value, null, 2)
}

async function handleExportCommand(command: string): Promise<void> {
  if (!ensureExportRows()) return

  // 原始 JSON 直接序列化数据，不依赖 exportRows
  if (command === 'copyRawJson') {
    meCopy(rawJsonText())
    return
  }
  if (command === 'exportRawJson') {
    await saveTableTextFile(rawJsonText(), exportFileName('json'), ['json'])
    return
  }

  // 其余格式：由视图提供的 exportRows 计算展示文本（与界面列定义保持一致）
  if (!props.exportRows) return
  const { headers, rows } = props.exportRows(sortedData.value)

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
      await saveTableXlsxFile(headers, rows, exportFileName('xlsx'))
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
    tableRef.value?.scrollTo(top, left)
  },
})
// #endregion
</script>

<template>
  <div class="me-table">
    <div class="me-table-main">
      <el-table
        ref="tableRef"
        stripe
        border
        v-bind="elTableAttrs"
        :data="pageData"
        height="100%"
        @sort-change="handleSortChange">
        <slot></slot>
      </el-table>
    </div>
    <div v-if="showTableFooter" class="me-table-footer">
      <el-pagination
        v-if="showPagination"
        class="me-table-pagination"
        :style="{ marginLeft: layout.includes('total') ? '5px' : 0 }"
        size="small"
        background
        :hide-on-single-page="hideOnSinglePage"
        @change="handleChange"
        :page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        @update:page-size="updatePageSize"
        :total="sortedData.length"
        :layout />
      <el-dropdown
        v-if="showExportMenu"
        class="me-table-more-wrap"
        trigger="click"
        placement="top-end"
        @command="handleExportCommand">
        <me-icon icon="el-icon-more-filled" class="icon-btn me-table-more" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="copyRawJson">{{
              t('meTable.copyRawJson')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="copyJson">{{
              t('meTable.copyJson')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="copyCsv">{{
              t('meTable.copyCsv')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="copyTsv">{{
              t('meTable.copyTsv')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="copyHtml">{{
              t('meTable.copyHtml')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="copyMarkdown">{{
              t('meTable.copyMarkdown')
            }}</el-dropdown-item>
            <el-dropdown-item command="exportRawJson" divided>{{
              t('meTable.exportRawJson')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="exportJson">{{
              t('meTable.exportJson')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="exportCsv">{{
              t('meTable.exportCsv')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="exportTsv">{{
              t('meTable.exportTsv')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="exportHtml">{{
              t('meTable.exportHtml')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="exportMarkdown">{{
              t('meTable.exportMarkdown')
            }}</el-dropdown-item>
            <el-dropdown-item v-if="exportRows" command="exportExcel">{{
              t('meTable.exportExcel')
            }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped lang="scss">
.me-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .me-table-main {
    flex: 1;
    height: 0;
  }

  .me-table-footer {
    display: flex;
    align-items: center;
    margin-top: 10px;
    gap: 4px;

    .me-table-pagination {
      flex: 1;
      min-width: 0;
    }

    .me-table-more-wrap {
      flex-shrink: 0;
      margin-left: auto;
      margin-right: 5px;
      font-size: 16px;
    }
  }
}
</style>
