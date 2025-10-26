<script setup>
// https://rennzhang.github.io/codemirror-editor-vue3/zh-CN/guide/getting-started
import CodeMirror from 'codemirror-editor-vue3'

// 语言
import 'codemirror/mode/javascript/javascript.js'
import "codemirror/mode/properties/properties.js"

// 主题
import 'codemirror/theme/idea.css'
// import 'codemirror/theme/darcula.css'
import "codemirror/theme/monokai.css"
import 'codemirror/addon/display/autorefresh'
import {useDark} from '@vueuse/core'

// 支持Ctrl+F搜索
import 'codemirror/addon/search/searchcursor.js'
import 'codemirror/addon/search/search'
import 'codemirror/addon/dialog/dialog.js'
import 'codemirror/addon/dialog/dialog.css'
import 'codemirror/addon/selection/mark-selection.js'

const {mode, readOnly} = defineProps({
  mode: {type: String, default: 'application/json'},
  readOnly: {type: Boolean, default: false, required: false},
})

const initOptions = reactive({
  lineNumbers: true,     // 显示行号
  scrollbarStyle: null,  // 不显示滚动条
  styleActiveLine: false, // 高亮当前行
  border: false,
})

const isDark = useDark()
const cmOptions = computed(() => {
  return ({
    ...initOptions,
    mode,
    readOnly,
    theme: isDark.value ? 'monokai' : 'idea'
  })
})
</script>

<template>
  <CodeMirror v-bind="$attrs" ref="cm" :options="cmOptions" :class="readOnly ? ['codemirror-opacity' , 'is-disabled'] : []"/>
</template>

<style scoped lang="scss">
.codemirror-container {
  font-size: 14px;
}
</style>

<style>
.CodeMirror-search-field {
  font-family: 'Consolas,Menlo,Monaco,黑体' !important;
}
.codemirror-opacity {
  opacity: 0.6;
}
</style>