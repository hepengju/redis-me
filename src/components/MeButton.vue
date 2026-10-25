<script setup lang="ts">
// 说明: 支持tooltip的按钮；info 传纯文本，需要富文本/多行时用 #content 插槽
import { computed, useSlots } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ info?: string; placement?: string; icon?: string; loading?: boolean }>(),
  { info: '', placement: 'auto', icon: '', loading: false },
)

/** 与 MeIcon 一致：el-icon-xxx 走 Element Plus 原生图标 */
const isElIcon = computed(() => props.icon.startsWith('el-icon-'))

// content 专供 tooltip 内容，其余插槽透传给 el-button（避免把 content 误挂到按钮上）
const slots = useSlots()
const buttonSlots = computed(() => Object.keys(slots).filter(key => key !== 'content'))
</script>

<template>
  <el-tooltip :disabled="!info && !slots.content" :content="info" :show-after="1000" :placement>
    <template v-if="slots.content" #content>
      <slot name="content" />
    </template>
    <el-button
      v-bind="$attrs"
      :loading="props.loading"
      :icon="!props.loading && isElIcon ? icon : undefined">
      <template v-if="icon && !isElIcon && !props.loading" #icon>
        <SvgIcon :name="icon" />
      </template>
      <template v-for="key in buttonSlots" v-slot:[key]>
        <slot :name="key" />
      </template>
    </el-button>
  </el-tooltip>
</template>
