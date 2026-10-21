<script setup lang="ts">
// #region 导入
// RedisME 客户端命令执行日志；非模态弹窗，标题栏可拖动
import { listen } from '@tauri-apps/api/event'
import { computed, inject, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import { shareProvideKey } from '@/types/me-interface'
import type { CommandLogEntry } from '@/types/tauri-specta'
import { meCommands, meConfirm, meOk } from '@/utils/util'
// #endregion

// #region 核心状态

interface CommandLogEvent {
  id: string
  entry: CommandLogEntry
}

const visible = defineModel<boolean>({ default: false })

const { t } = useI18n()
const share = inject(shareProvideKey)!

// 搜索关键词
const keyword = ref('')
const loading = ref(false)
const logs = ref<CommandLogEntry[]>([])
let unlisten: (() => void) | null = null

// 高亮状态：记录最新ID和需要高亮的行ID集合
const seenMaxId = ref(0)
const highlightIds = ref(new Set<number>())
const highlightColor = computed(() => share.conn?.color || share.color || 'var(--el-color-primary)')

// 弹框配置常量
const DIALOG_CLASS = 'command-log-dialog'
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type ResizeDir = (typeof RESIZE_DIRS)[number]
const MIN_W = 520
const MIN_H = 320
const LOG_LIMIT = 1000
const SLOW_MS = 100 // 慢命令阈值（毫秒）
const HIGHLIGHT_WINDOW_MS = 1000 // 高亮时间窗口（毫秒）

// 解析日志时间戳为毫秒
function parseLogTime(timestamp: string): number {
  const ms = Date.parse(timestamp.replace(' ', 'T'))
  return Number.isFinite(ms) ? ms : 0
}

// 重置高亮状态（切换连接或关闭弹框时调用）
function resetHighlightState() {
  seenMaxId.value = 0
  highlightIds.value = new Set()
}

// 标记新条目并计算需要高亮的行（最近1秒内的命令）
function markNewEntry(entry: CommandLogEntry) {
  if (entry.id <= seenMaxId.value) return
  seenMaxId.value = entry.id

  const latestMs = parseLogTime(entry.timestamp)
  const ids = new Set<number>()
  for (const row of logs.value) {
    const diff = latestMs - parseLogTime(row.timestamp)
    if (diff >= 0 && diff <= HIGHLIGHT_WINDOW_MS) {
      ids.add(row.id)
    }
  }
  highlightIds.value = ids
}
// #endregion

// #region 日志监听

function stopListening() {
  unlisten?.()
  unlisten = null
}

// 开始监听命令日志事件（实时接收新命令）
async function startListening() {
  stopListening()
  unlisten = await listen<CommandLogEvent>('command-log', event => {
    if (event.payload.id !== share.conn?.id) return // 只处理当前连接的日志
    const entry = event.payload.entry
    if (entry.id <= seenMaxId.value) return // 跳过已处理的条目
    logs.value.unshift(entry)
    if (logs.value.length > LOG_LIMIT) logs.value.length = LOG_LIMIT // 限制最大条数
    markNewEntry(entry)
  })
}
// #endregion

// #region 面板操作

// 获取弹框DOM元素
function getDialogEl(): HTMLElement | null {
  return document.querySelector(`.el-dialog.${DIALOG_CLASS}`)
}

// 限制弹框尺寸（最小/最大宽高）
function clampSize(w: number, h: number) {
  return {
    w: Math.min(Math.max(w, MIN_W), window.innerWidth * 0.96),
    h: Math.min(Math.max(h, MIN_H), window.innerHeight * 0.92),
  }
}

// 固定弹框位置：将相对定位转为绝对定位，用于拖动和缩放
function pinDialog(el: HTMLElement) {
  if (el.dataset.commandLogPinned) return // 已固定则跳过
  const rect = el.getBoundingClientRect()
  el.style.position = 'fixed'
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  el.style.margin = '0'
  el.style.transform = 'none'
  el.style.width = `${rect.width}px`
  el.style.height = `${rect.height}px`
  el.dataset.commandLogPinned = '1'
}

// 移除所有拖动手柄
function removeResizeHandles(el: HTMLElement) {
  el.querySelectorAll('.command-log-resize-handle').forEach(node => node.remove())
}

// 开始调整弹框大小（拖动边缘）
function onResizeStart(e: MouseEvent, dir: ResizeDir) {
  e.preventDefault()
  e.stopPropagation()
  const el = getDialogEl()
  if (!el) return
  pinDialog(el)
  const rect = el.getBoundingClientRect()
  const start = {
    x: e.clientX,
    y: e.clientY,
    w: rect.width,
    h: rect.height,
    l: rect.left,
    t: rect.top,
  }

  // 鼠标移动时计算新尺寸和位置
  const onMove = (ev: MouseEvent) => {
    let l = start.l
    let top = start.t
    let w = start.w
    let h = start.h
    const dx = ev.clientX - start.x
    const dy = ev.clientY - start.y

    if (dir.includes('e')) w = start.w + dx
    if (dir.includes('w')) {
      w = start.w - dx
      l = start.l + dx
    }
    if (dir.includes('s')) h = start.h + dy
    if (dir.includes('n')) {
      h = start.h - dy
      top = start.t + dy
    }

    const sized = clampSize(w, h)
    if (dir.includes('w')) l = start.l + start.w - sized.w
    if (dir.includes('n')) top = start.t + start.h - sized.h

    el.style.left = `${l}px`
    el.style.top = `${top}px`
    el.style.width = `${sized.w}px`
    el.style.height = `${sized.h}px`
  }

  // 鼠标松开时结束调整
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// 创建8个方向的拖动手柄
function setupResizeHandles() {
  const el = getDialogEl()
  if (!el) return
  removeResizeHandles(el)
  for (const dir of RESIZE_DIRS) {
    const handle = document.createElement('div')
    handle.className = `command-log-resize-handle command-log-resize-handle--${dir}`
    handle.addEventListener('mousedown', e => onResizeStart(e, dir))
    el.appendChild(handle)
  }
}

// 开始拖动弹框（标题栏）
function onDragMouseDown(e: Event) {
  if (!(e instanceof MouseEvent)) return
  if (e.target instanceof HTMLElement && e.target.closest('.el-dialog__headerbtn')) return // 排除关闭按钮
  const el = getDialogEl()
  if (!el) return
  pinDialog(el)
  const start = {
    x: e.clientX,
    y: e.clientY,
    l: el.getBoundingClientRect().left,
    t: el.getBoundingClientRect().top,
  }

  // 鼠标移动时更新位置
  const onMove = (ev: MouseEvent) => {
    el.style.left = `${start.l + ev.clientX - start.x}px`
    el.style.top = `${start.t + ev.clientY - start.y}px`
  }

  // 鼠标松开时结束拖动
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// 重置弹框样式（关闭时恢复默认状态）
function resetDialogShell() {
  const el = getDialogEl()
  if (!el) return
  removeResizeHandles(el)
  el.style.position = ''
  el.style.left = ''
  el.style.top = ''
  el.style.margin = ''
  el.style.transform = ''
  el.style.width = ''
  el.style.height = ''
  delete el.dataset.commandLogPinned
}

// 弹框打开后：创建拖动手柄并绑定拖动事件
function onDialogOpened() {
  setupResizeHandles()
  getDialogEl()?.querySelector('.el-dialog__header')?.addEventListener('mousedown', onDragMouseDown)
}

// 将弹框定位到右下角（留出50px边距）
function positionDialogToBottomRight() {
  const el = getDialogEl()
  if (!el) return
  const rect = el.getBoundingClientRect()
  const margin = 50
  const left = window.innerWidth - rect.width - margin
  const top = window.innerHeight - rect.height - margin

  pinDialog(el)
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

// 弹框关闭前：解绑拖动事件并重置样式
function onDialogClosed() {
  getDialogEl()
    ?.querySelector('.el-dialog__header')
    ?.removeEventListener('mousedown', onDragMouseDown)
  resetDialogShell()
}

// 监听弹框显示状态
watch(visible, async val => {
  if (val) {
    keyword.value = ''
    resetHighlightState()
    await loadLogs()
    await startListening()
  } else {
    stopListening()
    resetHighlightState()
  }
})

// 监听连接ID变化：连接关闭时自动关闭弹框
watch(
  () => share.conn?.id,
  id => {
    if (!visible.value) return
    resetHighlightState()
    if (!id) {
      visible.value = false // 连接关闭时自动关闭弹框
      logs.value = []
      return
    }
    void loadLogs()
  },
)

// 组件卸载时清理资源
onUnmounted(() => {
  stopListening()
  resetHighlightState()
  resetDialogShell()
})

// 过滤日志（根据关键词搜索）
const filterLogs = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return logs.value
  return logs.value.filter(row => {
    const text = `${row.fullCommand} ${row.command}`.toLowerCase()
    return text.includes(key)
  })
})

// 时间列只展示时分秒（日期对实时日志无信息量）
function logTimeText(timestamp: string): string {
  return timestamp.includes(' ') ? timestamp.split(' ')[1] : timestamp
}

// 列描述：展示与导出文本单一来源；命令列单元格走 #cell-command 插槽（带错误/慢命令标记）
const logColumns = computed<MeColumn<CommandLogEntry>[]>(() => [
  {
    key: 'timestamp',
    prop: 'timestamp',
    title: t('commandLog.time'),
    width: 118,
    formatter: row => logTimeText(row.timestamp),
  },
  {
    key: 'durationMs',
    prop: 'durationMs',
    title: t('commandLog.duration'),
    width: 90,
    align: 'right',
    formatter: row => `${row.durationMs} ms`,
  },
  { key: 'dbIndex', prop: 'dbIndex', title: t('commandLog.db'), width: 56, align: 'center' },
  // 命令列取值即 prop 原值（单元格经 #cell-command 附加错误/慢命令标记）
  // 关闭排序：表头内含清空按钮与搜索框，点击会冒泡触发表头排序
  { key: 'command', prop: 'fullCommand', title: t('commandLog.command'), minWidth: 360, sortable: false },
])

// 高亮最近 1 秒内的命令：行类由 MeTable rowClass 提供，颜色经包裹层 --me-log-new 变量下发
function logRowClass(row: unknown): string {
  return highlightIds.value.has((row as CommandLogEntry).id) ? 'command-log-row--new' : ''
}

// 加载命令日志（从后端获取历史记录）
async function loadLogs() {
  if (!share.conn?.id) {
    logs.value = []
    return
  }
  loading.value = true
  try {
    const entries = await meCommands.commandLogs(share.conn.id, LOG_LIMIT)
    logs.value = entries
    seenMaxId.value = entries.reduce((max, row) => Math.max(max, row.id), 0)
  } finally {
    loading.value = false
  }
}

// 清空命令日志
function clearLogs() {
  meConfirm(t('commandLog.clearConfirm'), async () => {
    await meCommands.commandLogsClear(share.conn!.id)
    meOk(t('commandLog.clearOk'))
    resetHighlightState()
    logs.value = []
  })
}
// #endregion
</script>

<template>
  <el-dialog
    v-model="visible"
    :class="DIALOG_CLASS"
    width="80vw"
    :modal="false"
    :modal-penetrable="true"
    :lock-scroll="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    destroy-on-close
    append-to-body
    @opened="onDialogOpened"
    @closed="onDialogClosed">
    <template #header>
      <div class="me-flex" style="align-items: flex-end; gap: 12px">
        <me-icon class="command-log-title" icon="el-icon-document" :name="t('commandLog.title')" />
        <span class="command-log-description">{{ t('commandLog.description') }}</span>
      </div>
    </template>
    <me-table
      class="command-log-table"
      v-loading="loading"
      :data="filterLogs"
      :columns="logColumns"
      :total="logs.length"
      :empty-text="loading ? ' ' : t('commandLog.empty')"
      :row-class="logRowClass"
      :style="{ '--me-log-new': highlightColor }"
      export-name="command-log">
      <template #header-command>
        <div class="command-log-header">
          <span class="command-log-header__label">{{ t('commandLog.command') }}</span>
          <div class="command-log-header__tools" @mousedown.stop>
            <me-button
              icon="el-icon-delete"
              :info="t('commandLog.clear')"
              :disabled="logs.length === 0"
              placement="top"
              @click="clearLogs" />
            <el-input
              v-model="keyword"
              :placeholder="t('commandLog.keyword')"
              class="command-log-header__search"
              clearable />
          </div>
        </div>
      </template>
      <template #cell-command="{ row }">
        <div class="command-log-cmd-row">
          <span class="command-log-cmd" :title="row.fullCommand">{{ row.fullCommand }}</span>
          <span v-if="row.error" class="command-log-cmd__flag">
            <el-tooltip :content="row.error" placement="top" :show-after="300">
              <span aria-hidden="true">❎</span>
            </el-tooltip>
          </span>
          <span v-else-if="row.durationMs > SLOW_MS" class="command-log-cmd__flag">
            <el-tooltip :content="t('commandLog.slowHint')" placement="top" :show-after="300">
              <span aria-hidden="true">⚠️</span>
            </el-tooltip>
          </span>
        </div>
      </template>
    </me-table>
  </el-dialog>
</template>

<!-- append-to-body：弹框样式写在组件内 -->
<style lang="scss">
.el-dialog.command-log-dialog {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 60vh;
  min-width: 520px;
  min-height: 320px;
  max-width: 96vw;
  max-height: 92vh;
  /* 直接定位到右下角，避免 JS 定位导致的居中→右下角闪烁 */
  margin: 0 !important;
  position: fixed;
  right: 50px;
  bottom: 50px;

  .el-dialog__header {
    cursor: move;
    margin-right: 0;
    padding-bottom: 8px;
  }

  /* 与 MeDialog 标题一致（--el-dialog-title-font-size = 18px）；不设会停在正文 14px */
  .command-log-title {
    font-size: var(--el-dialog-title-font-size);
    line-height: var(--el-dialog-font-line-height);
    color: var(--el-text-color-primary);
  }

  .command-log-description {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
    user-select: none;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .el-dialog__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding-top: 8px;
  }

  .command-log-resize-handle {
    position: absolute;
    z-index: 30;

    &--n {
      top: 0;
      left: 10px;
      right: 10px;
      height: 6px;
      cursor: n-resize;
    }

    &--s {
      bottom: 0;
      left: 10px;
      right: 10px;
      height: 6px;
      cursor: s-resize;
    }

    &--e {
      right: 0;
      top: 10px;
      bottom: 10px;
      width: 6px;
      cursor: e-resize;
    }

    &--w {
      left: 0;
      top: 10px;
      bottom: 10px;
      width: 6px;
      cursor: w-resize;
    }

    &--nw {
      top: 0;
      left: 0;
      width: 10px;
      height: 10px;
      cursor: nw-resize;
    }

    &--ne {
      top: 0;
      right: 0;
      width: 10px;
      height: 10px;
      cursor: ne-resize;
    }

    &--sw {
      bottom: 0;
      left: 0;
      width: 10px;
      height: 10px;
      cursor: sw-resize;
    }

    &--se {
      bottom: 0;
      right: 0;
      width: 10px;
      height: 10px;
      cursor: se-resize;
    }
  }
}
</style>

<style scoped lang="scss">
.command-log-table {
  flex: 1;
  min-height: 0;
}

:deep(.command-log-header) {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-weight: normal;
}

:deep(.command-log-header__label) {
  flex-shrink: 0;
  font-weight: bold;
}

:deep(.command-log-header__tools) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

:deep(.command-log-header__search) {
  width: 200px;
  max-width: 100%;
}

.command-log-cmd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.command-log-cmd {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-log-cmd__flag {
  flex-shrink: 0;
  line-height: 1;
}

// 高亮行文字色：变量由 me-table 包裹层 inline style 提供，类由 rowClass 加在行节点（运行时添加须 :deep）
:deep(.command-log-row--new) {
  color: var(--me-log-new);
}
</style>
