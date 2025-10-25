<script setup>
import 'dayjs/locale/zh-cn'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AppMain from '@/views/AppMain.vue'
</script>

<template>
  <el-config-provider :locale="zhCn">
    <AppMain/>
  </el-config-provider>
</template>

<style lang="scss">
#app {
  padding: 5px;
  height: 100%;
  overflow: hidden;
}
</style>