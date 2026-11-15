/** 代码编辑器 / 终端显示与右键菜单：本次运行内各自共用，不写入设置 */
import { ref } from 'vue'

export const meCodeShowLineNumbers = ref(true)
export const meCodeLineWrap = ref(false)
export const meCodeFontSize = ref(15)

export const ME_CODE_FONT_DEFAULT = 15
export const ME_CODE_FONT_MIN = 10
export const ME_CODE_FONT_MAX = 28
export const ME_CODE_FONT_STEP = 1

/** 终端字号与 CodeMirror 独立；默认 16 对齐 vue-web-terminal */
export const meXtermFontSize = ref(16)
export const ME_XTERM_FONT_DEFAULT = 16
export const ME_XTERM_FONT_MIN = 10
export const ME_XTERM_FONT_MAX = 28
export const ME_XTERM_FONT_STEP = 1
