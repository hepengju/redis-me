<script setup lang="ts">
import { computed, inject } from 'vue'

import { shareProvideKey } from '@/types/me-interface'
import { isConnMinimalMode } from '@/utils/conn'
import RedisChart from '@/views/tab/RedisChart.vue'
import RedisInfo from '@/views/tab/RedisInfo/index.vue'
import RedisMemory from '@/views/tab/RedisMemory.vue'
import RedisMonitor from '@/views/tab/RedisMonitor.vue'
import RedisPubsub from '@/views/tab/RedisPubsub.vue'
import RedisSearch from '@/views/tab/RedisSearch.vue'
import RedisSlow from '@/views/tab/RedisSlow.vue'
import RedisTerminal from '@/views/tab/RedisTerminal.vue'
import RedisValue from '@/views/tab/RedisValue/index.vue'

const share = inject(shareProvideKey)!
const minimalMode = computed(() => isConnMinimalMode(share.conn))
const infoSupported = computed(() => share.capabilities.infoSupported)
const searchSupported = computed(() => share.capabilities.redisSearchSupported)
const memoryUsageSupported = computed(() => share.capabilities.memoryUsageSupported)
</script>

<template>
  <el-tabs
    v-model="share.tabName"
    class="redis-tab"
    :style="{ paddingBottom: share.tabName === 'value' ? 0 : '10px' }">
    <!-- 信息界面: 极简模式或无INFO权限则不显示 -->
    <template v-if="!minimalMode">
      <me-tab-pane v-if="infoSupported" name="info" icon="el-icon-calendar">
        <RedisInfo />
      </me-tab-pane>
    </template>

    <!-- 值和终端界面: 极简模式下仅显示这两个 -->
    <me-tab-pane name="value" icon="el-icon-memo">
      <RedisValue />
    </me-tab-pane>
    <me-tab-pane name="terminal" icon="me-icon-terminal" lazy>
      <RedisTerminal />
    </me-tab-pane>

    <!-- 内存、慢查询、监控、发布订阅和图表界面 -->
    <template v-if="!minimalMode">
      <me-tab-pane v-if="searchSupported" name="search" icon="el-icon-search" lazy>
        <RedisSearch />
      </me-tab-pane>
      <me-tab-pane v-if="memoryUsageSupported" name="memory" icon="me-icon-memory" lazy>
        <RedisMemory />
      </me-tab-pane>
      <me-tab-pane name="slow" icon="me-icon-slow" lazy>
        <RedisSlow />
      </me-tab-pane>
      <me-tab-pane name="monitor" icon="el-icon-monitor" lazy>
        <RedisMonitor />
      </me-tab-pane>
      <me-tab-pane name="pubsub" icon="me-icon-pubsub" lazy>
        <RedisPubsub />
      </me-tab-pane>
      <me-tab-pane v-if="infoSupported" name="chart" icon="el-icon-data-line" lazy>
        <RedisChart />
      </me-tab-pane>
    </template>
  </el-tabs>
</template>

<style scoped lang="scss">
.redis-tab {
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  padding: 0 10px 10px 10px;

  height: 100%;

  :deep(.el-tab-pane) {
    height: 100%;
  }

  :deep(.el-tabs__item) {
    padding: 0 12px;
  }
}
</style>
