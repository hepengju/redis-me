<script setup lang="ts">
import RedisInfo from './tags/RedisInfo.vue'
import RedisValue from './tags/RedisValue.vue'
import RedisConsole from './tags/RedisConsole.vue'
import MetaIcon from '@/components/MetaIcon.vue'

const activeTabName = ref('info')
</script>

<template>
  <div class="container">
    <el-tabs v-model="activeTabName" type="border-card" style="height: 100%">
      <el-tab-pane name="info">
        <template #label>
          <MetaIcon name="信息" icon="el-icon-calendar"/>
        </template>
        <RedisInfo/>
      </el-tab-pane>

      <el-tab-pane name="value" lazy>
        <template #label>
          <MetaIcon name="键值" icon="el-icon-key"/>
        </template>
        <RedisValue/>
      </el-tab-pane>

      <el-tab-pane name="console" lazy>
        <template #label>
          <MetaIcon name="终端" icon="my-icon-console"/>
        </template>
        <RedisConsole/>
      </el-tab-pane>

      <el-tab-pane name="memory" lazy>
        <template #label>
          <MetaIcon name="内存分析" icon="my-icon-memory"/>
        </template>
        <RedisConsole/>
      </el-tab-pane>

      <el-tab-pane name="slow" lazy>
        <template #label>
          <MetaIcon name="慢查询" icon="my-icon-slow"/>
        </template>
        <RedisConsole/>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.container {
  border: 1px solid skyblue;
}
</style>