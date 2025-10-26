<script setup>
import RedisTag from './RedisTag.vue'
import {sortBy} from 'lodash'
import {bus, CONN_REFRESH, invoke_then} from "@/utils/util.js";
import {mockConnList} from "@/utils/api-mock.js";
import RedisConn from "@/views/RedisConn.vue";
import KeyHeader from "@/views/KeyHeader.vue";
import KeyMain from "@/views/KeyMain.vue";

// 共享数据
const share = reactive({
  conn: null,     // 当前连接
  connList: [], // 连接列表
  color: 'var(--el-color-primary)', // 即 share.conn.color（便于使用和移植）
  redisKey: null,
  tabName: 'info',
  nodeList: []  // 节点列表
})

share.connList = mockConnList
provide('share', share)

// 当环境发生变化时，销毁整个key和tag组件（避免状态保留）
onMounted(() => bus.on(CONN_REFRESH, toggleKeyTag))
onUnmounted(() => bus.off(CONN_REFRESH, toggleKeyTag))

// 切换连接时销毁key/tag组件
const connPrepared = ref(false)
function toggleKeyTag() {
  connPrepared.value = false
  nextTick(() => connPrepared.value = true)
}

watch(() => share.conn, async (newConn, oldConn) => {
  connPrepared.value = false

  // 关闭旧连接
  if (oldConn) {
    await invoke_then('disconnect', {id: oldConn.id})
  }

  // 打开新连接，获取节点列表和数据库列表（TODO）
  if (newConn) {
    share.color = newConn.color
    share.tabName = 'info'
    await invoke_then('connect', {id: newConn.id})
    connPrepared.value = true
    const data = await invoke_then('node_list', {id: share.conn.id})
    // 节点列表排序: 主节点在前面，相同类型节点按照node升序
    const nodeList = sortBy(data, 'node').reverse()
    share.nodeList = sortBy(nodeList, 'isMaster').reverse()
  }
}, {deep: true})

watch(() => share.connList, async (newConnList) => {
  await invoke_then('conn_list', {connList: newConnList})
}, {deep: true, immediate: true})
</script>

<template>
  <div class="redis-main">
    <el-splitter>
      <!-- 左侧键 -->
      <el-splitter-panel :min="250" size="30%">
        <div class="redis-key">
          <KeyHeader/>
          <KeyMain v-if="share.conn && connPrepared"/>
          <el-empty v-else/>
        </div>
      </el-splitter-panel>

      <!-- 右侧值 -->
      <el-splitter-panel :min="250">
        <RedisConn     v-if="!share.conn"/>
        <RedisTag v-else-if="connPrepared"/>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: 100%;
  //border: 2px solid blue;

  .redis-key {
    //border: 2px solid red;
    height: 100%;
    display: flex;
    flex-direction: column;

  }
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
