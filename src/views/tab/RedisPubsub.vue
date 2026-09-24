<script setup lang="ts">
// #region 导入
import { listen } from '@tauri-apps/api/event'
import { computed, inject, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MeWebsite from '@/components/MeWebsite.vue'
import { shareProvideKey } from '@/types/me-interface'
import type { TableExportMatrix } from '@/utils/export'
import { BYTES_FORMAT, IPC_WIRE_FORMAT, meViewToWire, type ViewBytesFormat } from '@/utils/format'
import { meCopy, meCommands, meErr, meOk } from '@/utils/util'
// #endregion

// #region 核心状态

const { t } = useI18n()
// 共享数据
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)

const channel = ref('')
const keyword = ref('')
const subscribing = ref(false)

interface PubsubRow {
  id?: string
  datetime?: string
  channel?: string
  message?: string
}
const dataList = ref<PubsubRow[]>([])
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return dataList.value.filter(
    row =>
      !key ||
      (row.channel?.toLowerCase() ?? '').indexOf(key) > -1 ||
      (row.message?.toLowerCase() ?? '').indexOf(key) > -1,
  )
})

// MeTable 导出：由行数据直接计算展示文本，与表格列定义一致（改列时同步改这里）
function exportRows(data: unknown[]): TableExportMatrix {
  return {
    headers: [t('redisPubSub.datetime'), t('redisPubSub.channel'), t('redisPubSub.message')],
    rows: (data as PubsubRow[]).map(row => [
      row.datetime ?? '',
      row.channel ?? '',
      row.message ?? '',
    ]),
  }
}

// 订阅按钮防抖
const loading = ref(false)
const subscribe = async () => {
  loading.value = true
  try {
    if (subscribing.value) {
      unlisten?.()
      await meCommands.subscribeStop(share.conn!.id)
      subscribing.value = false
      meOk(t('redisPubSub.subscribeStopped'))
    } else {
      await tauriListen()
      await meCommands.subscribe(share.conn!.id, channel.value)
      subscribing.value = true
      meOk(t('redisPubSub.subscribeStarted'))
    }
  } finally {
    loading.value = false
  }
}

// 发送消息（编码流程与 FieldAdd 值编码一致：view → wire + msgFmt）
const sendChannel = ref('')
const sendMessage = ref('')
const sendMessageFmt = ref<ViewBytesFormat>('utf8')
const sendLoading = ref(false)

async function publish() {
  sendLoading.value = true
  try {
    const viewFmt = sendMessageFmt.value
    let message = sendMessage.value
    try {
      message = meViewToWire(message, viewFmt)
    } catch (e) {
      meErr(e instanceof Error ? e.message : String(e))
      return
    }
    await meCommands.publish(share.conn!.id, sendChannel.value, message, IPC_WIRE_FORMAT)
    sendMessage.value = ''
    meOk(t('redisPubSub.publishOk'))
  } finally {
    sendLoading.value = false
  }
}

// 消息框回车发送（与发送按钮一致：频道非空且消息非空）
function publishOnEnter() {
  if (sendLoading.value) return
  if (!sendChannel.value || !sendMessage.value) return
  void publish()
}

function clearData() {
  dataList.value = []
  //meConfirm('确定清空消息吗？', () => dataList.value = [])
}

// 监听消息
let unlisten: (() => void) | null = null
async function tauriListen() {
  unlisten = await listen<PubsubRow>('subscribe', event => {
    const payload = event.payload
    if (payload.id !== share.conn!.id) return
    dataList.value.push(payload)
  })
}

async function tauriUnlisten() {
  unlisten?.()
}
onUnmounted(() => tauriUnlisten())
// #endregion
</script>

<template>
  <div class="redis-pubsub">
    <div class="me-flex">
      <div class="me-flex">
        <me-button
          icon="el-icon-delete"
          :info="t('redisPubSub.clearMessage')"
          @click="clearData"
          :disabled="dataList.length === 0"
          placement="top" />
        <el-input
          v-model="channel"
          style="width: 250px; margin-left: 10px"
          :placeholder="t('redisPubSub.subscribeChannel')"
          :disabled="subscribing"
          clearable>
          <template #prefix>
            <me-icon
              icon="el-icon-question-filled"
              :info="t('redisPubSub.psubscribePatternHint')"
              raw-content
              placement="bottom-start"
              :show-after="200" />
          </template>
        </el-input>
        <me-website to="pubsub" />
      </div>
      <div>
        <el-input
          v-model="keyword"
          :placeholder="t('redisPubSub.keyword')"
          style="width: 280px; margin: 0 10px"
          clearable />
        <me-button
          :icon="subscribing ? 'el-icon-video-pause' : 'el-icon-user'"
          :loading="loading"
          @click="subscribe"
          type="primary">
          {{ subscribing ? t('redisPubSub.subscribeStop') : t('redisPubSub.subscribeStart') }}
        </me-button>
      </div>
    </div>
    <div class="table">
      <me-table
        :data="filterDataList"
        ref="table"
        :default-sort="{ prop: 'datetime', order: 'descending' }"
        export-name="pubsub"
        :export-rows="exportRows">
        <el-table-column
          :label="t('redisPubSub.datetime')"
          prop="datetime"
          width="118"
          sortable
          show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.datetime?.slice(11) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('redisPubSub.channel')" prop="channel" show-overflow-tooltip />
        <el-table-column :label="t('redisPubSub.message')" prop="message" show-overflow-tooltip />
        <el-table-column :label="t('action')" width="80" align="center">
          <template #default="scope">
            <me-icon
              :info="t('copy')"
              icon="el-icon-document-copy"
              class="icon-btn"
              @click="meCopy(scope.row.message)"
              style="justify-content: center" />
          </template>
        </el-table-column>
      </me-table>
    </div>
    <div class="footer" v-if="canEdit">
      <el-input
        v-model="sendChannel"
        :placeholder="t('redisPubSub.channel')"
        class="footer-channel" />
      <el-input
        v-model="sendMessage"
        :placeholder="t('redisPubSub.messageContent')"
        class="footer-message"
        @keydown.enter.prevent="publishOnEnter">
        <template #append>
          <el-select v-model="sendMessageFmt" style="width: 100px">
            <el-option
              v-for="item in BYTES_FORMAT"
              :key="item"
              :label="item"
              :value="item.toLowerCase()" />
          </el-select>
        </template>
      </el-input>
      <el-button
        icon="el-icon-promotion"
        @click="publish"
        type="warning"
        :loading="sendLoading"
        :disabled="!(sendChannel && sendMessage)"
        >{{ t('redisPubSub.send') }}</el-button
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-pubsub {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .table {
    flex-grow: 1;
    height: 0;
    margin: 10px 0;
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 10px;

    .footer-channel {
      width: 200px;
      flex-shrink: 0;
    }

    .footer-message {
      flex: 1;
      min-width: 0;
    }
  }
}
</style>
