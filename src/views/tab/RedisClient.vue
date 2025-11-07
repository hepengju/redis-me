<script setup>
import {onMounted} from 'vue'
import NodeList from '@/views/ext/NodeList.vue'
import {humanSeconds, invoke_then} from '@/utils/util.js'

// 共享数据
const share = inject('share')
const {initNode} = defineProps({
  initNode: {type: String, default: ''}
})

const node = ref(initNode)
const clientType = ref('')
const keyword = ref('')
const loading = ref(false)
const dataList = ref([])
const sortProperty = ref('id')
const sortOrder = ref('ascending')

const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  const arr = dataList.value.filter(row => !key
    || row.addr?.toLowerCase().indexOf(key) > -1
    || row.name?.toLowerCase().indexOf(key) > -1
  )

  const prop = sortProperty.value
  const isAsc = sortOrder.value === 'ascending'
  const arr01 = arr.filter(d => d[prop])
  const arr02 = arr.filter(d => !d[prop])
  arr01.sort((a, b) => (a[prop] < b[prop] ? -1 : 1) * (isAsc ? 1 : -1))
  return [...arr01, ...arr02]
})

function sortChange({prop, order}) {
  if (order) {
    sortProperty.value = prop
    sortOrder.value = order
  } else {
    sortProperty.value = 'id'
    sortOrder.value = 'ascending'
  }
}

async function refresh() {
  loading.value = true
  try {
    const params = {id: share.conn.id, node: node.value, clientType: clientType.value}
    const data = await invoke_then('client_list', params)
    dataList.value = data
  } finally {
    loading.value = false
  }
}
refresh()
// onUnmounted(() => console.log('销毁'))
</script>

<template>
  <div class="redis-client">
    <div class="me-flex header">
      <div>
        <node-list v-model="node" style="margin-right: 10px" @change="refresh"/>
        <el-select v-model="clientType" style="width: 120px;margin-right: 10px;" placeholder="客户端类型" clearable>
          <el-option value="NORMAL"/>
          <el-option value="MASTER"/>
          <el-option value="SLAVE"/>
          <el-option value="REPLICA"/>
          <el-option value="PUBSUB"/>
        </el-select>
      </div>
      <div>
        <el-input v-model="keyword" placeholder="模糊筛选（客户端、名称）" style="width: 280px; margin-right: 10px"
                  clearable/>
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading"/>
      </div>
    </div>
    <div class="table">
      <me-table :data="filterDataList" ref="table" v-loading="loading"
                :default-sort="{prop: 'id', order: 'ascending'}"
                @sort-change="sortChange"
                border stripe height="100%">
        <el-table-column label="ID" prop="id" show-overflow-tooltip sortable width="100" align="right"/>
        <el-table-column label="客户端" prop="addr" show-overflow-tooltip width="160"/>
        <el-table-column label="客户端名称" prop="name" show-overflow-tooltip width="160"/>
        <el-table-column label="持续时间" prop="age" show-overflow-tooltip sortable width="120" align="right"
                         :formatter="row => humanSeconds(row.age)"/>
        <el-table-column label="空闲时间" prop="idle" show-overflow-tooltip sortable width="120" align="right"
                         :formatter="row => humanSeconds(row.idle)"/>
        <el-table-column label="最后命令" prop="cmd" show-overflow-tooltip sortable min-width="200"/>
        <el-table-column label="user" prop="user" show-overflow-tooltip sortable width="100"/>
        <el-table-column label="db" prop="db" show-overflow-tooltip sortable width="80" align="center"/>
        <el-table-column label="totMem" prop="totMem" show-overflow-tooltip sortable width="100" align="right"/>
        <el-table-column label="rbs" prop="rbs" show-overflow-tooltip sortable width="100" align="right"/>
      </me-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-client {
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
