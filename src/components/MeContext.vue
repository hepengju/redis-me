<script setup>
import {ref, useTemplateRef} from 'vue'

defineExpose({showMenu})
const emit = defineEmits(['handleCommand'])

const dropdownRef = useTemplateRef('dropdownRef')
const position = ref({top: 0, left: 0, bottom: 0, right: 0})
const triggerRef = ref({
  getBoundingClientRect: () => position.value,
})

// 显示菜单
function showMenu(e) {
  const {clientX, clientY} = e
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  e.preventDefault()
  dropdownRef.value?.handleOpen()
}

// 处理上下文命令
function handleCommand(command) {
  emit('handleCommand', command)
}
</script>

<template>
  <el-dropdown ref="dropdownRef"
               @command="handleCommand"
               :virtual-ref="triggerRef"
               virtual-triggering
               :show-arrow="false"
               trigger="contextmenu"
               placement="bottom-start">
    <template #dropdown>
      <slot></slot>
    </template>
  </el-dropdown>
</template>
