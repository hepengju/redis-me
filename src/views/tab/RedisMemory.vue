<script setup lang="ts">
// 内存分析：找大键。扫描循环与键列表同构（一轮 memoryUsage + 前端暂停/停止）。
import { computed, inject, onUnmounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize, RedisKeySize_Serialize } from '@/types/tauri-specta'
import type { TableExportMatrix } from '@/utils/export'
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
  meFilterHandler,
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

const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(row => !key || row.key?.toLowerCase().indexOf(key) > -1)
})
const filterTypes = computed(() => {
  return [...new Set(dataList.value.map(d => d.type))].map(d => ({
    text: toKeyTypeLabel(d),
    value: d,
  }))
})

// MeTable 导出：由行数据直接计算展示文本，与表格列定义一致（改列时同步改这里）
function exportRows(data: unknown[]): TableExportMatrix {
  return {
    headers: [t('redisMemory.type'), t('redisMemory.key'), t('redisMemory.size')],
    rows: (data as RedisKeySize_Serialize[]).map(row => [
      toKeyTypeLabel(row.type),
      row.key,
      meHumanSize(row.size),
    ]),
  }
}

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
        ref="table"
        :default-sort="{ prop: 'size', order: 'descending' }"
        export-name="memory"
        :export-rows="exportRows"
        @selection-change="selectionChange">
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column
          :label="t('redisMemory.type')"
          prop="type"
          width="100"
          show-overflow-tooltip
          sortable
          :filters="filterTypes"
          :filter-method="meFilterHandler">
          <template #default="scope">
            <el-text :type="meType(scope.row.type)">{{ toKeyTypeLabel(scope.row.type) }}</el-text>
          </template>
        </el-table-column>
        <el-table-column :label="t('redisMemory.key')" prop="key" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.key }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('redisMemory.size')"
          prop="size"
          width="120"
          sortable
          show-overflow-tooltip>
          <template #default="scope">
            {{ meHumanSize(scope.row.size) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="t('action')"
          :width="canEdit ? 100 : 65"
          fixed="right"
          align="center">
          <template #default="scope">
            <div class="me-flex">
              <me-icon
                :info="t('copy')"
                icon="el-icon-document-copy"
                class="icon-btn"
                @click="meCopy(scope.row.key)" />
              <me-icon
                :info="t('redisMemory.chooseKey')"
                icon="el-icon-view"
                class="icon-btn"
                @click="chooseKey(scope.row)" />
              <me-icon
                :info="t('delete')"
                icon="el-icon-delete"
                class="icon-btn"
                @click="delKey(scope.row)"
                v-if="canEdit" />
            </div>
          </template>
        </el-table-column>
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
