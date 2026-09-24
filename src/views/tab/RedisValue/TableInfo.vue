<script setup lang="ts">
// #region 导入
// 键元信息弹框：ARINFO / VINFO / TS.INFO / OBJECT / ZRANK 共用。
// - arinfo|vinfo|tsinfo：标题用原命令名，两列 field/value
// - object|zrank：命令 / 项目 / 值 三列（object 另含 tip / 不可用提示）
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisArInfoItem, RedisObjectInfo, RedisZsetRankResult } from '@/types/tauri-specta'
import { IPC_WIRE_FORMAT } from '@/utils/format'
import { meCommands, meHumanSeconds } from '@/utils/util'
// #endregion

export type TableInfoKind = 'arinfo' | 'vinfo' | 'tsinfo' | 'object' | 'zrank'

type InfoRow = { command: string; item: string; value: string; tip?: string; unavailable?: boolean }

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const visible = ref(false)
const loading = ref(false)
const kind = ref<TableInfoKind>('object')
const kvRows = ref<RedisArInfoItem[]>([])
const objectInfo = ref<RedisObjectInfo | null>(null)
const rankInfo = ref<RedisZsetRankResult | null>(null)
// #endregion

// #region 计算属性
const isKv = computed(
  () => kind.value === 'arinfo' || kind.value === 'vinfo' || kind.value === 'tsinfo',
)
const title = computed(() => {
  if (kind.value === 'arinfo') return 'ARINFO'
  if (kind.value === 'vinfo') return 'VINFO'
  if (kind.value === 'tsinfo') return 'TS.INFO'
  if (kind.value === 'zrank') return t('redisValue.rankTitle')
  return t('redisValue.objectInfo')
})
const headerIcon = computed(() => (kind.value === 'zrank' ? 'me-icon-rank' : 'el-icon-info-filled'))

const objectRows = computed<InfoRow[]>(() => {
  const data = objectInfo.value
  if (!data) return []
  const na = t('redisValue.objectInfoNA')

  const idleUnavailable = !!data.idleTimeError
  const idleValue =
    data.idleTime !== null
      ? `${data.idleTime} ${t('timeUnit.second', data.idleTime)} (${meHumanSeconds(data.idleTime)})`
      : na
  const idleTip = idleUnavailable
    ? [t('redisValue.objectIdleTimeUnavailable'), data.idleTimeError].filter(Boolean).join('<br/>')
    : undefined

  const freqUnavailable = !!data.freqError
  const freqValue = data.freq !== null ? String(data.freq) : na
  const freqTip = freqUnavailable
    ? [t('redisValue.objectFreqUnavailable'), data.freqError].filter(Boolean).join('<br/>')
    : undefined

  return [
    {
      command: 'ENCODING',
      item: t('redisValue.objectEncoding'),
      value: data.encoding ?? na,
      tip: t('redisValue.objectEncodingTip'),
    },
    {
      command: 'IDLETIME',
      item: t('redisValue.objectIdleTime'),
      value: idleValue,
      tip: idleTip,
      unavailable: idleUnavailable,
    },
    {
      command: 'REFCOUNT',
      item: t('redisValue.objectRefcount'),
      value: data.refcount !== null ? String(data.refcount) : na,
    },
    {
      command: 'FREQ',
      item: t('redisValue.objectFreq'),
      value: freqValue,
      tip: freqTip,
      unavailable: freqUnavailable,
    },
  ]
})

const rankRows = computed<InfoRow[]>(() => {
  const data = rankInfo.value
  if (!data) return []
  const na = t('redisValue.rankNotFound')
  return [
    {
      command: 'ZRANK',
      item: t('redisValue.rank'),
      value: data.rank !== null ? String(data.rank) : na,
    },
    {
      command: 'ZREVRANK',
      item: t('redisValue.revRank'),
      value: data.revRank !== null ? String(data.revRank) : na,
    },
  ]
})

const infoRows = computed(() => (kind.value === 'zrank' ? rankRows.value : objectRows.value))
// #endregion

// #region 面板操作
async function open(next: TableInfoKind, extra?: { member?: string }) {
  const conn = share.conn
  const rk = share.redisKey
  if (!conn || !rk) return
  kind.value = next
  visible.value = true
  loading.value = true
  kvRows.value = []
  objectInfo.value = null
  rankInfo.value = null
  try {
    if (next === 'arinfo') {
      kvRows.value = await meCommands.arInfo(conn.id, rk)
    } else if (next === 'vinfo') {
      kvRows.value = await meCommands.vInfo(conn.id, rk)
    } else if (next === 'tsinfo') {
      kvRows.value = await meCommands.tsInfo(conn.id, rk)
    } else if (next === 'zrank') {
      rankInfo.value = await meCommands.zsetRank(conn.id, {
        key: rk,
        member: extra?.member ?? '',
        valFmt: IPC_WIRE_FORMAT,
      })
    } else {
      objectInfo.value = await meCommands.objectInfo(conn.id, rk)
    }
  } finally {
    loading.value = false
  }
}

defineExpose({ open })
// #endregion
</script>

<template>
  <el-dialog v-model="visible" width="560px" destroy-on-close align-center draggable>
    <template #header>
      <me-icon :icon="headerIcon" :name="title" />
    </template>

    <!-- ARINFO / VINFO / TS.INFO：扁平键值 -->
    <el-table v-if="isKv" v-loading="loading" :data="kvRows" border stripe>
      <el-table-column :label="t('redisValue.infoField')" prop="field" width="200" />
      <el-table-column :label="t('redisValue.infoValue')" prop="value" min-width="200" />
    </el-table>

    <!-- OBJECT / ZRANK：命令 / 项目 / 值（object 含 tip） -->
    <el-table v-else v-loading="loading" :data="infoRows" border stripe>
      <el-table-column :label="t('redisValue.objectInfoCommand')" prop="command" width="120" />
      <el-table-column :label="t('redisValue.objectInfoItem')" prop="item" width="200">
        <template #default="{ row }">
          <me-icon
            v-if="row.tip && !row.unavailable"
            icon="el-icon-question-filled"
            :name="row.item"
            :info="row.tip"
            :icon-left="false"
            raw-content />
          <template v-else>{{ row.item }}</template>
        </template>
      </el-table-column>
      <el-table-column :label="t('redisValue.objectInfoValue')" prop="value" min-width="200">
        <template #default="{ row }">
          <me-icon
            v-if="row.unavailable && row.tip"
            icon="el-icon-warning-filled"
            :name="row.value"
            :info="row.tip"
            :icon-left="false"
            raw-content />
          <template v-else>{{ row.value }}</template>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>
