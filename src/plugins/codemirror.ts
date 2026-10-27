import {
  EditorView,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  // highlightActiveLineGutter
} from '@codemirror/view'

export { EditorView }
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { markdown as cmMarkdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  foldGutter,
  forceParsing,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
} from '@codemirror/language'
import { properties as propertiesMode } from '@codemirror/legacy-modes/mode/properties'
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell'
import { xml as xmlMode } from '@codemirror/legacy-modes/mode/xml'
import { yaml as yamlMode } from '@codemirror/legacy-modes/mode/yaml'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { tags } from '@lezer/highlight'
// import {closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete'
// import {lintKeymap} from '@codemirror/lint'

// import { basicSetup } from "codemirror"
export const meBasicSetup = [
  // lineNumbers：由 MeCode.vue 控制，支持 Ctrl+N 切换
  // highlightActiveLineGutter(), // 关闭高亮激活行的行号区域
  highlightSpecialChars(),
  history(),
  foldGutter({ openText: '▾' }), // 自定义打开文字，和codemirror5一样
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  // closeBrackets(),
  // autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  // highlightActiveLine(),  // 关闭高亮当前行
  highlightSelectionMatches(),
  keymap.of([
    // ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    // ...completionKeymap,
    // ...lintKeymap
  ]),
]

/**
 * 语言支持（模块级单例，供 MeCode 复用，避免每个编辑器实例各建一份）。
 * properties：Java .properties 流式解析，适配 Redis INFO/CONFIG（key:value、# 段注释、续行）；conf 亦复用。
 * shell / yaml：Redis 安装帮助产物展示用。
 * xml：值区 Auto 推断命中报文/配置片段时的高亮（legacy-modes 现成，零新依赖）。
 * markdown：值区 Auto 推断命中 markdown 特征时的高亮（官方语言包，legacy-modes 无 markdown）。
 */
export const propertiesLang = new LanguageSupport(StreamLanguage.define(propertiesMode))
export const shellLang = new LanguageSupport(StreamLanguage.define(shellMode))
export const yamlLang = new LanguageSupport(StreamLanguage.define(yamlMode))
export const xmlLang = new LanguageSupport(StreamLanguage.define(xmlMode))
export const markdownLang = cmMarkdown()

/**
 * properties / Redis INFO·CONFIG 等在深色下的高亮补丁：默认 key 为 #00f 不适配暗底。
 * themeType: dark 会禁用 fallback，须覆盖本模式用到的 token；key 与 Element Plus 主色一致。
 */
export const propertiesDarkSyntax = HighlightStyle.define(
  [
    { tag: tags.definition(tags.variableName), color: 'var(--el-color-primary)' },
    { tag: tags.heading, color: '#c678dd' },
    { tag: tags.comment, color: '#75715e' },
    { tag: tags.quote, color: '#e6db74' },
    { tag: tags.string, color: '#e6db74' },
  ],
  { themeType: 'dark' },
)

/**
 * markdown 标题覆盖：defaultHighlightStyle 给 heading 挂了 underline＋bold，
 * 编辑器里整行像链接；去下划线、保留加粗、改主色。scope 限定 markdown 语言，
 * 不影响 json/yaml/properties 等模式的 heading 着色。
 * 多 highlighter 命中标题时样式是类名并集、同优先级，default 的模块后挂载会赢层叠，
 * 故两条声明需 !important（与暗色选区覆盖同一手法）。
 */
export const markdownHeadingSyntax = HighlightStyle.define(
  [
    {
      tag: tags.heading,
      textDecoration: 'none !important',
      fontWeight: 'bold',
      color: 'var(--el-color-primary) !important',
    },
  ],
  { scope: markdownLanguage },
)

/**
 * StreamLanguage 默认按 viewport 增量解析，滚动时语法树才延伸，高亮会「追着」视口出现。
 * INFO/CONFIG 等文本很短，挂载后 / 文档变化时一次性 parse 到文末即可（大文档跳过以免卡 UI）。
 */
const PROPERTIES_EAGER_PARSE_MAX = 400_000

export const propertiesEagerParse = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.schedule(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.schedule(u.view)
    }
    schedule(view: EditorView) {
      const len = view.state.doc.length
      if (len === 0 || len > PROPERTIES_EAGER_PARSE_MAX) return
      queueMicrotask(() => {
        forceParsing(view, len, 20_000)
      })
    }
  },
)

// 语言切换及功能提示
export const zhPhrases: Record<string, string> = {
  // @codemirror/view
  'Control character': '控制字符',
  // @codemirror/commands
  'Selection deleted': '所选内容已删除',
  // @codemirror/language
  'Folded lines': '折叠的行',
  'Unfolded lines': '可展开的行',
  to: '目的地',
  'folded code': '折叠的代码',
  unfold: '展开折叠',
  'Fold line': '折叠行',
  'Unfold line': '展开行的折叠',
  // @codemirror/search
  'Go to line': '转到行',
  go: '确定',
  Find: '查找',
  Replace: '替换',
  next: '▼',
  previous: '▲',
  all: '全部',
  'match case': '区分大小写',
  'by word': '按单词',
  regexp: '正则表达式',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'current match': '当前匹配项',
  'replaced $ matches': '已替换 $ 个匹配项',
  'replaced match on line $': '已替换第 $ 行的匹配项',
  'on line': '在第...行',
  // @codemirror/autocomplete
  Completions: '自动完成',
  // @codemirror/lint
  Diagnostics: '诊断信息',
  'No diagnostics': '无诊断信息',
}
