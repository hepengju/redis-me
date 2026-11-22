<script setup lang="ts">
// #region 导入
import { type as getOsType } from '@tauri-apps/plugin-os'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FailedFunc, Message, SuccessFunc } from 'vue-web-terminal'

import MeCodeMenuRow from '@/components/me-code/MeCodeMenuRow.vue'
import MeCodeSubmenu from '@/components/me-code/MeCodeSubmenu.vue'
import { handleInputTipsSearch } from '@/plugins/terminal'
import type { MeXtermCommandItem } from '@/types/me-interface'
import {
  displayShortcutKey,
  matchAppFullscreenHotkey,
  type ShortcutKey,
} from '@/utils/app/shortcut'
import {
  ME_XTERM_FONT_DEFAULT,
  ME_XTERM_FONT_MAX,
  ME_XTERM_FONT_MIN,
  ME_XTERM_FONT_STEP,
  isDark,
  meCopy,
  meXtermFontSize,
} from '@/utils/app/util'
// #endregion

// #region 核心状态

type ExecCommandFn = (command: string) => string | Promise<string>

const props = withDefaults(
  defineProps<{
    welcome?: string
    prefix?: string
    execCommand?: ExecCommandFn
    commandHelp?: MeXtermCommandItem[]
    /** 回显已经写入终端后调用，多条命令靠它排成「命令、结果」交替 */
    onCommandDone?: () => void
    /** 粘贴由 Redis 终端处理（多行询问 / Tauri 剪贴板） */
    onPaste?: () => void
  }>(),
  {
    welcome: '欢迎使用 Terminal',
    prefix: '$ ',
    execCommand: async (command: string) => `TODO 后台运行命令: ${command}`,
    commandHelp: () => [],
  },
)
// #endregion

// #region 面板操作

type TerminalExpose = {
  pushMessage: (message: string | Message) => void
  fullscreen: () => void
  focus: (enforceFocus?: boolean) => void
  clearLog: () => void
  getCommand: () => string
  setCommand: (command: string) => void
  execute: (command: string) => boolean
}

const { t } = useI18n()
const wrapEl = useTemplateRef<HTMLElement>('wrapEl')
const terminalRef = useTemplateRef<TerminalExpose | null>('terminal')
const menuRef = useTemplateRef<{ showMenu: (e: MouseEvent) => void; closeMenu: () => void } | null>(
  'menuRef',
)
// 自动换行默认开启，Mod+B 切换（与 CodeMirror 一致）
const lineWrap = ref(true)
// 字号：终端会话内共用，与 CodeMirror 独立
const fontSizePx = meXtermFontSize
const fontTitle = computed(() => t('meCode.fontSize', { size: fontSizePx.value }))
const wrapStyle = computed(() => ({
  '--t-font-size': `${fontSizePx.value}px`,
  '--t-font-height': `${fontSizePx.value}px`,
}))
// 全屏挂在本组件根上，右键菜单才能留在全屏层内（库内 fullscreen 目标不含菜单）
const fullscreenOn = ref(false)

function bumpFontSize(delta: number): void {
  fontSizePx.value = Math.min(
    ME_XTERM_FONT_MAX,
    Math.max(ME_XTERM_FONT_MIN, fontSizePx.value + delta),
  )
}

onMounted(() => {
  terminalRef.value?.pushMessage(props.welcome)
  document.addEventListener('fullscreenchange', syncFullscreen)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
})

async function execCmd(
  _commandKey: string,
  command: string,
  success: SuccessFunc,
  _failed: FailedFunc,
  _name: string,
): Promise<void> {
  try {
    const data = await props.execCommand(command)
    const content = typeof data === 'string' ? data : String(data)
    success({ type: 'html', content })
  } finally {
    props.onCommandDone?.()
  }
}

const theme = computed(() => (isDark.value ? 'dark' : 'light'))

function clearTerminal(): void {
  const term = terminalRef.value
  if (!term) return
  term.clearLog()
  term.pushMessage(props.welcome)
  term.setCommand('')
}

function toggleFullscreen(): void {
  const el = wrapEl.value
  if (!el) return
  if (document.fullscreenElement === el) {
    void document.exitFullscreen().catch(() => {})
    return
  }
  void el.requestFullscreen().catch(() => {})
}

function syncFullscreen(): void {
  fullscreenOn.value = document.fullscreenElement === wrapEl.value
}

// 多行粘贴由 Redis 终端决定。这里只透出命令的读写和执行。
defineExpose({
  focus: () => terminalRef.value?.focus(true),
  getCommand: () => terminalRef.value?.getCommand() ?? '',
  setCommand: (command: string) => terminalRef.value?.setCommand(command),
  execute: (command: string) => terminalRef.value?.execute(command) ?? false,
})
// #endregion

// #region 右键菜单
// macOS 右键会选中旁边的词，这是 WebKit 的惯例（CodeMirror 同样）。不把选区改回去。
// 右键按下时选区还在；到 contextmenu 时可能已被清掉。mouseup 再记一次，避免仅靠 mousedown 起始空选区
let selectedOnPointer = ''
const menuSelected = ref('')

function readSelection(): string {
  return (document.getSelection()?.toString() ?? '').replaceAll('\u00a0', ' ')
}

// 选区必须落在本终端内。命令框 textarea 的选中不算，那种交给浏览器复制
function selectedInTerminal(): string {
  const sel = document.getSelection()
  if (!sel || sel.isCollapsed) return ''
  const root = wrapEl.value
  const node = sel.anchorNode
  if (!root || !node || !root.contains(node)) return ''
  return sel.toString().replaceAll('\u00a0', ' ')
}

function onMouseDown(e: MouseEvent): void {
  // 右键：按下时选区通常仍在
  if (e.button === 2) selectedOnPointer = readSelection()
}

function onMouseUp(): void {
  // 始终同步：空选区也要清掉旧缓存，避免无选区右键仍启用「复制」
  selectedOnPointer = readSelection()
}

function onDblClick(e: MouseEvent): void {
  // 库把 .t-window 的 dblclick 绑成 _focus(true)，焦点进命令框后浏览器会清掉刚选中的词
  e.stopPropagation()
}

function onContextMenu(e: MouseEvent): void {
  // 拦住 vue-web-terminal 自带的右键复制/粘贴，避免再 focus 清选区、与菜单抢事件
  e.preventDefault()
  e.stopPropagation()
  menuSelected.value = readSelection() || selectedOnPointer
  selectedOnPointer = ''
  menuRef.value?.showMenu(e)
}

function onMenuCommand(command: unknown): void {
  if (typeof command !== 'string' || !command) return
  if (command === 'copy') {
    if (menuSelected.value) meCopy(menuSelected.value, undefined, false)
  } else if (command === 'paste') {
    props.onPaste?.()
  } else if (command === 'fullscreen') {
    toggleFullscreen()
  } else if (command === 'lineWrap') {
    lineWrap.value = !lineWrap.value
  } else if (command === 'font+') {
    bumpFontSize(ME_XTERM_FONT_STEP)
  } else if (command === 'font-') {
    bumpFontSize(-ME_XTERM_FONT_STEP)
  } else if (command === 'clear') {
    clearTerminal()
  } else if (command === 'clearInput') {
    terminalRef.value?.setCommand('')
  }
  // 放大/缩小留着菜单连点，其余项点完关掉
  if (command !== 'font+' && command !== 'font-') menuRef.value?.closeMenu()
}

// 右键项右侧的快捷键。Mac：⌘C 复制，Ctrl+C 清输入。Win/Linux 没有 ⌘，两项都显示 Ctrl+C
const isMacOS = getOsType() === 'macos'
function menuShortcut(keys: ShortcutKey[]): string {
  return keys.map(key => displayShortcutKey(key, isMacOS)).join(' + ')
}
const menuKeys = {
  copy: menuShortcut(['mod', 'c']),
  paste: menuShortcut(['mod', 'v']),
  fullscreen: menuShortcut(isMacOS ? ['mod', 'shift', 'f'] : ['F11']),
  lineWrap: menuShortcut(['mod', 'b']),
  fontIncrease: menuShortcut(['mod', '=']),
  fontDecrease: menuShortcut(['mod', '-']),
  clear: menuShortcut(['mod', 'l']),
  clearInput: menuShortcut(isMacOS ? ['Ctrl', 'c'] : ['mod', 'c']),
}
// #endregion

// 提示开着时，回车接受当前项并关掉列表；关掉后再按回车才执行。Ctrl+回车仍是换行。
// 库把执行绑在输入框 keyup 上，没有选中接口，所以在更外层拦住，并复用它自己的点击和 Esc。
function onTipEnter(e: KeyboardEvent): void {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key !== 'Enter' && e.key !== 'Tab') return
  if (e.key === 'Enter' && e.shiftKey) return
  const root = wrapEl.value
  if (!root?.querySelector('.t-cmd-tips')) return
  if (e.key === 'Enter') {
    root.querySelector<HTMLElement>('.t-cmd-tips-item-active')?.click()
    e.preventDefault()
    e.stopPropagation()
  }
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
}

// #region 键盘事件
function onKeydown(e: KeyboardEvent): void {
  const term = terminalRef.value
  if (!term) return

  const key = e.key.toUpperCase()

  if (matchAppFullscreenHotkey(e)) {
    e.preventDefault()
    toggleFullscreen()
    return
  }

  // 与快捷键文档 mod 一致：Mac ⌘ / Win·Linux Ctrl
  if (!(e.ctrlKey || e.metaKey)) return

  switch (key) {
    case 'B':
      lineWrap.value = !lineWrap.value
      break
    case 'L':
      clearTerminal()
      break
    case 'C': {
      // Mac：⌘C 只复制，Ctrl+C 只清输入。Win/Linux 的 Ctrl+C 有选区则复制，否则清输入
      if (isMacOS && e.metaKey) {
        const selected = selectedInTerminal()
        if (selected) {
          e.preventDefault()
          meCopy(selected, undefined, false)
        }
        break
      }
      if (isMacOS && e.ctrlKey) {
        e.preventDefault()
        term.setCommand('')
        break
      }
      if (!e.ctrlKey) break
      const selected = selectedInTerminal()
      if (selected) {
        e.preventDefault()
        meCopy(selected, undefined, false)
        break
      }
      const input = document.activeElement
      if (input instanceof HTMLTextAreaElement && input.selectionStart !== input.selectionEnd) break
      term.setCommand('')
      break
    }
    case '=':
    case '+':
      e.preventDefault()
      bumpFontSize(ME_XTERM_FONT_STEP)
      break
    case '-':
    case '_':
      e.preventDefault()
      bumpFontSize(-ME_XTERM_FONT_STEP)
      break
    case '0':
      e.preventDefault()
      fontSizePx.value = ME_XTERM_FONT_DEFAULT
      break
  }
}
// #endregion
</script>

<template>
  <div
    ref="wrapEl"
    class="me-xterm"
    :class="{ 'is-wrap': lineWrap }"
    :style="wrapStyle"
    @mousedown.capture="onMouseDown"
    @mouseup.capture="onMouseUp"
    @dblclick.capture="onDblClick"
    @contextmenu.capture="onContextMenu"
    @keyup.capture="onTipEnter">
    <terminal
      name="terminal"
      ref="terminal"
      @exec-cmd="execCmd"
      @on-keydown="onKeydown"
      :theme
      :show-header="false"
      :line-space="2"
      cursor-style="bar"
      context=""
      :command-store="commandHelp"
      :input-tips-search-handler="handleInputTipsSearch"
      :context-suffix="prefix">
    </terminal>
    <!-- 全屏时菜单留在包裹层内；平时挂到 body，避免被父级 overflow 裁掉 -->
    <me-context
      ref="menuRef"
      popper-class="me-xterm-menu"
      :teleported="!fullscreenOn"
      :hide-on-click="false"
      @handle-command="onMenuCommand">
      <el-dropdown-item v-if="menuSelected" command="copy">
        <MeCodeMenuRow icon="el-icon-document-copy" :name="t('copy')" :shortcut="menuKeys.copy" />
      </el-dropdown-item>
      <el-dropdown-item v-if="onPaste" command="paste">
        <MeCodeMenuRow icon="el-icon-document-add" :name="t('paste')" :shortcut="menuKeys.paste" />
      </el-dropdown-item>
      <el-dropdown-item command="fullscreen" :divided="!!menuSelected || !!onPaste">
        <MeCodeMenuRow
          icon="me-icon-window-maximize"
          :name="t('meCode.fullscreen')"
          :shortcut="menuKeys.fullscreen" />
      </el-dropdown-item>
      <el-dropdown-item command="lineWrap">
        <MeCodeMenuRow
          icon="me-icon-line-wrap"
          :name="t('meCode.lineWrap')"
          :shortcut="menuKeys.lineWrap" />
      </el-dropdown-item>
      <MeCodeSubmenu keep-open icon="me-icon-font-size" :title="fontTitle" @command="onMenuCommand">
        <el-dropdown-item command="font+" :disabled="fontSizePx >= ME_XTERM_FONT_MAX">
          <MeCodeMenuRow
            icon="el-icon-zoom-in"
            :name="t('meCode.fontIncrease')"
            :shortcut="menuKeys.fontIncrease" />
        </el-dropdown-item>
        <el-dropdown-item command="font-" :disabled="fontSizePx <= ME_XTERM_FONT_MIN">
          <MeCodeMenuRow
            icon="el-icon-zoom-out"
            :name="t('meCode.fontDecrease')"
            :shortcut="menuKeys.fontDecrease" />
        </el-dropdown-item>
      </MeCodeSubmenu>
      <el-dropdown-item command="clear">
        <MeCodeMenuRow
          icon="el-icon-delete"
          :name="t('redisTerminal.keyShort.clearScreen')"
          :shortcut="menuKeys.clear" />
      </el-dropdown-item>
      <el-dropdown-item command="clearInput" :disabled="!isMacOS && !!menuSelected">
        <MeCodeMenuRow
          icon="el-icon-document-remove"
          :name="t('redisTerminal.keyShort.clearInput')"
          :shortcut="menuKeys.clearInput" />
      </el-dropdown-item>
    </me-context>
  </div>
</template>

<style lang="scss">
/* 提示行：左侧命令完整显示，右侧说明过长时省略 */
.t-cmd-tips-item {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.t-cmd-tips-content {
  flex: 0 0 auto;
  white-space: nowrap;
}

.t-cmd-tips-des {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 0 !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}

.t-cmd-tips-items {
  overflow-x: auto;
}

/* help命令表格默认15px改为5px */
.t-table,
.t-table tr,
.t-table td,
.t-table tbody,
.t-table thead {
  padding: 5px !important;
}

/* 帮助手册 */
.t-cmd-help {
  top: 5px !important;
  right: 5px !important;
}

.t-window {
  padding: 5px 5px 5px 20px !important;
  background-color: #efefef !important;
}

/* 深色主题下的背景色 */
html.dark {
  .t-window {
    background-color: var(--t-main-background-color) !important;
  }
}

/* 字体设置：终端正文 + 右上角说明 + 补全列表 */
code,
.t-window,
.t-ask-input,
.t-window p,
.t-window div,
.t-crude-font,
.t-cmd-help,
.t-cmd-help-des,
.t-cmd-tips-items {
  font-family: var(--code-font) !important;
}

.me-xterm {
  height: 100%;
  position: relative;
}

.me-xterm:fullscreen {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background-color: #efefef;

  /* 全屏挂在本组件根上，内部容器需铺满视口 */
  .t-container {
    height: 100%;
  }
}

html.dark .me-xterm:fullscreen {
  background-color: var(--t-main-background-color, #1e1e1e);
}

/* 自动换行开启：保留空白并强制长串换行，避免横向滚动条 */
.me-xterm.is-wrap {
  .t-window p,
  .t-window div,
  .t-log-box {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-all;
  }
}

/* 自动换行关闭：单行展示，横向滚动 */
.me-xterm:not(.is-wrap) {
  .t-window {
    overflow-x: auto;
  }

  .t-window p,
  .t-window div,
  .t-log-box {
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }
}

.me-xterm-menu.el-dropdown__popper .el-dropdown__list {
  min-width: 168px;
}
</style>
