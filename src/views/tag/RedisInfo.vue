<script setup>
import {apiInfo} from '@/utils/api.js'
import useGlobalStore from '@/utils/store.js'
import {bus, CONN_REFRESH, sleep} from '@/utils/util.js'
import {useTemplateRef} from 'vue'

const global = useGlobalStore()

// 数据
const raw = ref('') // 原始信息
const dic = ref({}) // 字典形式
const tag = ref({}) // 标签形式， key标签名称，value表格数据
const keyCount = ref(0)      // 键数量
const keyword = ref('')      // 关键字过滤
const tagSelected = ref('')  // 选中的标签
const dialog = reactive({
  raw: false
})
const loading = ref(false)

// raw原始值发生变化后，其他的值重新计算
watchEffect(() => {
  const lines = raw.value.split('\n')

  let dicObj = {}
  let tagObj = {}
  let tagKey = ''
  let tagList = []
  lines.forEach(line => {
    if (line.startsWith('#')) {
      if (tagKey !== '') {
        tagObj[tagKey] = tagList
      }

      tagKey = line.substring(1).trim()
      tagList = []
    } else {
      const index = line.indexOf(':')
      const key = line.substring(0, index)
      const value = line.substring(index + 1)

      if (key !== '') {
        tagList.push({key, value})
        dicObj[key] = value
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

  tag.value = tagObj
  dic.value = dicObj
  tagSelected.value = Object.keys(tagObj)[0]
})

// 表格数据
const tableData = computed(() => {
  const list = tag.value[tagSelected.value]
  const key = keyword.value.toLowerCase()
  return list?.filter(d => !key || d.key.toLowerCase().indexOf(key) > -1 || d.value.toLowerCase().indexOf(key) > -1)

})

// 监听刷新事件
bus.on(CONN_REFRESH, refresh)

async function refresh() {
  console.log('redis info refresh')
  loading.value = true
  raw.value = apiInfo(global.conn?.id)
  await sleep(500)
  loading.value = false
}

// 点击标签后滚动到最上方
const tableRef = useTemplateRef(('table'))
function clickTag(tag) {
  tagSelected.value = tag
  tableRef.value.scrollTo(0, 0) // 滚动条归零
}
</script>

<template>
  <div class="redis-info" v-loading="loading" v-if="global.conn">
    <el-descriptions border>
      <template #title>
        <me-flex>
          <div>
            <el-text size="large" style="margin-left: 5px">{{ global.conn.host + '@' + global.conn.port }}</el-text>
            <el-tag style="margin-left: 10px">v{{ dic['redis_version'] }}</el-tag>
            <el-tag type="success" style="margin-left: 10px" v-if="dic['redis_mode']">{{ dic['redis_mode'] }}</el-tag>
            <el-tag type="success" style="margin-left: 10px" v-if="dic['role']">{{ dic['role'] }}</el-tag>
          </div>
          <me-icon class="refresh" name="刷新" icon="el-icon-refresh-right" placement="left" hint @click="refresh"/>
        </me-flex>
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
        <me-flex>
          {{dic['connected_clients']}}
          <el-text type="info" style="margin-left: 10px">
            [ 限制: {{dic['maxclients']}} ]
          </el-text>
        </me-flex>
      </el-descriptions-item>

      <el-descriptions-item :span="1">
        <template #label><me-icon name="持久化" icon="me-icon-save"/></template>
        <!-- TODO rdb需要通过config get save命令去确认 -->
        <el-tag type="info" v-if="dic['rdb_saves']">rdb</el-tag>
        <el-tag type="info" v-if="dic['aof_enabled'] === '1'">aof</el-tag>
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon name="内存" icon="me-icon-memory"/></template>
        <me-flex>
          {{dic['used_memory_human']}}
          <el-text type="info" style="margin-left: 10px">
            [
              <span style="margin-left:  0px">峰值: {{dic['used_memory_peak_human']}}</span>
              <span style="margin-left: 20px">RSS:  {{dic['used_memory_rss_human']}}</span>
              <span style="margin-left: 20px">系统: {{dic['total_system_memory_human']}}</span>
            ]
          </el-text>
        </me-flex>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="执行程序" icon="el-icon-video-play"/></template>
        <me-flex>
          {{dic['executable']}}
          <el-text type="info" style="margin-left: 10px">
            [ 配置: {{dic['config_file']}} ]
          </el-text>
        </me-flex>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="系统" icon="el-icon-monitor"/></template>
        <me-flex>
          {{dic['os']}}
          <el-text type="info" style="margin-left: 10px">
            [ PID: {{dic['process_id']}} ]
          </el-text>
        </me-flex>
      </el-descriptions-item>
    </el-descriptions>

    <el-card class="detail-card">
      <template #header>
        <me-flex class="detail-header">
          <div>
            <el-text size="large">参数详情</el-text>
            <el-link type="success" target="_blank" style="margin-left: 10px"
                     href="https://redis.ac.cn/docs/latest/commands/info/">
              <me-icon icon="me-icon-link"/>
            </el-link>
          </div>

          <div class="detail-header-right">
            <me-icon icon="me-icon-raw" class="raw-info" @click="dialog.raw = true"/>
            <el-input v-model="keyword" clearable style="width: 200px" prefix-icon="el-icon-search" placeholder="关键字过滤"/>
          </div>
        </me-flex>
      </template>

      <div class="detail-main">
        <div class="tags">
          <el-button class="tag" plain v-for="(_, tagName) in tag"
                     @click="clickTag(tagName)">
            <span :style="{fontWeight: 600, color: tagSelected === tagName ? 'var(--el-color-primary)' : ''}">{{tagName}}</span>
          </el-button>
        </div>
        <el-table ref="table" :data="tableData" border height="100%">
          <el-table-column prop="key" label="键" />
          <el-table-column prop="value" label="值" />
        </el-table>
      </div>
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

  .refresh {
    font-size: 20px;
    color: var(--el-color-success);
    cursor: pointer;
    & :hover {
      color: var(--el-color-primary);
    }

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

      .detail-header-right {
        display: flex;

        .raw-info {
          cursor: pointer;
          margin-right: 10px;
          font-size: 20px;
          color: var(--el-color-success);

          & :hover {
            color: var(--el-color-primary);
          }
        }
      }
    }

    .detail-main {
      height: 100%;
      display: flex;
      justify-content: space-between;

      .tags {
        margin-right: 20px;
        display: flex;
        flex-direction: column;

        .tag {
          width: 88px;
          margin: 0 0 5px 0;
        }
      }
    }
  }
}
</style>