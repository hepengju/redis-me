<script setup>
// 官网参考: https://redis.ac.cn/docs/latest/commands/slowlog-get/
import {invoke_then} from "@/utils/util.js";

// 共享数据
const share = inject('share')

const slowerThan   = ref(10000)
const slowerMaxLen = ref(128)
const slowerGetCount = ref(Math.min(slowerMaxLen.value, 200))
const keyword = ref('')
const loading = ref(false)
const dataList = ref([])
const sortProperty = ref('cost')
const sortOrder = ref('descending')

const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  const arr = dataList.value.filter(row => !key
    || row.command?.toLowerCase().indexOf(key) > -1
    || row.client?.toLowerCase().indexOf(key) > -1
    || row.clientName?.toLowerCase().indexOf(key) > -1
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
    sortProperty.value = 'cost'
    sortOrder.value = 'descending'
  }
}

// const filterNodes = computed(() => {
//   return sortBy([...new Set(dataList.value.map(d => d.node))].map(d => ({text: d, value: d})), 'value')
// })
// const filterClients = computed(() => {
//   return sortBy([...new Set(dataList.value.map(d => d.client).filter(d => d))].map(d => ({text: d, value: d})), 'value')
// })
// const filterClientNames = computed(() => {
//   return sortBy([...new Set(dataList.value.map(d => d.clientName).filter(d => d))].map(d => ({text: d, value: d})), 'value')
// })

async function apiConfigGet() {
  const data = await invoke_then('config_get', {id: share.conn.id, pattern: 'slowlog*'})
  slowerThan.value = data['slowlog-log-slower-than']
  slowerMaxLen.value = data['slowlog-max-len']
}

async function apiSlowLog() {
  const data = await invoke_then('slow_log', {id: share.conn.id, count: slowerGetCount.value})
  dataList.value = data || []
}

async function refresh() {
  loading.value = true
  try {
    await apiConfigGet()
    await apiSlowLog()
  } finally {
    loading.value = false
  }
}
refresh()

</script>

<template>
  <div class="redis-slow">
    <div class="me-flex header">
      <div>
        <el-dropdown placement="bottom-start" :hide-on-click="false" :teleported="false">
          <el-button icon="el-icon-setting">慢参数</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>
                <el-input :value="slowerThan / 1000" style="width: 150px;" disabled>
                  <template #prepend>
                    <el-tooltip placement="top-end" content="命令执行时间超过的阈值 [ slowlog-log-slower-than ]，单位微秒，默认 10000" :show-after="1000">
                      <div>阈值</div>
                    </el-tooltip>
                  </template>
                  <template #append>ms</template>
                </el-input>
              </el-dropdown-item>

              <el-dropdown-item>
                <el-input v-model.number="slowerMaxLen" style="width: 150px;" disabled>
                  <template #prepend>
                    <el-tooltip placement="top-end" content="慢日志中条目的最大数量 [ slowlog-max-len ]，默认 128" :show-after="1000">
                      <div>数量</div>
                    </el-tooltip>
                  </template>
                  <template #append>个</template>
                </el-input>
              </el-dropdown-item>

              <el-dropdown-item>
                <el-input v-model.number="slowerGetCount" style="width: 150px;">
                  <template #prepend>限制</template>
                  <template #append>个</template>
                </el-input>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div>
        <el-input v-model="keyword" placeholder="模糊筛选（命令、客户端、名称）" style="width: 250px; margin-right: 10px" clearable/>
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading" />
      </div>
    </div>
    <div class="table">
      <me-table :data="filterDataList" ref="table" v-loading="loading"
                :default-sort="{prop: 'cost', order: 'descending'}"
                @sort-change="sortChange"
                border stripe>
        <el-table-column label="命令" prop="command" min-width="200" sortable show-overflow-tooltip/>
        <el-table-column label="耗时" prop="cost" width="100" sortable show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.cost.toFixed(2) }} ms
          </template>
        </el-table-column>
        <el-table-column label="客户端名称"   prop="clientName" width="120" sortable show-overflow-tooltip/>
        <el-table-column label="执行时间" prop="time" width="160" sortable/>
        <!--<el-table-column label="节点" prop="node" width="160" sortable/>-->
        <el-table-column label="客户端" prop="client" width="160" sortable show-overflow-tooltip/>
      </me-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-slow {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
    :deep(.el-input-group__prepend) {
      padding: 0 14px;
    }
    :deep(.el-input-group__append) {
      width: 40px;
    }
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;
  }
}
</style>
