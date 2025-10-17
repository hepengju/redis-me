<script setup>
import api from '@/api/index.js'
import {ElMessageBox} from 'element-plus'
import MeButton from '@/components/arkMe/MeButton.vue'
import NodeList from '@/views/ark/extops/redis-me/ext/NodeList.vue'

// 共享数据
const share = inject('share')

const node = ref(share.nodeList ? share.nodeList[0].node : '')
const timeout = ref(2)
const keyword = ref('')
const loading = ref(false)
const dataList = ref([])
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(item => !key || item.toLowerCase().indexOf(key) > -1)
})

async function apiMonitor() {
  const res = await api.ark.extops.redis.monitor(share.env, {node: node.value, timeout: timeout.value * 1000})
  if (res.code == 200) {
    dataList.value = res.data
  } else {
    ElMessageBox.alert(res.msg, '提示', { type: 'error'})
  }
}

async function refresh() {
  loading.value = true
  try {
    await apiMonitor()
  } finally {
    loading.value = false
  }
}
const tableTotal = computed(() => filterDataList.value.length)
</script>

<template>
  <div class="redis-monitor">
    <div class="me-flex header">
      <div>
        <node-list v-model="node" style="margin-right: 10px" @change="refresh"/>
        <el-input-number v-model="timeout" style="width: 120px" :min="1" :max="10">
          <template #suffix>秒</template>
        </el-input-number>
      </div>
      <div>
        <el-text v-if="tableTotal > 0" type="info" style="margin-right: 10px">[ 总数: {{tableTotal}} ]</el-text>
        <el-input  v-model="keyword" placeholder="模糊筛选" style="width: 280px; margin-right: 10px" clearable/>
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading"/>
      </div>
    </div>
    <div class="command" v-loading="loading">
      <div v-for="item in filterDataList" class="single-line-ellipsis">{{item}}</div>
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
    font-family: Consolas, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif!important;
    background-color: #454545;
    padding: 10px;

    div {
      color: #27aa5e;
    }
  }
}
</style>
