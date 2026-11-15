<script setup lang="ts">
import { computed, inject, onUnmounted, watch } from 'vue'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { meHumanSize } from '@/utils/app/util'
import {
  cachedKeyMemory,
  enqueueKeyMemory,
  keyMemoryGeneration,
} from '@/utils/redis/key-memory-cache'

// 叶子行右侧内存。只挂载可见行；结果进 key-memory-cache，滚回来不再请求。
const share = inject(shareProvideKey)!
const props = defineProps<{ redisKey?: RedisKey_Deserialize | null }>()

const size = computed(() => {
  const redisKey = props.redisKey
  const conn = share.conn
  if (!redisKey || !conn) return undefined
  return cachedKeyMemory(conn.id, conn.db, redisKey)
})

// 按当前单位四舍五入到整数：48B、4K、1M，不保留小数
const label = computed(() =>
  size.value != null && size.value > 0 ? meHumanSize(size.value, '', 0) : '',
)

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
      keyMemoryGeneration.value,
    ] as const,
  () => {
    stop()
    const redisKey = props.redisKey
    const conn = share.conn
    if (!redisKey || !conn) return
    cancel = enqueueKeyMemory(conn.id, conn.db, redisKey)
  },
  { immediate: true },
)

onUnmounted(stop)
</script>

<template>
  <span class="key-memory">{{ label }}</span>
</template>

<style scoped lang="scss">
.key-memory {
  display: inline-block;
  width: 52px;
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
