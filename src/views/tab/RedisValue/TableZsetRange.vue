<script setup lang="ts">
// #region 导入
// ZSet TopN 弹框：输入数量和排序方向，ZRANGE/ZREVRANGE 查询
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import { shareProvideKey } from '@/types/me-interface'
import type { BytesFormat, RedisZsetRangeItem } from '@/types/tauri-specta'
import { meCommands } from '@/utils/app/util'
import { meFormatViewValue, type ViewBytesFormat } from '@/utils/codec/format'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const visible = ref(false)
const loading = ref(false)
const count = ref(10)
const reverse = ref(false)
const itemList = ref<RedisZsetRangeItem[]>([])
const keyword = ref('')
// #endregion

// #region 计算属性
const dialogTitle = computed(() => t('redisValue.zsetRangeTitle'))
const dialogIcon = 'me-icon-rank'
const filteredList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return itemList.value
  return itemList.value.filter(
    item => item.value.toLowerCase().includes(kw) || String(item.score).includes(kw),
  )
})

// 列描述：序号 + 值 + 分值（展示与导出同一来源）
const zsetColumns = computed<MeColumn[]>(() => [
  { key: 'index', title: '#', width: 60, align: 'center', index: true },
  { key: 'value', prop: 'value', title: t('redisValue.value'), minWidth: 200 },
  { key: 'score', prop: 'score', title: t('redisValue.score'), width: 140 },
])
// #endregion

let currentValFmt: BytesFormat | null = null
// 打开弹框时的键级展示编码；query 复用
let currentViewFmt: ViewBytesFormat = 'utf8'

// #region 面板操作
async function open(valFmt: BytesFormat | null, viewFmt: ViewBytesFormat = 'utf8') {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  currentValFmt = valFmt
  currentViewFmt = viewFmt
  visible.value = true
  loading.value = false
  count.value = 10
  reverse.value = false
  keyword.value = ''
  itemList.value = []

  // 弹框打开自动查询
  await query()
}

async function query() {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  loading.value = true
  try {
    const raw = await meCommands.zsetRange(conn.id, {
      key: redisKey,
      reverse: reverse.value,
      count: count.value,
      valFmt: currentValFmt,
    })
    // IPC 为 base64 wire；按当前键级展示编码解码
    itemList.value = raw.map(item => ({
      ...item,
      value: meFormatViewValue(item.value, currentViewFmt),
    }))
  } finally {
    loading.value = false
  }
}

// 正序/倒序切换后自动触发查询
watch(reverse, () => {
  if (visible.value) {
    void query()
  }
})

defineExpose({ open })
// #endregion
</script>

<template>
  <me-dialog :title="dialogTitle" :icon="dialogIcon" v-model="visible" width="700">
    <div v-loading="loading" class="table-zset-range">
      <div class="zset-range-toolbar">
        <div class="toolbar-left">
          <el-input-number v-model="count" :min="1" :max="10000" style="width: 120px" />
          <el-radio-group v-model="reverse">
            <el-radio-button :value="false">
              {{ t('redisValue.zsetRangeAsc') }}
            </el-radio-button>
            <el-radio-button :value="true">
              {{ t('redisValue.zsetRangeDesc') }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="toolbar-right">
          <el-input
            v-model="keyword"
            :placeholder="t('redisValue.zsetRangeFilter')"
            clearable
            style="width: 220px" />
          <el-button icon="el-icon-search" @click="query" type="primary" />
        </div>
      </div>
      <div class="zset-range-main">
        <me-table
          :data="filteredList"
          :columns="zsetColumns"
          :total="itemList.length"
          :empty-text="loading ? ' ' : t('redisValue.zsetRangeEmpty')"
          export-name="zset-range"
          :default-sort="{ prop: 'score', order: reverse ? 'descending' : 'ascending' }" />
      </div>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.table-zset-range {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .zset-range-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 10px;

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }

  .zset-range-main {
    flex: 1;
    min-height: 0;
  }
}
</style>
