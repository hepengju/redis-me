<script setup lang="ts">
// #region 导入
import { listen } from '@tauri-apps/api/event'
import { computed, inject, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import MeSelectUpDownIcon from '@/components/MeSelectUpDownIcon.vue'
import MeWebsite from '@/components/MeWebsite.vue'
import { shareProvideKey } from '@/types/me-interface'
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

// 实时流软上限，防止长时间不清空撑爆内存 / 拖慢虚拟列表（与 CommandLog 同思路，阈值更宽）
const MAX_ROWS = 10000

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

// 列描述：时间列导出/悬停保留完整日期时间（取 prop 原值），单元格经 #cell-datetime 只显时分秒（与迁移前一致）
const pubsubColumns = computed<MeColumn[]>(() => [
  { key: 'datetime', prop: 'datetime', title: t('redisPubSub.datetime'), width: 118 },
  { key: 'channel', prop: 'channel', title: t('redisPubSub.channel'), minWidth: 150 },
  { key: 'message', prop: 'message', title: t('redisPubSub.message'), minWidth: 150 },
  { key: 'action', title: t('action'), width: 80, align: 'center' },
])

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
    // 新记录入头 → 数组天然时间倒序，显示层不再依赖 default-sort，省一次 MeTable orderBy 全表排序
    dataList.value.unshift(payload)
    if (dataList.value.length > MAX_ROWS) dataList.value.length = MAX_ROWS
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
        :columns="pubsubColumns"
        :total="dataList.length"
        export-name="pubsub">
        <template #cell-datetime="{ row }">{{ row.datetime?.slice(11) }}</template>
        <template #cell-action="{ row }">
          <me-icon
            :info="t('copy')"
            icon="el-icon-document-copy"
            class="icon-btn"
            style="justify-content: center"
            @click="meCopy(row.message)" />
        </template>
      </me-table>
    </div>
    <div class="footer" v-if="canEdit">
      <el-input
        v-model="sendChannel"
        :placeholder="t('redisPubSub.channel')"
        class="footer-channel" />
      <!-- 编码选择：内嵌在消息输入框左侧（prepend），套用 me-select 无边框样式；底栏贴底故下拉向上 -->
      <el-input
        v-model="sendMessage"
        :placeholder="t('redisPubSub.messageContent')"
        class="footer-message"
        @keydown.enter.prevent="publishOnEnter">
        <template #prepend>
          <el-select
            v-model="sendMessageFmt"
            class="footer-message-fmt me-select-plain"
            :suffix-icon="MeSelectUpDownIcon"
            placement="top-start"
            :fallback-placements="['top', 'top-end']">
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
