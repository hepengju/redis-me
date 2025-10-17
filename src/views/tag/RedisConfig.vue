<script setup>
import api from '@/api/index.js'
import {useTemplateRef} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import MeButton from '@/components/arkMe/MeButton.vue'
import {configTip as tips} from '@/views/ark/extops/redis-me/util/tip.js'
import NodeList from '@/views/ark/extops/redis-me/ext/NodeList.vue'

// 共享数据
const share = inject('share')

const node = ref(share.nodeList ? share.nodeList[0].node : '')
const keyword = ref('')
const loading = ref(false)
const dataList = ref([])

const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(row => !key
    || row.param?.toLowerCase().indexOf(key) > -1
    || row.value?.toLowerCase().indexOf(key) > -1
  )
})

async function apiConfigGet() {
  const res = await api.ark.extops.redis.configGet(share.env, {pattern: '*', node: node.value})
  if (res.code == 200) {
    const tableData = []
    const configMap = res.data
    Object.entries(configMap).forEach(([key, value]) => tableData.push({param: key, value}))
    dataList.value = tableData
  } else {
    ElMessageBox.alert(res.msg, '提示', { type: 'error'})
  }
}

async function refresh() {
  loading.value = true
  try {
    await apiConfigGet()
  } finally {
    loading.value = false
  }
}
refresh()

async function downloadConfigFile() {
  await api.ark.extops.redis.downloadConfigFile()
}

function editParam(row) {
  ElMessage({message: 'TODO编辑配置', type: 'success'})
}

// 避免表格自动调整列宽时闪烁一下
const tableRef = useTemplateRef(('table'))
const tableTotal = computed(() => tableRef.value?.store?.states?.data?.value?.length ?? 0)
watch(() => share.tabName, newValue => {
  if (newValue === 'config') {
    nextTick(() => {
      tableRef.value.doLayout()
    })
  }
})
</script>

<template>
  <div class="redis-config">
    <div class="me-flex header">
      <div>
        <div class="me-flex">
          <node-list v-model="node" style="margin-right: 10px" @change="refresh"/>
          <me-button plain style="margin-right: 10px" @click="downloadConfigFile" info="下载Redis的默认配置（Redis7.4)" icon="el-icon-download"/>
        </div>
      </div>
      <div>
        <el-text v-if="tableTotal > 0" type="info" style="margin-right: 10px">[ 总数: {{tableTotal}} ]</el-text>
        <el-input  v-model="keyword" placeholder="模糊筛选（配置项、配置值）" style="width: 300px; margin-right: 10px" clearable/>
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading"/>
      </div>
    </div>
    <div class="table">
      <el-table size="large" :data="filterDataList" ref="table"
                style="margin-top: 10px"
                v-loading="loading"
                border stripe height="100%">
        <el-table-column label="配置项" prop="param" sortable show-overflow-tooltip/>
        <el-table-column label="配置值" prop="value" show-overflow-tooltip/>
        <el-table-column label="说明" show-overflow-tooltip>
          <template #default="scope">
            <span style="color: var(--el-color-info)">{{tips[scope.row.param]}}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-config {
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
  }
}
</style>
