<script setup lang="ts">
// 内存分析：找大键。扫描循环与键列表同构（一轮 memoryUsage + 前端暂停/停止）。
import { computed, inject, onUnmounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn, MeFilterValue } from '@/components/me-table-column'
import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize, RedisKeySize_Serialize } from '@/types/tauri-specta'
import { clearKeyMemoryCacheForConn } from '@/utils/key-memory-cache'
import { clearKeyTypeCacheForConn } from '@/utils/key-type-cache'
import { useMemoryScan } from '@/utils/memory-scan'
import { meType, toKeyTypeLabel } from '@/utils/redis-display'
import { sameRedisKey } from '@/utils/redis-key'
import {
  bus,
  KEY_REFRESH,
  meConfirm,
  meCopy,
  meDeleteKey,
  meHumanSize,
  meCommands,
  meOk,
} from '@/utils/util'

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)
const hint = computed(() => {
  const params = {
    matchParam: matchParam.value,
    scanCount: scanCount.value,
    sizeLimitKb: sizeLimitKb.value,
    sleepMillis: sleepMillis.value,
  }
  return t('redisMemory.hint', params)
})

const sizeLimitKb = ref(100)
const scanCount = ref(1000)
const sleepMillis = ref(0)
const match = ref('')
const matchParam = computed(() => {
  if (match.value === '') return '*'
  return '*' + match.value + '*'
})

watchEffect(() => {
  if (sizeLimitKb.value < 0) sizeLimitKb.value = 0
  if (scanCount.value < 0) scanCount.value = 0
  if (sleepMillis.value < 0) sleepMillis.value = 0
})

const keyword = ref('')

const {
  scanning,
  paused,
  dataList,
  showScanControl,
  scanProgress,
  scanToggleTip,
  onRingClick,
  onStartStop,
  stop,
} = useMemoryScan({
  connId: () => share.conn?.id,
  param: () => ({
    match: matchParam.value,
    sizeLimit: sizeLimitKb.value * 1024,
    scanCount: scanCount.value,
    sleepMillis: sleepMillis.value,
    needKeyType: true,
  }),
  totalEstimate: () => {
    if (!share.conn) return 0
    const perDb = Number(share.dbSizeMap['db' + share.conn.db] ?? 0)
    if (!share.conn.cluster) return perDb
    const masterCount = share.nodeList.filter(n => n.isMaster).length
    return masterCount > 0 ? perDb * masterCount : perDb
  },
})

onUnmounted(() => {
  void stop()
})

// 类型列头筛选已选值（空数组即不限）
const typeFilter = ref<MeFilterValue[]>([])

const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  const types = typeFilter.value
  return dataList.value.filter(
    row =>
      (!key || row.key?.toLowerCase().indexOf(key) > -1) &&
      (!types.length || types.includes(row.type)),
  )
})
const filterTypes = computed(() => {
  return [...new Set(dataList.value.map(d => d.type))].map(d => ({
    text: toKeyTypeLabel(d),
    value: d,
  }))
})

// 列描述：展示与导出文本单一来源；类型列单元格走插槽渲染 el-text（文本最长约 70px < 100px 列宽，不会截断故无色差）
const memoryColumns = computed<MeColumn<RedisKeySize_Serialize>[]>(() => [
  { key: 'selection', width: 50, align: 'center', selection: true },
  {
    key: 'type',
    prop: 'type',
    title: t('redisMemory.type'),
    width: 100,
    // 列头是筛选面板：整格可点排序会劫持筛选点击，显式关闭（MeTable 默认对有 prop 的列开排序）
    sortable: false,
    formatter: row => toKeyTypeLabel(row.type),
  },
  { key: 'key', prop: 'key', title: t('redisMemory.key'), minWidth: 200 },
  {
    key: 'size',
    prop: 'size',
    title: t('redisMemory.size'),
    width: 120,
    formatter: row => meHumanSize(row.size),
  },
  {
    key: 'action',
    title: t('action'),
    // 与值区操作列同方案：宽 90px，3 图标两端对齐、2 图标（只读）均布
    width: 90,
    align: 'center',
    fixed: 'right',
  },
])

function chooseKey(redisKey: RedisKey_Deserialize) {
  share.redisKey = redisKey
  share.tabName = 'value'
  bus.emit(KEY_REFRESH)
}

async function delKey(redisKey: RedisKey_Deserialize) {
  meDeleteKey(share.conn!.id, redisKey, () => {
    dataList.value = dataList.value.filter(rk => !sameRedisKey(rk, redisKey))
  })
}

const selection = ref<RedisKeySize_Serialize[]>([])

function selectionChange(newSelection: RedisKeySize_Serialize[]) {
  selection.value = newSelection
}

function batchDelKey() {
  meConfirm(
    t('redisMemory.batchDeleteHint', { count: selection.value.length }, selection.value.length),
    async () => {
      const param = {
        match: '',
        keyList: selection.value.map(row => ({ key: row.key, bytes: row.bytes })),
      }
      await meCommands.batchDel(share.conn!.id, param)
      clearKeyTypeCacheForConn(share.conn!.id)
      clearKeyMemoryCacheForConn(share.conn!.id)
      meOk(t('deleteOk'))
      dataList.value = dataList.value.filter(
        rk => !param.keyList.some(del => sameRedisKey(rk, del)),
      )
    },
  )
}
// #endregion
</script>

<template>
  <div class="redis-memory">
    <div class="me-flex header">
      <div class="me-flex">
        <el-dropdown placement="bottom-start" :hide-on-click="false" :teleported="false">
          <el-button icon="el-icon-setting">{{ t('redisMemory.scanConfig') }}</el-button>

          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>
                <el-input
                  v-model="match"
                  style="width: 220px"
                  :placeholder="t('redisMemory.fuzzy')">
                  <template #prepend>{{ t('redisMemory.matchParam') }}</template>
                  <template #append>
                    <el-tooltip raw-content :content="hint" popper-style="max-width: 600px">
                      <el-icon>
                        <el-icon-question-filled />
                      </el-icon>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-dropdown-item>
              <el-dropdown-item>
                <el-input v-model.number="scanCount" style="width: 220px">
                  <template #prepend>{{ t('redisMemory.scanEach') }}</template>
                  <template #append>{{ t('redisMemory.unit') }}</template>
                </el-input>
              </el-dropdown-item>
              <el-dropdown-item>
                <el-input v-model.number="sleepMillis" style="width: 220px">
                  <template #prepend>{{ t('redisMemory.sleepMillis') }}</template>
                  <template #append>ms</template>
                </el-input>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-input v-model.number="sizeLimitKb" style="width: 120px; margin-left: 10px">
          <template #prefix>
            <div style="margin-right: 10px">&gE;</div>
          </template>
          <template #append>Kb</template>
        </el-input>

        <el-button
          icon="el-icon-delete"
          type="danger"
          v-if="canEdit"
          :disabled="selection.length === 0"
          @click="batchDelKey"
          style="margin-left: 10px"
          >{{ t('redisMemory.batchDelete') }}
        </el-button>
      </div>

      <div class="header-right">
        <me-scan-control
          v-if="showScanControl"
          :percentage="scanProgress"
          :loading="scanning"
          :tip="scanToggleTip"
          @click="onRingClick" />
        <el-input
          v-model="keyword"
          :placeholder="t('redisMemory.keyword')"
          style="width: 240px"
          clearable />
        <el-button
          v-if="!scanning && !paused"
          icon="el-icon-search"
          type="primary"
          @click="onStartStop"
          >{{ t('redisMemory.startScan') }}</el-button
        >
        <el-button v-else type="danger" icon="el-icon-video-pause" @click="onStartStop">{{
          t('redisMemory.stopScan')
        }}</el-button>
      </div>
    </div>
    <div class="table">
      <me-table
        :data="filterDataList"
        :columns="memoryColumns"
        :total="dataList.length"
        :default-sort="{ prop: 'size', order: 'descending' }"
        export-name="memory"
        @selection-change="selectionChange">
        <!-- 类型列头筛选：v2 无内置筛选 UI -->
        <template #header-type>
          <me-column-filter
            v-model="typeFilter"
            :title="t('redisMemory.type')"
            :options="filterTypes" />
        </template>
        <template #cell-type="{ row }">
          <el-text :type="meType(row.type)">{{ toKeyTypeLabel(row.type) }}</el-text>
        </template>
        <template #cell-action="{ row }">
          <!-- 与值区操作列同方案：3 图标两端对齐、只读 2 图标均布 -->
          <div
            class="me-flex"
            :style="{ justifyContent: canEdit ? 'space-between' : 'space-evenly' }">
            <me-icon
              :info="t('copy')"
              icon="el-icon-document-copy"
              class="icon-btn"
              @click="meCopy(row.key)" />
            <me-icon
              :info="t('redisMemory.chooseKey')"
              icon="el-icon-view"
              class="icon-btn"
              @click="chooseKey(row)" />
            <me-icon
              v-if="canEdit"
              :info="t('delete')"
              icon="el-icon-delete"
              class="icon-btn"
              @click="delKey(row)" />
          </div>
        </template>
      </me-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-memory {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
    :deep(.el-input-group__prepend) {
      width: 100px;
    }

    :deep(.el-input-group__append) {
      width: 42px;
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;
  }
}
</style>
