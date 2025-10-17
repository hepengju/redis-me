<script setup>
import api from '@/api/index.js'
import {useTemplateRef} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {copy} from '@/views/ark/extops/redis-me/util/me.js'

// 共享数据
const share = inject('share')

const timeout = ref(5)
const channel = ref('')
const keyword = ref('')
const loading = ref(false)
const dataList = ref([])
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(row => !key
    || row.channel?.toLowerCase().indexOf(key) > -1
    || row.message?.toLowerCase().indexOf(key) > -1
  )
})

async function apiSubscribe() {
  const channelList = channel.value ? channel.value.split(',') : []
  const res = await api.ark.extops.redis.subscribe(share.env, {channelList, timeout: timeout.value * 1000})
  if (res.code == 200) {
    dataList.value = res.data
  } else {
    ElMessageBox.alert(res.msg, '提示', { type: 'error'})
  }
}

async function refresh() {
  loading.value = true
  try {
    await apiSubscribe()
  } finally {
    loading.value = false
  }
}

// 发送消息
const sendChannel = ref('')
const sendMessage = ref('')
const sendLoading = ref(false)
async function apiPublish() {
  const res = await api.ark.extops.redis.publish(share.env, {
    channel: sendChannel.value,
    message: sendMessage.value
  })
  if (res.code == 200) {
    ElMessage.success("发布消息成功")
  } else {
    ElMessageBox.alert(res.msg, '提示', {type: 'error'})
  }
}

async function publish() {
  sendLoading.value = true
  try {
    await apiPublish()
  } finally {
    sendLoading.value = false
  }
}

// 避免表格自动调整列宽时闪烁一下
const tableRef = useTemplateRef(('table'))
const tableTotal = computed(() => tableRef.value?.store?.states?.data?.value?.length ?? 0)
watch(() => share.tabName, newValue => {
  if (newValue === 'pubsub') {
    nextTick(() => {
      tableRef.value.doLayout()
    })
  }
})
</script>

<template>
  <div class="redis-pubsub">
    <div class="me-flex header">
      <div>
        <el-input v-model="channel" style="width: 250px; margin-right: 10px" placeholder=" 可选订阅频道（逗号分隔多个）">
          <template #prefix>
            <div style="margin-right: 10px">频道</div>
          </template>
        </el-input>
        <el-input-number v-model="timeout" style="width: 120px" :min="1" :max="30">
          <template #suffix>秒</template>
        </el-input-number>
      </div>
      <div>
        <el-text v-if="tableTotal > 0" type="info" style="margin-right: 10px">[ 总数: {{tableTotal}} ]</el-text>
        <el-input  v-model="keyword" placeholder="模糊筛选（频道、消息）" style="width: 280px; margin-right: 10px" clearable/>
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading"/>
      </div>
    </div>
    <div class="table">
      <el-table size="large" :data="filterDataList" ref="table"
                v-loading="loading"
                border stripe height="100%">
        <el-table-column label="时间" prop="datetime" sortable width="200"/>
        <el-table-column label="频道" prop="channel"  show-overflow-tooltip/>
        <el-table-column label="消息" prop="message"  show-overflow-tooltip/>
        <el-table-column label="操作" width="60" align="center">
          <template #default="scope">
            <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn" @click.stop="copy(scope.row.message)"
                     style="justify-content: center"/>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="footer">
      <el-input v-model="sendChannel" placeholder="频道" style="width: 200px"></el-input>
      <el-input v-model="sendMessage" placeholder="消息内容" style="margin: 0 10px"></el-input>
      <el-button icon="el-icon-promotion" @click="publish" type="warning" :loading="sendLoading" :disabled="!(sendChannel && sendMessage)">发送</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-pubsub {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
  }

  .table {
    flex-grow: 1;
    height: 0;
    margin: 10px 0;
  }

  .footer {
    display: flex;
  }
}
</style>
