<script setup lang="ts">
/** 仅在 Hash TTL tooltip 打开时挂载，用自己的秒级时钟刷新剩余；不影响表格 */
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { formatFieldTtlTooltip } from './helpers'

const props = defineProps<{ ttl?: number | null; expireAtMs?: number | null }>()

const { t } = useI18n()
const now = useNow({ interval: 1000 })
const html = computed(() =>
  formatFieldTtlTooltip(
    props.ttl,
    props.expireAtMs,
    t('redisValue.ttlFieldExpired'),
    now.value.getTime(),
  ),
)
</script>

<template>
  <span v-html="html" />
</template>
