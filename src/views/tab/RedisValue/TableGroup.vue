<script setup lang="ts">
// #region 导入
// Stream 消费者组弹框：XINFO GROUPS + 展开 XINFO CONSUMERS
import type { TableInstance } from 'element-plus'
import { inject, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { XInfoConsumer, XInfoGroup } from '@/types/tauri-specta'
import { meCommands } from '@/utils/app/util'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const visible = ref(false)
const loading = ref(false)
const dataList = ref<XInfoGroup[]>([])
const table = useTemplateRef<TableInstance>('table')
const consumerData = ref<XInfoConsumer[]>([])
const consumerLoading = ref(false)
// #endregion

// #region 面板操作
async function open() {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  visible.value = true
  loading.value = true
  consumerData.value = []
  try {
    dataList.value = await meCommands.xinfoGroups(conn.id, redisKey)
  } finally {
    loading.value = false
  }
}

async function handleExpand(row: XInfoGroup, expandedRows: XInfoGroup[]) {
  if (expandedRows.length === 0) return

  // 手风琴效果：如果展开行数大于1，自动收起其他行
  if (expandedRows.length > 1) {
    const otherRow = expandedRows.find(r => r.name !== row.name)
    if (otherRow) table.value?.toggleRowExpansion(otherRow, false)
  }

  consumerLoading.value = true
  try {
    consumerData.value = await meCommands.xinfoConsumers(share.conn!.id, share.redisKey!, row.name)
  } finally {
    consumerLoading.value = false
  }
}

defineExpose({ open })
// #endregion
</script>

<template>
  <me-dialog title="Groups" icon="el-icon-grid" v-model="visible" width="900">
    <div v-loading="loading" class="table-group">
      <el-table
        ref="table"
        :data="dataList"
        border
        stripe
        height="100%"
        :default-sort="{ prop: 'name', order: 'ascending' }"
        @expand-change="handleExpand">
        <el-table-column type="expand">
          <template #default>
            <div class="consumer-wrapper" v-loading="consumerLoading">
              <el-table :data="consumerData" border stripe style="width: 80%">
                <el-table-column
                  :label="t('tableGroup.consumerName')"
                  prop="name"
                  show-overflow-tooltip />
                <el-table-column
                  :label="t('tableGroup.consumerPending')"
                  prop="pending"
                  show-overflow-tooltip />
                <el-table-column
                  :label="t('tableGroup.consumerIdle')"
                  prop="idle"
                  show-overflow-tooltip />
              </el-table>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          :label="t('tableGroup.name')"
          width="140"
          prop="name"
          show-overflow-tooltip
          sortable />
        <el-table-column
          :label="t('tableGroup.consumers')"
          prop="consumers"
          width="140"
          show-overflow-tooltip
          sortable />
        <el-table-column
          :label="t('tableGroup.pending')"
          prop="pending"
          width="120"
          show-overflow-tooltip
          sortable />
        <el-table-column
          :label="t('tableGroup.lastDeliveredId')"
          prop="last_delivered_id"
          width="150"
          show-overflow-tooltip />
        <el-table-column
          :label="t('tableGroup.entriesRead')"
          prop="entries_read"
          show-overflow-tooltip />
        <el-table-column
          :label="t('tableGroup.lag')"
          prop="lag"
          width="120"
          show-overflow-tooltip />
      </el-table>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.table-group {
  height: 100%;
  overflow: auto;

  .consumer-wrapper {
    padding: 20px;
    background-color: var(--el-fill-color-lighter);
    display: flex;
    justify-content: center;
  }
}
</style>
