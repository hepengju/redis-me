<script setup>
// 全局对象
import useGlobalStore from '@/utils/store.js'
const global = useGlobalStore()

const {filterKeyList} = defineProps({
  filterKeyList: {type: Array, default: []}
})

function getKey(item) {
  global.redisKey = item
}
</script>

<template>
  <div :style="{color: global.conn?.color, height: '100%'}">
    <div v-for="item in filterKeyList" @click="getKey(item)"
         class="key single-line-ellipsis" :style="item.bytes === global.redisKey?.bytes ? {backgroundColor: 'var(--el-color-info-light-5)'} : {}">
      <span>{{ item.key }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.key {
  cursor: pointer;
  font-size: 12px;
  line-height: 12px;
  padding: 3px;

  &:hover {
    background-color: var(--el-color-info-light-7);
  }
}
</style>