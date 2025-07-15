<script setup>
// 全局对象
import useGlobalStore from '@/utils/store.js'
const global = useGlobalStore()

const {filterKeyList} = defineProps({
  filterKeyList: {type: Array, default: []}
})

const emit = defineEmits(['chooseKey'])
</script>

// TODO 后期考虑是否改为虚拟化列表
<template>
  <div :style="{color: global.color, height: '100%'}">
    <div v-if="filterKeyList.length > 0">
      <div v-for="item in filterKeyList" @click="emit('chooseKey', item)"
           class="key single-line-ellipsis"
           :style="item.bytes === global.redisKey?.bytes ? {backgroundColor: 'var(--el-color-info-light-7)'} : {}">
        <span>{{ item.key }}</span>
      </div>
    </div>
    <div v-else>
      <!-- 和el-tree的empty-data保持一致 -->
      <div class="el-tree__empty-block"><span class="el-tree__empty-text">没有数据</span></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.key {
  cursor: pointer;
  font-size: 12px;
  line-height: 12px;
  padding: 4px;

  &:hover {
    background-color: var(--el-color-info-light-7);
  }
}
</style>