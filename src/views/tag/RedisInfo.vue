<script setup lang="ts">
import store from '@/utils/store.ts'
import {computed, reactive, watchEffect} from 'vue'

/**
 * redis字符串信息转换为Map
 */
const info = reactive({
  dic: {},
  tag: {},
  keys: null
})
watchEffect(() => {
  const lines: string[] = store.info.split('\n')

  let dicObj = {}
  let tagObj = {}
  let tag = ''
  let tmp = {}
  lines.forEach(line => {
    if (line.startsWith('#')) {
      if (tag !== '') {
        tagObj[tag] = tmp
      }

      tag = line.substring(1).trim()
      tmp = {}
    } else {
      const index = line.indexOf(':')
      const key = line.substring(0, index)
      const value = line.substring(index + 1)
      tmp[key] = value
      dicObj[key] = value

      // db0:keys=14410,expires=3997,avg_ttl=736124073
      if (key === 'db0') {
        try {
          info.keys = value.split(',')[0].split('=')[1]
        } catch (e) {
        }
      }
    }
  })

  info.tag = tagObj
  info.dic = dicObj


})


</script>

<template>
  <div class="redis-info" v-loading="store.loading.info">
    <el-descriptions border>
      <template #title>
        <el-text size="large">{{store.conn.host + '@' + store.conn.port}}</el-text>
        <el-tag style="margin-left: 10px">v{{info.dic['redis_version']}}</el-tag>
        <el-tag type="success" style="margin-left: 10px" v-if="info.dic['redis_mode']">{{info.dic['redis_mode']}}</el-tag>
        <el-tag type="success" style="margin-left: 10px" v-if="info.dic['role']">{{info.dic['role']}}</el-tag>
      </template>
      <el-descriptions-item>
        <template #label><me-icon name="运行时间" icon="el-icon-timer"/></template>
        {{info.dic['uptime_in_days']}}天
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="键数量" icon="el-icon-key"/></template>
        {{info.keys}}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="连接数" icon="me-icon-conn"/></template>
        {{info.dic['connected_clients']}} <el-text type="info"> [ {{info.dic['maxclients']}} ]</el-text>
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="内存" icon="me-icon-memory"/></template>
        {{info.dic['used_memory_human']}} <el-text type="info"> [ {{info.dic['total_system_memory_human']}} ]</el-text>
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon name="系统" icon="el-icon-monitor"/></template>
        {{info.dic['os']}}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon name="CPU" icon="el-icon-cpu"/></template>
        10%
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon name="持久化" icon="me-icon-save"/></template>
        <el-tag type="success" v-if="info.dic['rdb_saves']">rdb</el-tag>
        <el-tag type="success" v-if="info.dic['aof_enabled'] === '1'">aof</el-tag>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="执行程序" icon="el-icon-video-play"/></template>
        {{info.dic['executable']}}
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon name="配置文件" icon="el-icon-memo"/></template>
        {{info.dic['config_file']}}
      </el-descriptions-item>
    </el-descriptions>

    <me-code :value="store.info" language="yaml" read-only/>
  </div>

</template>

<style scoped lang="scss">
.redis-info {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  display: flex;
  flex-direction: column;
}
</style>