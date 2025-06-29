<script setup>
import {filterKeys} from '@/utils/store.ts'
</script>

<template>
  <div v-for="item in filterKeys" class="key">
    {{item.key}}
  </div>
</template>

<style scoped lang="scss">
// 可以点击的键
.key {
  cursor: pointer;

  // 省略号
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>