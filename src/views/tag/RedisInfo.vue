<script setup lang="ts">
import store from '@/utils/store.ts'
import {sleep} from '@/utils/util.ts'
import {info} from '@/utils/api.ts'

/**
 * redis字符串信息转换为Map
 */
const data = reactive({
  loading: false,
  raw: '',         // 原始信息
  dic: {},         // 字典形式
  tag: {},         // 标签形式， key标签名称，value表格数据

  keyCount: null,  // 键数量
  keyword: '',     // 关键字过滤
  tagSelected: '', // 选中的标签

  dialog: {
    raw: false,
  }
})

watch(() => data.raw, () => {
  const lines: string[] = data.raw.split('\n')

  let dicObj = {}
  let tagObj = {}
  let tag = ''
  let tagList = []
  lines.forEach(line => {
    if (line.startsWith('#')) {
      if (tag !== '') {
        tagObj[tag] = tagList
      }

      tag = line.substring(1).trim()
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
          data.keyCount = value.split(',')[0].split('=')[1]
        } catch (e) {
        }
      }
    }
  })

  data.tag = tagObj
  data.dic = dicObj

  data.tagSelected = Object.keys(tagObj)[0]
})

const tableData = computed(() => {
  const list = data.tag[data.tagSelected]
  const key = data.keyword.toLowerCase()
  return list?.filter(d => !key || d.key.toLowerCase().indexOf(key) > -1 || d.value.toLowerCase().indexOf(key) > -1)
})
async function refresh() {
  data.loading = true
  data.raw = info(store.conn.id)
  await sleep(500)
  data.loading = false
}

refresh()
</script>

<template>
  <div class="redis-info" v-loading="data.loading">
    <el-descriptions border>
      <template #title>
        <div class="description-title">
          <div>
            <el-text size="large" style="margin-left: 5px">{{store.conn.host + '@' + store.conn.port}}</el-text>
            <el-tag style="margin-left: 10px">v{{data.dic['redis_version']}}</el-tag>
            <el-tag type="success" style="margin-left: 10px" v-if="data.dic['redis_mode']">{{data.dic['redis_mode']}}</el-tag>
            <el-tag type="success" style="margin-left: 10px" v-if="data.dic['role']">{{data.dic['role']}}</el-tag>
          </div>

          <me-icon class="description-refresh" name="刷新" icon="el-icon-refresh-right" placement="left" tooltip @click="refresh"/>
        </div>
      </template>
      <el-descriptions-item>
        <template #label><me-icon name="运行时间" icon="el-icon-timer"/></template>
        {{data.dic['uptime_in_days']}}天
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="键数量" icon="el-icon-key"/></template>
        {{ data.keyCount }}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="连接数" icon="me-icon-conn"/></template>
        {{data.dic['connected_clients']}} <el-text type="info"> [ {{data.dic['maxclients']}} ]</el-text>
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="内存" icon="me-icon-memory"/></template>
        {{data.dic['used_memory_human']}} <el-text type="info"> [ {{data.dic['total_system_memory_human']}} ]</el-text>
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon name="系统" icon="el-icon-monitor"/></template>
        {{data.dic['os']}}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="CPU" icon="el-icon-cpu"/></template>
        10%
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon name="持久化" icon="me-icon-save"/></template>
        <el-tag type="success" v-if="data.dic['rdb_saves']">rdb</el-tag>
        <el-tag type="success" v-if="data.dic['aof_enabled'] === '1'">aof</el-tag>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="执行程序" icon="el-icon-video-play"/></template>
        {{data.dic['executable']}}
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="配置文件" icon="el-icon-memo"/></template>
        {{data.dic['config_file']}}
      </el-descriptions-item>
    </el-descriptions>

    <el-card class="detail-card">
      <template #header>
        <div class="detail-header">
          <el-text size="large">参数详情</el-text>

          <div class="detail-header-right">
            <me-icon icon="me-icon-raw" class="raw-info" @click="data.dialog.raw = true"/>
            <el-input v-model="data.keyword" clearable style="width: 200px" prefix-icon="el-icon-search" placeholder="关键字过滤"/>
          </div>
        </div>
      </template>

      <div class="detail-main">
        <div class="tags">
          <el-button class="tag" plain v-for="(_, key) in data.tag"
                     @click="data.tagSelected = key">
            <span :style="{color: data.tagSelected === key ? 'var(--el-color-primary)' : ''}">{{key}}</span>
          </el-button>
        </div>
        <el-table :data="tableData" border height="100%">
          <el-table-column prop="key" label="键" />
          <el-table-column prop="value" label="值" />
        </el-table>
      </div>
    </el-card>
  </div>

  <el-dialog title="Info" v-model="data.dialog.raw" width="60vw" align-center draggable>
    <me-code :value="data.raw" mode="properties" read-only height="60vh" />
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

  .description-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .description-refresh {
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
      display: flex;
      justify-content: space-between;
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