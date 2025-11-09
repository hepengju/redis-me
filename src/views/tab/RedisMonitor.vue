<script setup>
import NodeList from '@/views/ext/NodeList.vue'
import {meConfirm, meCopy, meInvoke, meOk} from '@/utils/util.js'
import {debounce} from 'lodash'
import {listen} from '@tauri-apps/api/event'

// 共享数据
const share = inject('share')

const node = ref('')
const keyword = ref('')
const monitoring = ref(false)
const dataList = ref([])
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(item => !key || item.toLowerCase().indexOf(key) > -1)
})

// 监控函数防抖
const monitor = debounce(async () => {
  if (monitoring.value) {
    await meInvoke('monitor_stop', {id: share.conn.id})
    monitoring.value = false
    meOk('监控已停止')
  } else {
    meConfirm('命令监控可能造成服务端阻塞，请谨慎在生产环境中使用！', async () => {
      await meInvoke('monitor', {id: share.conn.id, node: node.value})
      monitoring.value = true
      meOk('监控已开始')
    })
  }
}, 200)

function clearData() {
  dataList.value = []
  //meConfirm('确定清空消息吗？', () => dataList.value = [])
}

// 监听消息
let unlisten = null
onMounted(async () => {
  unlisten = await listen('monitor', (event) => {
    const payload = event.payload
    if (payload.id != share.conn.id) return
    dataList.value.push(event.payload)
  })
})
onUnmounted(() => {
  if (unlisten) {
    unlisten()
  }
})
</script>

<template>
  <div class="redis-monitor">
    <div class="me-flex header">
      <div>
        <node-list v-model="node" style="margin-right: 10px" init-node/>
      </div>
      <div>
        <me-button icon="el-icon-delete" info="清空消息" @click="clearData" :disabled="dataList.length === 0" placement="top"/>
        <el-input v-model="keyword" placeholder="模糊搜索" style="width: 280px; margin: 0 10px" clearable/>
        <el-button :icon="monitoring ? 'el-icon-video-pause' : 'el-icon-video-play'"
                   @click="monitor" type="primary">
          {{ monitoring ? '停止监控' : '开始监控' }}
        </el-button>
      </div>
    </div>
    <div class="table">
      <el-table :data="filterDataList" ref="table" border stripe height="100%">
        <el-table-column label="时间" prop="datetime" sortable width="200"/>
        <el-table-column label="命令" prop="command"  show-overflow-tooltip/>
        <el-table-column label="操作" width="60" align="center">
          <template #default="scope">
            <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn"
                     @click="meCopy(scope.row.command)" style="justify-content: center"/>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-monitor {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
    :deep(.el-input-group__prepend) {
      padding: 0 14px;
    }
  }

  .table {
    flex-grow: 1;
    height: 0;
    margin: 10px 0;
  }
}
</style>
