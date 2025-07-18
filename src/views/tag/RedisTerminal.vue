<script setup>
import '@xterm/xterm/css/xterm.css'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit/src/FitAddon.js'

const term = new Terminal({
  rendererType: "canvas", //渲染类型
  //rows: parseInt(this.rows), //行数
  //cols: parseInt(this.cols), // 不指定行数，自动回车后光标从下一行开始
  fontSize: '14',
  fontFamily: '"Cascadia Code", Menlo, monospace', // 官网的默认字体，更好看一些
  convertEol: true, //启用时，光标将设置为下一行的开头
  scrollback: 9999999, //终端中的回滚量
  disableStdin: false, //是否应禁用输入。
  cursorStyle: "underline", //光标样式
  cursorBlink: true, //光标闪烁
  theme: {
    cursor: "help" //设置光标
  }
})
const fitAddon = new FitAddon()
term.loadAddon(fitAddon)

onMounted(() => {
  term.open(document.getElementById('terminal'))
  term.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ')
})

</script>

<template>
  <div class="redis-terminal" id="terminal"></div>
</template>

<style scoped lang="scss">
.redis-terminal {
  height: 100%;
  overflow: hidden;
}
</style>