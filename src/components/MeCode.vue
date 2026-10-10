<script setup lang="ts">
// #region 导入
import { syntaxHighlighting } from '@codemirror/language'
import { Prec, EditorState, StateEffect } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { useDark } from '@vueuse/core'
import { json5 as cmJson5 } from 'codemirror-json5'
import {
  type HTMLAttributes,
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useAttrs,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

import {
  meBasicSetup,
  propertiesDarkSyntax,
  propertiesEagerParse,
  propertiesLang,
  shellLang,
  yamlLang,
  zhPhrases,
} from '@/plugins/codemirror'
import { redisHighlighting, redisLang } from '@/utils/redis-lang'
import { isZh, meCopy } from '@/utils/util'
// #endregion

// #region 核心状态
// 在编辑器聚焦时 F11：对 `.cm-editor` 调用 Fullscreen API（再按 F11 或 Esc 退出）
function toggleCmEditorFullscreen(el: HTMLElement) {
  const doc = el.ownerDocument
  if (doc.fullscreenElement === el) {
    void doc.exitFullscreen().catch(() => {})
    return
  }
  void el.requestFullscreen().catch(() => {})
}

// 自动换行默认关闭，Mod+B 切换（Mac ⌘ / Win·Linux Ctrl）
const lineWrap = ref(false)
// 行号默认显示，Mod+N 切换
const showLineNumbers = ref(true)

// 编辑器字号（px），Mod+= / Mod+- 调节，Mod+0 恢复默认
const FONT_SIZE_DEFAULT = 15
const FONT_SIZE_MIN = 10
const FONT_SIZE_MAX = 28
const FONT_SIZE_STEP = 2
const fontSizePx = ref(FONT_SIZE_DEFAULT)

function bumpFontSize(delta: number) {
  fontSizePx.value = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSizePx.value + delta))
}
// #endregion

// #region 计算属性
const meCodePrecKeymap = Prec.highest(
  keymap.of([
    {
      key: 'F11',
      run: view => {
        toggleCmEditorFullscreen(view.dom)
        return true
      },
    },
    {
      key: 'Mod-b',
      run: () => {
        lineWrap.value = !lineWrap.value
        return true
      },
    },
    {
      key: 'Mod-n',
      run: () => {
        showLineNumbers.value = !showLineNumbers.value
        return true
      },
    },
    {
      key: 'Mod-=',
      run: () => {
        bumpFontSize(FONT_SIZE_STEP)
        return true
      },
    },
    {
      key: 'Mod--',
      run: () => {
        bumpFontSize(-FONT_SIZE_STEP)
        return true
      },
    },
    {
      key: 'Mod-0',
      run: () => {
        fontSizePx.value = FONT_SIZE_DEFAULT
        return true
      },
    },
  ]),
)

const props = withDefaults(
  defineProps<{
    /** 编辑器文本 */
    modelValue?: string
    /** `json` / `json5` 均使用 JSON5 语法高亮；`properties`/`conf` 为行式配置；`shell` / `yaml` 安装帮助产物；`redis` 为 FT.CREATE */
    mode?: string
    readOnly?: boolean
    /** 解码失败：danger 描边 */
    error?: boolean
    /** 右下角内置复制图标（可选展示） */
    copyable?: boolean
    /** 自定义编码识别中：编辑区留空，只盖一行半透明提示 */
    loading?: boolean
    loadingText?: string
  }>(),
  {
    modelValue: '',
    mode: 'json',
    readOnly: false,
    error: false,
    copyable: false,
    loading: false,
    loadingText: '',
  },
)

// 对外仅暴露 v-model：编辑内容变化时通知父组件
// （原先靠 attrs 透传 onUpdate:modelValue 给 code-mirror，去掉包装后显式声明）
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// class/style 落到外层包装（撑高度），其余属性透给编辑器
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
// class/style 拆到外层 wrapper，其余透传给编辑器容器
const wrapClass = computed<HTMLAttributes['class']>(() => attrs.class as HTMLAttributes['class'])
const wrapStyle = computed<HTMLAttributes['style']>(() => attrs.style as HTMLAttributes['style'])
const restAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest as Record<string, unknown>
})
const { t } = useI18n()

function copyCode(): void {
  meCopy(props.modelValue)
}

const rootClass = computed(() => [
  ...(props.readOnly ? ['codemirror-opacity', 'is-disabled'] : []),
  ...(props.error ? ['is-decode-error'] : []),
])

const dark = useDark()
const lang = computed(() => {
  if (props.mode === 'json' || props.mode === 'json5') return cmJson5()
  if (props.mode === 'properties' || props.mode === 'conf') return propertiesLang
  if (props.mode === 'shell') return shellLang
  if (props.mode === 'yaml') return yamlLang
  if (props.mode === 'redis') return redisLang
  return undefined
})
const phrases = computed(() => (isZh.value ? zhPhrases : {}))
const extensions = computed(() => {
  const list = [
    meBasicSetup,
    meCodePrecKeymap,
    EditorView.theme({ '&': { fontSize: `${fontSizePx.value}px` } }),
  ]

  if (lineWrap.value) {
    list.push(EditorView.lineWrapping)
  }

  if (showLineNumbers.value) {
    list.push(lineNumbers())
  }

  if (props.mode === 'properties' || props.mode === 'conf') {
    list.push(syntaxHighlighting(propertiesDarkSyntax), propertiesEagerParse)
  }
  // 跟语言包各挂一次。只放在 LanguageSupport 里时，这个编辑器仍会落到默认高亮。
  if (props.mode === 'redis') list.push(redisHighlighting)
  return list
})

// 合并扩展 + 语言 + 短语 + 只读：直接喂给 EditorState，不再经 vue-codemirror6 包装
const fullExtensions = computed(() => [
  ...extensions.value,
  ...(lang.value ? [lang.value] : []),
  ...(Object.keys(phrases.value).length > 0 ? [EditorState.phrases.of(phrases.value)] : []),
  EditorState.readOnly.of(props.readOnly),
  EditorView.editable.of(!props.readOnly),
  EditorView.theme({}, { dark: dark.value }),
])
// #endregion

// #region 编辑器挂载（直接实例化 EditorView）
const containerEl = ref<HTMLElement>()
const view = shallowRef<EditorView>()
let lastEmitted: string | null = null // 抑制「用户输入 → emit → 父回灌」的整篇替换回环
let pendingExternal: string | null = null // IME 合成期间收到的外部改值，合成结束后重放

// 外部改值整篇替换：跳过自身 emit 的回灌与文档已相同的值
function applyExternalValue(value: string) {
  const v = view.value
  if (!v || v.composing) return
  if (value === lastEmitted) {
    lastEmitted = null
    return
  }
  if (v.state.doc.toString() === value) return
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, scrollIntoView: true })
}

// IME 合成结束后重放合成期间暂存的外部改值（否则那次改值会被永久丢弃）
function flushPendingExternal() {
  if (pendingExternal === null || view.value?.composing) return
  const pending = pendingExternal
  pendingExternal = null
  applyExternalValue(pending)
}

onMounted(() => {
  if (!containerEl.value || typeof window === 'undefined') return
  view.value = new EditorView({
    parent: containerEl.value,
    state: EditorState.create({ doc: props.modelValue, extensions: fullExtensions.value }),
    dispatch: (tr, dv) => {
      const before = dv.state.doc
      dv.update(Array.isArray(tr) ? tr : [tr])
      // 仅当整批事务前后文档真正变化才 emit：只看末尾事务会漏发「前面改文档、末尾没改」的情况
      if (dv.state.doc !== before) {
        lastEmitted = dv.state.doc.toString()
        emit('update:modelValue', lastEmitted)
      }
    },
  })
  containerEl.value.addEventListener('compositionend', flushPendingExternal)
})

onBeforeUnmount(() => {
  containerEl.value?.removeEventListener('compositionend', flushPendingExternal)
  view.value?.destroy()
  view.value = undefined
})

// 字号 / 换行 / 行号 / 语言 / 主题 / 只读变化时热替换，保留文档与光标
watch(fullExtensions, exts => {
  view.value?.dispatch({ effects: StateEffect.reconfigure.of(exts) })
})

// 外部改值（加载 / 刷新 / 切换键）整篇替换；IME 合成中先暂存，合成结束后重放
watch(
  () => props.modelValue,
  value => {
    if (view.value?.composing) {
      pendingExternal = value
      return
    }
    applyExternalValue(value)
  },
)
// #endregion
</script>

<template>
  <!-- 直接挂载 CodeMirror EditorView，不再依赖 vue-codemirror6 包装层 -->
  <div class="me-code-wrap" :class="[wrapClass, rootClass]" :style="wrapStyle">
    <div ref="containerEl" class="vue-codemirror" v-bind="restAttrs"></div>
    <div v-if="props.loading" class="me-code-loading">
      <me-icon icon="el-icon-loading" :name="props.loadingText" />
    </div>
    <me-icon
      v-if="props.copyable"
      class="me-code-copy"
      icon="el-icon-document-copy"
      :info="t('copy')"
      placement="top"
      @click="copyCode" />
  </div>
</template>

<style scoped lang="scss">
.me-code-wrap {
  position: relative;
  height: 100%;
  min-height: 0;
}

.me-code-loading {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-info);
  background: transparent;
  opacity: 0.8;

  :deep(.el-icon) {
    animation: rotating 2s linear infinite;
  }
}

/* 右下角复制图标（仅 copyable 时展示） */
.me-code-copy {
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 4;
  cursor: pointer;
  color: var(--el-text-color-secondary);

  &:hover {
    color: var(--el-color-primary);
  }
}

.codemirror-opacity {
  opacity: 0.8;
}

.is-decode-error {
  /* border 不被 gutter 挡住；勿用 inset shadow */
  border: 2px solid var(--el-color-danger);
  box-sizing: border-box;
}

.vue-codemirror {
  height: 100%;

  /* 默认高度 */
  :deep(.cm-editor) {
    height: 100%;
  }

  /* F11 全屏时填满视口（普通 DOM 全屏，非整窗 Tauri F11） */
  :deep(.cm-editor:fullscreen) {
    box-sizing: border-box;
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    background-color: var(--el-bg-color-page, var(--el-bg-color, #fff));
  }

  :deep(.cm-editor:fullscreen .cm-scroller) {
    flex: 1;
    min-height: 0;
  }

  /* 字体设置 */
  :deep(.cm-scroller) {
    font-family: var(--code-font);
  }
}

html.dark .vue-codemirror {
  background-color: #272822;

  :deep(.cm-editor:fullscreen) {
    background-color: #272822;
  }

  :deep(.ͼ3 .cm-gutters) {
    background-color: #272822;
  }

  /* 默认选区 #233 与背景 #272822 过近，略提亮 */
  :deep(.cm-selectionBackground) {
    background-color: #4b6a3f !important;
  }

  /* JSON值在黑色模式下红色看着不舒服，因此改下 */
  /* Json 的 null（默认 #708 过暗） */
  :deep(.ͼb) {
    color: #ae81ff;
  }

  /* Json的字符串值 */
  :deep(.ͼe) {
    color: #e6db74;
  }

  /* Json的布尔值 */
  :deep(.ͼc) {
    color: var(--el-color-primary);
  }

  /* Json的数字值 */
  :deep(.ͼd) {
    color: var(--el-color-success);
  }

  /* Json5的注释 */
  :deep(.ͼm) {
    color: #75715e;
  }
}
</style>
