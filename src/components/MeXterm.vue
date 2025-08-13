<script setup>
import '@xterm/xterm/css/xterm.css'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit/src/FitAddon.js'
import {onMounted} from 'vue'
import { get, set } from 'lodash'

// TODO 命令提示
// TODO 集群节点选择
const {welcome, prefix, execCommand} = defineProps({
  welcome: {
    type: String,
    default: '欢迎使用 \x1B[1;3;31mRedisME\x1B[0m Terminal\r\n',
  },
  prefix: {
    type: String,
    default: '$ ',
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

const newTerm = () => {
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

  term.onData(onTermData)
  term.attachCustomKeyEventHandler(onTermKey)
  return {term, fitAddon}
}

// 页面加载后挂载到元素
let termInst = null
let fitAddonInst = null
const resizeTerm = () => {
  if (fitAddonInst != null) {
    fitAddonInst.fit()
  }
}
onMounted(() => {
  const { term, fitAddon } = newTerm()
  termInst = term
  fitAddonInst = fitAddon

  // 在指定元素中打开，并适配元素大小，写入欢迎信息
  termInst.open(document.getElementById('terminal'))
  termInst.write(welcome)
  termInst.write(prefixContent.value)
  fitAddonInst.fit() // 适配元素大小
  termInst.focus()
  window.addEventListener('resize', resizeTerm)
})

onUnmounted(() => {
  termInst.dispose()
  termInst = null
  window.removeEventListener('resize', resizeTerm)
})


//// 参考Tiny-RDM中的终端优化
const promptPrefix = computed(() => prefix)

let inputCursor = 0
let historyIndex = 0
let waitForOutput = false
const inputHistory = []
const prefixContent = computed(() => {
  return `\x1B[1;3;31m${promptPrefix.value}\x1B[0m`
})

const prefixLen = computed(() => {
  let len = 0
  for (let i = 0; i < promptPrefix.value.length; i++) {
    const char = prefix.charCodeAt(i)
    if (char >= 0x0000 && char <= 0x00ff) {
      // single byte ASCII char
      len += 1
    } else {
      // multibyte Unicode char
      len += 2
    }
  }
  return len
})

const onTermData = (data) => {
  if (termInst == null) {
    return
  }

  if (data) {
    const cc = data.charCodeAt(0)
    switch (cc) {
      case 127: // backspace
        deleteInput(true)
        return

      case 13: // enter
        // try to process local command first
        switch (getCurrentInput()) {
          case 'clear':
          case 'clr':
            termInst.clear()
            replaceTermInput()
            newInputLine()
            return

          default: // send command to server
            flushTermInput()
            return
        }

      case 27:
        switch (data.substring(1)) {
          case '[A': // arrow up
            changeHistory(true)
            return
          case '[B': // arrow down
            changeHistory(false)
            return
          case '[C': // arrow right ->
            moveInputCursor(1)
            return
          case '[D': // arrow left <-
            moveInputCursor(-1)
            return
          case '[3~': // del
            deleteInput(false)
            return
        }

      case 9: // tab
        return
    }
  }
  updateInput(data)
}

/**
 *
 * @param e
 * @return {boolean}
 */
const onTermKey = (e) => {
  if (e.type === 'keydown') {
    if (e.ctrlKey) {
      switch (e.key) {
        case 'a': // move to head of line
          moveInputCursorTo(0)
          return false

        case 'e': // move to tail of line
          moveInputCursorTo(Number.MAX_SAFE_INTEGER)
          return false

        case 'f': // move forward
          moveInputCursor(1)
          return false

        case 'b': // move backward
          moveInputCursor(-1)
          return false

        case 'd': // delete char
          deleteInput(false)
          return false

        case 'h': // back delete
          deleteInput(true)
          return false

        case 'u': // delete all text before cursor
          deleteInput2(false)
          return false

        case 'k': // delete all text after cursor
          deleteInput2(true)
          return false

        case 'w': // delete word before cursor
          deleteWord(false)
          return false

        case 'p': // previous history
          changeHistory(true)
          return false

        case 'n': // next history
          changeHistory(false)
          return false

        case 'l': // clear screen
          termInst.clear()
          replaceTermInput()
          newInputLine()
          return false
      }
      // block all ctrl key combinations input
      return false
    } else {
      switch (e.key) {
        case 'Home': // move to head of line
          moveInputCursorTo(0)
          return false
        case 'End': // move to tail of line
          moveInputCursorTo(Number.MAX_SAFE_INTEGER)
          return false
        case ' ': // replace space
          e.preventDefault()
          updateInput(' ')
          return false
      }
    }
  }
  return true
}

/**
 * move input cursor by step
 * @param {number} step above 0 indicate move right; 0 indicate move to last
 */
const moveInputCursor = (step) => {
  if (termInst == null) {
    return
  }

  let updateCursor = false
  if (step > 0) {
    // move right
    const currentLine = getCurrentInput()
    if (inputCursor + step <= currentLine.length) {
      inputCursor += step
      updateCursor = true
    }
  } else if (step < 0) {
    // move left
    if (inputCursor + step >= 0) {
      inputCursor += step
      updateCursor = true
    }
  }

  if (updateCursor) {
    moveInputCursorTo(inputCursor)
  }
}

/**
 * move cursor to the end of current line
 */
const moveInputCursorToEnd = () => {
  moveInputCursorTo(Number.MAX_SAFE_INTEGER)
}

/**
 * move cursor to pos
 * @param {number} pos
 */
const moveInputCursorTo = (pos) => {
  const currentLine = getCurrentInput()
  inputCursor = Math.min(Math.max(0, pos), currentLine.length)
  termInst.write(`\x1B[${prefixLen.value + inputCursor + 1}G`)
}

/**
 * update current input cache and refresh term
 * @param {string} data
 */
const updateInput = (data) => {
  if (data == null || data.length <= 0) {
    return
  }
  // replace &nbsp;(Non-Breaking Space) with normal blank space
  data = data.replace(/\u00A0/g, ' ')

  if (termInst == null) {
    return
  }

  let currentLine = getCurrentInput()
  if (inputCursor < currentLine.length) {
    // insert
    currentLine = currentLine.substring(0, inputCursor) + data + currentLine.substring(inputCursor)
    replaceTermInput(currentLine)
    moveInputCursor(data.length)
  } else {
    // append
    currentLine += data
    termInst.write(data)
    inputCursor += data.length
  }
  updateCurrentInput(currentLine)
}

/**
 *
 * @param {boolean} back backspace or not
 */
const deleteInput = (back = false) => {
  if (termInst == null) {
    return
  }

  let currentLine = getCurrentInput()
  if (inputCursor < currentLine.length) {
    // delete middle part
    if (back) {
      currentLine = currentLine.substring(0, inputCursor - 1) + currentLine.substring(inputCursor)
      inputCursor -= 1
    } else {
      currentLine = currentLine.substring(0, inputCursor) + currentLine.substring(inputCursor + 1)
    }
  } else {
    if (back) {
      // delete last one
      currentLine = currentLine.slice(0, -1)
      inputCursor -= 1
    }
  }

  replaceTermInput(currentLine)
  updateCurrentInput(currentLine)
  moveInputCursorTo(inputCursor)
}

/**
 * delete to the end
 * @param back
 */
const deleteInput2 = (back = false) => {
  if (termInst == null) {
    return
  }

  let currentLine = getCurrentInput()
  if (back) {
    // delete until tail
    currentLine = currentLine.substring(0, inputCursor - 1)
    inputCursor = currentLine.length
  } else {
    // delete until head
    currentLine = currentLine.substring(inputCursor)
    inputCursor = 0
  }

  replaceTermInput(currentLine)
  updateCurrentInput(currentLine)
  moveInputCursorTo(inputCursor)
}

/**
 * delete one word
 * @param back
 */
const deleteWord = (back = false) => {
  if (termInst == null) {
    return
  }

  let currentLine = getCurrentInput()
  if (back) {
    const prefix = currentLine.substring(0, inputCursor)
    let firstNonChar = false
    let cursor = inputCursor
    while (cursor < currentLine.length) {
      const isChar =
          (currentLine[cursor] >= 'a' && currentLine[cursor] <= 'z') ||
          (currentLine[cursor] >= 'A' && currentLine[cursor] <= 'Z') ||
          (currentLine[cursor] >= '0' && currentLine[cursor] <= '9')
      if (!firstNonChar || isChar) {
        if (!isChar) {
          firstNonChar = true
        }
        cursor++
      } else {
        break
      }
    }
    currentLine = prefix + currentLine.substring(cursor)
  } else {
    const suffix = currentLine.substring(inputCursor)
    let firstNonChar = false
    while (inputCursor >= 0) {
      const isChar =
          (currentLine[inputCursor] >= 'a' && currentLine[inputCursor] <= 'z') ||
          (currentLine[inputCursor] >= 'A' && currentLine[inputCursor] <= 'Z') ||
          (currentLine[inputCursor] >= '0' && currentLine[inputCursor] <= '9')
      if (!firstNonChar || isChar) {
        if (!isChar) {
          firstNonChar = true
        }
        inputCursor--
      } else {
        break
      }
    }
    currentLine = currentLine.substring(0, inputCursor) + suffix
  }

  replaceTermInput(currentLine)
  updateCurrentInput(currentLine)
  moveInputCursorTo(inputCursor)
}

const getCurrentInput = () => {
  return get(inputHistory, historyIndex, '')
}

const updateCurrentInput = (input) => {
  set(inputHistory, historyIndex, input || '')
}

const newInputLine = () => {
  if (historyIndex >= 0 && historyIndex < inputHistory.length - 1) {
    // edit prev history, move to last
    const pop = inputHistory.splice(historyIndex, 1)
    inputHistory[inputHistory.length - 1] = pop[0]
  }
  if (get(inputHistory, inputHistory.length - 1, '')) {
    historyIndex = inputHistory.length
    updateCurrentInput('')
  }
}

/**
 * get prev or next history record
 * @param prev
 * @return {*|null}
 */
const changeHistory = (prev) => {
  let currentLine = null
  if (prev) {
    if (historyIndex > 0) {
      historyIndex -= 1
      currentLine = inputHistory[historyIndex]
    }
  } else {
    if (historyIndex < inputHistory.length - 1) {
      historyIndex += 1
      currentLine = inputHistory[historyIndex]
    }
  }

  if (currentLine != null) {
    if (termInst == null) {
      return
    }

    replaceTermInput(currentLine)
    moveInputCursorToEnd()
  }

  return null
}

/**
 * flush terminal input and send current prompt to server
 * @param {boolean} flushCmd
 */
const flushTermInput = async (flushCmd = false) => {
  const currentLine = getCurrentInput()
  inputCursor = 0
  // historyIndex = inputHistory.length
  waitForOutput = true

  // 执行命令并写结果
  const result = await execCommand(currentLine)
  termInst.writeln('')
  termInst.writeln(result)
  termInst.write(prefixContent.value)
  newInputLine()
}

/**
 * clear current input line and replace with new content
 * @param {string|null} [content]
 */
const replaceTermInput = (content = '') => {
  if (termInst == null) {
    return
  }

  // erase current line and write new content
  termInst.write('\r\x1B[K' + prefixContent.value + (content || ''))
}

/**
 * process receive output content
 * @param {{content: string[], prompt: string}} data
 */
// const receiveTermOutput = (data) => {
//   if (termInst == null) {
//     return
//   }
//
//   termInst.write(data)
//   const { content = [], prompt } = data || {}
//   if (!isEmpty(content)) {
//     for (const line of content) {
//       termInst.write('\r\n' + line)
//     }
//   }
//   if (!isEmpty(prompt)) {
//     promptPrefix.value = prompt
//     termInst.write('\r\n' + prefixContent.value)
//     waitForOutput = false
//     inputCursor = 0
//     newInputLine()
//   }
// }
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