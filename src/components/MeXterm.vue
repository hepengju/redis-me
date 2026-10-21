<script setup lang="ts">
// #region 导入
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import type { FailedFunc, Message, SuccessFunc } from 'vue-web-terminal'

import { handleInputTipsSearch } from '@/plugins/ternimal'
import type { MeXtermCommandItem } from '@/types/me-interface'
import { isDark } from '@/utils/util'
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
  clearLog: () => void
  getCommand: () => string
  setCommand: (command: string) => void
  execute: (command: string) => boolean
}

const terminalRef = useTemplateRef<TerminalExpose | null>('terminal')
// 自动换行默认开启，Mod+B 切换（与 CodeMirror 一致）
const lineWrap = ref(true)

onMounted(() => {
  terminalRef.value?.pushMessage(props.welcome)
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

// 多行粘贴由 Redis 终端决定。这里只透出命令的读写和执行。
defineExpose({
  getCommand: () => terminalRef.value?.getCommand() ?? '',
  setCommand: (command: string) => terminalRef.value?.setCommand(command),
  execute: (command: string) => terminalRef.value?.execute(command) ?? false,
})
// #endregion

// #region 键盘事件
function onKeydown(e: KeyboardEvent): void {
  const term = terminalRef.value
  if (!term) return

  const key = e.key.toUpperCase()

  if (e.key === 'F11') {
    term.fullscreen()
    return
  }

  // 与快捷键文档 mod 一致：Mac ⌘ / Win·Linux Ctrl
  if (!(e.ctrlKey || e.metaKey)) return

  switch (key) {
    case 'B':
      lineWrap.value = !lineWrap.value
      break
    case 'L':
      term.clearLog()
      term.pushMessage(props.welcome)
      term.setCommand('')
      break
    case 'C':
      term.setCommand('')
      break
  }
}
// #endregion
</script>

<template>
  <div class="me-xterm" :class="{ 'is-wrap': lineWrap }">
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
  </div>
</template>

<style lang="scss">
/* 提示颜色 */
//.t-prompt {
//  color: var(--el-color-primary);
//}

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
  /* 库内 z-index:1 会隔离层叠上下文，导致补全(100)盖不过 help(99)；unset 后同层比较 */
  /* z-index: unset !important; */
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
</style>
