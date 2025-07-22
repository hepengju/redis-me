<script setup>
const {filterKeyList} = defineProps({
  color: {type: String, default: ''},
  redisKey: {type: Object, default: {}},
  filterKeyList: {type: Array, default: []}
})

const emit = defineEmits(['chooseKey'])
</script>

// TODO 后期考虑是否改为虚拟化列表
<template>
  <div :style="{color: color, height: '100%'}">
    <div v-if="filterKeyList.length > 0">
      <div v-for="item in filterKeyList" @click="emit('chooseKey', item)"
           class="key single-line-ellipsis"
           :style="item.bytes === redisKey.bytes ? {backgroundColor: 'var(--el-color-info-light-7)'} : {}">
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
  font-size: 14px;
  line-height: 14px;
  padding: 4px;

  &:hover {
    background-color: var(--el-color-info-light-7);
  }
}
</style>