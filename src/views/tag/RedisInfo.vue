<script setup>
import {useTemplateRef} from 'vue'
import {infoTip as tips} from '@/utils/tip.js'
import NodeList from '../ext/NodeList.vue'
import {bus, GO_CLIENT, invoke_then} from '@/utils/util.js'

// 共享数据
const share = inject('share')

// 数据
const node = ref('')         // 指定节点
const raw = ref('')          // 原始信息
const dic = ref({})          // 字典形式
const tagList = ref([])      // 标签名列表
const tagTable = ref([])     // 标签形式， tag分类名称, key标签名称，value表格数据
const keyCount = ref(0)      // 键数量
const keyword = ref('')      // 关键字过滤
const tagSelected = ref('')  // 选中的标签
const dialog = reactive({
  raw: false
})
const loading = ref(false)
const config = ref('')
const rdbChecked = computed(() => config.value.save ? true : false)
const aofChecked = computed(() => dic.value['aof_enabled'] === '1')
const rdbTooltip = computed(() => config.value.save || '未开启RDB')

// raw原始值发生变化后，其他的值重新计算
watchEffect(() => {
  dic.value = {}
  tagList.value = []
  tagTable.value = []

  const lines = raw.value.split('\n')
  let tagKey = ''
  lines.forEach(line => {
    if (line.startsWith('#')) {
      tagKey = line.substring(1).trim()

      if (tagKey !== 'Ark') {
        tagList.value.push(tagKey)
      }
    } else {
      const index = line.indexOf(':')
      const key = line.substring(0, index).trim()
      const value = line.substring(index + 1).trim()

      if (key !== '') {
        if (tagKey !== 'Ark') {
          tagTable.value.push({key, value, tag: tagKey})
        }
        dic.value[key] = value
      }

      // db0:keys=14410,expires=3997,avg_ttl=736124073
      if (key === 'db0') {
        try {
          keyCount.value = value.split(',')[0].split('=')[1]
        } catch (e) {
        }
      }
    }
  })
})

// 表格数据
const tableData = computed(() => {
  const key = keyword.value.toLowerCase()
  return tagTable.value.filter(d =>
    (!key || d.key.toLowerCase().indexOf(key) > -1 || d.value.toLowerCase().indexOf(key) > -1)
    &&
    (!tagSelected.value || d.tag === tagSelected.value)
  )
})

const infoNode = ref('')
async function refresh() {
  loading.value = true
  try {
    const data = await invoke_then('info', {id: share.conn.id, node: node.value})
    raw.value = data.info || ''
    infoNode.value = data.node || (share.conn.host + ':' + share.conn.port)
    const data2 = await invoke_then('config_get', {id: share.conn.id, pattern: 'save', node: node.value})
    config.value = data2 || ''
  } finally {
    loading.value = false
  }
}
refresh()

// 点击标签后滚动到最上方
const tableRef = useTemplateRef(('table'))
function clickTag(tag) {
  tagSelected.value = tag
  tableRef.value.scrollTo(0, 0) // 滚动条归零
}

function goClient() {
  share.tabName = 'client'
  nextTick(() => {
    bus.emit(GO_CLIENT, node.value || dic.value['ark_node'])
  })
}

function goMemory() {
  share.tabName = 'memory'
}
</script>

<template>
  <div class="redis-info" v-loading="loading">
    <el-descriptions border>
      <template #title>
        <div class="me-flex" style="align-items: center">
          <div>
            <el-text size="large" style="margin-left: 5px">{{ infoNode }}</el-text>
            <el-tag style="margin-left: 10px">v{{ dic['redis_version'] }}</el-tag>
            <el-tag type="success" style="margin-left: 10px" v-if="dic['redis_mode']">{{ dic['redis_mode'] }}</el-tag>
            <el-tag type="success" style="margin-left: 10px" v-if="dic['role']">{{ dic['role'] }}</el-tag>
          </div>
          <div class="me-flex">
            <me-icon class="refresh icon-btn" name="刷新" icon="el-icon-refresh" placement="left" hint @click="refresh" :loading="loading"/>
            <node-list v-model="node" style="margin-left: 10px" @change="refresh" clearable/>
          </div>
        </div>
      </template>

      <el-descriptions-item>
        <template #label><me-icon name="运行时间" icon="el-icon-timer"/></template>
        {{dic['uptime_in_days']}}天
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="键数量" icon="el-icon-key"/></template>
        {{ keyCount }}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="连接数" icon="me-icon-conn"/></template>
        <div class="me-flex">
          <el-link @click="goClient" :underline="false">{{dic['connected_clients']}}</el-link>
          <el-text type="info" style="margin-left: 10px">
            [ 限制: {{dic['maxclients']}} ]
          </el-text>
        </div>
      </el-descriptions-item>

      <el-descriptions-item :span="1">
        <template #label><me-icon name="持久化" icon="me-icon-save"/></template>
        <!-- rdb需要通过config get save命令去确认 -->
        <el-checkbox v-model="rdbChecked" disabled>
          <el-tooltip :content="rdbTooltip" placement="top-start">RDB</el-tooltip>
        </el-checkbox>
        <el-checkbox v-model="aofChecked" disabled>AOF</el-checkbox>
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon name="内存" icon="me-icon-memory"/></template>
        <div class="me-flex">
          <el-link :underline="false" @click="goMemory">{{dic['used_memory_human']}}</el-link>
          <el-text type="info" style="margin-left: 10px">
            [
            <span style="margin-left:  0px">峰值: {{dic['used_memory_peak_human']}}</span>
            <span style="margin-left: 20px">RSS:  {{dic['used_memory_rss_human']}}</span>
            <span style="margin-left: 20px">系统: {{dic['total_system_memory_human']}}</span>
            ]
          </el-text>
        </div>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="执行程序" icon="el-icon-video-play"/></template>
        <div class="me-flex">
          {{dic['executable']}}
          <el-text type="info" style="margin-left: 10px">
            [ 配置: {{dic['config_file']}} ]
          </el-text>
        </div>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="系统" icon="el-icon-monitor"/></template>
        <div class="me-flex">
          {{dic['os']}}
          <el-text type="info" style="margin-left: 10px">
            [ PID: {{dic['process_id']}} ]
          </el-text>
        </div>
      </el-descriptions-item>
    </el-descriptions>

    <el-card class="detail-card">
      <template #header>
        <div class="me-flex detail-header">
          <div>
            <el-text size="large">参数详情</el-text>
            <el-link type="success" target="_blank" style="margin-left: 10px"
                     href="https://redis.ac.cn/docs/latest/commands/info/">
              <me-icon info="跳转官网参数详解" icon="me-icon-link"/>
            </el-link>
          </div>

          <div class="detail-header-right">
            <me-icon info="原始信息" icon="me-icon-raw" class="raw-info icon-btn" @click="dialog.raw = true"/>
            <el-select v-model="tagSelected" placeholder="分类" clearable style="width: 150px; margin: 0 10px">
              <el-option v-for="tag in tagList" :key="tag" :label="tag" :value="tag"/>
            </el-select>
            <el-input v-model="keyword" clearable style="width: 200px" prefix-icon="el-icon-search" placeholder="键值过滤"/>
          </div>
        </div>
      </template>

      <el-table ref="table" :data="tableData" stripe height="100%">
        <el-table-column prop="tag" label="分类" width="100"/>
        <el-table-column prop="key" label="键" show-overflow-tooltip/>
        <el-table-column prop="value" label="值" show-overflow-tooltip/>
        <el-table-column label="说明" show-overflow-tooltip>
          <template #default="scope">
            <span style="color: var(--el-color-info)">{{tips[scope.row.key]}}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>

  <el-dialog title="Info" v-model="dialog.raw" width="60vw" align-center draggable>
    <me-code :value="raw" mode="properties" read-only height="60vh" />
  </el-dialog>
</template>

<style scoped lang="scss">
.redis-info {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  display: flex;
  flex-direction: column;
  justify-content: space-between;

  // 描述标题的宽度
  :deep(.el-descriptions__title) {
    width: 100%;
  }

  // 参数详情的高度小一些
  :deep(.el-card__header) {
    padding: 10px;
  }

  // 参数详情的Body去掉Padding
  :deep(.el-card__body) {
    padding: 0;
  }

  .refresh {
    font-size: 20px;
    color: var(--el-color-success);
  }
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  .detail-card {
    margin-top: 10px;
    flex: 1;

    :deep(.el-card__body) {
      height: calc(100% - var(--el-card-padding) * 2 - 10px);
    }

    .detail-header {
      font-weight: bold;
      align-items: center;

      .detail-header-right {
        display: flex;

        .raw-info {
          font-size: 20px;
          color: var(--el-color-success);
        }
      }
    }
  }
}
</style>
