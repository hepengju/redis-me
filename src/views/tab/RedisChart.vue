<script setup lang="ts">
// #region 导入
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from 'chart.js'
import type { ChartDataset, ChartOptions, TooltipItem } from 'chart.js'
import dayjs from 'dayjs'
import { cloneDeep, merge } from 'lodash'
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  unref,
  useTemplateRef,
  watch,
} from 'vue'
import { Line } from 'vue-chartjs'
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisChart } from '@/types/tauri-specta'
import {
  CHART_COLORS,
  isDark,
  meConfirm,
  meHumanNums,
  meHumanSize,
  meCommands,
  meLog,
} from '@/utils/util'
import NodeList from '@/views/ext/NodeList.vue'
// #endregion

// #region Chart.js 初始化
// 只注册必要的组件即可
// https://chartjs.cn/docs/latest/getting-started/integration.html
ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  LinearScale,
  Legend,
  CategoryScale,
  Title,
  Tooltip,
)
// #endregion

// #region 核心状态
const { t } = useI18n()

const share = inject(shareProvideKey)!
const node = ref<string>(share.conn?.cluster ? 'master' : 'all') // 节点过滤：显式 token（all/master/slave/ip:port）
const autoRefresh = ref(true) // 自动刷新
const refreshInterval = ref(5) // 刷新间隔（秒）
const keepMinutes = ref(60) // 保留N分钟的数据
const maxPointCount = ref(100) // 最多保存N个数据
const nowPointCount = ref(0) // 当前数据条数
const showMoreChart = ref(false) // 显示更多图表
const loaded = ref(false) // 首次取数是否完成（避免加载前闪现空态）
const hiddenNodes = ref<Record<string, boolean>>({}) // 共享图例点击隐藏的节点（addr -> true）

// 与 chartData 各块 key 一致
type ChartBlockKey =
  | 'command'
  | 'memory'
  | 'network'
  | 'keyTotal'
  | 'connectedClients'
  | 'cacheHitRatio'
  | 'totalConnectionsReceived'
  | 'totalCommandsProcessed'

// 每个图表块由哪些字段构成；多系列块（network）用 dir 标注方向、dash 区分线型
type SeriesSpec = { field: keyof RedisChart; dir?: string; dash?: boolean }
const BLOCK_SERIES: Record<ChartBlockKey, SeriesSpec[]> = {
  command: [{ field: 'instantaneousOpsPerSec' }],
  memory: [{ field: 'usedMemory' }],
  network: [
    { field: 'instantaneousInputKbps', dir: '↓' },
    { field: 'instantaneousOutputKbps', dir: '↑', dash: true },
  ],
  keyTotal: [{ field: 'keyTotal' }],
  connectedClients: [{ field: 'connectedClients' }],
  cacheHitRatio: [{ field: 'cacheHitRatio' }],
  totalConnectionsReceived: [{ field: 'totalConnectionsReceived' }],
  totalCommandsProcessed: [{ field: 'totalCommandsProcessed' }],
}
// 遍历/渲染顺序即图表块顺序，直接由 BLOCK_SERIES 派生，避免多处列表不同步
const BLOCK_KEYS = Object.keys(BLOCK_SERIES) as ChartBlockKey[]

type Series = ChartDataset<'line', (number | null)[]> & { _addr: string; _field: keyof RedisChart }
type ChartBlock = { labels: number[]; datasets: Series[] }

// 自动刷新及刷新间隔配置
let timer: ReturnType<typeof setInterval> | null = null
watch(
  [autoRefresh, refreshInterval],
  ([val, _]: [boolean, number]) => {
    if (timer) clearInterval(timer)
    timer = null
    if (val) {
      timer = setInterval(getData, refreshInterval.value * 1000)
    }
  },
  { immediate: true },
)
// #endregion

// #region 图表操作
// 图表实例，手动刷新
// vue-chartjs Line 经 reforwardRef 暴露的 chart（可能是 Ref，需 unref）
type LineChartExposed = { chart: unknown }
const commandRef = useTemplateRef<LineChartExposed>('command')
const memoryRef = useTemplateRef<LineChartExposed>('memory')
const networkRef = useTemplateRef<LineChartExposed>('network')
const keyTotalRef = useTemplateRef<LineChartExposed>('keyTotal')
const connectedClientsRef = useTemplateRef<LineChartExposed>('connectedClients')
const cacheHitRatioRef = useTemplateRef<LineChartExposed>('cacheHitRatio')
const totalConnectionsReceivedRef = useTemplateRef<LineChartExposed>('totalConnectionsReceived')
const totalCommandsProcessedRef = useTemplateRef<LineChartExposed>('totalCommandsProcessed')
const chartsRoot = useTemplateRef<HTMLElement>('charts')

function updateLineChart(lineRef: LineChartExposed | null | undefined) {
  const chart = unref(lineRef?.chart) as { update?: () => void } | null | undefined
  chart?.update?.()
}

const lineRefs = [
  commandRef,
  memoryRef,
  networkRef,
  keyTotalRef,
  connectedClientsRef,
  cacheHitRatioRef,
  totalConnectionsReceivedRef,
  totalCommandsProcessedRef,
]
function refreshInstance() {
  for (const r of lineRefs) updateLineChart(r.value)
}

let chartsFullscreenWasOurs = false

async function toggleChartsFullscreen() {
  const el = chartsRoot.value
  if (!el) return
  try {
    if (document.fullscreenElement === el) {
      await document.exitFullscreen()
    } else {
      await el.requestFullscreen()
    }
  } catch (e: unknown) {
    meLog('charts fullscreen error', e)
  }
}

function onChartsFullscreenKey(e: KeyboardEvent) {
  if (e.key !== 'F11') return
  e.preventDefault()
  void toggleChartsFullscreen()
}

function onChartsFullscreenChange() {
  const el = chartsRoot.value
  if (!el) return
  const now = document.fullscreenElement === el
  if (now || chartsFullscreenWasOurs) {
    chartsFullscreenWasOurs = now
    refreshInstance()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onChartsFullscreenKey, true)
  document.addEventListener('fullscreenchange', onChartsFullscreenChange)
  // 等 Line 子组件 onMounted 创建 chart 后再拉数并 refresh（setup 阶段 chart 仍为 null）
  void nextTick(() => {
    void getData()
  })
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('keydown', onChartsFullscreenKey, true)
  document.removeEventListener('fullscreenchange', onChartsFullscreenChange)
  if (chartsRoot.value && document.fullscreenElement === chartsRoot.value) {
    void document.exitFullscreen()
  }
})

// 节点 -> 稳定配色：首次出现按色板顺序定色，之后固定（切筛选不跳色）
const colorCache = new Map<string, string>()
function nodeColor(addr: string): string {
  let c = colorCache.get(addr)
  if (!c) {
    c = CHART_COLORS[colorCache.size % CHART_COLORS.length]
    colorCache.set(addr, c)
  }
  return c
}

// 折线/图例文案：优先短标签（M1/S1），集群未匹配退回地址，单机（addr 为空）返回空串
function nodeDisplayName(addr: string): string {
  const hit = share.nodeList.find(item => item.node === addr)
  if (hit?.shortLabel) return hit.shortLabel
  return addr
}

// 排序：主节点整体在前、再按短标签编号 → M1,M2,M3,S1,S2,S3（图例与 tooltip 共用，元组比较无节点数上限假设）
function nodeOrderKey(addr: string): [number, number] {
  const hit = share.nodeList.find(item => item.node === addr)
  if (!hit) return [2, 0]
  return [hit.isMaster ? 0 : 1, Number(hit.shortLabel.replace(/\D/g, '')) || 0]
}
function compareNodeOrder(a: string, b: string): number {
  const [roleA, numA] = nodeOrderKey(a)
  const [roleB, numB] = nodeOrderKey(b)
  return roleA - roleB || numA - numB
}

// 取数值（缺失按 0，沿用旧行为）
function chartNumber(res: RedisChart, key: keyof RedisChart): number {
  const v = res[key]
  return typeof v === 'number' ? v : 0
}

// 找到（或惰性创建）某节点在某块的 dataset；新建时用 null 补齐历史点对齐
function ensureSeries(block: ChartBlock, addr: string, spec: SeriesSpec): Series {
  let ds = block.datasets.find(d => d._addr === addr && d._field === spec.field)
  if (!ds) {
    const c = nodeColor(addr)
    ds = {
      _addr: addr,
      _field: spec.field,
      label: spec.dir ? `${nodeDisplayName(addr)} ${spec.dir}` : nodeDisplayName(addr),
      borderColor: c,
      backgroundColor: c,
      pointBackgroundColor: c, // 点与线同色，避免默认空心点看起来不一致
      pointBorderColor: c,
      data: Array.from({ length: Math.max(0, block.labels.length - 1) }, () => null),
      tension: 0.4,
      hidden: !!hiddenNodes.value[addr],
    }
    if (spec.dash) ds.borderDash = [6, 3]
    block.datasets.push(ds)
  }
  return ds
}

// 从后台获取原始数据（统一按列表取数：单机/单节点时长度为 1）
async function getData() {
  try {
    const list = await meCommands.chartList(share.conn!.id, node.value)
    const label = Date.now()
    // 各块先推进同一个 label（时间轴对齐），再逐节点逐系列落点
    for (const key of BLOCK_KEYS) chartData.value[key].labels.push(label)
    for (const res of list) {
      const addr = res.node
      for (const key of BLOCK_KEYS) {
        for (const spec of BLOCK_SERIES[key]) {
          ensureSeries(chartData.value[key], addr, spec).data.push(chartNumber(res, spec.field))
        }
      }
    }

    // 保存当前数据条数, 超过最大条数，则均分取样
    nowPointCount.value = chartData.value.command.labels.length
    if (nowPointCount.value > maxPointCount.value) {
      const indexes = calcLabelIndexes(chartData.value.command.labels)
      for (const key of BLOCK_KEYS) cutChartData(indexes, key)
    }
    // shallowRef 原地 push 不会触发 vue-chartjs，克隆后 :data 引用变化才能重绘
    chartData.value = cloneDeep(chartData.value)
    nowPointCount.value = chartData.value.command.labels.length
  } catch (e: unknown) {
    meLog('get chart data error', e)
  } finally {
    loaded.value = true
  }
}

// 裁剪图表数据（块内所有 dataset 同步裁剪，与 labels 对齐）
function cutChartData(indexes: number[], prop0: ChartBlockKey) {
  const propData = chartData.value[prop0]
  propData.labels = cutArray(propData.labels, indexes)
  for (const ds of propData.datasets) {
    ds.data = cutArray(ds.data, indexes)
  }
}

// 裁剪数组：仅保留 indexes 中的下标（Set 去重 + O(1) 命中）
function cutArray<T>(arr: T[], indexes: number[]): T[] {
  const keep = new Set(indexes)
  return arr.filter((_, i) => keep.has(i))
}

// 计算需要保留的索引位置，用于裁剪判断
function calcLabelIndexes(labels: number[]) {
  const minLabel = Date.now() - keepMinutes.value * 60 * 1000

  // 最大值减去最小值，除以 maxPointCount 获得刻度间隔
  const interval =
    Math.floor((labels[labels.length - 1] - Math.max(labels[0], minLabel)) / maxPointCount.value) *
    1.5

  const indexes: number[] = []
  let intervalLabel: number | undefined = undefined
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]

    // 超过保留时间的数据跳过
    if (label < minLabel) {
      continue
    }

    // 第1个保留的标签
    if (intervalLabel === undefined) {
      intervalLabel = label
      continue
    }

    if (label - intervalLabel >= interval) {
      indexes.push(i)
      intervalLabel = label
    }
  }
  return indexes
}
// #endregion

// #region 图表配置
// chart.js配置项（基本配置项）
const baseOptions = {
  maintainAspectRatio: false,
  // x轴为日期格式，显示为秒
  scales: {
    x: {
      type: 'time' as const,
      time: { unit: 'second' as const, displayFormats: { second: 'HH:mm:ss' } },
      // 控制刻度显示数量
      ticks: {
        align: 'center' as const, // 刻度居中
        maxTicksLimit: 10, // 最多显示N个主刻度
        autoSkip: true, // 自动跳过部分刻度
      },
      bounds: 'ticks' as const, // 确保坐标轴从第一个刻度开始，到最后一个刻度结束
      offset: false, // 在两端留出空白
    },
  },
  plugins: {
    legend: {
      display: false, // 节点图例统一收敛到顶部共享组件，避免每张图重复
    },
    tooltip: {
      mode: 'index' as const, // 多线同屏：触发时按时间点对齐展示各节点
      intersect: true, // 贴近数据点才触发（false 会在图表任意位置触发，与旧版行为不符）
      // 等宽字体：配合 padEnd2 的空格补齐使各行列对齐，改回比例字体则对齐失效（见 padEnd2 注释）
      bodyFont: { family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      // tooltip 各节点按主/从分组次序排列（与共享图例一致）
      itemSort: (a, b) =>
        compareNodeOrder((a.dataset as Series)._addr, (b.dataset as Series)._addr),
      callbacks: {
        // 工具提示标题：仅时间（HH:mm:ss）
        title: function (context: TooltipItem<'line'>[]) {
          const first = context[0]
          if (!first) return ''
          const dt = dayjs(first.parsed.x)
          return dt.format('HH:mm:ss')
        },
      },
    },
  },
} satisfies ChartOptions<'line'>

// 浅色深色主题
const lightOptions = {
  color: '#333',
  scales: {
    x: {
      ticks: {
        color: '#666', // 默认的X轴标签颜色
      },
      grid: {
        color: 'rgba(0, 0, 0, 0.1)', // 默认的X轴网格线颜色
      },
    },
    y: {
      ticks: {
        color: '#666', // 默认的Y轴标签颜色
      },
      grid: {
        color: 'rgba(0, 0, 0, 0.1)', // 默认的Y轴网格线颜色
      },
    },
  },
}

const darkOptions = {
  color: '#EEE',
  scales: {
    x: {
      ticks: {
        color: '#EEE', // 默认的X轴标签颜色
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.2)', // 默认的X轴网格线颜色
      },
    },
    y: {
      ticks: {
        color: '#EEE', // 默认的Y轴标签颜色
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.2)', // 默认的Y轴网格线颜色
      },
    },
  },
}

// Y 轴刻度覆写（非响应式；merge 仅读取不改这些常量）
const memoryScale = {
  scales: {
    y: {
      beginAtZero: true, // 从零开始
      ticks: {
        callback: function (this: unknown, value: string | number) {
          const valueInMB = Number(value) / (1024 * 1024) // 字节转 MB
          return valueInMB.toFixed(1) + ' M' // 保留 1 位小数
        },
      },
    },
  },
}
const ratioScale = { scales: { y: { min: 0, max: 1 } } }
const totalScale = {
  scales: {
    y: {
      ticks: {
        callback: function (this: unknown, value: string | number) {
          return meHumanNums(Number(value), '0', 2)
        },
      },
    },
  },
}

// tooltip 数值格式化：整数千分位，≥1000 走 K/M/B 简写
function fmtCount(v: number): string {
  if (!Number.isFinite(v)) return '-'
  if (Math.abs(v) >= 1000) return meHumanNums(v, '0', 1)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
// 命中率：0~1 → 百分比
function fmtPercent(v: number): string {
  return Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '-'
}
const fmtOpt = (v: number | null | undefined) => (v == null ? '-' : fmtCount(v))

// 统一构建图表配置（标题走 i18n，随语言切换的 computed 自动更新）
type BlockOpt = {
  scale?: object | null // Y 轴刻度覆写
  hintKey?: string // 追加在标题后的线型说明（网络图）
  tooltipExtra?: object // 直接深合并进 tooltip（主从合并行 / 网络输入输出合并行）
}
function chartOptions(titleKey: string, opt: BlockOpt = {}): ChartOptions<'line'> {
  const dark = isDark.value
  const themed = (
    dark ? merge(cloneDeep(baseOptions), darkOptions) : merge(cloneDeep(baseOptions), lightOptions)
  ) as ChartOptions<'line'>
  if (opt.scale) merge(themed, opt.scale)
  const titleText = opt.hintKey ? `${t(titleKey)} · ${t(opt.hintKey)}` : t(titleKey)
  merge(themed, {
    plugins: {
      title: {
        display: true,
        text: titleText,
        color: dark ? '#A3A6AD' : '#909399', // 用 Element Plus 次要（secondary）文字色
        font: { size: 13 },
        padding: { top: 4, bottom: 8 },
      },
    },
  })
  if (opt.tooltipExtra) {
    merge(themed, { plugins: { tooltip: opt.tooltipExtra } })
  }
  return themed
}

// 从节点是否并入主节点行：需其主节点折线在场（「仅从」模式下主不在图中，从节点仍单独成行不丢数据）
function isPairedSlave(item: TooltipItem<'line'>): boolean {
  return isPairedSlaveAddr(item.dataset as Series, item.chart.data.datasets as Series[])
}

// 地址是否为「配对主节点折线在场」的从节点（dataset 级判断，不依赖 tooltip item）
function isPairedSlaveAddr(ds: Series, all: Series[]): boolean {
  const hit = share.nodeList.find(n => n.node === ds._addr)
  if (!hit || hit.isMaster || !hit.slaveOfNode) return false
  return all.some(d => d._addr === hit.slaveOfNode && d._field === ds._field)
}

// 在同图折线中找「某节点的某指标」dataset（主从/输入输出拼行时取配对值）
function findSeries(
  datasets: ChartDataset<'line', (number | null)[]>[],
  addr: string,
  field: keyof RedisChart,
): Series | undefined {
  return datasets.find(d => (d as Series)._addr === addr && (d as Series)._field === field) as
    | Series
    | undefined
}

// 右对齐到指定宽度，使各行后续列起始位置对齐；依赖 tooltip 的等宽字体（bodyFont），改回比例字体则对齐失效
function padEnd2(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

// 通用 tooltip 合并行：从节点并入其主节点之后同行显示（如「M1: 11.26M  S1: 10.08M」）
function mergedTooltip(field: keyof RedisChart, fmt: (v: number) => string): object {
  // 主列最宽按本次悬停时间点算一次，同次 label 按 dataIndex 缓存复用（避免每行重复扫描）
  let widthCache: { i: number; w: number } | null = null
  const masterWidth = (item: TooltipItem<'line'>, i: number): number => {
    if (widthCache?.i === i) return widthCache.w
    const all = item.chart.data.datasets as Series[]
    const w = Math.max(
      1,
      ...all
        .filter(ds => !ds.hidden && !isPairedSlaveAddr(ds, all))
        .map(ds => fmtOptVal(ds.data[i], fmt).length),
    )
    widthCache = { i, w }
    return w
  }
  return {
    // filter 丢弃配对从节点项，值由主节点行的 label 拼入
    filter: (item: TooltipItem<'line'>) => !isPairedSlave(item),
    callbacks: {
      label: (item: TooltipItem<'line'>) => {
        const ds = item.dataset as Series
        const i = item.dataIndex
        const name = nodeDisplayName(ds._addr)
        // 主列统一右对齐到最宽，S 列才能逐列对齐
        const w = masterWidth(item, i)
        const parts: string[] = []
        if (name || !isPairedSlave(item)) {
          const own = padEnd2(fmtOptVal(ds.data[i], fmt), w)
          parts.push(name ? `${name}: ${own}` : own)
        }
        for (const slave of share.nodeList) {
          if (slave.slaveOfNode !== ds._addr) continue
          const sDs = findSeries(item.chart.data.datasets, slave.node, field)
          if (!sDs) continue // 折线不在图中（如「仅主」筛选）则不拼
          parts.push(`${slave.shortLabel}: ${fmtOptVal(sDs.data[i], fmt)}`)
        }
        return parts.join('  ')
      },
    },
  }
}
const fmtOptVal = (v: number | null | undefined, fmt: (v: number) => string) =>
  v == null ? '-' : fmt(v)

// 网络图 tooltip：同节点的输入/输出合并成一行，从节点再并入主节点行（丢弃输出项与配对从节点项）
const networkTooltipExtra = {
  filter: (item: TooltipItem<'line'>) =>
    (item.dataset as Series)._field !== 'instantaneousOutputKbps' && !isPairedSlave(item),
  callbacks: {
    label: (item: TooltipItem<'line'>) => {
      const inDs = item.dataset as Series
      const i = item.dataIndex
      const all = item.chart.data.datasets as Series[]
      // 本次悬停参与拼行的各节点（主 + 在图的从）的输入/输出格式化值，用于列宽对齐
      const addrs = all
        .filter(
          ds => ds._field === 'instantaneousInputKbps' && !ds.hidden && !isPairedSlaveAddr(ds, all),
        )
        .flatMap(ds => [
          ds._addr,
          ...share.nodeList.filter(s => s.slaveOfNode === ds._addr).map(s => s.node),
        ])
      const valOf = (addr: string, field: keyof RedisChart) =>
        fmtOpt(findSeries(all, addr, field)?.data[i])
      // 仅对齐输入列（↓）：输出列（↑）是末列无需补齐
      const wDown = Math.max(...addrs.map(a => valOf(a, 'instantaneousInputKbps').length), 1)
      const netPair = (addr: string) =>
        `↓ ${padEnd2(valOf(addr, 'instantaneousInputKbps'), wDown)}  ↑ ${valOf(addr, 'instantaneousOutputKbps')}`
      const name = nodeDisplayName(inDs._addr)
      const parts: string[] = []
      if (name || !isPairedSlave(item)) {
        parts.push(name ? `${name}: ${netPair(inDs._addr)}` : netPair(inDs._addr))
      }
      for (const slave of share.nodeList) {
        if (slave.slaveOfNode !== inDs._addr) continue
        if (!findSeries(all, slave.node, 'instantaneousInputKbps')) continue // 「仅主」筛选下不拼
        parts.push(`${slave.shortLabel}: ${netPair(slave.node)}`)
      }
      return parts.join('  ')
    },
  },
}

// 除网络外的块统一走主从合并行 tooltip（传入块指标字段以定位从节点折线）
const commandOptions = computed(() =>
  chartOptions('redisChart.command', {
    tooltipExtra: mergedTooltip('instantaneousOpsPerSec', fmtCount),
  }),
)
const memoryOptions = computed(() =>
  chartOptions('redisChart.memory', {
    scale: memoryScale,
    tooltipExtra: mergedTooltip('usedMemory', meHumanSize),
  }),
)
const networkOptions = computed(() =>
  chartOptions('redisChart.network', {
    hintKey: 'redisChart.networkLineHint',
    tooltipExtra: networkTooltipExtra,
  }),
)
const keyTotalOptions = computed(() =>
  chartOptions('redisChart.keyTotal', { tooltipExtra: mergedTooltip('keyTotal', fmtCount) }),
)
const connectedClientsOptions = computed(() =>
  chartOptions('redisChart.connectedClients', {
    tooltipExtra: mergedTooltip('connectedClients', fmtCount),
  }),
)
const cacheHitRatioOptions = computed(() =>
  chartOptions('redisChart.cacheHitRatio', {
    scale: ratioScale,
    tooltipExtra: mergedTooltip('cacheHitRatio', fmtPercent),
  }),
)
const totalConnectionsReceivedOptions = computed(() =>
  chartOptions('redisChart.totalConnectionsReceived', {
    scale: totalScale,
    tooltipExtra: mergedTooltip('totalConnectionsReceived', fmtCount),
  }),
)
const totalCommandsProcessedOptions = computed(() =>
  chartOptions('redisChart.totalCommandsProcessed', {
    scale: totalScale,
    tooltipExtra: mergedTooltip('totalCommandsProcessed', fmtCount),
  }),
)

// 初始骨架：各块空 labels/datasets，dataset 由 ensureSeries 依节点惰性创建
const initData = computed((): Record<ChartBlockKey, ChartBlock> => {
  const data = {} as Record<ChartBlockKey, ChartBlock>
  for (const key of BLOCK_KEYS) data[key] = { labels: [], datasets: [] }
  return data
})

// 避免vue的响应式更新和chartjs的响应式更新冲突（无限循环），使用shallowRef
let chartData = shallowRef(cloneDeep(initData.value))

// 重置数据
function resetData() {
  chartData.value = cloneDeep(initData.value)
  hiddenNodes.value = {} // 切筛选/清空时重置隐藏态
  getData()
}
watch(node, resetData)

// 已加载但无任何折线（如「仅从」但从节点为空）时显示空态
const noSeries = computed(() => loaded.value && chartData.value.command.datasets.length === 0)

// 顶部共享图例：节点名 + 稳定色，只展示一次；按 share.nodeList（已排序）次序排列，与 M1/M2/S1 编号一致
const nodeLegend = computed(() =>
  chartData.value.command.datasets
    .map(ds => ({
      addr: ds._addr,
      label: String(ds.label ?? ''),
      color: String(ds.borderColor ?? ''),
      hidden: !!hiddenNodes.value[ds._addr],
    }))
    .sort((a, b) => compareNodeOrder(a.addr, b.addr)),
)

// 点击图例：切换该节点在所有图表块中折线的显隐
function toggleNode(addr: string) {
  const willHide = !hiddenNodes.value[addr]
  if (willHide) hiddenNodes.value[addr] = true
  else delete hiddenNodes.value[addr]
  for (const key of BLOCK_KEYS) {
    for (const ds of chartData.value[key].datasets) {
      if (ds._addr === addr) ds.hidden = willHide
    }
  }
  chartData.value = cloneDeep(chartData.value)
}

// 语言/主题切换：块标题与配色在 options computed 内（依赖 t / isDark），刷新实例让 chart.js 应用
watch([() => meTauri.settings.language, () => meTauri.settings.theme], () => refreshInstance())
// #endregion
</script>

<template>
  <div class="redis-chart">
    <div class="me-flex">
      <div class="left">
        <me-button
          @click="meConfirm(t('redisChart.clearConfirm'), resetData)"
          icon="el-icon-delete"
          :info="t('redisChart.clearData')"
          placement="top" />
        <el-switch
          v-model="autoRefresh"
          :active-text="t('redisChart.autoRefresh')"
          style="margin-left: 15px" />
        <el-switch
          v-model="showMoreChart"
          :active-text="t('redisChart.moreChart')"
          style="margin-left: 15px" />
      </div>
      <div class="right">
        <el-dropdown placement="bottom-end" :hide-on-click="false" :teleported="false">
          <me-icon
            class="refresh icon-btn"
            :class="autoRefresh ? 'rotating' : ''"
            icon="el-icon-refresh-right"
            @click="getData"
            style="margin-right: 10px" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-form :label-width="t('redisChart.labelWidth')" label-position="right">
                <el-dropdown-item>
                  <el-form-item :label="t('redisChart.refreshInterval')">
                    <el-input-number
                      v-model.number="refreshInterval"
                      :min="1"
                      :max="60"
                      :controls="false"
                      style="width: 80px; margin-left: 10px">
                      <template #suffix>{{ t('redisChart.refreshUnit') }}</template>
                    </el-input-number>
                  </el-form-item>
                </el-dropdown-item>
                <el-dropdown-item>
                  <el-form-item :label="t('redisChart.keepMinutes')">
                    <el-input-number
                      v-model.number="keepMinutes"
                      :min="1"
                      :max="600"
                      :controls="false"
                      style="width: 80px; margin-left: 10px">
                      <template #suffix>{{ t('redisChart.keepUnit') }}</template>
                    </el-input-number>
                  </el-form-item>
                </el-dropdown-item>
                <el-dropdown-item>
                  <el-form-item :label="t('redisChart.maxPointCount')">
                    <el-input-number
                      v-model.number="maxPointCount"
                      :min="10"
                      :max="200"
                      :controls="false"
                      style="width: 80px; margin-left: 10px">
                      <template #suffix>{{ t('redisChart.pointUnit') }}</template>
                    </el-input-number>
                  </el-form-item>
                </el-dropdown-item>
              </el-form>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <node-list v-model="node" filterable />
      </div>
    </div>

    <!-- 全屏容器：图例 + 图表 + 点数一并进入全屏 -->
    <div ref="charts" class="charts-area">
      <!-- 共享图例（仅集群）：节点色块+名称只列一次，可点击隐藏对应折线 -->
      <div v-if="!noSeries && share.conn?.cluster && nodeLegend.length" class="node-legend">
        <span
          v-for="n in nodeLegend"
          :key="n.addr"
          class="node-legend-item"
          :class="{ 'is-hidden': n.hidden }"
          @click="toggleNode(n.addr)">
          <i class="node-legend-swatch" :style="{ backgroundColor: n.color }"></i>{{ n.label }}
        </span>
      </div>

      <el-empty v-if="noSeries" :description="t('redisChart.noMatchedNode')" />
      <div v-else class="charts">
        <div class="chart">
          <Line ref="command" :data="chartData.command" :options="commandOptions" />
        </div>
        <div class="chart">
          <Line ref="memory" :data="chartData.memory" :options="memoryOptions" />
        </div>
        <div class="chart">
          <Line ref="network" :data="chartData.network" :options="networkOptions" />
        </div>

        <template v-if="showMoreChart">
          <div class="chart">
            <Line ref="keyTotal" :data="chartData.keyTotal" :options="keyTotalOptions" />
          </div>
          <div class="chart">
            <Line
              ref="connectedClients"
              :data="chartData.connectedClients"
              :options="connectedClientsOptions" />
          </div>
          <div class="chart">
            <Line
              ref="cacheHitRatio"
              :data="chartData.cacheHitRatio"
              :options="cacheHitRatioOptions" />
          </div>
          <div class="chart">
            <Line
              ref="totalConnectionsReceived"
              :data="chartData.totalConnectionsReceived"
              :options="totalConnectionsReceivedOptions" />
          </div>
          <div class="chart">
            <Line
              ref="totalCommandsProcessed"
              :data="chartData.totalCommandsProcessed"
              :options="totalCommandsProcessedOptions" />
          </div>
        </template>
      </div>
      <el-text class="point-count" type="info"
        >{{ t('redisChart.points') }}: {{ nowPointCount }}</el-text
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-chart {
  height: 100%;
  overflow: hidden; // 仅 .charts 内部滚动，顶部工具栏/图例/点数固定
  display: flex;
  flex-direction: column;

  .point-count {
    align-self: flex-end;
    opacity: 0.6;
  }

  .left {
    display: flex;
    align-items: center;
  }

  .right {
    display: flex;
    align-items: center;
  }

  .node-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    padding: 15px 10px 0 10px;
    font-size: 14px;
    color: var(--el-text-color-regular);

    .node-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      user-select: none;
      padding: 5px 8px;
      margin: -5px -8px; // 扩大点击热区而不影响排布
      border-radius: 4px;
      transition:
        opacity 0.15s,
        background-color 0.15s;

      &:hover {
        background-color: var(--el-fill-color-light);
      }

      &.is-hidden {
        opacity: 0.4;
        text-decoration: line-through;
      }
    }

    .node-legend-swatch {
      display: inline-block;
      width: 14px;
      height: 3px;
      border-radius: 2px;
    }
  }

  :deep(.el-input-group__prepend) {
    padding: 0 10px 0 0;
  }

  :deep(.el-input-group__append) {
    width: 42px;
  }

  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  .refresh {
    font-size: 24px;
    color: var(--el-color-success);
  }

  // 全屏容器：图例 + 图表 + 点数一并进入全屏
  .charts-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    &:fullscreen {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 10px;
      /* 与 Tab 内容区一致：深色主题下未覆写 --el-bg-color-page，会与主背景脱节 */
      background-color: var(--el-bg-color);
    }
  }

  .charts {
    margin-top: -10px;
    flex-grow: 1;
    min-height: 0; // 允许 flex 子项收缩以触发内部滚动
    overflow-y: auto;

    .chart {
      height: min(28vh, 33%);
      padding: 10px;
    }
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }

  .rotating {
    animation: rotate 2s linear infinite;
  }
}
</style>
