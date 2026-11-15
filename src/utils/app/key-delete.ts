/** Redis 键删除：确认框 + meCommands + 缓存失效 + 总线 */
import i18n from '@/locales'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { bus, KEY_DELETE } from '@/utils/app/bus'
import { meConfirm, meOk } from '@/utils/app/feedback'
import { meCommands } from '@/utils/app/me-commands'
import { invalidateKeyMemory } from '@/utils/redis/key-memory-cache'
import { invalidateKeyTtl } from '@/utils/redis/key-ttl-cache'
import { invalidateKeyType } from '@/utils/redis/key-type-cache'

const t = i18n.global.t

export function meDeleteKey(id: string, redisKey: RedisKey_Deserialize, thenFn?: () => void): void {
  meConfirm(t('util.deleteKey', { key: redisKey.key }), async () => {
    await meCommands.del(id, redisKey)
    invalidateKeyType(id, redisKey)
    invalidateKeyMemory(id, redisKey)
    invalidateKeyTtl(id, redisKey)
    bus.emit(KEY_DELETE, redisKey)
    meOk(t('deleteOk'))
    thenFn?.()
  })
}
