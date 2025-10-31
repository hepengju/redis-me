<script setup>
import RedisInfo from './tag/RedisInfo.vue'
import RedisValue from './tag/RedisValue.vue'
import RedisSlow from './tag/RedisSlow.vue'
import RedisMemory from './tag/RedisMemory.vue'
import RedisTerminal from './tag/RedisTerminal.vue'
import RedisConfig from './tag/RedisConfig.vue'
import RedisClient from './tag/RedisClient.vue'
import RedisMonitor from './tag/RedisMonitor.vue'
// import RedisPubsub from './tag/RedisPubsub.vue'
// import RedisDemo from '@/views/tag/RedisDemo.vue'
// import RedisTauri from './tag/RedisTauri.vue'

// 共享数据
const share = inject('share')
const canEdit = computed(() => true)
</script>

<template>
  <el-tabs class="redis-tag" v-model="share.tabName" type="border-card">
    <!--
    <el-tab-pane name="demo">
      <template #label>
        <me-icon name="测试" icon="el-icon-calendar"/>
      </template>
      <RedisDemo/>
    </el-tab-pane>-->

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

    <el-tab-pane name="config" lazy>
      <template #label>
        <me-icon name="配置" icon="el-icon-wallet"/>
      </template>
      <RedisConfig/>
    </el-tab-pane>

    <el-tab-pane name="memory" lazy v-if="canEdit">
      <template #label>
        <me-icon name="内存" icon="me-icon-memory"/>
      </template>
      <RedisMemory/>
    </el-tab-pane>

    <el-tab-pane name="slow" lazy>
      <template #label>
        <me-icon name="慢日志" icon="me-icon-slow"/>
      </template>
      <RedisSlow/>
    </el-tab-pane>

    <el-tab-pane name="client" lazy>
      <template #label>
        <me-icon name="客户端" icon="el-icon-mic"/>
      </template>
      <RedisClient/>
    </el-tab-pane>

    <el-tab-pane name="monitor" lazy v-if="canEdit">
      <template #label>
        <me-icon name="监控" icon="el-icon-monitor"/>
      </template>
      <RedisMonitor/>
    </el-tab-pane>

    <!--    <el-tab-pane name="pubsub" lazy v-if="canEdit">-->
    <!--      <template #label>-->
    <!--        <me-icon name="发布订阅" icon="me-icon-pubsub"/>-->
    <!--      </template>-->
    <!--      <RedisPubsub/>-->
    <!--    </el-tab-pane>-->


  </el-tabs>
</template>

<style scoped lang="scss">
.redis-tag {
  //border: 2px solid red;
  height: 100%;

  :deep(.el-tab-pane) {
    height: 100%;
  }

  :deep(.el-tabs__new-tab) {
    border: none;
  }
}
</style>
