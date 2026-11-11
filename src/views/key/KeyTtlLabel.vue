<script setup lang="ts">
import { computed, inject, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { cachedKeyTtl, enqueueKeyTtl, keyTtlGeneration } from '@/utils/key-ttl-cache'
import { formatKeyTtlRemain } from '@/utils/ttl'

// 叶子行右侧 TTL。只挂载可见行；结果进 key-ttl-cache，不每秒倒计时。
const share = inject(shareProvideKey)!
const { t } = useI18n()
const props = defineProps<{ redisKey?: RedisKey_Deserialize | null }>()

const entry = computed(() => {
  const redisKey = props.redisKey
  const conn = share.conn
  if (!redisKey || !conn) return undefined
  return cachedKeyTtl(conn.id, conn.db, redisKey)
})

const label = computed(() => {
  const value = entry.value
  if (!value || value.kind === 'none') return ''
  if (value.kind === 'forever') return t('redisValue.ttlForever')
  return formatKeyTtlRemain(value.at)
})

let cancel: (() => void) | null = null

function stop(): void {
  cancel?.()
  cancel = null
}

watch(
  () =>
    [
      props.redisKey?.key,
      props.redisKey?.bytes,
      share.conn?.id,
      share.conn?.db,
      keyTtlGeneration.value,
    ] as const,
  () => {
    stop()
    const redisKey = props.redisKey
    const conn = share.conn
    if (!redisKey || !conn) return
    cancel = enqueueKeyTtl(conn.id, conn.db, redisKey)
  },
  { immediate: true },
)

onUnmounted(stop)
</script>

<template>
  <span class="key-ttl">{{ label }}</span>
</template>

<style scoped lang="scss">
.key-ttl {
  display: inline-block;
  width: 60px;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 14px;
  color: var(--el-color-info);
  opacity: 0.7;
}
</style>
