<script setup>
import store from '@/utils/store.js'
import {colorStyle} from '@/utils/store.js'

const filterKeys = computed(() => store.keys.slice(0, 50))

</script>

<template>
  <div v-for="item in filterKeys" class="key" :style="colorStyle">
    {{item.key}}
  </div>
</template>


<style scoped lang="scss">
.key {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-color-primary);

  // 省略号
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>