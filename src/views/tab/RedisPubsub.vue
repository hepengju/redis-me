<script setup>
import {meConfirm, meCopy, meInvoke, meOk} from '@/utils/util.js'
import {debounce} from 'lodash'
import {listen} from '@tauri-apps/api/event'

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
    await meInvoke('subscribe_stop', {id: share.conn.id})
    subscribing.value = false
    meOk('订阅已停止')
  } else {
    await meInvoke('subscribe', {id: share.conn.id, channel: channel.value})
    subscribing.value = true
    meOk('订阅已开始')
  }
}, 200)

// 发送消息
const sendChannel = ref('')
const sendMessage = ref('')
const sendLoading = ref(false)
async function publish() {
  sendLoading.value = true
  try {
    await meInvoke('publish', {id: share.conn.id, channel: sendChannel.value, message: sendMessage.value})
    meOk("发布消息成功")
  } finally {
    sendLoading.value = false
  }
}

function clearData() {
  meConfirm('确定清空消息吗？', () => dataList.value = [])
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
        <el-input v-model="channel" style="width: 160px; margin-right: 10px"
                  placeholder="订阅频道" :disabled="subscribing" clearable/>
      </div>
      <div>
        <el-input  v-model="keyword" placeholder="模糊筛选（频道、消息）" style="width: 280px; margin-right: 10px" clearable/>
        <me-button icon="el-icon-bottom" info="滚动到最新" placement="top"/>
        <me-button icon="el-icon-delete" info="清空消息" @click="clearData" :disabled="dataList.length === 0" placement="top"/>
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
            <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn" @click="meCopy(scope.row.message)"
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
