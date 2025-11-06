<script setup lang="ts">
// 说明: 自定义弹框，支持最大化
const fullscreen = ref(false)
defineProps({
  title: String,
})
</script>

<template>
  <el-dialog v-bind="$attrs" align-center draggable :fullscreen="fullscreen" @closed="fullscreen=false" append-to-body>
      <template #header>
        <div class="me-flex">
          <div>{{ title }}</div>
          <me-icon :icon="fullscreen ? 'me-icon-window-restore' : 'me-icon-window-maximize'" class="fullscreen-icon" @click="fullscreen = !fullscreen"/>
        </div>
      </template>

      <template #default>
        <div :style="{height:fullscreen ? 'calc(100vh - 80px)' : '60vh'}">
          <slot name="default"></slot>
        </div>
      </template>
  </el-dialog>
</template>