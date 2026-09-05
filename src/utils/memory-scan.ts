/**
 * 内存分析扫描循环：每轮调用一轮 `memoryUsage`（内部复用 SCAN 游标），
 * 暂停/继续/停止由前端控制，与键列表 SCAN 同构。
 */
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RedisKeySize_Serialize, ScanCursor } from '@/types/tauri-specta'
import { computeScanProgress } from '@/utils/redis-glob'
import { redisKeyId } from '@/utils/redis-key'
import { meCommands, sleep } from '@/utils/util'

/** 与键列表 SCAN 相同：前若干轮很快结束时不闪进度环 */
const SCAN_CONTROL_MIN_BATCHES = 10
/** 内存单轮更慢，超时也显示，避免只看到「停止」却没有环 */
const SCAN_CONTROL_MIN_MS = 400

export type MemoryScanParam = {
  match: string
  sizeLimit: number
  scanCount: number
  sleepMillis: number
  needKeyType: boolean
}

export function useMemoryScan(options: {
  connId: () => string | undefined
  param: () => MemoryScanParam
  totalEstimate: () => number
}) {
  const { t } = useI18n()
  const scanning = ref(false)
  const paused = ref(false)
  const dataList = ref<RedisKeySize_Serialize[]>([])
  const cursor = ref<ScanCursor | null>(null)
  const batchCount = ref(0)
  const controlReady = ref(false)

  let cancelled = false
  let controlTimer: ReturnType<typeof setTimeout> | null = null

  function clearControlTimer(): void {
    if (!controlTimer) return
    clearTimeout(controlTimer)
    controlTimer = null
  }

  function armControlDelay(): void {
    controlReady.value = false
    clearControlTimer()
    controlTimer = setTimeout(() => {
      controlReady.value = true
      controlTimer = null
    }, SCAN_CONTROL_MIN_MS)
  }

  onUnmounted(() => clearControlTimer())

  const showScanControl = computed(
    () =>
      paused.value ||
      (scanning.value && (batchCount.value >= SCAN_CONTROL_MIN_BATCHES || controlReady.value)),
  )
  const scanProgress = computed(() =>
    computeScanProgress(
      batchCount.value,
      options.param().scanCount,
      options.totalEstimate(),
      Boolean(cursor.value?.finished),
    ),
  )
  const scanToggleTip = computed(() =>
    scanning.value ? t('keyMain.pauseScan') : t('keyMain.resumeScan'),
  )

  async function waitUntilIdle(): Promise<void> {
    while (scanning.value) {
      await sleep(20)
    }
  }

  async function runLoop(): Promise<void> {
    const connId = options.connId()
    if (!connId) {
      scanning.value = false
      return
    }
    cancelled = false
    paused.value = false
    try {
      while (!cancelled && !paused.value) {
        const p = options.param()
        const res = await meCommands.memoryUsage(connId, {
          match: p.match,
          sizeLimit: p.sizeLimit,
          scanCount: p.scanCount,
          cursor: cursor.value,
          needKeyType: p.needKeyType,
        })
        if (cancelled) break
        batchCount.value++
        cursor.value = res.cursor
        dataList.value = mergeMemoryHits(dataList.value, res.keyList)
        if (res.cursor.finished) break
        if (p.sleepMillis > 0) {
          await sleep(p.sleepMillis)
          if (cancelled || paused.value) break
        }
      }
    } catch {
      // meCommands 已弹错；停在暂停态便于继续或停止
      paused.value = true
    } finally {
      scanning.value = false
      if (cursor.value?.finished) paused.value = false
      if (!paused.value) clearControlTimer()
    }
  }

  async function start(): Promise<void> {
    if (scanning.value) return
    // 先占住 scanning，避免连点「开始」并发清列表
    scanning.value = true
    cancelled = false
    paused.value = false
    dataList.value = []
    cursor.value = null
    batchCount.value = 0
    armControlDelay()
    await runLoop()
  }

  async function resume(): Promise<void> {
    if (scanning.value || !paused.value) return
    scanning.value = true
    controlReady.value = true
    clearControlTimer()
    await runLoop()
  }

  function pause(): void {
    paused.value = true
  }

  async function stop(): Promise<void> {
    cancelled = true
    paused.value = false
    clearControlTimer()
    await waitUntilIdle()
  }

  function onRingClick(): void {
    if (scanning.value) pause()
    else if (paused.value) void resume()
  }

  function onStartStop(): void {
    if (scanning.value || paused.value) void stop()
    else void start()
  }

  return {
    scanning,
    paused,
    dataList,
    showScanControl,
    scanProgress,
    scanToggleTip,
    start,
    stop,
    onRingClick,
    onStartStop,
  }
}

/** 追加本轮命中并按大小降序；SCAN 可能重复，按 redisKeyId 去重 */
export function mergeMemoryHits(
  existing: RedisKeySize_Serialize[],
  incoming: RedisKeySize_Serialize[],
): RedisKeySize_Serialize[] {
  const seen = new Set(existing.map(redisKeyId))
  const next = existing.slice()
  for (const row of incoming) {
    const id = redisKeyId(row)
    if (seen.has(id)) continue
    seen.add(id)
    next.push(row)
  }
  next.sort((a, b) => b.size - a.size)
  return next
}
