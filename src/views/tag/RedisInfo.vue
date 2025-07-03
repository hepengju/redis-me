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
  tagSelected: ''  // 选中的标签
})

watchEffect(() => {
  const lines: string[] = data.raw.split('\n')

  let dicObj = {}
  let tagObj = {}
  let tag = ''
  let tmp = []
  lines.forEach(line => {
    if (line.startsWith('#')) {
      if (tag !== '') {
        tagObj[tag] = tmp
      }

      tag = line.substring(1).trim()
      tmp = []
    } else {
      const index = line.indexOf(':')
      const key = line.substring(0, index)
      const value = line.substring(index + 1)
      tmp.push({key, value})
      dicObj[key] = value

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

          <me-button circle tooltip="刷新" icon="el-icon-refresh" placement="left" @click="refresh"/>
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
          <el-input v-model="data.keyword" style="width: 200px" prefix-icon="el-icon-search" placeholder="关键字过滤"/>
        </div>
      </template>

      <div class="detail-main">
        <div class="tags">
          <el-button class="tag" plain v-for="item in Object.keys(data.tag)"
                     @click="data.tagSelected = item">
            <span :style="{color: data.tagSelected === item ? 'var(--el-color-primary)' : ''}">{{item}}</span>
          </el-button>
        </div>
        <el-table :data="data.tag[data.tagSelected]" border height="100%">
          <el-table-column prop="key" label="键" />
          <el-table-column prop="value" label="值" />
        </el-table>
      </div>
    </el-card>
<!--    <me-code :value="store.info" language="properties" read-only/>-->
  </div>

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