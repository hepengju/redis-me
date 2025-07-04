<script setup>
import store from '@/utils/store.js'

const filterKeys = reactive([])
function getKey(){

}
function customType(item) {
  return item.bytes === store.redisKey?.bytes ? 'success' : 'primary'
}
</script>

<template>
  <div v-for="item in filterKeys" @click="getKey(item)" >
    <el-link :type="customType(item)" icon="el-icon-key" underline="never">
      <span class="key">{{ item.key }}</span>
    </el-link>
  </div>
</template>

<style scoped lang="scss">
.key {
  //overflow: hidden;
  white-space: nowrap;
  //text-overflow: ellipsis;
}
</style>