<script setup lang="ts">
// 二级菜单用 Element Plus 悬停下拉。挂在外层弹层内，点击才不会被当成点外面
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

defineProps<{
  icon: string
  title: string
  maxHeight?: number | string
  /** 点选后不收起，放大/缩小可以连点 */
  keepOpen?: boolean
}>()

const emit = defineEmits<{ command: [value: string] }>()

// 挂进外层 .el-popper。全屏切换会挪走弹层，悬停前再对一次
const rowEl = useTemplateRef<HTMLElement>('rowEl')
const appendTo = ref<HTMLElement | string>('body')
function syncAppend() {
  const popper = rowEl.value?.closest('.el-popper')
  appendTo.value = popper instanceof HTMLElement ? popper : 'body'
}
onMounted(() => {
  syncAppend()
  document.addEventListener('fullscreenchange', syncAppend)
})
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncAppend))

// 右侧不够改左侧，下方不够则同一侧向上对齐。fixed 避免挂进父弹层后定位被带着跑
const popperOptions = {
  strategy: 'fixed',
  modifiers: [
    { name: 'flip', options: { fallbackPlacements: ['right-end', 'left-start', 'left-end'] } },
    { name: 'offset', options: { offset: [0, -8] } },
  ],
}

function onCommand(command: unknown) {
  if (typeof command !== 'string' || !command) return
  emit('command', command)
}
</script>

<template>
  <el-dropdown-item>
    <el-dropdown
      class="me-code-menu-sub"
      trigger="hover"
      placement="right-start"
      :show-arrow="false"
      :show-timeout="0"
      :hide-timeout="300"
      :hide-on-click="!keepOpen"
      :max-height="maxHeight"
      :append-to="appendTo"
      popper-class="me-code-menu"
      :popper-options="popperOptions"
      @command="onCommand">
      <span ref="rowEl" class="me-code-menu-row" @mouseenter="syncAppend" @click.stop>
        <me-icon class="me-code-menu-label" :icon="icon" :name="title" />
        <me-icon class="me-code-menu-arrow" icon="el-icon-arrow-right" />
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <slot />
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </el-dropdown-item>
</template>
