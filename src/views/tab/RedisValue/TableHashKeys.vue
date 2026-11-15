<script setup lang="ts">
// #region 导入
// Hash 全量字段名/值（HKEYS/HVALS）弹框：me-table 虚拟滚动，万级字段也不卡
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import { shareProvideKey } from '@/types/me-interface'
import type { BytesFormat } from '@/types/tauri-specta'
import { meCommands } from '@/utils/app/util'
import { meFormatViewValue, type ViewBytesFormat } from '@/utils/codec/format'
// #endregion

type HashListMode = 'keys' | 'values'

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const visible = ref(false)
const loading = ref(false)
const mode = ref<HashListMode>('keys')
const itemList = ref<string[]>([])
const keyword = ref('')
// #endregion

// #region 计算属性
const columnProp = computed(() => (mode.value === 'keys' ? 'key' : 'value'))
const displayList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const rows = kw ? itemList.value.filter(s => s.toLowerCase().includes(kw)) : itemList.value
  const prop = columnProp.value
  return rows.map(text => ({ [prop]: text }))
})

const dialogTitle = computed(() => {
  const label = mode.value === 'keys' ? t('redisValue.allHashKeys') : t('redisValue.allHashValues')
  if (loading.value) return label
  return `${label} (${itemList.value.length})`
})

const dialogIcon = computed(() => (mode.value === 'keys' ? 'el-icon-key' : 'el-icon-document'))

const emptyText = computed(() =>
  mode.value === 'keys' ? t('redisValue.hashKeysEmpty') : t('redisValue.hashValuesEmpty'),
)

const exportName = computed(() => (mode.value === 'keys' ? 'hash-keys' : 'hash-values'))

// 列描述：序号列 + 内容列（列名与取值字段随模式变），展示与导出同一来源
const hashColumns = computed<MeColumn[]>(() => [
  { key: 'index', title: '#', width: 60, align: 'center', index: true },
  {
    key: columnProp.value,
    prop: columnProp.value,
    title: mode.value === 'keys' ? t('redisValue.key') : t('redisValue.value'),
    minWidth: 200,
  },
])
// #endregion

// #region 面板操作
async function open(
  valFmt: BytesFormat | null,
  listMode: HashListMode = 'keys',
  viewFmt: ViewBytesFormat = 'utf8',
) {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  mode.value = listMode
  visible.value = true
  loading.value = true
  keyword.value = ''
  const param = { key: redisKey, valFmt }
  try {
    const raw =
      listMode === 'keys'
        ? await meCommands.hashKeys(conn.id, param)
        : await meCommands.hashValues(conn.id, param)
    // IPC 为 base64 wire；按当前键级展示编码解码
    itemList.value = raw.map(s => meFormatViewValue(s, viewFmt))
  } finally {
    loading.value = false
  }
}

defineExpose({ open })
// #endregion
</script>

<template>
  <me-dialog :title="dialogTitle" :icon="dialogIcon" v-model="visible" width="700">
    <div v-loading="loading" class="table-hash-keys">
      <el-input v-model="keyword" :placeholder="t('redisValue.tableKeyword')" clearable />
      <div class="table-hash-keys-main">
        <me-table
          :data="displayList"
          :columns="hashColumns"
          :total="itemList.length"
          :empty-text="loading ? ' ' : emptyText"
          :export-name="exportName"
          :default-sort="{ prop: columnProp, order: 'ascending' }" />
      </div>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.table-hash-keys {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .table-hash-keys-main {
    margin-top: 10px;
    flex: 1;
    min-height: 0;
  }
}
</style>
