<script setup lang="ts">
// #region 导入
import { listen } from '@tauri-apps/api/event'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import MeWebsite from '@/components/MeWebsite.vue'
import { shareProvideKey } from '@/types/me-interface'
import { createRealtimeStream, filterByKeyword } from '@/utils/realtime-stream'
import { meCommands, meConfirm, meCopy, meOk } from '@/utils/util'
// #endregion

// #region 核心状态
const { t } = useI18n()
// 共享数据
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)
// 集群配置广播所有节点（*），单机 node 传 null
const setNode = computed(() => (share.conn?.cluster ? '*' : null))

// 视角：一次只订一族，避免 K+E 同开时同一事件重复成两行
const perspective = ref<'keyevent' | 'keyspace'>('keyevent')
// 当前库号（DB 下拉「当前库」选项的值）
const currentDb = computed(() => share.conn?.db ?? 0)
// 订阅目标库：仅「当前库」与「全部库」（'all' → @*），默认当前库
const dbSelect = ref<number | 'all'>(currentDb.value)
// el-segmented 选项（i18n 响应式，用 computed 构建）
const perspectiveOptions = computed(() => [
  { label: t('redisNotify.keyevent'), value: 'keyevent' },
  { label: t('redisNotify.keyspace'), value: 'keyspace' },
])
const dbOptions = computed(() => [
  { label: t('redisNotify.dbCurrent'), value: currentDb.value },
  { label: t('redisNotify.dbAll'), value: 'all' },
])
// 订阅匹配模式：空 → *（keyspace 匹配键名，keyevent 匹配事件名）
const pattern = ref('')
const keyword = ref('')
const subscribing = ref(false)
const loading = ref(false)

// 实时流软上限，防止长时间不清空撑爆内存 / 拖慢虚拟列表（与 CommandLog 同思路，阈值更宽）
const MAX_ROWS = 10000

// 与 Tauri `notify` 事件 payload（NotifyEvent）一致
interface NotifyRow {
  id?: string
  datetime?: string
  node?: string
  db?: number
  key?: string
  event?: string
}
// 实时流：批量缓冲并入 dataList，避免高频通知逐条头插拖慢主线程
const stream = createRealtimeStream<NotifyRow>({ maxRows: MAX_ROWS })
const dataList = stream.list
const filterDataList = computed(() =>
  filterByKeyword(
    dataList.value,
    keyword.value,
    (row, key) =>
      (row.key?.toLowerCase() ?? '').indexOf(key) > -1 ||
      (row.event?.toLowerCase() ?? '').indexOf(key) > -1 ||
      (row.node?.toLowerCase() ?? '').indexOf(key) > -1,
  ),
)

// 列描述：单一来源驱动渲染/排序/导出；节点列仅集群显示（单机 node 为空串）
const notifyColumns = computed<MeColumn<NotifyRow>[]>(() => [
  { key: 'datetime', prop: 'datetime', title: t('redisNotify.datetime'), width: 118 },
  ...(share.conn?.cluster
    ? ([
        { key: 'node', prop: 'node', title: t('redisNotify.node'), width: 150 },
      ] as MeColumn<NotifyRow>[])
    : []),
  { key: 'db', prop: 'db', title: t('redisNotify.db'), width: 64, align: 'center' },
  { key: 'key', prop: 'key', title: t('redisNotify.key'), minWidth: 200 },
  { key: 'event', prop: 'event', title: t('redisNotify.event'), width: 120 },
  { key: 'action', title: t('action'), width: 80, align: 'center' },
])
// #endregion

// #region 配置：notify-keyspace-events 读取与一键开关
const configValue = ref('')
const configLoading = ref(false)
const customFlags = ref('')
// 已开启时按钮显示「更新」，未开启显示「开启」（避免已开启仍叫开启的违和）
const enableLabel = computed(() =>
  configValue.value ? t('redisNotify.update') : t('redisNotify.enable'),
)
// flag 字母含义 / pattern 语义提示（HTML，raw-content 渲染）
const flagsHint = computed(() => t('redisNotify.flagsHint'))
const patternHint = computed(() => t('redisNotify.patternHint'))
// 服务器配置编辑弹框：参考慢参数页（参数内联 + 编辑图标弹框）
const editShow = ref(false)
// 将要执行的命令，弹框内展示、点击可复制（同慢参数弹框样式）
const setCommand = computed(() => {
  const flags = customFlags.value.trim()
  return `CONFIG SET notify-keyspace-events ${flags || '""'}`
})

function openEditDialog() {
  editShow.value = true
  void loadConfig()
}

// 读取当前配置；CONFIG 被 ACL 限制时降级为空（不挡订阅）
async function loadConfig() {
  configLoading.value = true
  try {
    const data = await meCommands.configGet(share.conn!.id, 'notify-keyspace-events', null, false)
    configValue.value = data?.['notify-keyspace-events'] ?? ''
  } catch {
    configValue.value = ''
  } finally {
    configLoading.value = false
  }
}

function enableNotify() {
  const flags = customFlags.value.trim()
  // flag 为空即「禁用通知」（CONFIG SET 置空），否则为开启/更新，带开销与非持久警告
  const isDisable = !flags
  meConfirm(
    isDisable ? t('redisNotify.disableConfirm') : t('redisNotify.enableConfirm'),
    async () => {
      configLoading.value = true
      try {
        await meCommands.configSet(share.conn!.id, 'notify-keyspace-events', flags, setNode.value)
        configValue.value = flags
        meOk(isDisable ? t('redisNotify.disableOk') : t('redisNotify.enableOk'))
        editShow.value = false
      } finally {
        configLoading.value = false
      }
    },
    { dangerouslyUseHTMLString: true },
  )
}
// #endregion

// #region 订阅
const subscribe = async () => {
  loading.value = true
  try {
    if (subscribing.value) {
      unlisten?.()
      await meCommands.notifySubscribeStop(share.conn!.id)
      subscribing.value = false
      stream.flush() // 收尾：把缓冲里剩余通知立即并入，避免停订后丢尾部消息
      meOk(t('redisNotify.subscribeStopped'))
    } else {
      await tauriListen()
      await meCommands.notifySubscribe(share.conn!.id, {
        perspective: perspective.value,
        db: dbSelect.value === 'all' ? null : dbSelect.value,
        pattern: pattern.value || null,
      })
      subscribing.value = true
      meOk(t('redisNotify.subscribeStarted'))
    }
  } finally {
    loading.value = false
  }
}

function clearData() {
  stream.clear()
}

// 监听通知事件（按连接 id 过滤，避免串到别的连接）
let unlisten: (() => void) | null = null
async function tauriListen() {
  unlisten = await listen<NotifyRow>('notify', event => {
    const payload = event.payload
    if (payload.id !== share.conn!.id) return
    stream.push(payload)
  })
}

onMounted(() => {
  if (canEdit.value) void loadConfig()
})
onUnmounted(() => unlisten?.())
// #endregion
</script>

<template>
  <div class="redis-notify">
    <div class="me-flex">
      <div class="me-flex">
        <me-button
          icon="el-icon-delete"
          :info="t('redisNotify.clearMessage')"
          @click="clearData"
          :disabled="dataList.length === 0"
          placement="top" />
        <!-- 编辑服务器配置（notify-keyspace-events），只读连接隐藏 -->
        <me-button
          icon="el-icon-edit"
          :info="t('redisNotify.editConfig')"
          style="margin-left: 10px"
          v-if="canEdit"
          placement="top"
          @click="openEditDialog" />
        <!-- 订阅参数：两行（事件方式 / 哪个库），参考慢参数页 -->
        <el-dropdown
          placement="bottom-start"
          :hide-on-click="false"
          :teleported="false"
          style="margin-left: 10px">
          <el-button icon="el-icon-data-board">{{ t('redisNotify.param') }}</el-button>
          <template #dropdown>
            <el-dropdown-menu class="notify-param">
              <el-dropdown-item>
                <div class="param-row">
                  <span class="param-label">{{ t('redisNotify.eventMode') }}</span>
                  <!-- 分段控件无浮层，直接内联切换，避免 el-select 嵌在下拉里的抢焦点问题 -->
                  <el-segmented
                    v-model="perspective"
                    :options="perspectiveOptions"
                    :disabled="subscribing" />
                </div>
              </el-dropdown-item>
              <el-dropdown-item>
                <div class="param-row">
                  <span class="param-label">{{ t('redisNotify.dbWhich') }}</span>
                  <el-segmented v-model="dbSelect" :options="dbOptions" :disabled="subscribing" />
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- 订阅匹配模式：空即 *，语义随视角（键名 / 事件名） -->
        <el-input
          v-model="pattern"
          :placeholder="t('redisNotify.pattern')"
          :disabled="subscribing"
          style="width: 160px; margin-left: 10px"
          clearable>
          <template #prefix>
            <me-icon
              icon="el-icon-question-filled"
              :info="patternHint"
              raw-content
              placement="bottom-start"
              :show-after="200" />
          </template>
        </el-input>
        <me-website to="notify" />
      </div>
      <div>
        <el-input
          v-model="keyword"
          :placeholder="t('redisNotify.keyword')"
          style="width: 220px; margin: 0 10px"
          clearable />
        <me-button
          :icon="subscribing ? 'el-icon-video-pause' : 'el-icon-video-play'"
          :loading="loading"
          @click="subscribe"
          type="primary">
          {{ subscribing ? t('redisNotify.subscribeStop') : t('redisNotify.subscribeStart') }}
        </me-button>
      </div>
    </div>
    <div class="table">
      <me-table
        :data="filterDataList"
        :columns="notifyColumns"
        :total="dataList.length"
        export-name="notify">
        <template #cell-datetime="{ row }">{{ row.datetime?.slice(11) }}</template>
        <template #cell-action="{ row }">
          <me-icon
            :info="t('copy')"
            icon="el-icon-document-copy"
            class="icon-btn"
            style="justify-content: center"
            @click="meCopy(row.key)" />
        </template>
      </me-table>
    </div>

    <!-- 编辑服务器配置弹框：参考慢参数页弹框，命令点击可复制 -->
    <el-dialog
      :title="t('redisNotify.editConfig')"
      v-model="editShow"
      align-center
      width="480px"
      destroy-on-close>
      <div class="notify-edit">
        <el-form label-width="80px">
          <el-form-item :label="t('redisNotify.configStatus')">
            <el-tag :type="configValue ? 'success' : 'danger'" v-loading="configLoading">
              {{ configValue || t('redisNotify.configEmpty') }}
            </el-tag>
          </el-form-item>
          <el-form-item :label="t('redisNotify.preset')">
            <el-button @click="customFlags = 'AKE'">
              {{ t('redisNotify.presetAll') }} · AKE
            </el-button>
            <el-button @click="customFlags = 'Ex'">
              {{ t('redisNotify.presetExpired') }} · Ex
            </el-button>
            <!-- 禁用通知：置空 flag，后续「更新」提交 CONFIG SET 空字符串 -->
            <el-button @click="customFlags = ''">{{ t('redisNotify.presetDisable') }}</el-button>
          </el-form-item>
          <el-form-item :label="t('redisNotify.flags')">
            <el-input v-model="customFlags" :placeholder="t('redisNotify.custom')">
              <template #append>
                <el-tooltip raw-content :content="flagsHint" popper-style="max-width: 600px">
                  <el-icon><el-icon-question-filled /></el-icon>
                </el-tooltip>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item :label="t('redisConfig.command')">
            <el-text
              @click="meCopy(setCommand)"
              style="cursor: pointer"
              :style="{ color: share.color }">
              {{ setCommand }}
            </el-text>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="configLoading" @click="editShow = false">
          {{ t('cancel') }}
        </el-button>
        <el-button type="primary" :loading="configLoading" @click="enableNotify">
          {{ enableLabel }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.redis-notify {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  // 工具栏控件较多，窄窗口下换行而非裁掉订阅按钮
  > .me-flex {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;
  }
}

// 订阅参数下拉（:teleported="false" 渲染在组件内，scoped 生效）
.notify-param {
  .param-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .param-label {
    width: 64px;
    color: var(--el-text-color-regular);
  }
}

// 服务器配置编辑弹框：flag 输入框的 ? 后缀宽度与内存 Tab 扫描配置保持一致
.notify-edit {
  :deep(.el-input-group__append) {
    width: 42px;
  }
}
</style>
