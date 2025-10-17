<script setup>
// 官网参考: https://redis.ac.cn/docs/latest/commands/slowlog-get/
import api from '@/api/index.js'
import {useTemplateRef} from 'vue'
import {bus, copy, DELETE_KEY, filterHandler, humanSize, REFRESH_KEY} from '../util/me.js'
import {ElMessage, ElMessageBox} from 'element-plus'
import {isEnvEdit} from '@/utils/permission.js'
import {capitalize} from 'lodash'

// 共享数据
const share = inject('share')
const canEdit = computed(() => isEnvEdit(share.env))
const hint = computed(() => {
  return `
<b>原理：scan / memory usage / pipeline / type</b> <br/>
说明：使用scan方法扫描所有slave节点，寻找匹配 ${matchParam.value} 的键。每次扫描${scanCount.value}个键，然后pipeline批量发送memory usage命令获取占用内存大小，将>=${sizeLimitKb.value}Kb的键记录下来。
如果扫描键的总数已经到达${scanTotal.value}个（小于等于0表示扫描所有 或 结果数量已经满足${countLimit.value}个则返回，否则睡眠${sleepMillis.value}ms 再使用游标继续扫描。<br/>
备注：memory usage 命令报告键及其值存储在内存中所需的字节数。报告的用量是一个键及其值所需的数据和管理开销的总内存分配量。
`.trim()
})

const sizeLimitKb = ref(100)
const countLimit  = ref(500)
const scanCount  = ref(1000)
const scanTotal  = ref(10000)
const sleepMillis  = ref(share.env.indexOf('prd') > -1 ? 50 : 0)
const match = ref('')
const matchParam = computed(() => {
  if (match.value==='') return '*'
  return '*' + match.value + '*'
})

const keyword = ref('')
const loading = ref(false)
const dataList = ref([])

const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(row => !key || row.key?.toLowerCase().indexOf(key) > -1)
})
const filterTypes = computed(() => {
    return [...new Set(dataList.value.map(d => d.type))].map(d => ({text: capitalize(d), value: d}))
})

async function apiMemoryUsage() {
  const params = {
    match: matchParam.value,
    sizeLimit: sizeLimitKb.value * 1024,
    countLimit: countLimit.value,
    scanCount: scanCount.value,
    scanTotal: scanTotal.value,
    sleepMillis: sleepMillis.value,
  }
  const res = await api.ark.extops.redis.memoryUsage(share.env, params)
  if (res.code === 200) {
    dataList.value = res.data || []
  } else {
    ElMessageBox.alert(res.msg, '提示', { type: 'error'})
  }
}

async function refresh() {
  loading.value = true
  try {
    await apiMemoryUsage()
  } finally {
    loading.value = false
  }
}

function memoryUsage() {
  if (scanTotal.value > 10_0000 || scanTotal.value <= 0 || sleepMillis.value > 100) {
    ElMessageBox.confirm(
      `确定开始内存分析吗？耗时可能较长，请耐心等待！`,
      '提示',
      {type: 'warning'},
    ).then(async () => {
      await refresh()
    }).catch(() => {})
  } else {
    refresh()
  }
}

// 选中键
function chooseKey(redisKey) {
  share.redisKey = redisKey
  share.tabName = 'value'
  bus.emit(REFRESH_KEY)
}

// 删除键
async function delKey(redisKey) {
  ElMessageBox.confirm(
    `确定删除键【${redisKey.key}】吗？`,
    '提示',
    {type: 'warning'},
  ).then(async () => {
    const res = await api.ark.extops.redis.del(share.env, redisKey)
    if (res.code == 200) {
      bus.emit(DELETE_KEY, redisKey)
      ElMessage({message: '删除成功', type: 'success'})
      dataList.value = dataList.value.filter(rk => rk.bytes !== redisKey.bytes)
    } else {
      ElMessageBox.alert(res.msg, "提示", {type: 'error'})
    }
  }).catch(() => {})
}

// 批量删除键
const selection = ref([])
function selectionChange(newSelection){
  selection.value = newSelection
}
async function batchDelKey() {
  ElMessageBox.confirm(
    `确定批量删除【${selection.value.length}】个键吗？`,
    '提示',
    {type: 'warning'},
  ).then(async () => {
    const params = {
      keyList: selection.value.map(row => ({key: row.key, bytes: row.bytes})),
    }
    const res = await api.ark.extops.redis.batchDel(share.env, params)
    if (res.code == 200) {
      const keyBytesArr = params.keyList.map(rk => rk.bytes)
      ElMessage({message: '删除成功', type: 'success'})
      dataList.value = dataList.value.filter(rk => keyBytesArr.indexOf(rk.bytes) < 0)
    } else {
      ElMessageBox.alert(res.msg, "提示", {type: 'error'})
    }
  }).catch(() => {})
}


// 避免表格自动调整列宽时闪烁一下
const tableRef = useTemplateRef(('table'))
const tableTotal = computed(() => tableRef.value?.store?.states?.data?.value?.length ?? 0)
const tableTotalSize = computed(() => humanSize(tableRef.value?.store?.states?.data?.value?.map(d => d.size).reduce((sum, cur) => sum + cur, 0) ?? 0))
watch(() => share.tabName, newValue => {
  if (newValue === 'memory') {
    nextTick(() => {
      tableRef.value.doLayout()
    })
  }
})
</script>

<template>
  <div class="redis-memory">
    <div class="me-flex header">
      <div class="me-flex">
        <el-dropdown placement="bottom-start" :hide-on-click="false" :teleported="false">
          <el-button icon="el-icon-setting">扫描配置</el-button>

          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>
                <el-input v-model.number="match" style="width: 200px" placeholder="模糊">
                  <template #prepend>匹配参数</template>
                  <template #append>
                    <el-tooltip raw-content :content="hint" placement="top">
                      <el-icon>
                        <el-icon-question-filled/>
                      </el-icon>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-dropdown-item>
              <el-dropdown-item>
                <el-input v-model.number="scanCount" style="width: 200px">
                  <template #prepend>每次扫描</template>
                  <template #append>个</template>
                </el-input>
              </el-dropdown-item>
              <el-dropdown-item>
                <el-input v-model.number="sleepMillis" style="width: 200px;">
                  <template #prepend>每次睡眠</template>
                  <template #append>ms</template>
                </el-input>
              </el-dropdown-item>
              <el-dropdown-item>
                <el-input v-model.number="scanTotal" style="width: 200px;">
                  <template #prepend>扫描总数</template>
                  <template #append>个</template>
                </el-input>
              </el-dropdown-item>

              <el-dropdown-item divided>
                <el-input v-model.number="sizeLimitKb" style="width: 200px; ">
                  <template #prepend>大小限制</template>
                  <template #prefix> <div style="margin-right: 10px">&gE;</div> </template>
                  <template #append>Kb</template>
                </el-input>
              </el-dropdown-item>
              <el-dropdown-item>
                <el-input v-model.number="countLimit" style="width: 200px; ">
                  <template #prepend>数量限制</template>
                  <template #append>个</template>
                </el-input>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-button icon="el-icon-delete" type="danger"
                   :disabled="selection.length === 0"
                   @click="batchDelKey" style="margin-left: 10px">批量删除
        </el-button>
      </div>

      <div>
        <el-text v-if="tableTotal > 0" type="info" style="margin-right: 10px">[ 总数: {{tableTotal}}，大小: {{tableTotalSize}} ]</el-text>
        <el-input v-model="keyword" placeholder="键模糊筛选" style="width: 260px; margin:0 10px" clearable/>
        <el-button icon="el-icon-search" @click="memoryUsage" type="primary" :loading="loading" >开始分析</el-button>
      </div>
    </div>
    <div class="table">
      <el-table size="large" :data="filterDataList" ref="table"
                :default-sort="{prop: 'size', order: 'descending'}"
                style="margin-top: 10px"
                v-loading="loading"
                @selection-change="selectionChange"
                border stripe height="100%">
        <el-table-column type="selection" width="50" align="center"/>
        <el-table-column label="类型" prop="type" width="100" show-overflow-tooltip sortable :filters="filterTypes" :filter-method="filterHandler">
          <template #default="scope">
            {{ capitalize(scope.row.type) }}
          </template>
        </el-table-column>
        <el-table-column label="键" prop="key" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.key }}
          </template>
        </el-table-column>
        <el-table-column label="大小" prop="size" width="120" sortable show-overflow-tooltip>
          <template #default="scope">
            {{ humanSize(scope.row.size) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="canEdit ? 100 : 80" fixed="right" align="center">
          <template #default="scope">
            <div class="me-flex">
              <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn" @click="copy(scope.row.key) "/>
              <me-icon info="详情" icon="el-icon-view"          class="icon-btn" @click="chooseKey(scope.row)"/>
              <me-icon info="删除" icon="el-icon-delete"        class="icon-btn" @click="delKey(scope.row)" v-if="canEdit"/>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-memory {
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
    flex-grow: 1;
    height: 0;
  }
}
</style>
