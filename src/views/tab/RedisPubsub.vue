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
import { createRealtimeStream } from '@/utils/realtime-stream'
import { meCommands, meConfirm, meErr, meOk } from '@/utils/util'
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
// 实时流：批量缓冲并入 dataList，避免高频消息逐条头插拖慢主线程
const stream = createRealtimeStream<PubsubRow>({ maxRows: MAX_ROWS })
const dataList = stream.list

// 列描述：时间列导出/悬停保留完整日期时间（取 prop 原值），单元格经 #cell-datetime 只显时分秒（与迁移前一致）
const pubsubColumns = computed<MeColumn[]>(() => [
  { key: 'datetime', prop: 'datetime', title: t('redisPubSub.datetime'), width: 118 },
  {
    key: 'channel',
    prop: 'channel',
    title: t('redisPubSub.channel'),
    minWidth: 150,
    // 列头筛选 + 关键词搜索均由 MeTable 自动处理
    filterable: true,
    searchable: true,
  },
  {
    key: 'message',
    prop: 'message',
    title: t('redisPubSub.message'),
    minWidth: 150,
    searchable: true,
  },
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
      stream.flush() // 收尾：把缓冲里剩余消息立即并入，避免停订后丢尾部数据
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
// 多行编辑弹框：底栏保持单行（回车即发），复杂/多行内容在此编辑
const editorVisible = ref(false)

// 返回是否发布成功，供弹框决定发布后是否关闭
async function publish(): Promise<boolean> {
  sendLoading.value = true
  try {
    const viewFmt = sendMessageFmt.value
    let message = sendMessage.value
    try {
      message = meViewToWire(message, viewFmt)
    } catch (e) {
      meErr(e instanceof Error ? e.message : String(e))
      return false
    }
    await meCommands.publish(share.conn!.id, sendChannel.value, message, IPC_WIRE_FORMAT)
    sendMessage.value = ''
    meOk(t('redisPubSub.publishOk'))
    return true
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

// 弹框内发布：成功后关闭；频道/消息任一为空不响应
async function publishFromEditor() {
  if (sendLoading.value) return
  if (!sendChannel.value || !sendMessage.value) return
  if (await publish()) editorVisible.value = false
}

// 清空前二次确认（与命令日志页一致：防误点丢实时流数据）
function clearData() {
  meConfirm(t('redisPubSub.clearConfirm'), () => {
    stream.clear()
  })
}

// 监听消息
let unlisten: (() => void) | null = null
async function tauriListen() {
  unlisten = await listen<PubsubRow>('subscribe', event => {
    const payload = event.payload
    if (payload.id !== share.conn!.id) return
    stream.push(payload)
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
          style="width: 220px; margin: 0 10px"
          clearable />
        <me-button
          :icon="subscribing ? 'el-icon-video-pause' : 'el-icon-video-play'"
          :loading="loading"
          @click="subscribe"
          type="primary">
          {{ subscribing ? t('redisPubSub.subscribeStop') : t('redisPubSub.subscribeStart') }}
        </me-button>
      </div>
    </div>
    <div class="table">
      <me-table :data="dataList" :keyword="keyword" :columns="pubsubColumns" export-name="pubsub">
        <template #cell-datetime="{ row }">{{ row.datetime?.slice(11) }}</template>
      </me-table>
    </div>
    <div class="footer" v-if="canEdit">
      <el-input
        v-model="sendChannel"
        :placeholder="t('redisPubSub.channel')"
        class="footer-channel"
        clearable />
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
        <!-- 展开多行编辑：单行放不下时进弹框编辑，不改变底栏回车发送习惯 -->
        <template #suffix>
          <me-icon
            icon="el-icon-full-screen"
            class="footer-expand"
            :info="t('redisPubSub.multiLine')"
            placement="top"
            :show-after="200"
            @click="editorVisible = true" />
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
    <!-- 多行消息编辑弹框：与底栏共用 sendChannel / sendMessageFmt / sendMessage -->
    <me-dialog
      v-model="editorVisible"
      :title="t('redisPubSub.messageContent')"
      icon="el-icon-chat-line-square"
      width="640px"
      body-height="auto">
      <div class="editor">
        <el-input
          v-model="sendChannel"
          :placeholder="t('redisPubSub.channel')"
          class="editor-channel"
          clearable />
        <!-- 消息内容用 me-code：mode=json 获得 JSON 语法高亮（多行/自动换行/行号） -->
        <me-code
          v-model="sendMessage"
          mode="json"
          :placeholder="t('redisPubSub.messageContent')"
          class="editor-code" />
      </div>
      <!-- 编码下拉放底部左侧：与消息内容就近，避免误以为是频道的编码 -->
      <template #footer>
        <div class="editor-footer">
          <el-select
            v-model="sendMessageFmt"
            class="editor-fmt"
            :suffix-icon="MeSelectUpDownIcon"
            placement="top-start"
            :fallback-placements="['top', 'top-end']">
            <el-option
              v-for="item in BYTES_FORMAT"
              :key="item"
              :label="item"
              :value="item.toLowerCase()" />
          </el-select>
          <div>
            <el-button @click="editorVisible = false">{{ t('cancel') }}</el-button>
            <el-button
              type="warning"
              :loading="sendLoading"
              :disabled="!(sendChannel && sendMessage)"
              @click="publishFromEditor">
              {{ t('redisPubSub.send') }}
            </el-button>
          </div>
        </div>
      </template>
    </me-dialog>
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

      // 展开图标：靠右侧、可点击
      .footer-expand {
        display: inline-flex;
        align-items: center;
        height: 100%;
        cursor: pointer;
        color: var(--el-color-info);

        &:hover {
          color: var(--el-color-primary);
        }
      }
    }
  }
}

// 多行编辑弹框（slot 在 append-to-body 下仍携带本组件 scope，样式生效）
.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;

  // me-code 需固定高度（其内部 height:100%）
  .editor-code {
    width: 100%;
    height: 260px;
  }
}

// 底栏：左侧编码选择 + 右侧按钮
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .editor-fmt {
    // 按选中文案收缩（同外部 me-select-plain 宽度），但保留边框
    --el-select-width: max-content;

    :deep(.el-select__wrapper) {
      width: max-content;
    }

    // 选中项默认 absolute+width:100%，不进 max-content，改回文档流
    :deep(.el-select__selected-item.el-select__placeholder) {
      position: static;
      transform: none;
      width: auto;
    }
  }
}
</style>
