<script setup>
import 'dayjs/locale/zh-cn'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import RedisMain from '@/views/RedisMain.vue'
</script>

<template>
  <el-config-provider :locale="zhCn">
    <RedisMain/>
  </el-config-provider>
</template>

<style lang="scss">
#app {
  padding: 5px;
  height: 100%;
  overflow: hidden;
}
</style>