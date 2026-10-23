<script setup lang="ts">
import { readText } from '@tauri-apps/plugin-clipboard-manager'
// #region 导入
import { computed, inject, nextTick, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MeIcon from '@/components/MeIcon.vue'
import MeSelectUpDownIcon from '@/components/MeSelectUpDownIcon.vue'
import MeShortcut from '@/components/MeShortcut.vue'
import { commandHelp, isReadonlyCommand, parseCommandName } from '@/locales/cmd'
import { shareProvideKey } from '@/types/me-interface'
import type { CliOutputMode } from '@/types/tauri-specta'
import { getTerminalShortcuts } from '@/utils/shortcut'
import { bus, DB_SWITCH, formatSpectaErrorForUser, meCopy, meCommands } from '@/utils/util'

import CommandHelp from '../ext/CommandHelp.vue'
import NodeList from '../ext/NodeList.vue'
// #endregion

// #region 核心状态

const { t } = useI18n()
// 共享数据
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)

// 终端输出格式（对齐 redis-cli --raw / --json / --csv；每次进入默认 TTY）
const outputModeOptions: { value: CliOutputMode; labelKey: string }[] = [
  { value: 'standard', labelKey: 'redisTerminal.outputStandard' },
  { value: 'raw', labelKey: 'redisTerminal.outputRaw' },
  { value: 'json', labelKey: 'redisTerminal.outputJson' },
  { value: 'csv', labelKey: 'redisTerminal.outputCsv' },
]
const outputMode = ref<CliOutputMode>('standard')

// 待颜色的文本
function colorText(color: string, text: string, bold = false): string {
  return bold
    ? `<span style="color: ${color}; font-weight: bold">${text}</span>`
    : `<span style="color: ${color}">${text}</span>`
}

const autoBroadcast = ref(true)
const node = ref('')
const prefix = computed(() => (node.value ? node.value + '> ' : '$ '))
const welcome = computed(() =>
  t('redisTerminal.welcome', { RedisME: colorText(share.color, 'RedisME', true) }),
)

// 成功输出统一绿色；raw 空结果保留空行占位
function formatCommandResult(data: string): string {
  if (outputMode.value === 'raw' && data === '') {
    return colorText('var(--el-color-success)', '<br/>')
  }
  const html = data.split(/\r?\n/).join('<br/>')
  return colorText('var(--el-color-success)', html)
}

// 定制化执行命令。pasteEntered 同步置位，供多行粘贴判断有没有进到这里
let pasteEntered = false
let pasteDone: (() => void) | null = null

// 订阅类：命令会把共享连接切进订阅态、消息以 push 帧回流，污染后续读写 → 引导到发布订阅面板
const subscribeCmds = new Set([
  'SUBSCRIBE',
  'PSUBSCRIBE',
  'SSUBSCRIBE',
  'UNSUBSCRIBE',
  'PUNSUBSCRIBE',
  'SUNSUBSCRIBE',
])
// 阻塞/独占类：会挂住共享连接直到超时，界面其它操作一起卡死 → 终端不支持
const blockingCmds = new Set([
  'MONITOR',
  'BLPOP',
  'BRPOP',
  'BLMOVE',
  'BLMOVEM',
  'BRPOPLPUSH',
  'BLMPOP',
  'BZMPOP',
  'BZPOPMIN',
  'BZPOPMAX',
  'WAIT',
])

// SELECT：走后端 select_db 同步 self.db，更新 share.conn.db 并通知键区，避免只改连接不改界面
async function handleSelect(command: string): Promise<string> {
  const arg = command.trim().split(/\s+/)[1]
  const db = Number(arg)
  if (arg === undefined || arg === '' || !Number.isInteger(db) || db < 0) {
    return colorText('var(--el-color-error)', '(error) ERR invalid DB index')
  }
  if (!share.conn) return colorText('var(--el-color-error)', '(error) no connection')
  try {
    // 末尾传 false 关闭错误弹窗，集群切库等失败统一在终端内联回显，不另弹框
    await meCommands.selectDb(share.conn.id, db, false)
    share.conn.db = db
    bus.emit(DB_SWITCH, db)
    return colorText('var(--el-color-success)', 'OK')
  } catch (e: unknown) {
    return colorText('var(--el-color-error)', `(error) ${formatSpectaErrorForUser(String(e))}`)
  }
}

// 命中会话态命令返回适配后的输出；普通命令返回 null，继续走后端 executeCommand
async function adaptCommand(command: string): Promise<string | null> {
  const name = parseCommandName(command)
  if (subscribeCmds.has(name)) {
    return colorText('var(--el-color-error)', `(error) ${t('redisTerminal.unsupportedSubscribe')}`)
  }
  if (blockingCmds.has(name)) {
    const key =
      name === 'MONITOR' ? 'redisTerminal.unsupportedMonitor' : 'redisTerminal.unsupportedBlocking'
    return colorText('var(--el-color-error)', `(error) ${t(key)}`)
  }
  if (name === 'SELECT') {
    return handleSelect(command)
  }
  return null
}

async function execCommand(command: string): Promise<string> {
  pasteEntered = true
  try {
    // 会话态命令（订阅/阻塞/SELECT）先适配，不受只读门禁影响，也不原样打到共享连接
    const adapted = await adaptCommand(command)
    if (adapted !== null) return adapted
    if (!canEdit.value && !isReadonlyCommand(command)) {
      return colorText('var(--el-color-warning)', t('redisTerminal.readonlyWriteHint'))
    }
    const param = {
      command,
      node: node.value,
      autoBroadcast: autoBroadcast.value,
      outputMode: outputMode.value,
    }
    const data = await meCommands.executeCommand(share.conn!.id, param, false)
    autoCopyIfNeed(data)
    return formatCommandResult(data)
  } catch (e: unknown) {
    autoCopyIfNeed(e)
    return colorText('var(--el-color-error)', `(error) ${String(e)}`)
  }
}

function finishCommand(): void {
  const done = pasteDone
  pasteDone = null
  done?.()
}

// 自动复制命令结果
const autoCopy = ref(false)
function autoCopyIfNeed(text: unknown) {
  if (autoCopy.value) {
    meCopy(String(text), undefined, false)
  }
}

// 命令提示的中英文实时切换
// 说明: vue-web-terminal的命令只能初始化1次, 后续更新无效。因此考虑销毁重建
const showCode = ref(true)
watch(commandHelp, () => {
  showCode.value = false
  nextTick(() => {
    showCode.value = true
  })
})
// #endregion

// #region 面板操作

// 命令帮助弹窗
const commandHelpRef = ref<InstanceType<typeof CommandHelp>>()
function openCommandDialog() {
  commandHelpRef.value?.open()
}

const keyShortVisible = ref(false)
function openKeyShortDialog() {
  keyShortVisible.value = true
}

const keyShortcuts = computed(() => getTerminalShortcuts(t))

// 多行粘贴：单条命令或每行一条。关掉弹框则取消。
type XtermExpose = {
  getCommand: () => string
  setCommand: (command: string) => void
  execute: (command: string) => boolean
}
const xtermRef = useTemplateRef<XtermExpose>('xtermRef')

type PasteMode = 'one' | 'lines'
const pasteAskVisible = ref(false)
const pasteLineCount = ref(0)
let pasteAskMode: PasteMode | null = null
let pasteAskResolve: ((mode: PasteMode | null) => void) | null = null

function choosePasteMode(mode: PasteMode): void {
  pasteAskMode = mode
  pasteAskVisible.value = false
}

function settlePasteAsk(mode: PasteMode | null): void {
  const resolve = pasteAskResolve
  pasteAskResolve = null
  pasteAskMode = null
  resolve?.(mode)
}

function askPasteMode(count: number): Promise<PasteMode | null> {
  pasteLineCount.value = count
  pasteAskMode = null
  pasteAskVisible.value = true
  return new Promise(resolve => {
    pasteAskResolve = resolve
  })
}

let pasteQueue: Promise<void> = Promise.resolve()

function enqueue(task: () => Promise<void> | void): void {
  pasteQueue = pasteQueue.then(task).catch((error: unknown) => console.error(error))
}

function runCommand(cmd: string): Promise<void> {
  const term = xtermRef.value
  if (!term) return Promise.resolve()
  return new Promise(resolve => {
    pasteEntered = false
    pasteDone = resolve
    term.execute(cmd)
    // help / clear / open 不进 execCommand
    if (!pasteEntered) {
      pasteDone = null
      resolve()
    }
  })
}

function normalizePaste(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function commandLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

// 不足两行返回 false，调用方继续走原来的粘贴。单条命令保留原文换行。
function enqueueMultiPaste(text: string): boolean {
  const normalized = normalizePaste(text)
  const lines = commandLines(normalized)
  if (lines.length < 2) return false
  enqueue(() => pasteLines(normalized, lines))
  return true
}

async function pasteLines(text: string, lines: string[]): Promise<void> {
  const term = xtermRef.value
  if (!term) return
  const mode = await askPasteMode(lines.length)
  if (!mode) return
  const typed = term.getCommand().trim()
  const cmds =
    mode === 'one'
      ? [[typed, text.trim()].filter(Boolean).join(' ')]
      : lines.map((line, i) => (i === 0 && typed ? `${typed} ${line}` : line))
  for (const cmd of cmds) await runCommand(cmd)
  term.setCommand('')
}

function onPaste(event: ClipboardEvent): void {
  const data = event.clipboardData
  const text = data?.getData('text/plain') || data?.getData('text') || ''
  if (!enqueueMultiPaste(text)) return
  event.preventDefault()
}

// 右键按下时选区还在；到 contextmenu 时可能已被清掉，有选区则留给组件复制
let selectedOnPointer = ''

function onMouseDown(): void {
  selectedOnPointer = document.getSelection()?.toString() ?? ''
}

function insertAtCursor(root: HTMLElement, text: string): void {
  const term = xtermRef.value
  if (!term) return
  const input = root.querySelector('textarea')
  const current = term.getCommand()
  const at = input instanceof HTMLTextAreaElement ? input.selectionStart : current.length
  term.setCommand(current.slice(0, at) + text.trim() + current.slice(at))
}

// 读取剪贴板并粘贴：多行走弹框判断，单行插入光标处
// macOS WKWebView 会拦截 navigator.clipboard.readText（NotAllowedError），改用 Tauri 剪贴板插件
function pasteFromClipboard(root: HTMLElement): void {
  void readText()
    .then(text => {
      if (!text || enqueueMultiPaste(text)) return
      enqueue(() => insertAtCursor(root, text))
    })
    .catch((error: unknown) => console.error(error))
}

// 终端 textarea 在 WKWebView 下收不到 Cmd+V 的 paste 事件，这里拦截快捷键统一走插件读取
function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toUpperCase() === 'V') {
    const root = event.currentTarget
    if (!(root instanceof HTMLElement)) return
    event.preventDefault()
    pasteFromClipboard(root)
  }
}

function onContextMenu(event: MouseEvent): void {
  const selected = (document.getSelection()?.toString() || selectedOnPointer).replaceAll(
    '\u00a0',
    ' ',
  )
  selectedOnPointer = ''
  event.preventDefault()
  event.stopPropagation()
  if (selected) {
    meCopy(selected)
    return
  }
  const root = event.currentTarget
  if (!(root instanceof HTMLElement)) return
  pasteFromClipboard(root)
}

onUnmounted(() => {
  settlePasteAsk(null)
  finishCommand()
})
// #endregion
</script>

<template>
  <div class="redis-terminal">
    <!-- 命令输入 -->
    <div
      v-if="showCode"
      class="terminal"
      @keydown.capture="onKeydown"
      @paste.capture="onPaste"
      @mousedown.capture="onMouseDown"
      @contextmenu.capture="onContextMenu">
      <me-xterm
        ref="xtermRef"
        class="terminal"
        :exec-command="execCommand"
        :on-command-done="finishCommand"
        :prefix
        :welcome
        :command-help="commandHelp" />
    </div>

    <!-- 集群节点 -->
    <div class="node me-flex" v-if="share.conn?.cluster">
      <el-tooltip raw-content :content="t('redisTerminal.broadcastHint')" placement="top">
        <el-checkbox
          v-model="autoBroadcast"
          :label="t('redisTerminal.autoBroadcast')"
          style="margin-left: 10px" />
      </el-tooltip>
      <node-list v-model="node" clearable style="margin-left: 10px" />
    </div>

    <!-- 工具栏 -->
    <div class="tool me-flex">
      <el-select
        v-model="outputMode"
        class="output-mode-select me-select-plain"
        :suffix-icon="MeSelectUpDownIcon">
        <el-option
          v-for="item in outputModeOptions"
          :key="item.value"
          :label="t(item.labelKey)"
          :value="item.value" />
      </el-select>
      <el-tooltip :content="t('redisTerminal.autoCopyHint')" placement="top-end">
        <el-checkbox v-model="autoCopy" style="margin-left: 10px" />
      </el-tooltip>
      <me-icon
        class="icon-btn"
        icon="me-icon-keyshort"
        :info="t('redisTerminal.keyShortHint')"
        placement="top-end"
        @click="openKeyShortDialog"
        style="margin-left: 10px; font-size: 20px" />
      <me-icon
        class="icon-btn"
        icon="el-icon-help"
        :info="t('redisTerminal.commandHint')"
        placement="top-end"
        @click="openCommandDialog"
        style="margin-left: 5px" />
    </div>

    <!-- 快捷键提示 -->
    <el-dialog
      v-model="keyShortVisible"
      width="400"
      align-center
      draggable
      :show-close="false"
      header-class="me-shortcut-dialog__header">
      <div class="terminal-shortcut-title">{{ t('setting.shortcutTerminal') }}</div>
      <MeShortcut :items="keyShortcuts" />
    </el-dialog>

    <!-- 命令帮助 -->
    <CommandHelp ref="commandHelpRef" />

    <!-- 多行粘贴 -->
    <el-dialog
      v-model="pasteAskVisible"
      width="440px"
      align-center
      append-to-body
      @closed="settlePasteAsk(pasteAskMode)">
      <template #header>
        <me-icon
          class="paste-ask-title"
          icon="el-icon-warning-filled"
          :name="t('redisTerminal.pasteMultiTitle')" />
      </template>
      <p class="paste-ask">{{ t('redisTerminal.pasteMultiHint', { n: pasteLineCount }) }}</p>
      <template #footer>
        <div class="paste-ask-actions">
          <el-button @click="choosePasteMode('one')" type="primary">
            {{ t('redisTerminal.pasteAsOne') }}
          </el-button>
          <el-button @click="choosePasteMode('lines')" type="success">
            {{ t('redisTerminal.pastePerLine') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.redis-terminal {
  height: 100%;
  overflow: hidden;
  position: relative;

  .terminal {
    height: 100%;
  }

  :deep(.xterm) {
    padding: 10px;
  }

  .node {
    position: absolute;
    right: 0;
    top: 0;
    z-index: 10;
  }

  .tool {
    position: absolute;
    right: 10px;
    bottom: 0;
    z-index: 10;
    align-items: center;
  }

  .output-mode-select {
    :deep(.el-select__wrapper) {
      min-height: 0;
      height: 30px;
      padding: 4px;
    }
  }
}

.paste-ask-title {
  font-weight: 600;

  :deep(.el-icon) {
    color: var(--el-color-warning);
    font-size: 18px;
  }
}

.paste-ask {
  margin: 0;
  line-height: 1.6;
}

.paste-ask-actions {
  display: flex;
  justify-content: space-between;

  .el-button {
    margin: 0;
  }
}

.terminal-shortcut-title {
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  text-align: center;
}
</style>
