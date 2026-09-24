<script setup lang="ts">
// TimeSeries 折线图弹框：用当前表已加载样本画 line（chart.js）；与实例监控 RedisChart 无关
import {
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js'
import type { ChartOptions, TooltipItem } from 'chart.js'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm'
import { useI18n } from 'vue-i18n'

import { isDark, PREDEFINE_COLORS } from '@/utils/util'

ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  LinearScale,
  CategoryScale,
  Tooltip,
)

type TsSample = { key?: string; value?: unknown }

const { t } = useI18n()
const visible = ref(false)
const points = ref<{ x: number; y: number }[]>([])

/** 打开弹框；rows 为当前表已加载样本（key=timestamp ms，value=数值明文） */
function open(rows: TsSample[]) {
  const list: { x: number; y: number }[] = []
  for (const row of rows) {
    const x = Number(String(row.key ?? '').trim())
    const y = Number(String(row.value ?? '').trim())
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    list.push({ x, y })
  }
  // 折线按时间正序，与表格升降序无关
  list.sort((a, b) => a.x - b.x)
  points.value = list
  visible.value = true
}

defineExpose({ open })

const chartData = computed(() => ({
  datasets: [
    {
      label: t('redisValue.tsChartSeries'),
      data: points.value,
      borderColor: PREDEFINE_COLORS[0],
      // 与 RedisChart 一致：平滑折线；样本多时隐藏圆点以免卡顿
      tension: 0.4,
      pointRadius: points.value.length > 400 ? 0 : 3,
      pointHoverRadius: 4,
    },
  ],
}))

const chartOptions = computed((): ChartOptions<'line'> => {
  const dark = isDark.value
  return {
    maintainAspectRatio: false,
    parsing: false,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'second', displayFormats: { second: 'HH:mm:ss' } },
        ticks: {
          color: dark ? '#EEE' : '#666',
          align: 'center',
          maxTicksLimit: 10,
          autoSkip: true,
        },
        bounds: 'ticks',
        offset: false,
        grid: { color: dark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' },
      },
      y: {
        ticks: { color: dark ? '#EEE' : '#666' },
        grid: { color: dark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title(items: TooltipItem<'line'>[]) {
            const first = items[0]
            if (!first) return ''
            return dayjs(first.parsed.x).format('YYYY-MM-DD HH:mm:ss')
          },
        },
      },
    },
  }
})
</script>

<template>
  <me-dialog
    v-model="visible"
    :title="t('redisValue.tsChartTitle')"
    icon="me-icon-line-charts"
    width="860px">
    <el-empty v-if="!points.length" :description="t('redisValue.tsChartEmpty')" />
    <div v-else class="ts-chart-canvas">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.ts-chart-canvas {
  height: 100%;
  position: relative;
}
</style>
