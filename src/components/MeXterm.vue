<script setup lang="ts">
import '@xterm/xterm/css/xterm.css'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit/src/FitAddon.js'
import {onMounted} from 'vue'

// TODO 上下切换历史命令
// TODO Ctrl A/E等快捷键
// TODO 命令提示
// TODO 集群节点选择
const {welcome, prefix, execCommand} = defineProps({
  welcome: {
    type: String,
    default: '欢迎使用 \x1B[1;3;31mRedisME\x1B[0m Terminal\r\n'
  },
  prefix: {
    type: String,
    default: '\x1B[1;3;31m$ \x1B[0m',
  },
  execCommand: {
    type: Function,
    default: (command: string) => `TODO 后台运行命令: ${command}`,
  }
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

// 输入命令监控
let command = ''
term.onData(e => {
  switch (e) {
    case '\u0003': // Ctrl+C
      term.write('^C')
      prompt()
      break
    case '\r': // Enter
      runCommand(command)
      command = ''
      break
    case '\u007F': // Backspace (DEL)
      // Do not delete the prompt
      if (term._core.buffer.x > 2) {
        term.write('\b \b')
        if (command.length > 0) {
          command = command.slice(0, command.length - 1)
        }
      }
      break
    default: // Print all other characters for demo
      if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7E) || e >= '\u00a0') {
        command += e
        term.write(e)
      }
  }
})

// 命令行提示符
function prompt() {
  term.write(prefix)
}

// 执行命令
function runCommand(command) {
  if (command.length > 0) {
    const result = execCommand(command)
    term.writeln('')
    term.writeln(result)
  }
  prompt()
}

// 页面加载后挂载到元素
onMounted(() => {
  // 在指定元素中打开，并适配元素大小，写入欢迎信息
  term.open(document.getElementById('terminal'))
  fitAddon.fit() // 适配元素大小
  window.onresize = () => {fitAddon.fit()}

  term.write(welcome)
  prompt()
})
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