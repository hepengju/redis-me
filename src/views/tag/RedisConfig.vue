<script setup>
import {ElMessage} from 'element-plus'
import {configTip as tips, redisConfList} from '@/utils/tip.js'
import NodeList from '../ext/NodeList.vue'
import {invoke_then} from "@/utils/util.js";
import {sortBy} from "lodash";

// 共享数据
const share = inject('share')

const node = ref(share.nodeList && share.nodeList.length > 0 ? share.nodeList[0].node : '')
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

// 合计列
function getSummaries() {
  return ['配置数', filterDataList.value.length + ' / ' + dataList.value.length, '']
}

async function apiConfigGet() {
  const data = await invoke_then('config_get', {id: share.conn.id, pattern: '*', node: node.value})
  const tableData = []
  const configMap = data
  Object.entries(configMap).forEach(([key, value]) => tableData.push({param: key, value}))
  dataList.value = sortBy(tableData, ['param'])
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

function editParam(row) {
  ElMessage({message: 'TODO编辑配置', type: 'success'})
}

// 官网默认配置参考
const dialog = reactive({
  raw: false
})
const configVersion = ref('')  // 版本
const configList = computed(() => {
  const list = Object.entries(redisConfList).map(([key, value]) => ({key, value}))
  return sortBy(list, ['key']).reverse()
})
const configRaw = computed(() => {
  return redisConfList[configVersion.value] || '暂不支持'
})
function handleCommand(command){
  dialog.raw = true
  configVersion.value = command
}
</script>

<template>
  <div class="redis-config">
    <div class="me-flex header">
      <div>
        <div class="me-flex">
          <node-list v-model="node" style="margin-right: 10px" @change="refresh"/>
          <el-dropdown @command="handleCommand">
            <el-button plain icon="el-icon-notebook" type="info">参考</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :command="item.key" v-for="item in configList">{{item.key}}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
      <div>
        <el-input  v-model="keyword" placeholder="模糊筛选（配置项、配置值）" style="width: 300px; margin-right: 10px" clearable/>
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading"/>
      </div>
    </div>

    <el-table :data="filterDataList" ref="table"
              style="margin-top: 10px"
              v-loading="loading"
              show-summary :summary-method="getSummaries"
              border stripe height="100%">
      <el-table-column label="配置项" prop="param" sortable show-overflow-tooltip/>
      <el-table-column label="配置值" prop="value" show-overflow-tooltip/>
      <el-table-column label="说明" show-overflow-tooltip>
        <template #default="scope">
          <span style="color: var(--el-color-info)">{{tips[scope.row.param]}}</span>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog :title="`默认配置：${configVersion}`" v-model="dialog.raw" width="60vw" center align-center draggable>
      <me-code :value="configRaw" mode="properties" read-only height="60vh" />
    </el-dialog>
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
    margin-top: 10px;
    flex-grow: 1;
    height: 0;
  }
}
</style>
