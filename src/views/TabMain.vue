<script setup lang="ts">
import { computed, inject } from 'vue'

import { shareProvideKey } from '@/types/me-interface'
import { isConnMinimalMode } from '@/utils/conn'
import RedisChart from '@/views/tab/RedisChart.vue'
import RedisInfo from '@/views/tab/RedisInfo/index.vue'
import RedisMemory from '@/views/tab/RedisMemory.vue'
import RedisMonitor from '@/views/tab/RedisMonitor.vue'
import RedisNotify from '@/views/tab/RedisNotify.vue'
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
  <el-tabs v-model="share.tabName" class="redis-tab">
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
      <me-tab-pane name="notify" icon="el-icon-bell" lazy>
        <RedisNotify />
      </me-tab-pane>
      <me-tab-pane v-if="infoSupported" name="chart" icon="el-icon-data-line" lazy>
        <RedisChart />
      </me-tab-pane>
    </template>
  </el-tabs>
</template>

<style scoped lang="scss">
.redis-tab {
  // border: 1px solid var(--el-border-color);
  // border-radius: var(--el-border-radius-base);
  padding: 0 5px 0 3px;

  height: 100%;

  :deep(.el-tab-pane) {
    height: 100%;
  }

  :deep(.el-tabs__item) {
    height: 30px;
    align-items: start;
    padding: 0 12px;
  }

  :deep(.el-tabs__header) {
    margin: 0 0 10px;
    padding-top: 2px;
  }

  // EP 的 nav-wrap 内置 margin-bottom:-1px，页签栏实际占位 2+30-1=31px，
  // 比左侧连接栏 32px 少 1px，导致右列输入框顶边比左列高 1px；归零后左右完全对齐
  :deep(.el-tabs__nav-wrap) {
    margin-bottom: 0;
  }

  // 宽度不够时 EP 显示的左右滚动箭头默认定位在 40px 高的行内（line-height:40px），
  // 而页签已改为 30px 高、内容顶部对齐，箭头会明显偏低；
  // 这里让箭头行高与页签文字（约 20px 高）垂直居中对齐
  :deep(.el-tabs__nav-prev),
  :deep(.el-tabs__nav-next) {
    top: 2px; // 抵消 header 的 padding-top，与页签内容同一基准线
    height: 20px;
    line-height: 20px;
    font-size: 14px;
  }
}
</style>
