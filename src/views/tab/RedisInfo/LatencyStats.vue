<script setup lang="ts">
// 延迟分位：把已经取回的 INFO latencystats 画成表。不发命令。
// 传入 sources 时每个分位取这些节点的最大值（调用方决定给哪些，信息页只给主节点）；否则解析 info。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import MeOverflowText from '@/components/MeOverflowText.vue'
import type { MasterStatSource } from '@/utils/command-stats'
import {
  aggregateMasterLatencyStats,
  parseLatencyStats,
  type LatencyMasterNode,
  type LatencyMaxCell,
} from '@/utils/latency-stats'
import { parseVersionNums } from '@/utils/redis-version'

type LatencyViewRow = { command: string; cells: Record<string, LatencyMaxCell> }

const props = defineProps<{
  /** 单节点 INFO 原文 */
  info?: string
  /** 要取最大值的节点。传入则忽略 info，并在底栏写各节点运行时间 */
  sources?: MasterStatSource[]
}>()

const { t } = useI18n()

const isMasters = computed(() => props.sources != null)

function formatUsec(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

function formatCell(cell: LatencyMaxCell | undefined): string {
  if (!cell || !Number.isFinite(cell.usec)) return ''
  const value = formatUsec(cell.usec)
  return cell.labels.length ? `${cell.labels.join(' ')} ${value}` : value
}

/** 空值更小，降序时留在最后 */
function compareCell(a: LatencyMaxCell | undefined, b: LatencyMaxCell | undefined): number {
  const av = a?.usec
  const bv = b?.usec
  if (av == null && bv == null) return 0
  if (av == null) return -1
  if (bv == null) return 1
  return av - bv
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
    const aggregated = aggregateMasterLatencyStats(props.sources)
    return {
      rows: aggregated.rows,
      percentiles: aggregated.percentiles,
      nodes: aggregated.nodes,
      sectionPresent: aggregated.nodes.some(node => node.sectionPresent),
      redisVersion: aggregated.nodes.find(node => node.redisVersion)?.redisVersion ?? null,
    }
  }
  const parsed = parseLatencyStats(props.info ?? '')
  const rows: LatencyViewRow[] = parsed.rows.map(row => ({
    command: row.command,
    cells: Object.fromEntries(
      Object.entries(row.usec).map(([name, usec]) => [name, { usec, labels: [] }]),
    ),
  }))
  return {
    rows,
    percentiles: parsed.percentiles,
    nodes: [] as LatencyMasterNode[],
    sectionPresent: parsed.sectionPresent,
    redisVersion: parsed.redisVersion,
  }
})

const defaultSort = computed(() => {
  const prop = view.value.percentiles.at(-1)
  if (!prop) return undefined
  return { prop, order: 'descending' as const }
})

const emptyText = computed(() => {
  if (view.value.rows.length) return undefined
  if (isMasters.value) {
    const nodes = view.value.nodes
    if (!nodes.length || nodes.every(node => node.missing))
      return t('redisInfo.latencyMastersMissing')
    const present = nodes.filter(node => !node.missing)
    const version = present.find(node => node.redisVersion)?.redisVersion
    if (
      present.every(node => !node.sectionPresent) &&
      version &&
      parseVersionNums(version)[0] < 7
    ) {
      return t('redisInfo.latencyEmptyOld', { version })
    }
    return t('redisInfo.latencyEmptyBlank')
  }
  if (!view.value.sectionPresent) {
    const version = view.value.redisVersion
    const major = version ? parseVersionNums(version)[0] : 0
    if (version && major < 7) return t('redisInfo.latencyEmptyOld', { version })
    return t('redisInfo.latencyEmptyMissing')
  }
  return t('redisInfo.latencyEmptyBlank')
})

function nodeNote(node: LatencyMasterNode): string {
  if (node.missing) return t('redisInfo.cmdUptimeMissing', { label: node.label })
  if (node.noSamples) return t('redisInfo.latencyNoSamples', { label: node.label })
  if (node.uptimeSeconds == null) return `${node.label} --`
  return `${node.label} ${formatUptime(node.uptimeSeconds)}`
}

/** 脚注分段，模板用 | 隔开，与节点概览底栏合计一致 */
const noteParts = computed(() => {
  if (!isMasters.value) {
    return view.value.rows.length ? [t('redisInfo.latencyNote')] : []
  }
  return [t('redisInfo.latencyMasterNote'), ...view.value.nodes.map(nodeNote)]
})

const labelColumns = computed(() => (isMasters.value ? view.value.percentiles : []))

function cellOf(row: LatencyViewRow, name: string): LatencyMaxCell | undefined {
  return row.cells[name]
}

// 不写 width：命令列和各分位列按同样权重平分弹窗宽度
const columns = computed<MeColumn<LatencyViewRow>[]>(() => {
  const tip = isMasters.value ? t('redisInfo.latencyUsecTipMasters') : t('redisInfo.latencyUsecTip')
  return [
    { key: 'command', prop: 'command', title: t('redisInfo.command') },
    ...view.value.percentiles.map(name => ({
      key: name,
      prop: name,
      title: `${name} (µs)`,
      headerTip: tip,
      align: 'right' as const,
      formatter: (row: LatencyViewRow) => formatCell(row.cells[name]),
      sortMethod: (a: LatencyViewRow, b: LatencyViewRow) =>
        compareCell(a.cells[name], b.cells[name]),
    })),
  ]
})
</script>

<template>
  <div class="redis-latency-stats">
    <me-table
      :data="view.rows"
      :columns="columns"
      :default-sort="defaultSort"
      :empty-text="emptyText"
      export-name="latencystats">
      <template v-for="name in labelColumns" :key="name" #[`cell-${name}`]="{ row }">
        <template v-if="cellOf(row, name)">
          <span class="latency-cell">
            <span v-if="cellOf(row, name)!.labels.length" class="latency-node">{{
              cellOf(row, name)!.labels.join(' ')
            }}</span>
            <span class="latency-usec">{{ formatUsec(cellOf(row, name)!.usec) }}</span>
          </span>
        </template>
      </template>
      <template v-if="noteParts.length" #footer-center>
        <div class="latency-note">
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
.redis-latency-stats {
  height: 100%;
  min-height: 0;
}

.latency-cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.latency-node {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-color-info);
}

.latency-usec {
  flex-shrink: 0;
  margin-left: auto;
}

.latency-note {
  color: var(--el-text-color-secondary);
  font-size: 13px;

  .sum-sep {
    margin: 0 10px;
  }
}
</style>
