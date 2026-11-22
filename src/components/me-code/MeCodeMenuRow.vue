<script setup lang="ts">
/** 代码编辑器 / 终端右键菜单行：左图标文案，右快捷键。样式类与 MeCode 全局菜单样式共用 */
defineProps<{ icon: string; name: string; shortcut: string }>()
</script>

<template>
  <span class="me-code-menu-row">
    <me-icon class="me-code-menu-label" :icon="icon" :name="name" />
    <span class="me-code-menu-key">{{ shortcut }}</span>
  </span>
</template>
