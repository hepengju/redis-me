<script setup lang="ts">
// #region 导入
import { syntaxHighlighting } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { Prec, EditorState, StateEffect } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view'
import { type as getOsType } from '@tauri-apps/plugin-os'
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

import MeCodeSubmenu from '@/components/MeCodeSubmenu.vue'
import {
  markdownHeadingSyntax,
  markdownLang,
  meBasicSetup,
  propertiesDarkSyntax,
  propertiesEagerParse,
  propertiesLang,
  propertiesLightSyntax,
  shellLang,
  xmlLang,
  yamlLang,
  zhPhrases,
} from '@/plugins/codemirror'
import { detectCodeMode } from '@/utils/detect-code-mode'
import { redisHighlighting, redisLang } from '@/utils/redis-lang'
import { displayShortcutKey, type ShortcutKey } from '@/utils/shortcut'
import {
  ME_CODE_FONT_DEFAULT,
  ME_CODE_FONT_MAX,
  ME_CODE_FONT_MIN,
  ME_CODE_FONT_STEP,
  isZh,
  meCodeFontSize,
  meCodeLineWrap,
  meCodeShowLineNumbers,
  meCopy,
} from '@/utils/util'
// #endregion

// #region 核心状态
// 全屏外层包裹（含右键菜单）。全屏 `.cm-editor` 时菜单在元素外，全屏层里看不见
// macOS 的 F11 被系统「显示桌面」占用，另认 ⌘⇧F；F11 仍保留
function toggleCmEditorFullscreen(el: HTMLElement) {
  const doc = el.ownerDocument
  if (doc.fullscreenElement === el) {
    void doc.exitFullscreen().catch(() => {})
    return
  }
  void el.requestFullscreen().catch(() => {})
}

// 行号 / 换行 / 字号：本次运行内所有编辑器共用，见 util.ts
const lineWrap = meCodeLineWrap
const showLineNumbers = meCodeShowLineNumbers
const fontSizePx = meCodeFontSize
const wrapEl = ref<HTMLElement>()
const fullscreenOn = ref(false)
const menuRef = ref<{ showMenu: (e: MouseEvent) => void; closeMenu: () => void }>()

function fullscreenEditor() {
  const el = wrapEl.value
  if (!el) return
  toggleCmEditorFullscreen(el)
}

function syncFullscreen() {
  fullscreenOn.value = document.fullscreenElement === wrapEl.value
}

function bumpFontSize(delta: number) {
  fontSizePx.value = Math.min(
    ME_CODE_FONT_MAX,
    Math.max(ME_CODE_FONT_MIN, fontSizePx.value + delta),
  )
}
// #endregion

// #region 计算属性
const meCodePrecKeymap = Prec.highest(
  keymap.of([
    {
      key: 'F11',
      run: () => {
        fullscreenEditor()
        return true
      },
    },
    {
      // 仅 macOS。`mac` 会盖掉同条里的 key，所以不跟 F11 写在一起
      mac: 'Mod-Shift-f',
      run: () => {
        fullscreenEditor()
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
        bumpFontSize(ME_CODE_FONT_STEP)
        return true
      },
    },
    {
      key: 'Mod--',
      run: () => {
        bumpFontSize(-ME_CODE_FONT_STEP)
        return true
      },
    },
    {
      key: 'Mod-0',
      run: () => {
        fontSizePx.value = ME_CODE_FONT_DEFAULT
        return true
      },
    },
  ]),
)

const props = withDefaults(
  defineProps<{
    /** 编辑器文本 */
    modelValue?: string
    /** `json` / `json5` 均使用 JSON5 语法高亮；`properties`/`conf` 为行式配置（含 INI）；`shell` / `yaml` 安装帮助产物；`redis` 为 FT.CREATE；`xml`/`markdown` 文档高亮；`auto` 按内容特征推断（仅外部改值时重推断） */
    mode?: string
    readOnly?: boolean
    /** 解码失败：danger 描边 */
    error?: boolean
    /** 右下角内置复制图标（可选展示） */
    copyable?: boolean
    /** 自定义编码识别中：编辑区留空，只盖一行半透明提示 */
    loading?: boolean
    loadingText?: string
    /** 空内容时的占位提示（仅文档为空时显示，同原生 input placeholder） */
    placeholder?: string
  }>(),
  {
    modelValue: '',
    mode: 'json',
    readOnly: false,
    error: false,
    copyable: false,
    loading: false,
    loadingText: '',
    placeholder: '',
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

function onContextMenu(e: MouseEvent) {
  menuRef.value?.showMenu(e)
}

function onMenuCommand(command: unknown) {
  if (typeof command !== 'string' || !command) return
  if (command === 'fullscreen') fullscreenEditor()
  else if (command === 'lineNumbers') showLineNumbers.value = !showLineNumbers.value
  else if (command === 'lineWrap') lineWrap.value = !lineWrap.value
  else if (command === 'find') {
    const v = view.value
    if (v) openSearchPanel(v)
  } else if (command === 'font+') bumpFontSize(ME_CODE_FONT_STEP)
  else if (command === 'font-') bumpFontSize(-ME_CODE_FONT_STEP)
  else if (command === 'mode:follow') modeOverride.value = null
  else if (command.startsWith('mode:')) modeOverride.value = command.slice('mode:'.length)
  // 放大/缩小留着菜单连点，其余项点完关掉
  if (command !== 'font+' && command !== 'font-') menuRef.value?.closeMenu()
}

// 只读只改外观（变淡 + 禁止光标），不把编辑器设成不可聚焦
const rootClass = computed(() => [
  ...(props.readOnly ? ['codemirror-opacity', 'is-disabled'] : []),
  ...(props.error ? ['is-decode-error'] : []),
])

const dark = useDark()

// auto：按内容特征推断一次，外部改值（加载/刷新/remount）才重算；用户输入不重推断，避免打字过程中 mode 抖动的观感与重配置开销
const detectedMode = ref<string>('text')
function detectOnce(value: string) {
  detectedMode.value = detectCodeMode(value)
}
// 右键临时改高亮，不写入设置。外部换内容或 mode 时回到传入值 / 推断结果
const modeOverride = ref<string | null>(null)
const effectiveMode = computed(() => {
  if (modeOverride.value) return modeOverride.value
  return props.mode === 'auto' ? detectedMode.value : props.mode
})

const HIGHLIGHT_MODES = [
  'json',
  'yaml',
  'markdown',
  'xml',
  'properties',
  'shell',
  'redis',
  'text',
] as const

function highlightId(mode: string): string {
  if (mode === 'json' || mode === 'json5') return 'json'
  if (mode === 'properties' || mode === 'conf') return 'properties'
  return mode
}

function modeLabel(mode: string): string {
  const id = highlightId(mode)
  const key = `meCode.mode.${id}`
  const text = t(key)
  return text === key ? mode : text
}

const followChecked = computed(() => props.mode === 'auto' && !modeOverride.value)
const followLabel = computed(() =>
  t('meCode.highlightFollow', { name: modeLabel(detectedMode.value) }),
)
const fontTitle = computed(() => t('meCode.fontSize', { size: fontSizePx.value }))

// 右键项右侧的快捷键，与编辑器实际按键一致。macOS 全屏显示 ⌘⇧F（F11 被系统占用）
const isMacOS = getOsType() === 'macos'
function menuShortcut(keys: ShortcutKey[]): string {
  return keys.map(key => displayShortcutKey(key, isMacOS)).join(' + ')
}
const menuKeys = {
  fullscreen: menuShortcut(isMacOS ? ['mod', 'shift', 'f'] : ['F11']),
  lineNumbers: menuShortcut(['mod', 'n']),
  lineWrap: menuShortcut(['mod', 'b']),
  fontIncrease: menuShortcut(['mod', '=']),
  fontDecrease: menuShortcut(['mod', '-']),
  find: menuShortcut(['mod', 'f']),
}

function languageChecked(id: string): boolean {
  if (followChecked.value) return false
  return highlightId(effectiveMode.value) === id
}

const lang = computed(() => {
  const m = effectiveMode.value
  if (m === 'json' || m === 'json5') return cmJson5()
  if (m === 'properties' || m === 'conf') return propertiesLang
  if (m === 'shell') return shellLang
  if (m === 'yaml') return yamlLang
  if (m === 'xml') return xmlLang
  if (m === 'markdown') return markdownLang
  if (m === 'redis') return redisLang
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

  // 空文档时的占位提示（非空自动隐藏）
  if (props.placeholder) {
    list.push(cmPlaceholder(props.placeholder))
  }

  if (effectiveMode.value === 'properties' || effectiveMode.value === 'conf') {
    list.push(
      syntaxHighlighting(propertiesLightSyntax),
      syntaxHighlighting(propertiesDarkSyntax),
      propertiesEagerParse,
    )
  }
  // markdown 标题去下划线（覆盖 default 的 underline，样式 scope 限定 markdown 语言）
  if (effectiveMode.value === 'markdown') list.push(syntaxHighlighting(markdownHeadingSyntax))
  // 跟语言包各挂一次。只放在 LanguageSupport 里时，这个编辑器仍会落到默认高亮。
  if (effectiveMode.value === 'redis') list.push(redisHighlighting)
  return list
})

// 合并扩展 + 语言 + 短语 + 只读：直接喂给 EditorState，不再经 vue-codemirror6 包装
const fullExtensions = computed(() => [
  ...extensions.value,
  ...(lang.value ? [lang.value] : []),
  ...(Object.keys(phrases.value).length > 0 ? [EditorState.phrases.of(phrases.value)] : []),
  // 只读只锁文档，编辑器仍可聚焦：选中、复制、Ctrl+F 搜索都可用
  EditorState.readOnly.of(props.readOnly),
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
  if (props.mode === 'auto') detectOnce(props.modelValue)
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
  document.addEventListener('fullscreenchange', syncFullscreen)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  containerEl.value?.removeEventListener('compositionend', flushPendingExternal)
  view.value?.destroy()
  view.value = undefined
})

// 字号 / 换行 / 行号 / 语言 / 主题 / 只读变化时热替换，保留文档与光标
watch(fullExtensions, exts => {
  view.value?.dispatch({ effects: StateEffect.reconfigure.of(exts) })
})

watch(
  () => props.mode,
  () => {
    modeOverride.value = null
  },
)

// 外部改值（加载 / 刷新 / 切换键）整篇替换；IME 合成中先暂存，合成结束后重放
watch(
  () => props.modelValue,
  value => {
    // 外部改值：丢掉右键选的高亮，auto 再推断一次。用户输入回灌跳过
    if (value !== lastEmitted) {
      modeOverride.value = null
      if (props.mode === 'auto') detectOnce(value)
    }
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
  <div
    ref="wrapEl"
    class="me-code-wrap"
    :class="[wrapClass, rootClass]"
    :style="wrapStyle"
    @contextmenu="onContextMenu">
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
    <!-- 全屏时菜单留在包裹层内；平时挂到 body，避免被父级 overflow 裁掉 -->
    <me-context
      ref="menuRef"
      popper-class="me-code-menu"
      :teleported="!fullscreenOn"
      :hide-on-click="false"
      @handle-command="onMenuCommand">
      <el-dropdown-item command="fullscreen">
        <span class="me-code-menu-row">
          <me-icon
            class="me-code-menu-label"
            icon="me-icon-window-maximize"
            :name="t('meCode.fullscreen')" />
          <span class="me-code-menu-key">{{ menuKeys.fullscreen }}</span>
        </span>
      </el-dropdown-item>
      <el-dropdown-item command="lineNumbers">
        <span class="me-code-menu-row">
          <me-icon
            class="me-code-menu-label"
            icon="me-icon-line-number"
            :name="t('meCode.lineNumbers')" />
          <span class="me-code-menu-key">{{ menuKeys.lineNumbers }}</span>
        </span>
      </el-dropdown-item>
      <el-dropdown-item command="lineWrap">
        <span class="me-code-menu-row">
          <me-icon
            class="me-code-menu-label"
            icon="me-icon-line-wrap"
            :name="t('meCode.lineWrap')" />
          <span class="me-code-menu-key">{{ menuKeys.lineWrap }}</span>
        </span>
      </el-dropdown-item>
      <MeCodeSubmenu keep-open icon="me-icon-font-size" :title="fontTitle" @command="onMenuCommand">
        <el-dropdown-item command="font+" :disabled="fontSizePx >= ME_CODE_FONT_MAX">
          <span class="me-code-menu-row">
            <me-icon
              class="me-code-menu-label"
              icon="el-icon-zoom-in"
              :name="t('meCode.fontIncrease')" />
            <span class="me-code-menu-key">{{ menuKeys.fontIncrease }}</span>
          </span>
        </el-dropdown-item>
        <el-dropdown-item command="font-" :disabled="fontSizePx <= ME_CODE_FONT_MIN">
          <span class="me-code-menu-row">
            <me-icon
              class="me-code-menu-label"
              icon="el-icon-zoom-out"
              :name="t('meCode.fontDecrease')" />
            <span class="me-code-menu-key">{{ menuKeys.fontDecrease }}</span>
          </span>
        </el-dropdown-item>
      </MeCodeSubmenu>
      <MeCodeSubmenu
        icon="el-icon-brush"
        :title="t('meCode.highlight')"
        :max-height="320"
        @command="onMenuCommand">
        <el-dropdown-item v-if="props.mode === 'auto'" command="mode:follow">
          <span class="me-code-menu-row">
            <span class="me-code-menu-mark">
              <me-icon v-if="followChecked" icon="el-icon-check" />
            </span>
            <span>{{ followLabel }}</span>
          </span>
        </el-dropdown-item>
        <el-dropdown-item
          v-for="id in HIGHLIGHT_MODES"
          :key="id"
          :command="`mode:${id}`"
          :divided="id === 'json' && props.mode === 'auto'">
          <span class="me-code-menu-row">
            <span class="me-code-menu-mark">
              <me-icon v-if="languageChecked(id)" icon="el-icon-check" />
            </span>
            <span>{{ t(`meCode.mode.${id}`) }}</span>
          </span>
        </el-dropdown-item>
      </MeCodeSubmenu>
      <el-dropdown-item command="find">
        <span class="me-code-menu-row">
          <me-icon class="me-code-menu-label" icon="me-icon-search" :name="t('meCode.find')" />
          <span class="me-code-menu-key">{{ menuKeys.find }}</span>
        </span>
      </el-dropdown-item>
    </me-context>
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

  /* 字体设置 */
  :deep(.cm-scroller) {
    font-family: var(--code-font);
  }

  /* 空内容占位提示：与输入框 placeholder 同色，避免误读为正文 */
  :deep(.cm-placeholder) {
    color: var(--el-text-color-placeholder);
  }
}

.me-code-wrap:fullscreen {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: var(--el-bg-color-page, var(--el-bg-color, #fff));

  .vue-codemirror {
    flex: 1;
    min-height: 0;
  }
}

html.dark .me-code-wrap:fullscreen {
  background-color: #272822;
}

html.dark .vue-codemirror {
  background-color: #272822;

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

<style lang="scss">
.me-code-menu-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.me-code-menu-mark {
  width: 14px;
  height: 14px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.me-code-menu-label {
  flex: 1;
}

.me-code-menu-arrow {
  margin-left: 12px;
  flex: none;
}

.me-code-menu-key {
  flex: none;
  margin-left: 16px;
  color: var(--el-color-info);
  font-size: 12px;
  white-space: nowrap;
}

.el-dropdown-menu__item.is-disabled .me-code-menu-key {
  color: inherit;
}

.me-code-menu-arrow {
  font-size: 12px;
}

.me-code-menu.el-dropdown__popper .el-dropdown__list {
  min-width: 168px;
}

/* 子菜单触发器铺满整行。不要把这一行改成 block，否则箭头会掉到下一行，弹出层也会跟着偏下 */
.el-dropdown-menu__item:has(.me-code-menu-sub) {
  padding: 0;
}

.me-code-menu-sub.el-dropdown {
  display: flex;
  width: 100%;
  line-height: inherit;
}

.me-code-menu-sub .me-code-menu-row {
  flex: 1;
  box-sizing: border-box;
  min-width: 0;
  padding: 5px 16px;
  line-height: 22px;
}
</style>
