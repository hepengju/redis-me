<script setup lang="ts">
// 列数据的复制/导出菜单。只吃列描述和行数据：格式化项走列矩阵，RAW 序列化原始行。
// 表格底栏的「…」和目录内存分析的按钮共用这一套，菜单里复制和导出各一半，所以不叫「导出」。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { TABLE_EXPORT_MENU, dispatchTableExport } from '@/utils/export'
import { meErr } from '@/utils/util'

import { type MeColumn, exportMatrixFromColumns, exportableColumns } from './me-table-column'

const props = withDefaults(
  defineProps<{
    data: unknown[]
    columns: MeColumn[]
    /** 文件名中段，同时作为 Excel 工作表名 */
    exportName?: string
    placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end'
  }>(),
  { exportName: 'table', placement: 'top-end' },
)

const { t } = useI18n()

const items = computed(() => {
  const withMatrix = exportableColumns(props.columns).length > 0
  return TABLE_EXPORT_MENU.filter(item => withMatrix || !item.needsMatrix).map(item => ({
    command: item.command,
    divided: item.divided,
    label: t(`meTable.${item.command}`),
  }))
})

async function onCommand(command: string): Promise<void> {
  if (!props.data.length) {
    meErr(t('meTable.exportEmpty'))
    return
  }
  // 点下去就钉住当前行，扫描中途继续追加不会改到这份结果
  const rows = props.data.slice()
  await dispatchTableExport(command, {
    rawText: () => JSON.stringify(rows, null, 2),
    matrix: () => exportMatrixFromColumns(props.columns, rows),
    exportName: props.exportName,
  })
}
</script>

<template>
  <el-dropdown :disabled="!data.length" trigger="click" :placement="placement" @command="onCommand">
    <slot />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in items"
          :key="item.command"
          :command="item.command"
          :divided="item.divided">
          {{ item.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
