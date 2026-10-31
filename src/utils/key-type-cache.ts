import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { meCommands } from '@/utils/me-commands'
import { redisKeyId } from '@/utils/redis-key'

/** 连接 + db + 键身份 → TYPE 结果；UTF-8 省略 bytes 时用 key 作缓存键 */
const cache = new Map<string, string>()
const pending = new Map<string, Promise<string | undefined>>()

function cacheKey(connId: string, db: number, redisKey: RedisKey_Deserialize): string {
  return `${connId}\0${db}\0${redisKeyId(redisKey)}`
}

/** 单键删除/重命名：按身份精确失效 */
export function invalidateKeyType(connId: string, redisKey: RedisKey_Deserialize): void {
  const id = redisKeyId(redisKey)
  const suffix = `\0${id}`
  for (const k of cache.keys()) {
    if (k.startsWith(`${connId}\0`) && k.endsWith(suffix)) {
      cache.delete(k)
      pending.delete(k)
    }
  }
}

/** 关闭/切换连接、批量删、FLUSHDB：丢弃该连接的全部 TYPE 缓存 */
export function clearKeyTypeCacheForConn(connId: string): void {
  const prefix = `${connId}\0`
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) {
      cache.delete(k)
      pending.delete(k)
    }
  }
}

async function fetchKeyType(
  connId: string,
  redisKey: RedisKey_Deserialize,
): Promise<string | undefined> {
  try {
    return (await meCommands.keyType(connId, redisKey, false))?.toUpperCase()
  } catch {
    return undefined
  }
}

export async function resolveKeyType(
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): Promise<string | undefined> {
  const ck = cacheKey(connId, db, redisKey)
  const hit = cache.get(ck)
  if (hit) return hit

  let req = pending.get(ck)
  if (!req) {
    req = fetchKeyType(connId, redisKey)
      .then(upper => {
        if (upper) cache.set(ck, upper)
        return upper
      })
      .finally(() => {
        pending.delete(ck)
      })
    pending.set(ck, req)
  }
  return req
}
