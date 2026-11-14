<script setup lang="ts">
// 说明: 自定义右键菜单（使用el-dropdown的虚拟触发实现）
import { ref, useTemplateRef } from 'vue'

withDefaults(
  defineProps<{
    /** 默认挂到 body。全屏容器内传 false，菜单才能画在全屏元素里 */
    teleported?: boolean
    popperClass?: string
    /** 点菜单项后是否收起。代码编辑器里放大/缩小要连点，由调用方自己关 */
    hideOnClick?: boolean
  }>(),
  { teleported: true, popperClass: '', hideOnClick: true },
)

function closeMenu(): void {
  dropdownRef.value?.handleClose()
}

defineExpose({ showMenu, closeMenu })
const emit = defineEmits(['handleCommand', 'handleClose'])

const dropdownRef = useTemplateRef('dropdownRef')
const position = ref({ top: 0, left: 0, bottom: 0, right: 0 })
const triggerRef = ref({ getBoundingClientRect: () => position.value })

function showMenu(e: MouseEvent): void {
  const { clientX, clientY } = e
  position.value = DOMRect.fromRect({ x: clientX, y: clientY })
  e.preventDefault()
  dropdownRef.value?.handleOpen()
}

function handleCommand(command: string): void {
  emit('handleCommand', command)
}

function handleClose(isOpen: boolean): void {
  if (!isOpen) {
    emit('handleClose')
  }
}
</script>

<template>
  <el-dropdown
    ref="dropdownRef"
    @command="handleCommand"
    @visible-change="handleClose"
    :virtual-ref="triggerRef"
    virtual-triggering
    :show-arrow="false"
    :teleported="teleported"
    :popper-class="popperClass"
    :hide-on-click="hideOnClick"
    trigger="contextmenu"
    placement="bottom-start">
    <template #dropdown>
      <slot />
    </template>
  </el-dropdown>
</template>
