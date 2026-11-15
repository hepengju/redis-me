<script setup lang="ts">
// #region 导入
// ACL LOG 安全日志对话框；客户端列置末便于横向浏览
import dayjs from 'dayjs'
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import { shareProvideKey } from '@/types/me-interface'
import type { AclLogEntry } from '@/types/tauri-specta'
import { meCommands, meConfirm, meOk } from '@/utils/app/util'
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

// 列描述：展示与导出文本单一来源（formatter 优先于 prop 取值）
const logColumns = computed<MeColumn<AclLogEntry>[]>(() => [
  { key: 'count', prop: 'count', title: t('redisACL.logCount'), width: 72, align: 'center' },
  { key: 'reason', prop: 'reason', title: t('redisACL.logReason'), width: 100 },
  { key: 'context', prop: 'context', title: t('redisACL.logContext'), width: 88 },
  { key: 'object', prop: 'object', title: t('redisACL.logObject'), minWidth: 150 },
  { key: 'username', prop: 'username', title: t('redisACL.username'), width: 96 },
  {
    key: 'age',
    title: t('redisACL.logAge'),
    width: 100,
    align: 'right',
    formatter: row => formatAge(row.ageSeconds ?? Number.NaN),
  },
  { key: 'entryId', prop: 'entryId', title: t('redisACL.logEntryId'), width: 88, align: 'right' },
  {
    key: 'timeCreated',
    title: t('redisACL.logTimeCreated'),
    width: 180,
    formatter: row => formatTimestamp(row.timestampCreated),
  },
  {
    key: 'timeUpdated',
    title: t('redisACL.logTimeUpdated'),
    width: 180,
    formatter: row => formatTimestamp(row.timestampLastUpdated),
  },
  {
    key: 'clientInfo',
    prop: 'clientInfo',
    title: t('redisACL.logClient'),
    minWidth: 160,
    formatter: row => row.clientInfo || '--',
  },
])
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
          v-loading="loading"
          :data="filterLogs"
          :columns="logColumns"
          :total="logs.length"
          :empty-text="t('redisACL.logEmpty')"
          export-name="acl-log" />
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
  }
}
</style>
