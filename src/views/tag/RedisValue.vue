<script setup>
// 全局对象
import useGlobalStore from '@/utils/store.js'

const global = useGlobalStore()

</script>

<template>
  <div class="redis-value">
    <div v-if="global.redisValue">
      TODO 值显示与编辑
      {{global.redisValue}}
    </div>
    <el-empty v-else description="键不存在 或 未选择任何键"></el-empty>
  </div>
</template>

<style scoped lang="scss">

</style>