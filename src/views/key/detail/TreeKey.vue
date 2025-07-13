<script setup>
// 全局对象
import useGlobalStore from '@/utils/store.js'
const global = useGlobalStore()

const {filterKeyList} = defineProps({
  filterKeyList: {type: Array, default: []}
})

const filterKeyTree = computed(() => {

})

function listToTree(keyList) {
  keyList.forEach(key => {
    const index = key.indexOf(':')
    if (index > -1) {
      const label = key.substring(0, index)
      const value = key.substring(index + 1)
    }
  })
  const node = {
    label: '',
    children: []
  }
}

function getKey(item) {
  global.redisKey = item
}
</script>

<template>
  <div :style="{color: global.conn?.color}">
    <div v-for="item in filterKeyList" @click="getKey(item)"
         class="key" :style="item.bytes === global.redisKey?.bytes ? {backgroundColor: 'var(--el-color-info-light-5)'} : {}">
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