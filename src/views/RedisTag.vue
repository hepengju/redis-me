<script setup lang="ts">
import RedisInfo from '@/views/tag/RedisServer.vue'
import RedisValue from '@/views/tag/RedisValue.vue'
import RedisConsole from '@/views/tag/RedisConsole.vue'
</script>

<template>
  <div class="container">
    <el-tabs type="border-card" style="height: 100%">
      <RedisInfo/>
      <RedisValue/>
      <RedisConsole/>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">

</style>