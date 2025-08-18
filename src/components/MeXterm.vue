<script setup>
import '@xterm/xterm/css/xterm.css'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit/src/FitAddon.js'
import {onMounted, onUnmounted} from 'vue'

// TODO 命令提示
// TODO 集群节点选择
const {welcome, prefix, execCommand} = defineProps({
  welcome: {
    type: String,
    default: '欢迎使用 \x1B[1;3;31mRedisME\x1B[0m Terminal',
  },
  prefix: {
    type: String,
    default: '\x1B[1;3;31m$ \x1B[0m',
  },
  execCommand: {
    type: Function,
    default: async (command) => `TODO 后台运行命令: ${command}`,
  },
})

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
  term.writeln(welcome)
  term.write(prefix)
  window.addEventListener('resize', resizeTerm)
})

onUnmounted(() => {
  term.dispose()
  window.removeEventListener('resize', resizeTerm)
})

function cursorLen(str) {
  // 移除ANSI转义序列
  const clean = str.replace(/\x1B\[[0-9;]*m/g, '')
  let length = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i)
    if (char >= 0x0000 && char <= 0x00ff) {
      length += 1
    } else {
      length += 2
    }
  }
  return length;
}

let command = ''
const prefixLen = computed(() => cursorLen(prefix))
const commandLen = computed(() => cursorLen(command))
const totalLen  = computed(() => prefixLen.value + commandLen.value)

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
      navigateHistory(-1);
      break;
    case '\u001B[B': // 下箭头
      navigateHistory(1);
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
    default:
      inputData(data)
      break;
  }
}

// 获取光标位置：参考xterm.js官网的demo.js
function getCursorX() {
  return term._core.buffer.x
}

// 命令行提示符
function prompt() {
  command = ''
  term.write(prefix)
}

function keyCtrlC() {
  term.writeln('^C')
  prompt()
}

async function keyEnter() {
  if (command.length > 0) {
    const result = await execCommand(command)
    term.writeln('')
    term.writeln(result)
    command = ''
  }
  prompt()
}

function navigateHistory(){}
function moveCursorLeft() {
  if (getCursorX() <= prefixLen.value) return
  term.write('\x1B[D')
}
function moveCursorRight() {
  if (getCursorX() >= totalLen.value) return
  term.write('\x1B[C')
}

// 移动光标到最左边：先移动到行首，再向后移动前缀
function moveCursorToStart() {
  term.write('\x1B[0G' + '\x1B[' + prefixLen.value + 'C')
}

// 移动光标到最右边：先移动到行首，再向后移动前缀 + 命令
function moveCursorToEnd() {
  term.write('\x1B[0G' + '\x1B[' + totalLen.value + 'C')
}

function backspace() {}
function autoComplete() {}
function inputData(data) {
  if (data.length === 1 || (data.length > 1 && !data.startsWith('\u001B'))) {
    command += data
    term.write(data)
  }
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