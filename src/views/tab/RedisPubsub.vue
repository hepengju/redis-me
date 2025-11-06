<script setup>
import {ElMessage} from 'element-plus'
import {copy, invoke_then} from '@/utils/util.js'
import {debounce} from 'lodash'
import { listen } from '@tauri-apps/api/event';

// 共享数据
const share = inject('share')

const channel = ref('')
const keyword = ref('')
const subscribing = ref(false)
const dataList = ref([])
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(row => !key
    || row.channel?.toLowerCase().indexOf(key) > -1
    || row.message?.toLowerCase().indexOf(key) > -1
  )
})

// 订阅按钮防抖
const subscribe = debounce(async () => {
  if (subscribing.value) {
    await invoke_then('subscribe_stop', {id: share.conn.id})
    subscribing.value = false
    ElMessage.success('订阅已停止')
  } else {
    await invoke_then('subscribe', {id: share.conn.id, channel: channel.value})
    subscribing.value = true
    ElMessage.success('订阅已开始')
  }
}, 200)

// 发送消息
const sendChannel = ref('')
const sendMessage = ref('')
const sendLoading = ref(false)
async function publish() {
  sendLoading.value = true
  try {
    await invoke_then('publish', {id: share.conn.id, channel: sendChannel.value, message: sendMessage.value})
    ElMessage.success("发布消息成功")
  } finally {
    sendLoading.value = false
  }
}

// 监听消息
let unlisten = null
onMounted(async () => {
  unlisten = await listen('subscribe', (event) => {
    const payload = event.payload
    if (payload.id != share.conn.id) return
    dataList.value.push(event.payload)
  })
})
onUnmounted(() => {
  if (unlisten) {
    unlisten()
  }
})
</script>

<template>
  <div class="redis-pubsub">
    <div class="me-flex header">
      <div>
        <el-input v-model="channel" style="width: 200px; margin-right: 10px" placeholder="可选订阅频道"/>
      </div>
      <div>
        <el-input  v-model="keyword" placeholder="模糊筛选（频道、消息）" style="width: 280px; margin-right: 10px" clearable/>
        <el-button :icon="subscribing ? 'el-icon-video-pause' : 'el-icon-video-play'"
                   @click="subscribe" type="primary">
          {{subscribing ? '停止订阅' : '开启订阅'}}
        </el-button>
      </div>
    </div>
    <div class="table">
      <el-table :data="filterDataList" ref="table" border stripe height="100%">
        <el-table-column label="时间" prop="datetime" sortable width="200"/>
        <el-table-column label="频道" prop="channel"  show-overflow-tooltip/>
        <el-table-column label="消息" prop="message"  show-overflow-tooltip/>
        <el-table-column label="操作" width="60" align="center">
          <template #default="scope">
            <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn" @click="copy(scope.row.message)"
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
