<script setup lang="ts">
// #region 导入
// Array ARLASTITEMS 弹框：数量 + REV，对标 ZSet TopN
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import { shareProvideKey } from '@/types/me-interface'
import type { BytesFormat } from '@/types/tauri-specta'
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
// 展示行：value=null 表示 Redis 空槽
type ArLastItemsRow = { index: number; value: string | null }
const itemList = ref<ArLastItemsRow[]>([])
const keyword = ref('')
// #endregion

// #region 计算属性
const dialogTitle = computed(() => t('redisValue.arLastItemsTitle'))
const dialogIcon = 'me-icon-rank'
const filteredList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return itemList.value
  const nilLabel = t('redisValue.arLastItemsNil').toLowerCase()
  return itemList.value.filter(item => {
    const text = item.value == null ? nilLabel : item.value.toLowerCase()
    return text.includes(kw)
  })
})

// 列描述：展示与导出文本单一来源；空槽行的置灰文本走 #cell-value 插槽
//（nil 标签固定为短文本，在 200px 列里永不截断，故不存在省略号色差）
const arColumns = computed<MeColumn<ArLastItemsRow>[]>(() => [
  { key: 'index', title: '#', width: 60, align: 'center', index: true },
  {
    key: 'value',
    prop: 'value',
    title: t('redisValue.value'),
    minWidth: 200,
    formatter: row => {
      const value = row.value
      return value == null ? t('redisValue.arLastItemsNil') : value
    },
  },
])
// #endregion

let currentValFmt: BytesFormat | null = null
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

  await query()
}

async function query() {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  loading.value = true
  try {
    const raw = await meCommands.arLastItems(conn.id, {
      key: redisKey,
      reverse: reverse.value,
      count: count.value,
      valFmt: currentValFmt,
    })
    // value=null 表示 Redis 空槽（稀疏数组常见）；勿当空串解码
    itemList.value = raw.map(item => ({
      ...item,
      value: item.value == null ? null : meFormatViewValue(item.value, currentViewFmt),
    }))
  } finally {
    loading.value = false
  }
}

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
    <div v-loading="loading" class="table-ar-last-items">
      <div class="ar-last-toolbar">
        <div class="toolbar-left">
          <el-input-number v-model="count" :min="1" :max="10000" style="width: 120px" />
          <el-radio-group v-model="reverse">
            <el-radio-button :value="false">
              {{ t('redisValue.arLastItemsAsc') }}
            </el-radio-button>
            <el-radio-button :value="true">
              {{ t('redisValue.arLastItemsDesc') }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="toolbar-right">
          <el-input
            v-model="keyword"
            :placeholder="t('redisValue.arLastItemsFilter')"
            clearable
            style="width: 220px" />
          <el-button icon="el-icon-search" @click="query" type="primary" />
        </div>
      </div>
      <div class="ar-last-main">
        <me-table
          :data="filteredList"
          :columns="arColumns"
          :total="itemList.length"
          :empty-text="loading ? ' ' : t('redisValue.arLastItemsEmpty')"
          export-name="ar-last-items">
          <!-- 空槽置灰 -->
          <template #cell-value="{ row }">
            <el-text v-if="row.value == null" type="info">
              {{ t('redisValue.arLastItemsNil') }}
            </el-text>
            <span v-else>{{ row.value }}</span>
          </template>
        </me-table>
      </div>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.table-ar-last-items {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .ar-last-toolbar {
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

  .ar-last-main {
    flex: 1;
    min-height: 0;
  }
}
</style>
