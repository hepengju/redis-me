<script setup lang="ts">
// 命令统计：把已经取回的 INFO commandstats 画成表。不发命令。
// 传入 sources 时合计这些节点（调用方决定给哪些，信息页只给主节点）；否则解析 info。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import MeOverflowText from '@/components/MeOverflowText.vue'
import { meHumanNums } from '@/utils/app/util'
import {
  chartDurationDivisor,
  chartDurationUnit,
  formatChartDuration,
  type ChartDurationUnit,
} from '@/utils/redis/chart-duration'
import {
  aggregateMasterCommandStats,
  commandStatRows,
  parseCommandStats,
  type CommandStatRow,
  type MasterStatSource,
} from '@/utils/redis/command-stats'
import { formatMsOrUs } from '@/utils/redis/format-ms-or-us'

import TopBars from './TopBars.vue'

const props = defineProps<{
  /** 单节点 INFO 原文 */
  info?: string
  /** 要合计的节点。传入则忽略 info，并在底栏写各节点运行时间 */
  sources?: MasterStatSource[]
  /** 与外层表格弹框标题旁同一句：主节点合计，或当前节点 */
  scopeLabel?: string
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

/** 只留最大一级：天、小时、分钟。用来看出是不是刚重启 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return t('redisInfo.cmdUptimeUnderMinute')
  const days = Math.floor(seconds / 86400)
  if (days > 0) return t('redisInfo.cmdUptimeDays', { n: days })
  const hours = Math.floor(seconds / 3600)
  if (hours > 0) return t('redisInfo.cmdUptimeHours', { n: hours })
  return t('redisInfo.cmdUptimeMinutes', { n: Math.floor(seconds / 60) })
}

const view = computed(() => {
  if (props.sources) {
    const aggregated = aggregateMasterCommandStats(props.sources)
    return { rows: commandStatRows(aggregated.rows), nodes: aggregated.nodes }
  }
  return { rows: commandStatRows(parseCommandStats(props.info ?? '')), nodes: [] }
})

const rows = computed(() => view.value.rows)

const TOP = 10
const chartOpen = ref(false)
/** 图按这一列自己取前 10，不跟表格当前排序 */
const chartMetric = ref<'usec' | 'calls' | 'avg'>('usec')
const chartMetricOptions = computed(() => [
  { label: t('redisInfo.cmdUsecName'), value: 'usec' as const },
  { label: t('redisInfo.cmdCalls'), value: 'calls' as const },
  { label: t('redisInfo.cmdAvgName'), value: 'avg' as const },
])
const chartTitle = computed(() => {
  const name = chartMetricOptions.value.find(item => item.value === chartMetric.value)?.label ?? ''
  return t('redisInfo.top10Of', { name })
})
const chartBars = computed(() => {
  const metric = chartMetric.value
  return [...rows.value]
    .sort((a, b) => b[metric] - a[metric] || a.command.localeCompare(b.command))
    .slice(0, TOP)
})
/** 总耗时图的单位：这 10 根里最短的正值仍 ≥ 1 的最大档。不到 1 秒则整图保持毫秒。 */
function usecChartUnit(bars: CommandStatRow[]): ChartDurationUnit {
  let minMs = Infinity
  for (const row of bars) {
    const ms = row.usec / 1000
    if (ms > 0 && ms < minMs) minMs = ms
  }
  return chartDurationUnit(Number.isFinite(minMs) ? minMs : 0)
}

const chartItems = computed(() => {
  const metric = chartMetric.value
  const total = chartTotal.value
  const durationUnit = metric === 'usec' ? usecChartUnit(chartBars.value) : 'ms'
  return chartBars.value.map(row => {
    if (metric === 'avg') {
      return { label: row.command, value: row.avg / 1000, caption: formatAvgLine(row) }
    }
    if (metric === 'usec') {
      const ms = row.usec / 1000
      const caption = [formatChartDuration(ms, durationUnit), formatShare(row.usec, total)]
        .filter(Boolean)
        .join(' · ')
      const value = durationUnit === 'ms' ? Math.round(ms) : ms / chartDurationDivisor(durationUnit)
      return { label: row.command, value, caption }
    }
    const share = formatShare(row.calls, total)
    const caption = [shortNum(row.calls), share].filter(Boolean).join(' · ')
    const exact = [formatStatNum(row.calls), share].filter(Boolean).join(' · ')
    return {
      label: row.command,
      value: row.calls,
      caption,
      tip: exact === caption ? undefined : exact,
    }
  })
})

/** 占比按全部命令算，不只按图里这 10 条。平均耗时不是份额 */
const chartTotal = computed(() => {
  const metric = chartMetric.value
  if (metric === 'avg') return 0
  return rows.value.reduce((sum, row) => sum + row[metric], 0)
})

function formatShare(part: number, total: number): string {
  if (!(total > 0) || !Number.isFinite(part)) return ''
  const pct = (part / total) * 100
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10
  return `${rounded}%`
}

function shortNum(n: number): string {
  if (Math.abs(n) < 1000) return formatStatNum(n)
  return meHumanNums(n, '0', 1).replace(/\.0([KMB])$/, '$1')
}

function formatAvgLine(row: CommandStatRow): string {
  return t('redisInfo.chartAvgCalls', {
    value: formatMsOrUs(row.avg),
    calls: formatStatNum(row.calls),
  })
}

/** 脚注分段，模板用 | 隔开，与节点概览底栏合计一致。
 * 拒绝/失败整列为空时（Redis 7 以前没有这两项）单节点也写一句，避免看起来像没加载。 */
const noteParts = computed(() => {
  const list = rows.value
  const rejectBlank = list.length > 0 && list.every(row => row.rejected == null)
  const failedBlank = list.length > 0 && list.every(row => row.failed == null)
  const rejectNote = rejectBlank && failedBlank ? t('redisInfo.cmdstatRejectBlank') : ''
  if (!isMasters.value) return rejectNote ? [rejectNote] : []
  const parts = [
    t('redisInfo.cmdstatNote'),
    ...view.value.nodes.map(item => {
      if (item.missing) return t('redisInfo.cmdUptimeMissing', { label: item.label })
      if (item.uptimeSeconds == null) return `${item.label} --`
      return `${item.label} ${formatUptime(item.uptimeSeconds)}`
    }),
  ]
  if (rejectNote) parts.push(rejectNote)
  return parts
})

// 不写 width：六列都是弹性列，按同样权重平分弹窗宽度
const columns = computed<MeColumn<CommandStatRow>[]>(() => [
  { key: 'command', prop: 'command', title: t('redisInfo.cmdName') },
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
      <template v-if="rows.length" #footer>
        <me-icon
          class="icon-btn stat-chart-icon"
          icon="el-icon-histogram"
          :name="t('redisInfo.top10Chart')"
          hint
          placement="top"
          @click="chartOpen = true" />
      </template>
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

    <me-dialog
      v-model="chartOpen"
      icon="el-icon-histogram"
      :title="chartTitle"
      width="70vw"
      body-height="60vh">
      <template v-if="scopeLabel" #title-extra>
        <el-text type="info" class="stat-scope">{{ scopeLabel }}</el-text>
      </template>
      <div class="stat-chart">
        <el-segmented v-model="chartMetric" :options="chartMetricOptions" />
        <div class="stat-chart-plot">
          <TopBars :items="chartItems" />
        </div>
      </div>
    </me-dialog>
  </div>
</template>

<style scoped lang="scss">
.redis-command-stats {
  height: 100%;
  min-height: 0;
}

.stat-chart-icon {
  font-size: 16px;
}

.stat-chart {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-chart-plot {
  flex: 1;
  min-height: 0;
}

/* 标题补充在弹窗 header 上，弹窗 append-to-body */
.stat-scope {
  margin-left: 8px;
  font-size: 13px;
}

.cmdstat-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;

  .sum-sep {
    margin: 0 10px;
  }
}
</style>
