<script setup lang="ts">
import type { TableInstance } from 'element-plus'
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { UiConn } from '@/types/me-interface'
import { connEndpoint, getConnIcon } from '@/utils/conn'
import { PREDEFINE_COLORS } from '@/utils/util'

const props = defineProps<{ data: UiConn[]; groupKey?: string }>()

const emit = defineEmits<{
  select: [conn: UiConn]
  copy: [conn: UiConn]
  edit: [conn: UiConn]
  delete: [conn: UiConn]
}>()

const { t } = useI18n()
const tableRef = useTemplateRef<TableInstance>('table')

function cellStyle({ row }: { row: UiConn }): Record<string, string> | undefined {
  if (row.color) return { color: row.color }
  return undefined
}

function markTbody(): void {
  const inst = tableRef.value
  if (!inst) return
  const tbody = inst.$el.querySelector('.el-table__body-wrapper tbody')
  if (tbody) tbody.setAttribute('data-group-key', props.groupKey ?? '')
}

onMounted(() => void nextTick(markTbody))
watch(
  () => [props.data, props.groupKey],
  () => void nextTick(markTbody),
)

defineExpose({
  getTbody: () =>
    tableRef.value?.$el.querySelector('.el-table__body-wrapper tbody') as HTMLElement | null,
})
</script>

<template>
  <el-table ref="table" :data="data" :cell-style="cellStyle" row-key="id" border stripe>
    <el-table-column label="#" type="index" width="50" align="center" class-name="drag-handle" />
    <el-table-column :label="t('conn.color')" prop="color" width="64" align="center">
      <template #default="scope">
        <el-color-picker size="small" v-model="scope.row.color" :predefine="PREDEFINE_COLORS" />
      </template>
    </el-table-column>
    <el-table-column
      :label="t('conn.name')"
      prop="name"
      show-overflow-tooltip
      class-name="conn-name">
      <template #default="scope">
        <div
          class="conn-name-hit"
          :style="{ color: scope.row.color || 'var(--el-color-primary)' }"
          @click="emit('select', scope.row)">
          <me-icon :icon="getConnIcon(scope.row)" :name="scope.row.name" />
        </div>
      </template>
    </el-table-column>
    <el-table-column
      :label="t('conn.hostPort')"
      prop="host"
      width="200"
      show-overflow-tooltip
      class-name="conn-host">
      <template #default="scope">
        <div style="color: var(--el-color-info)">
          {{ connEndpoint(scope.row) }}
        </div>
      </template>
    </el-table-column>
    <el-table-column :label="t('conn.otherProp')" width="200" show-overflow-tooltip>
      <template #default="scope">
        <el-checkbox disabled size="small" v-model="scope.row.readonly">{{
          t('conn.readonlyShort')
        }}</el-checkbox>
        <el-checkbox disabled size="small" v-model="scope.row.cluster">{{
          t('conn.cluster')
        }}</el-checkbox>
        <el-checkbox disabled size="small" v-model="scope.row.ssl">SSL</el-checkbox>
      </template>
    </el-table-column>
    <el-table-column :label="t('action')" width="80" fixed="right" align="center">
      <template #default="scope">
        <div class="me-flex">
          <me-icon
            :info="t('copy')"
            icon="el-icon-document-copy"
            class="icon-btn"
            @click="emit('copy', scope.row)" />
          <me-icon
            :info="t('edit')"
            icon="el-icon-edit"
            class="icon-btn"
            @click="emit('edit', scope.row)" />
          <me-icon
            :info="t('delete')"
            icon="el-icon-delete"
            class="icon-btn"
            @click="emit('delete', scope.row)" />
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped lang="scss">
/* 名称列横向铺满可点，保留表格默认 cell 内边距避免撑高行高 */
.conn-name-hit {
  display: block;
  width: 100%;
  cursor: pointer;

  :deep(.icon-main) {
    overflow: hidden;
  }
}
</style>
