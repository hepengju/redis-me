import { reactive, ref } from 'vue'

import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { meCommands } from '@/utils/me-commands'
import { redisKeyId } from '@/utils/redis-key'
import { pttlToEntry, type KeyTtlEntry } from '@/utils/ttl'

/**
 * 键列表 PTTL 缓存。开关打开后，可见叶子攒成一批 pipeline。
 * 命中后滚回来不再请求；文字不倒计时，重绘时用到期时刻重算。
 * 刷新、删除、重命名、FLUSH、本客户端改 TTL 时清掉。
 */

const cache = reactive(new Map<string, KeyTtlEntry>())
/** 整连接清空或单键失效时递增。在途的批量结果对不上就丢弃，避免改完 TTL 又被旧 PTTL 盖回去 */
export const keyTtlGeneration = ref(0)

type Queued = { connId: string; redisKey: RedisKey_Deserialize }

const queued = new Map<string, Queued>()
/** 仍挂在视口里、还没查到的行数。减到 0 就从队列拿掉 */
const pins = new Map<string, number>()
let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false

const BATCH = 200
const DEBOUNCE_MS = 40

function cacheKey(connId: string, db: number, redisKey: RedisKey_Deserialize): string {
  return `${connId}\0${db}\0${redisKeyId(redisKey)}`
}

/** undefined = 还没查 */
export function cachedKeyTtl(
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): KeyTtlEntry | undefined {
  return cache.get(cacheKey(connId, db, redisKey))
}

/** 单键删除、重命名、改 TTL、整键 SET（会重写过期） */
export function invalidateKeyTtl(connId: string, redisKey: RedisKey_Deserialize): void {
  const suffix = `\0${redisKeyId(redisKey)}`
  dropWhere(ck => ck.startsWith(`${connId}\0`) && ck.endsWith(suffix))
  keyTtlGeneration.value++
}

export function invalidateKeyTtlList(connId: string, keys: RedisKey_Deserialize[]): void {
  for (const redisKey of keys) {
    const suffix = `\0${redisKeyId(redisKey)}`
    dropWhere(ck => ck.startsWith(`${connId}\0`) && ck.endsWith(suffix))
  }
  keyTtlGeneration.value++
}

/** 关闭/切换连接、批量删、FLUSHDB、刷新列表 */
export function clearKeyTtlCacheForConn(connId: string): void {
  dropWhere(ck => ck.startsWith(`${connId}\0`))
  keyTtlGeneration.value++
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
export function enqueueKeyTtl(
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
  const generation = keyTtlGeneration.value
  try {
    const ttls = await meCommands.keyPttl(
      connId,
      batch.map(item => item.entry.redisKey),
      false,
    )
    // 用结果回到本地的时刻换算到期时间，不把整段往返算进剩余时间
    const fetchedAt = Date.now()
    if (generation !== keyTtlGeneration.value) return
    batch.forEach((item, index) => {
      if (!cache.has(item.ck)) cache.set(item.ck, pttlToEntry(ttls[index] ?? -2, fetchedAt))
    })
  } catch {
    if (generation !== keyTtlGeneration.value) return
    // 临时失败或没权限：记成空，避免同一批反复打。刷新列表会清掉再查。
    for (const item of batch) {
      if (!cache.has(item.ck)) cache.set(item.ck, { kind: 'none' })
    }
  } finally {
    flushing = false
    if (queued.size > 0) schedule()
  }
}
