<script setup>
import RedisKey from './RedisKey.vue'
import RedisTag from './RedisTag.vue'
import {sortBy} from 'lodash'
import {bus, CONN_REFRESH, invoke_then} from "@/utils/util.js";
import {mockConnList} from "@/utils/api-mock.js";
import RedisConn from "@/views/RedisConn.vue";

// 共享数据
const tagShow = ref(false)
const share = reactive({
  conn: '',     // 当前连接
  connList: [], // 连接列表
  tagShow: false,
  color: 'var(--el-color-primary)',
  redisKey: null,
  tabName: 'info',
  nodeList: []  // 节点列表
})

share.connList = mockConnList
provide('share', share)

// 当环境发生变化时，销毁整个key和tag组件（避免状态保留）
onMounted(() => bus.on(CONN_REFRESH, toggleTag))
onUnmounted(() => bus.off(CONN_REFRESH, toggleTag))

function toggleTag() {
  tagShow.value = false
  nextTick(() => tagShow.value = true)
}

watch(() => share.conn, async (newConn) => {
  toggleTag()
  if (newConn) {
    share.color = newConn.color
    await invoke_then('connect', {id: newConn.id}, )
    const data = await invoke_then('node_list', {id: share.conn.id})
    share.nodeList = sortBy(data, 'node')
  }
})

watch(() => share.connList, async (newConnList) => {
  await invoke_then('conn_list', {param: newConnList})
})
</script>

<template>
  <div class="redis-main">
    <el-splitter>
      <!-- 左侧键 -->
      <el-splitter-panel :min="250" size="30%">
        <RedisKey/>
      </el-splitter-panel>

      <!-- 右侧值 -->
      <el-splitter-panel :min="250">
        <RedisConn     v-if="!share.conn"/>
        <RedisTag v-else-if="tagShow"/>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: 100%;
  //border: 2px solid blue;

  /* 中间分隔面板的样式调整 */
  :deep(.el-splitter-bar) {
    width: 5px !important;

    .el-splitter-bar__dragger-horizontal:before {
      width: 0; // 宽度为0，不显示原始的竖线
      background-color: transparent;
    }
  }

  /* icon图标hover变色 */
  :deep(.icon-btn) {
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}
</style>
