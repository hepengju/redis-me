<script setup>
import RedisInfo from './tab/RedisInfo.vue'
import RedisValue from './tab/RedisValue.vue'
import RedisSlow from './tab/RedisSlow.vue'
import RedisMemory from './tab/RedisMemory.vue'
import RedisTerminal from './tab/RedisTerminal.vue'
import RedisConfig from './tab/RedisConfig.vue'
import RedisClient from './tab/RedisClient.vue'
import RedisMonitor from './tab/RedisMonitor.vue'
import RedisPubsub from './tab/RedisPubsub.vue'
// import RedisDemo from '@/views/tab/RedisDemo.vue'
// import RedisTauri from './tab/RedisTauri.vue'

// 共享数据
const share = inject('share')
const canEdit = computed(() => true)
</script>

<template>
  <el-tabs class="redis-tag" v-model="share.tabName">
    <!--
    <el-tab-pane name="tauri" lazy>
      <template #label>
        <me-icon name="Tauri" icon="el-icon-data-line"/>
      </template>
      <RedisTauri/>
    </el-tab-pane>
    -->

    <el-tab-pane name="info">
      <template #label>
        <me-icon name="信息" icon="el-icon-calendar"/>
      </template>
      <RedisInfo/>
    </el-tab-pane>

    <el-tab-pane name="value">
      <template #label>
        <me-icon name="键值" icon="el-icon-memo"/>
      </template>
      <RedisValue/>
    </el-tab-pane>

    <el-tab-pane name="console" lazy v-if="canEdit">
      <template #label>
        <me-icon name="终端" icon="me-icon-console"/>
      </template>
      <RedisTerminal/>
    </el-tab-pane>

    <el-tab-pane name="slow" lazy>
      <template #label>
        <me-icon name="慢日志" icon="me-icon-slow"/>
      </template>
      <RedisSlow/>
    </el-tab-pane>

    <el-tab-pane name="monitor" lazy v-if="canEdit">
      <template #label>
        <me-icon name="监控" icon="el-icon-monitor"/>
      </template>
      <RedisMonitor/>
    </el-tab-pane>

    <el-tab-pane name="pubsub" lazy v-if="canEdit">
      <template #label>
        <me-icon name="发布订阅" icon="me-icon-pubsub"/>
      </template>
      <RedisPubsub/>
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped lang="scss">
.redis-tag {
  //border: 2px solid red;
  border: 1px solid var(--el-border-color);
  padding: 0 10px 10px 10px;
  height: 100%;

  //:deep(.el-tabs--border-card) {
  //  border: 1px solid var(--el-border-color);
  //}

  :deep(.el-tab-pane) {
    height: 100%;
  }

  //:deep(.el-tabs__new-tab) {
  //  border: none;
  //}
}
</style>
