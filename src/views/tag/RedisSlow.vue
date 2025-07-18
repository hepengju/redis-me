<script setup>
// 官网参考: https://redis.ac.cn/docs/latest/commands/slowlog-get/
// TODO 获取配置并设置为初始值: slowlog-log-slower-than slowlog-max-len
import MeFlex from '@/components/MeFlex.vue'
import {apiSlowlog} from '@/utils/api.js'

const slowerThan   = ref(10000)
const slowerMaxLen = ref(128)
const slowerGetCount = ref(Math.min(slowerMaxLen.value, 200))
const keyword = ref('')

const dataList = ref([])
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(row => !key
      || row.command?.toLowerCase().indexOf(key) > -1
      || row.client?.toLowerCase().indexOf(key) > -1
  )
})
function refresh() {
  dataList.value = apiSlowlog(slowerGetCount.value)
}
refresh()
</script>

<template>
  <div class="redis-slow">
    <me-flex class="header">
      <div>
        <el-input :value="slowerThan + ' μs'" style="width: 140px;" disabled>
          <template #prepend>
            <el-tooltip placement="top-end" content="命令执行时间超过的阈值 [ slowlog-log-slower-than ]，单位微秒，默认 10000" :show-after="1000">
              <div>阈值</div>
            </el-tooltip>
          </template>
        </el-input>
        <el-input v-model.number="slowerMaxLen" style="width: 140px; margin: 0 10px;" disabled>
          <template #prepend>
            <el-tooltip placement="top-end" content="慢日志中条目的最大数量 [ slowlog-max-len ]，默认 128" :show-after="1000">
              <div>数量</div>
            </el-tooltip>
          </template>
        </el-input>
      </div>

      <div>
        <el-input v-model="keyword" placeholder="模糊筛选（客户端、命令）" style="width: 300px"/>
        <el-input v-model.number="slowerGetCount" style="width: 180px; margin: 0 10px;">
          <template #prepend>
              <div>限制</div>
          </template>
          <template #append>
            <me-button info="查询慢日志" icon="el-icon-search" @click="refresh" placement="top-end"/>
          </template>
        </el-input>
      </div>
    </me-flex>
    <div class="table">
      <el-table :data="filterDataList" style="margin-top: 10px" border height="100%">
        <el-table-column label="#" type="index" width="50" align="center" show-overflow-tooltip/>
        <el-table-column label="执行时间" prop="time" width="160" sortable/>
        <el-table-column label="客户端" prop="client" width="200" sortable show-overflow-tooltip/>
        <el-table-column label="命令" prop="command" sortable show-overflow-tooltip/>
        <el-table-column label="耗时" prop="cost" width="100" sortable show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.cost }} ms
          </template>
        </el-table-column>
      </el-table>
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
  }

  .table {
    flex-grow: 1;
    height: 0;
  }
}
</style>