/**
 * Redis 键身份：SCAN 对合法 UTF-8 可省略 bytes（空串），比对不能只用 bytes ===。
 * 统一走 redisKeyId（UTF-8 有无 bytes 归一），保证收藏/缓存/列表删除一致。
 */
import { base64ToUtf8Text } from '@/utils/codec/detect-view-format'
import { utf8TextToBase64 } from '@/utils/codec/format'

export type RedisKeyLike = { key: string; bytes: string }

export function sameRedisKey(a: RedisKeyLike, b: RedisKeyLike): boolean {
  return redisKeyId(a) === redisKeyId(b)
}

/**
 * 稳定缓存/集合 id：合法 UTF-8（含旧数据带 base64）统一为 `k\0${text}`，
 * 仅非法 UTF-8 用 `b\0${base64}`，避免省略 bytes 前后缓存键分裂。
 */
export function redisKeyId(rk: RedisKeyLike): string {
  if (rk.bytes) {
    const decoded = base64ToUtf8Text(rk.bytes)
    if (decoded !== null) return `k\0${decoded}`
    return `b\0${rk.bytes}`
  }
  return `k\0${rk.key}`
}

/** 重命名/复制切 hex 等编码时：有 bytes 用 bytes，否则用 key 的 UTF-8 wire */
export function redisKeyWireBase64(rk: RedisKeyLike): string {
  return rk.bytes || utf8TextToBase64(rk.key)
}
