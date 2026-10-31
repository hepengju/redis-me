import { reactive, ref } from 'vue'

import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { meCommands } from '@/utils/me-commands'
import { redisKeyId } from '@/utils/redis-key'

/**
 * 键列表 MEMORY USAGE 缓存。
 * 可见行攒成一批 pipeline；命中后虚拟列表滚回来不再请求。
 * 详情 fieldScan 用 captureKeyMemoryWrite 写回（编辑后覆盖）。
 * 刷新、删除、重命名、FLUSH 时清掉。
 */

/** 已查过：字节数；null 表示键不存在或这次没拿到大小 */
const cache = reactive(new Map<string, number | null>())
/** 整连接清空时递增。在途的批量结果和详情写回对不上就丢弃 */
export const keyMemoryGeneration = ref(0)

type Queued = { connId: string; redisKey: RedisKey_Deserialize }

const queued = new Map<string, Queued>()
/** 仍挂在视口里、还没查到的行数。减到 0 就从队列拿掉。不清这个表，避免刷新和取消交错时把新排队的行删掉 */
const pins = new Map<string, number>()
let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let onUnsupported: ((connId: string) => void) | null = null

const BATCH = 200
const DEBOUNCE_MS = 40
const UNSUPPORTED_HINTS = [
  'unknown command',
  'unknown subcommand',
  'noperm',
  'no permission',
  'not supported',
  'not allowed',
]

function cacheKey(connId: string, db: number, redisKey: RedisKey_Deserialize): string {
  return `${connId}\0${db}\0${redisKeyId(redisKey)}`
}

/** 批量调用发现命令不可用时，由 AppMain 关掉本连接的能力标志 */
export function onMemoryUsageUnsupported(fn: (connId: string) => void): void {
  onUnsupported = fn
}

/** undefined = 还没查；null = 查过但没有大小 */
export function cachedKeyMemory(
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): number | null | undefined {
  const ck = cacheKey(connId, db, redisKey)
  return cache.has(ck) ? (cache.get(ck) ?? null) : undefined
}

/**
 * 详情请求发出前调用。返回的函数在结果回来时写缓存。
 * 键名会当场定格：重命名会改同一个对象。等待期间刷新或换连接则丢弃。
 */
export function captureKeyMemoryWrite(
  connId: string | undefined,
  db: number | undefined,
  redisKey: RedisKey_Deserialize | null | undefined,
): (size: number) => void {
  if (connId == null || db == null || !redisKey) return () => {}
  const generation = keyMemoryGeneration.value
  const ck = cacheKey(connId, db, { key: redisKey.key, bytes: redisKey.bytes })
  return size => {
    if (size > 0 && generation === keyMemoryGeneration.value) cache.set(ck, size)
  }
}

/** 单键删除/重命名：按身份精确失效 */
export function invalidateKeyMemory(connId: string, redisKey: RedisKey_Deserialize): void {
  const suffix = `\0${redisKeyId(redisKey)}`
  dropWhere(ck => ck.startsWith(`${connId}\0`) && ck.endsWith(suffix))
}

/** 关闭/切换连接、批量删、FLUSHDB、刷新列表：丢弃该连接的全部内存缓存 */
export function clearKeyMemoryCacheForConn(connId: string): void {
  dropWhere(ck => ck.startsWith(`${connId}\0`))
  keyMemoryGeneration.value++
}

function dropWhere(pred: (ck: string) => boolean): void {
  for (const ck of cache.keys()) {
    if (pred(ck)) cache.delete(ck)
  }
  for (const ck of queued.keys()) {
    if (pred(ck)) queued.delete(ck)
  }
}

/** 排队。已有结果时取消函数是空操作。行滚出视口时调用返回的函数，避免白查 */
export function enqueueKeyMemory(
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): () => void {
  const ck = cacheKey(connId, db, redisKey)
  if (cache.has(ck)) return () => {}

  pins.set(ck, (pins.get(ck) ?? 0) + 1)
  queued.set(ck, { connId, redisKey })
  schedule()

  let active = true
  return () => {
    if (!active) return
    active = false
    const left = (pins.get(ck) ?? 1) - 1
    if (left > 0) {
      pins.set(ck, left)
      return
    }
    pins.delete(ck)
    queued.delete(ck)
  }
}

function schedule(): void {
  if (flushing || timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, DEBOUNCE_MS)
}

function isUnsupported(message: string): boolean {
  const text = message.toLowerCase()
  return UNSUPPORTED_HINTS.some(hint => text.includes(hint))
}

async function flush(): Promise<void> {
  if (flushing) return
  const batch: { ck: string; entry: Queued }[] = []
  let connId = ''
  for (const [ck, entry] of queued) {
    if ((pins.get(ck) ?? 0) <= 0) {
      queued.delete(ck)
      continue
    }
    if (!connId) connId = entry.connId
    if (entry.connId !== connId) continue
    batch.push({ ck, entry })
    if (batch.length >= BATCH) break
  }
  if (batch.length === 0) return
  for (const item of batch) queued.delete(item.ck)

  flushing = true
  const generation = keyMemoryGeneration.value
  try {
    const sizes = await meCommands.keyMemory(
      connId,
      batch.map(item => item.entry.redisKey),
      false,
    )
    if (generation !== keyMemoryGeneration.value) return
    batch.forEach((item, index) => {
      // 详情写回可能更晚、更准，已有值就不被这批旧结果盖掉
      if (!cache.has(item.ck)) cache.set(item.ck, sizes[index] ?? null)
    })
  } catch (error) {
    if (generation !== keyMemoryGeneration.value) return
    const message = error instanceof Error ? error.message : String(error)
    if (isUnsupported(message)) {
      onUnsupported?.(connId)
    } else {
      // 临时失败记成空，避免同一批反复打。刷新列表会清掉再查。
      for (const item of batch) {
        if (!cache.has(item.ck)) cache.set(item.ck, null)
      }
    }
  } finally {
    flushing = false
    if (queued.size > 0) schedule()
  }
}
