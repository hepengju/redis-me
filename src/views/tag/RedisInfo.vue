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
        <el-tag type="success" style="margin-left: 10px">v{{info.dic['redis_version']}}</el-tag>
        <el-tag type="warning" style="margin-left: 10px" v-if="info.dic['redis_mode']">{{info.dic['redis_mode']}}</el-tag>
        <el-tag type="danger"  style="margin-left: 10px" v-if="info.dic['role']">{{info.dic['role']}}</el-tag>
      </template>
      <el-descriptions-item>
        <template #label>
          <me-icon name="运行时间" icon="el-icon-timer"></me-icon>
        </template>
        {{info.dic['uptime_in_days']}}天
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label>
          <me-icon name="键数量" icon="el-icon-key"/>
        </template>
        {{info.keys}}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label>
          <me-icon name="连接数" icon="me-icon-conn"/>
        </template>
        {{info.dic['connected_clients']}} <el-text type="info"> [ max: {{info.dic['maxclients']}} ]</el-text>
      </el-descriptions-item>

      <el-descriptions-item label="已用内存">
        <template #label>
          <me-icon name="已用内存" icon="me-icon-memory"/>
        </template>
        {{info.dic['used_memory_human']}}
      </el-descriptions-item>
      <el-descriptions-item label="OS">
        <template #label>
          <me-icon name="系统" icon="me-icon-os"/>
        </template>
        {{info.dic['os']}}
      </el-descriptions-item>
    </el-descriptions>

    <pre>
{{ store.info }}
    </pre>
  </div>

</template>

<style scoped lang="scss">
.redis-info {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>