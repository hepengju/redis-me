<script setup>
import NodeList from '@/views/ext/NodeList.vue'
import {invoke_then} from '@/utils/util.js'
import {ElMessage, ElMessageBox} from 'element-plus'

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

async function monitor() {
  if (monitoring.value) {
    await invoke_then('monitor_stop', {id: share.conn.id})
    monitoring.value = false
    ElMessage.success('监控已停止')
  } else {
    ElMessageBox.confirm(
      '命令监控可能造成服务端阻塞，请谨慎在生产环境中使用！',
      '提示',
      {type: 'warning'},
    ).then(async () => {
      await invoke_then('monitor', {id: share.conn.id, node: node.value})
      monitoring.value = true
      ElMessage.success('监控已开始')
    }).catch(() => {
    })
  }
}

const tableTotal = computed(() => filterDataList.value.length)
</script>

<template>
  <div class="redis-monitor">
    <div class="me-flex header">
      <div>
        <node-list v-model="node" style="margin-right: 10px" init-node/>
      </div>
      <div>
        <el-text v-if="tableTotal > 0" type="info" style="margin-right: 10px">[ 总数: {{ tableTotal }} ]</el-text>
        <el-input v-model="keyword" placeholder="模糊搜索" style="width: 280px; margin-right: 10px" clearable/>
        <el-button :icon="monitoring ? 'el-icon-video-pause' : 'el-icon-video-play'"
                   @click="monitor" type="danger">
          {{monitoring ? '停止监控' : '开始监控'}}
        </el-button>
      </div>
    </div>
    <div class="command">
      <div v-for="item in filterDataList" class="single-line-ellipsis">{{ item }}</div>
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

  .command {
    margin-top: 10px;
    overflow-y: auto;
    flex-grow: 1;
    height: 0;

    font-size: 13px;
    font-family: Consolas, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif !important;
    background-color: var(--el-fill-color-lighter);
    padding: 10px;

    div {
      color: #27aa5e;
    }
  }
}
</style>
