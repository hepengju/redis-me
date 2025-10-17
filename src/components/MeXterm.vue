<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {onMounted, onUnmounted, computed, watch} from 'vue'

/*
ANSI 转义序列颜色规则
  ANSI 转义序列以 \x1B[ 开头，以 m 结尾，中间的数字用于指定不同的显示属性，
  其中与前景色（文本颜色）相关的代码范围是 30 - 37，代表不同的基本颜色，具体对应关系如下：

  30m：黑色
  31m：红色
  32m：绿色
  33m：黄色
  34m：蓝色
  35m：洋红色（紫红色）
  36m：青色
  37m：白色
*/
// TODO 命令提示
const {welcome, prefix, execCommand} = defineProps({
  welcome: {
    type: String,
    // \x1B[1;3;32m 表示: 粗体;斜体;颜色
    default: '欢迎使用 \x1B[1;3;32mRedisME\x1B[0m Terminal',
  },
  prefix: {
    type: String,
    default: '\x1B[1;3;32m$ \x1B[0m',
  },
  execCommand: {
    type: Function,
    default: async (command: string) => `TODO 后台运行命令: ${command}`,
  },
})

watch(() => prefix, () => prompt())

// 参考官网示例: https://xtermjs.org/js/demo.js
// 主题
const baseTheme = {
  foreground: '#F8F8F8',
  background: '#222222',  // 背景和应用保持一致
  selection: '#5DA5D533',
  black: '#1E1E1D',
  brightBlack: '#262625',
  red: '#CE5C5C',
  brightRed: '#FF7272',
  green: '#5BCC5B',
  brightGreen: '#72FF72',
  yellow: '#CCCC5B',
  brightYellow: '#FFFF72',
  blue: '#5D5DD3',
  brightBlue: '#7279FF',
  magenta: '#BC5ED1',
  brightMagenta: '#E572FF',
  cyan: '#5DA5D5',
  brightCyan: '#72F0FF',
  white: '#F8F8F8',
  brightWhite: '#FFFFFF',
}

// 设置终端尺寸
const term = new Terminal({
  theme: baseTheme,
  fontFamily: '"Cascadia Code", 黑体, Menlo, monospace',
  cursorBlink: true,  // 光标闪烁
  cursorStyle: 'bar', // 竖线
})

// 附属插件
const fitAddon = new FitAddon()
term.loadAddon(fitAddon)
term.onData(data => onTermData(data))

// 页面加载后挂载到元素
const resizeTerm = () => {
  if (fitAddon != null) {
    fitAddon.fit()
  }
}

onMounted(() => {
  // 在指定元素中打开，并适配元素大小，写入欢迎信息
  term.open(document.getElementById('terminal'))
  fitAddon.fit() // 适配元素大小
  term.focus()
  term.write(welcome)
  prompt()
  window.addEventListener('resize', resizeTerm)
})

onUnmounted(() => {
  term.dispose()
  window.removeEventListener('resize', resizeTerm)
})

function cursorLen(str) {
  let length = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    if (char >= 0x0000 && char <= 0x00ff) {
      length += 1
    } else {
      length += 2
    }
  }
  return length;
}

const prefixClean = computed(() => prefix.replace(/\x1B\[[0-9;]*m/g, '')) // 移除ANSI转义序列
const prefixLen  = computed(() => cursorLen(prefixClean.value))

// 输入数据的处理
const onTermData = (data) => {
  switch (data) {
    case '\u0003': // Ctrl+C
      keyCtrlC();
      break;
    case '\r':     // Enter键
      keyEnter();
      break;
    case '\u001B[A': // 上箭头
      navigateHistory('up');
      break;
    case '\u001B[B': // 下箭头
      navigateHistory('down');
      break;
    case '\u001B[D': // 左箭头
      moveCursorLeft();
      break;
    case '\u001B[C': // 右箭头
      moveCursorRight();
      break;
    case '\u0001': // Ctrl+A
      moveCursorToStart();
      break;
    case '\u0005': // Ctrl+E
      moveCursorToEnd();
      break;
    case '\u007F': // Backspace
      backspace();
      break;
    case '\t': // Tab键（自动补全）
      autoComplete();
      break;
    case '\u000c': // Ctrl+L
      clearScreen();
      break;
    default:
      inputData(data)
      break;
  }
}

// 获取光标位置：参考xterm.js官网的demo.js
function getCursorX() {
  return term.buffer.active.cursorX
}

function getLine(){
  return term.buffer.active.getLine(term.buffer.active.cursorY).translateToString(true)
}
function getCommand() {
  return getLine().substring(prefixClean.value.length)
}

// 命令行提示符
function prompt() {
  term.writeln('')
  term.write(prefix)
}

function keyCtrlC() {
  term.write('^C')
  prompt()
}

async function keyEnter() {
  const command = getCommand()
  if (command.length > 0) {

    // 添加到历史记录（避免重复添加）
    if (commandHistory.length === 0 ||
      commandHistory[commandHistory.length - 1] !== command) {
      commandHistory.push(command)
    }

    // 重置历史索引
    historyIndex = -1

    const result = await execCommand(command)
    term.writeln('')
    term.write(result)
  }
  prompt()
}

// 历史命令处理
let commandHistory = []
let historyIndex   = -1

function navigateHistory(direction) {
  if (commandHistory.length === 0) return

  if (historyIndex === -1) {
    historyIndex = commandHistory.length
  }

  if (direction === 'up') {
    historyIndex--
    if (historyIndex < 0) {
      historyIndex = 0
    }
  } else if (direction === 'down') {
    historyIndex++
    if (historyIndex > commandHistory.length) {
      historyIndex = commandHistory.length
    }
  }

  let command = ''
  if (historyIndex >= 0 && historyIndex < commandHistory.length) {
    command = commandHistory[historyIndex]
  }
  redrawCommand(command)
}

function redrawCommand(command) {
  // 清除当前行, 重新写入前缀和命令
  term.write('\x1B[2K\r' + prefix + command)
}

function moveCursorLeft() {
  if (getCursorX() <= prefixLen.value) return
  term.write('\x1B[D')
}
function moveCursorRight() {
  if (getCursorX() >= getLine().length) return
  term.write('\x1B[C')
}

// 移动光标到最左边：先移动到行首，再向后移动前缀
function moveCursorToStart() {
  term.write('\x1B[0G' + '\x1B[' + prefixLen.value + 'C')
}

// 移动光标到最右边：先移动到行首，再向后移动前缀 + 命令
function moveCursorToEnd() {
  term.write('\x1B[0G' + '\x1B[' + getLine().length + 'C')
}

// 退格删除
function backspace() {
  if (getCursorX() <= prefixLen.value) return
  term.write('\b \b')
}

// TODO 自动完成
function autoComplete() {}

// 清除屏幕
function clearScreen() {
  term.write('\x1B[2J\x1B[3J\x1B[H') // 清除整个屏幕并移动光标到左上角
  term.write(welcome) // 重新显示欢迎信息
  prompt() // 显示提示符
}

// 输入数据
function inputData(data) {
  term.write(data)
}

</script>

<template>
  <div id="terminal"></div>
</template>

<style scoped lang="scss">
#terminal {
  :deep(.xterm-viewport) {
    overflow-y: hidden;
  }
}
</style>
