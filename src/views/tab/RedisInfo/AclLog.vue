<script setup lang="ts">
// #region 导入
// ACL LOG 安全日志对话框；客户端列置末便于横向浏览
import dayjs from 'dayjs'
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { AclLogEntry } from '@/types/tauri-specta'
import type { TableExportMatrix } from '@/utils/export'
import { meCommands, meConfirm, meOk } from '@/utils/util'
// #endregion

// #region 核心状态
const visible = defineModel<boolean>({ default: false })
const { t } = useI18n()
const share = inject(shareProvideKey)!
const keyword = ref('')
const loading = ref(false)
const logs = ref<AclLogEntry[]>([])
// #endregion

// #region 计算属性
const canEdit = computed(() => !share.readonly)
const filterLogs = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return logs.value
  return logs.value.filter(row => {
    const text = `${row.reason} ${row.username}`.toLowerCase()
    return text.includes(key)
  })
})

// MeTable 导出：由行数据直接计算展示文本，与表格列定义一致（改列时同步改这里）
function exportRows(data: unknown[]): TableExportMatrix {
  return {
    headers: [
      t('redisACL.logCount'),
      t('redisACL.logReason'),
      t('redisACL.logContext'),
      t('redisACL.logObject'),
      t('redisACL.username'),
      t('redisACL.logAge'),
      t('redisACL.logEntryId'),
      t('redisACL.logTimeCreated'),
      t('redisACL.logTimeUpdated'),
      t('redisACL.logClient'),
    ],
    rows: (data as AclLogEntry[]).map(row => [
      String(row.count),
      row.reason,
      row.context,
      row.object,
      row.username,
      formatAge(row.ageSeconds ?? Number.NaN),
      String(row.entryId),
      formatTimestamp(row.timestampCreated),
      formatTimestamp(row.timestampLastUpdated),
      row.clientInfo || '--',
    ]),
  }
}
// #endregion

// #region 面板操作
watch(visible, val => {
  if (val) {
    keyword.value = ''
    void loadLogs()
  }
})

// ACL LOG timestamp-created：7.2+ 为 Unix 毫秒，更早版本无该字段
function formatTimestamp(ts: number) {
  if (!ts) return '--'
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss')
}

function formatAge(age: number) {
  if (!Number.isFinite(age)) return '--'
  return String(Math.round(age))
}

async function loadLogs() {
  if (!share.conn?.id) return
  loading.value = true
  try {
    logs.value = await meCommands.aclLog(share.conn.id, 100)
  } finally {
    loading.value = false
  }
}

function clearLogs() {
  meConfirm(t('redisACL.logClearConfirm'), async () => {
    await meCommands.aclLogReset(share.conn!.id)
    meOk(t('redisACL.logClearOk'))
    await loadLogs()
  })
}
// #endregion
</script>

<template>
  <me-dialog
    v-model="visible"
    icon="el-icon-document"
    :title="t('redisACL.log')"
    width="80vw"
    :close-on-press-escape="false"
    :close-on-click-modal="false">
    <div class="acl-log">
      <div class="me-flex header">
        <me-button
          v-if="canEdit"
          icon="el-icon-delete"
          :info="t('redisACL.logClear')"
          :disabled="logs.length === 0"
          placement="top"
          @click="clearLogs" />
        <div class="header-tools">
          <el-input
            v-model="keyword"
            :placeholder="t('redisACL.logKeyword')"
            style="width: 250px; margin-right: 10px"
            clearable />
          <el-button icon="el-icon-search" type="primary" :loading="loading" @click="loadLogs" />
        </div>
      </div>
      <div class="table">
        <me-table
          v-if="logs.length"
          :data="filterLogs"
          export-name="acl-log"
          :export-rows="exportRows"
          height="100%"
          v-loading="loading"
          stripe
          border>
          <el-table-column prop="count" :label="t('redisACL.logCount')" width="72" align="center" />
          <el-table-column
            prop="reason"
            :label="t('redisACL.logReason')"
            width="100"
            class-name="col-nowrap"
            show-overflow-tooltip />
          <el-table-column prop="context" :label="t('redisACL.logContext')" width="88" />
          <el-table-column
            prop="object"
            :label="t('redisACL.logObject')"
            min-width="150"
            show-overflow-tooltip />
          <el-table-column prop="username" :label="t('redisACL.username')" width="96" />
          <el-table-column :label="t('redisACL.logAge')" width="100" align="right">
            <template #default="{ row }">{{ formatAge(row.ageSeconds) }}</template>
          </el-table-column>
          <el-table-column
            prop="entryId"
            :label="t('redisACL.logEntryId')"
            width="88"
            align="right" />
          <el-table-column :label="t('redisACL.logTimeCreated')" width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ formatTimestamp(row.timestampCreated) }}</template>
          </el-table-column>
          <el-table-column :label="t('redisACL.logTimeUpdated')" width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ formatTimestamp(row.timestampLastUpdated) }}</template>
          </el-table-column>
          <el-table-column
            prop="clientInfo"
            :label="t('redisACL.logClient')"
            min-width="160"
            show-overflow-tooltip>
            <template #default="{ row }">{{ row.clientInfo || '--' }}</template>
          </el-table-column>
        </me-table>
        <el-empty v-else-if="!loading" :description="t('redisACL.logEmpty')" />
      </div>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.acl-log {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .header {
    align-items: center;

    .header-tools {
      display: flex;
      align-items: center;
      margin-left: auto;
    }
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;

    :deep(.col-nowrap .cell) {
      white-space: nowrap;
    }
  }
}
</style>
