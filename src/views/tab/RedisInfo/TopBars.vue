<script setup lang="ts">
// 前 10 横条。调用方按数值从高到低传入，第一条画在最上面。不发命令。
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartOptions,
  type Plugin,
  type Scale,
} from 'chart.js'
import { computed, onMounted, onUnmounted, unref, useTemplateRef } from 'vue'
import { Bar } from 'vue-chartjs'

import { CHART_COLORS, isDark, meHumanNums } from '@/utils/app/util'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

export type TopBarItem = {
  label: string
  /** 柱长。同一张图用同一单位 */
  value: number
  /** 柱端文字 */
  caption: string
  /** 比柱端多出来的悬停。不传或与 caption 相同则不弹 */
  tip?: string
}

const props = defineProps<{ items: TopBarItem[] }>()

function captionAt(index: number): string {
  return props.items[index]?.caption ?? ''
}

/** 给最长的柱端文字留出右侧空档，避免画到画布外面 */
function labelPad(): number {
  const longest = props.items.reduce((max, item) => Math.max(max, item.caption.length), 0)
  return Math.ceil(longest * 7.5 + 16)
}

const host = useTemplateRef<HTMLElement>('host')
const barRef = useTemplateRef<{ chart: unknown }>('bar')

function axisTick(n: number): string {
  const abs = Math.abs(n)
  if (abs !== 0 && abs < 1000) {
    if (abs >= 100) return String(Math.round(n))
    if (abs >= 10) return String(Math.round(n * 10) / 10)
    if (abs >= 1) return String(Math.round(n * 100) / 100)
    return String(Math.round(n * 1000) / 1000)
  }
  return meHumanNums(n, '0', 1)
}

const data = computed(() => ({
  labels: props.items.map(item => item.label),
  datasets: [
    {
      data: props.items.map(item => item.value),
      // 按名次取色，避免十条柱子同一颜色分不清
      backgroundColor: props.items.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
      borderWidth: 0,
      borderRadius: 2,
      maxBarThickness: 28,
    },
  ],
}))

function shorten(label: string): string {
  return label.length > 32 ? `${label.slice(0, 31)}…` : label
}

const options = computed<ChartOptions<'bar'>>(() => {
  const dark = isDark.value
  const tick = dark ? '#EEE' : '#666'
  const grid = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)'
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: labelPad() } },
    plugins: {
      legend: { display: false },
      tooltip: {
        // 柱端已经写出的内容不再弹。只保留柱端没有的补充，如完整次数、主节点名
        filter: item => {
          const row = props.items[item.dataIndex]
          return !!row?.tip && row.tip !== row.caption
        },
        callbacks: { label: item => props.items[item.dataIndex]?.tip ?? '' },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: tick, callback: value => axisTick(Number(value)) },
        grid: { color: grid },
      },
      y: {
        ticks: {
          color: tick,
          autoSkip: false,
          callback(this: Scale, value) {
            return shorten(this.getLabelForValue(Number(value)))
          },
        },
        grid: { display: false },
      },
    },
  }
})

/** 柱端标数。读 props，切换指标后不用重建图表 */
const valuePlugin: Plugin<'bar'> = {
  id: 'barEndLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    const color = isDark.value ? '#EEE' : '#333'
    ctx.save()
    ctx.font = '12px sans-serif'
    ctx.textBaseline = 'middle'
    meta.data.forEach((el, index) => {
      const text = captionAt(index)
      if (!text) return
      const pos = el.getProps(['x', 'y', 'base'], false) as { x: number; y: number; base: number }
      const end = Math.max(pos.x, pos.base)
      const width = ctx.measureText(text).width
      let x = end + 6
      const inside = x + width > chart.width - 4
      if (inside) x = end - width - 8
      ctx.fillStyle = inside ? '#fff' : color
      ctx.fillText(text, x, pos.y)
    })
    ctx.restore()
  },
}
const chartPlugins = [valuePlugin]

function resizeChart() {
  const chart = unref(barRef.value?.chart) as { resize?: () => void } | null | undefined
  chart?.resize?.()
}

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!host.value) return
  observer = new ResizeObserver(() => resizeChart())
  observer.observe(host.value)
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div ref="host" class="top-bars">
    <Bar ref="bar" :data="data" :options="options" :plugins="chartPlugins" />
  </div>
</template>

<style scoped lang="scss">
.top-bars {
  position: relative;
  height: 100%;
  min-height: 0;
}
</style>
