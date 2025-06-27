<script setup lang="ts">
import RedisInfo from '@/views/tag/RedisInfo.vue'
import RedisValue from '@/views/tag/RedisValue.vue'
import RedisConsole from '@/views/tag/RedisConsole.vue'
import MetaIcon from '@/components/MetaIcon.vue'
import RedisSlow from '@/views/tag/RedisSlow.vue'
import RedisMemory from '@/views/tag/RedisMemory.vue'

const activeTabName = ref('info')
</script>

<template>
  <el-tabs v-model="activeTabName" type="border-card" class="container">
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
      <RedisMemory/>
    </el-tab-pane>

    <el-tab-pane name="slow" lazy>
      <template #label>
        <MetaIcon name="慢查询" icon="my-icon-slow"/>
      </template>
      <RedisSlow/>
    </el-tab-pane>
  </el-tabs>
</template>