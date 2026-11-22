<script setup lang="ts">
/** TTL 时长/时刻共用的模式选择。根节点必须是 el-select，才能嵌进 input-group 的 prepend */
import type { TtlMode } from '@/utils/redis/ttl'

defineProps<{
  disabled?: boolean
  selectStyle: Record<string, string>
  options: { value: TtlMode; label: string }[]
}>()

const mode = defineModel<TtlMode>({ required: true })
</script>

<template>
  <el-select v-model="mode" :disabled="disabled" :style="selectStyle">
    <el-option v-for="opt in options" :key="opt.value" :label="opt.label" :value="opt.value" />
  </el-select>
</template>
