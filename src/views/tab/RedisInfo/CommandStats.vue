<script setup lang="ts">
// 命令统计：把已经取回的 INFO commandstats 画成表。不发命令。
// 传入 sources 时合计这些节点（调用方决定给哪些，信息页只给主节点）；否则解析 info。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import MeOverflowText from '@/components/MeOverflowText.vue'
import {
  aggregateMasterCommandStats,
  commandStatRows,
  parseCommandStats,
  type CommandStatRow,
  type MasterStatSource,
} from '@/utils/command-stats'

const props = defineProps<{
  /** 单节点 INFO 原文 */
  info?: string
  /** 要合计的节点。传入则忽略 info，并在底栏写各节点运行时间 */
  sources?: MasterStatSource[]
}>()

const { t } = useI18n()

const isMasters = computed(() => props.sources != null)

function formatStatNum(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return ''
  return String(Math.round(n))
}

function formatStatAvg(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 100) / 100)
}

function compareNullable(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  return a - b
}

/** 运行时间只留到能看出「是不是刚重启」的两级 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return t('redisInfo.cmdUptimeUnderMinute')
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(t('redisInfo.cmdUptimeDays', { n: days }))
  if (hours > 0) parts.push(t('redisInfo.cmdUptimeHours', { n: hours }))
  if (days === 0 && minutes > 0) parts.push(t('redisInfo.cmdUptimeMinutes', { n: minutes }))
  return parts.join(' ')
}

const view = computed(() => {
  if (props.sources) {
    const aggregated = aggregateMasterCommandStats(props.sources)
    return { rows: commandStatRows(aggregated.rows), nodes: aggregated.nodes }
  }
  return { rows: commandStatRows(parseCommandStats(props.info ?? '')), nodes: [] }
})

const rows = computed(() => view.value.rows)

/** 脚注分段，模板用 | 隔开，与节点概览底栏合计一致 */
const noteParts = computed(() => {
  if (!isMasters.value) return [] as string[]
  const parts = [
    t('redisInfo.cmdstatNote'),
    ...view.value.nodes.map(item => {
      if (item.missing) return t('redisInfo.cmdUptimeMissing', { label: item.label })
      if (item.uptimeSeconds == null) return `${item.label} --`
      return `${item.label} ${formatUptime(item.uptimeSeconds)}`
    }),
  ]
  const list = rows.value
  const rejectBlank = list.length > 0 && list.every(row => row.rejected == null)
  const failedBlank = list.length > 0 && list.every(row => row.failed == null)
  if (rejectBlank && failedBlank) parts.push(t('redisInfo.cmdstatRejectBlank'))
  return parts
})

// 不写 width：六列都是弹性列，按同样权重平分弹窗宽度
const columns = computed<MeColumn<CommandStatRow>[]>(() => [
  { key: 'command', prop: 'command', title: t('redisInfo.command') },
  {
    key: 'calls',
    prop: 'calls',
    title: t('redisInfo.cmdCalls'),
    align: 'right',
    formatter: row => formatStatNum(row.calls),
  },
  {
    key: 'usec',
    prop: 'usec',
    title: t('redisInfo.cmdUsec'),
    headerTip: t('redisInfo.cmdUsecTip'),
    align: 'right',
    formatter: row => formatStatNum(row.usec),
  },
  {
    key: 'avg',
    prop: 'avg',
    title: t('redisInfo.cmdAvg'),
    headerTip: t('redisInfo.cmdAvgTip'),
    align: 'right',
    formatter: row => formatStatAvg(row.avg),
  },
  {
    key: 'rejected',
    prop: 'rejected',
    title: t('redisInfo.cmdRejected'),
    headerTip: t('redisInfo.cmdRejectedTip'),
    align: 'right',
    formatter: row => formatStatNum(row.rejected),
    sortMethod: (a, b) => compareNullable(a.rejected, b.rejected),
  },
  {
    key: 'failed',
    prop: 'failed',
    title: t('redisInfo.cmdFailed'),
    headerTip: t('redisInfo.cmdFailedTip'),
    align: 'right',
    formatter: row => formatStatNum(row.failed),
    sortMethod: (a, b) => compareNullable(a.failed, b.failed),
  },
])
</script>

<template>
  <div class="redis-command-stats">
    <me-table
      :data="rows"
      :columns="columns"
      :default-sort="{ prop: 'usec', order: 'descending' }"
      export-name="commandstats">
      <template v-if="noteParts.length" #footer-center>
        <div class="cmdstat-note">
          <me-overflow-text :content="noteParts.join(' | ')">
            <template v-for="(part, i) in noteParts" :key="i">
              <span v-if="i" class="sum-sep">|</span>
              <span>{{ part }}</span>
            </template>
          </me-overflow-text>
        </div>
      </template>
    </me-table>
  </div>
</template>

<style scoped lang="scss">
.redis-command-stats {
  height: 100%;
  min-height: 0;
}

.cmdstat-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;

  .sum-sep {
    margin: 0 10px;
  }
}
</style>
