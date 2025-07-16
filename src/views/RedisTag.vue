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
  <el-tabs class="redis-tag" v-model="global.tabName" type="border-card" addable>
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

    <!-- 此处利用tab的新增按钮位置放置一个redis值的编辑功能 -->
    <template #add-icon>
      <el-switch v-model="global.readonly" v-if="global.tabName === 'value'"
                 inline-prompt active-text="只读" inactive-text="编辑"
                 style="margin-right: 60px;--el-switch-on-color: #13ce66"/>
    </template>
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