<script setup lang="ts">
// 说明: 支持tooltip的按钮
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ info?: string; placement?: string; icon?: string; loading?: boolean }>(),
  { info: '', placement: 'auto', icon: '', loading: false },
)

/** 与 MeIcon 一致：el-icon-xxx 走 Element Plus 原生图标 */
const isElIcon = computed(() => props.icon.startsWith('el-icon-'))
</script>

<template>
  <el-tooltip :disabled="!info" :content="info" :show-after="1000" :placement>
    <el-button
      v-bind="$attrs"
      :loading="props.loading"
      :icon="!props.loading && isElIcon ? icon : undefined">
      <template v-if="icon && !isElIcon && !props.loading" #icon>
        <SvgIcon :name="icon" />
      </template>
      <template v-for="(, key) in $slots" v-slot:[key]>
        <slot :name="key" />
      </template>
    </el-button>
  </el-tooltip>
</template>
