<script setup>
import {load} from '@tauri-apps/plugin-store'
import TabMain from './TabMain.vue'
import {sortBy} from 'lodash'
import {bus, CONN_REFRESH, meInvoke, STORE_CONN_LIST, STORE_FILE_NAME} from '@/utils/util.js'
import TabConn from '@/views/TabConn.vue'
import KeyHeader from '@/views/KeyHeader.vue'
import KeyMain from '@/views/KeyMain.vue'
import {onMounted} from 'vue'

// 共享数据
const share = reactive({
  conn: null,    // 当前连接
  connList: [],  // 连接列表
  nodeList: [],  // 节点列表
  color: 'var(--el-color-primary)', // 即 share.conn.color（便于使用和移植）
  redisKey: null,
  tabName: 'info',
  store: null    // 共享存储对象
})

provide('share', share)

// 导入存储的连接信息
let initConnListReady = false
async function loadStore() {
  // markRaw 将一个对象标记为不可被转为代理。返回该对象本身。
  // 避免报错: Cannot read private member from an object whose class did not declare it
  try {
    const store = await load(STORE_FILE_NAME)
    share.store = markRaw(store)
    share.connList = await share.store.get(STORE_CONN_LIST) || []
  } catch (e) {
    console.error('加载存储文件失败', e)
  }

  await nextTick(() => {
    initConnListReady = true
  })
}
onMounted(() => loadStore())

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
  // 连接id未发生改变时，无需断开重连（比如颜色或db改变）
  if (newConn?.id == oldConn?.id) return

  connPrepared.value = false
  // 关闭旧连接
  if (oldConn) {
    await meInvoke('disconnect', {id: oldConn.id})
  }

  // 打开新连接，获取节点列表和数据库列表（TODO）
  if (newConn) {
    share.color = newConn.color
    share.tabName = 'info'
    await meInvoke('connect', {id: newConn.id})
    connPrepared.value = true
    const data = await meInvoke('node_list', {id: share.conn.id})
    // 节点列表排序: 主节点在前面，相同类型节点按照node升序
    const nodeList = sortBy(data, 'node').reverse()
    share.nodeList = sortBy(nodeList, 'isMaster').reverse()
  }
}, {deep: true})

// 保存连接列表: 列表真实变化时才发送命令
const connListToString = computed(() => JSON.stringify(share.connList))
watch(connListToString, async (newConnList) => {
  // 应用启动读取到所有连接信息发送给后端
  await meInvoke('conn_list', {connList: JSON.parse(newConnList)})
  if (initConnListReady) {
    // 首次读取无需写入，后续有变化时才需写入
    await share.store?.set(STORE_CONN_LIST, share.connList)
  }
})
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
        <TabConn     v-if="!share.conn"/>
        <TabMain v-else-if="connPrepared"/>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: calc(100% - 30px);
  //border: 2px solid blue;
  padding: 0px 5px 5px 5px;
  flex: 1;

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
