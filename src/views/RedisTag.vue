<script setup>
import useGlobalStore from '@/utils/store.js'
import RedisConsole from './tag/RedisConsole.vue'
import RedisInfo from './tag/RedisInfo.vue'
import RedisMemory from './tag/RedisMemory.vue'
import RedisSlow from './tag/RedisSlow.vue'
import RedisValue from './tag/RedisValue.vue'


const global = useGlobalStore()
</script>

<template>
  <el-tabs v-model="global.tabName" type="border-card" class="redis-tag">
    <el-tab-pane name="info">
      <template #label>
        <me-icon name="信息" icon="el-icon-calendar"/>
      </template>
      <RedisInfo/>
    </el-tab-pane>

    <el-tab-pane name="value" lazy>
      <template #label>
        <me-icon name="键值" icon="el-icon-key"/>
      </template>
      <RedisValue/>
    </el-tab-pane>

    <el-tab-pane name="console" lazy>
      <template #label>
        <me-icon name="终端" icon="me-icon-console"/>
      </template>
      <RedisConsole/>
    </el-tab-pane>

    <el-tab-pane name="memory" lazy>
      <template #label>
        <me-icon name="内存分析" icon="me-icon-memory"/>
      </template>
      <RedisMemory/>
    </el-tab-pane>

    <el-tab-pane name="slow" lazy>
      <template #label>
        <me-icon name="慢查询" icon="me-icon-slow"/>
      </template>
      <RedisSlow/>
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped lang="scss">
.redis-tag {
  //border: 2px solid red;
  height: 100%;

  :deep(.el-tab-pane) {
    height: 100%;
  }
}
</style>