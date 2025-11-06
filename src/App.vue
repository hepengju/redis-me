<script setup>
import 'dayjs/locale/zh-cn'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AppMain from '@/views/AppMain.vue'
import AppTitle from '@/views/ext/AppTitle.vue'
</script>

<template>
  <el-config-provider :locale="zhCn">
    <AppTitle/>
    <Suspense>
      <AppMain/>
    </Suspense>
  </el-config-provider>
</template>

<style lang="scss">
#app {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;
}
</style>