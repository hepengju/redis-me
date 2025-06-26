<script setup>
// https://rennzhang.github.io/codemirror-editor-vue3/zh-CN/guide/getting-started
import CodeMirror from "codemirror-editor-vue3"

// 语言
import "codemirror/mode/sql/sql.js"
import "codemirror/mode/clike/clike.js"  // java
import "codemirror/mode/javascript/javascript.js"
import "codemirror/mode/rust/rust.js"
import "codemirror/mode/go/go.js"

// 主题
// import "codemirror/theme/monokai.css"
import "codemirror/theme/idea.css"
import "codemirror/theme/darcula.css"
import "codemirror/addon/display/autorefresh"
import {useDark} from "@vueuse/core";

// 支持Ctrl+F搜索
import "codemirror/addon/search/searchcursor.js";
import "codemirror/addon/search/search";
import "codemirror/addon/dialog/dialog.js";
import "codemirror/addon/dialog/dialog.css";
import "codemirror/addon/selection/mark-selection.js";

// prop
const {language, readOnly} = defineProps({
  language: {type: String, default: 'sql'},
  readOnly: {type: Boolean, default: false, required: false}
})

const initOptions = reactive({
  // theme: "darcula",
  // mode: "text/sql",
  lineNumbers: true,     // 显示行号
  scrollbarStyle: null,  // 不显示滚动条
  readOnly: false,       // 只读
  styleActiveLine: true, // 高亮当前行
  border: false,
})

const mode = computed(() => {
  const lang = language.toLowerCase()
  switch(lang) {
    case "java"      : return "text/x-java"
    case "rust"      : return "rust"
    case "go"        : return "go"
    case "javascript": return "javascript"
    case "js"        : return "javascript"
    case "json"      : return "application/json"
  }
  return 'sql'
})

const isDark = useDark()
const cmOptions = computed(() => ({...initOptions, mode, readOnly, theme: isDark.value ? 'darcula' : 'idea' }))
const cm = useTemplateRef('cm')
onMounted(() => {
  cm.value.refresh()
})
</script>

<template>
  <CodeMirror v-bind="$attrs" ref="cm" :options="cmOptions" original-style :class="readOnly ? ['is-disabled', 'codemirror-opacity'] : []"/>
</template>

<style scoped lang="scss">
.codemirror-container {
  font-size: 20px;
}
</style>
<style>
.CodeMirror-search-field {
  font-family: Consolas !important;
}
</style>