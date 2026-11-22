/**
 * 工作台编辑器的命令提示。只挂在工作台，不放进 MeCode 的公共扩展。
 * 列表开着时 Enter / Tab 接受当前项；列表关掉后 Enter 仍是换行。Ctrl+Space 再打开。
 * 选中后如果下一位是键，会接着弹出键名。
 */

import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  moveCompletionSelection,
  startCompletion,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { Prec } from '@codemirror/state'
import { EditorView, keymap, tooltips } from '@codemirror/view'

import i18n from '@/locales'
import { commandHelp } from '@/locales/cmd'
import { terminalKeyHints } from '@/utils/redis/terminal-key-hints'

import { completionMatchRanges, workbenchCompletionAt } from './workbench-complete'

function redisCompletionSource(context: {
  state: { doc: { toString(): string } }
  pos: number
}): CompletionResult | null {
  const hit = workbenchCompletionAt(
    context.state.doc.toString(),
    context.pos,
    commandHelp.value,
    terminalKeyHints.value,
    {
      scanned: i18n.global.t('redisTerminal.keyHintScanned'),
      favorite: i18n.global.t('redisTerminal.keyHintFavorite'),
    },
  )
  if (!hit) return null
  return {
    from: hit.from,
    to: hit.to,
    filter: false,
    getMatch: completion => completionMatchRanges(completion.label, hit.matchParts),
    options: hit.options.map(option => ({
      label: option.label,
      detail: option.detail || undefined,
      apply: option.apply,
    })),
  }
}

const completeKeys = Prec.high(
  keymap.of([
    { key: 'Ctrl-Space', run: startCompletion },
    { key: 'ArrowDown', run: moveCompletionSelection(true) },
    { key: 'ArrowUp', run: moveCompletionSelection(false) },
    { key: 'PageDown', run: moveCompletionSelection(true, 'page') },
    { key: 'PageUp', run: moveCompletionSelection(false, 'page') },
    { key: 'Tab', run: acceptCompletion },
    // 没打开列表时返回 false，换行交给编辑器自己的 Enter
    { key: 'Enter', run: acceptCompletion },
    { key: 'Escape', run: closeCompletion },
  ]),
)

// 颜色和宽度跟 vue-web-terminal 的提示框一致。框宽 280–500。
// 深色：命中黄色，命令名白色，说明 #cbb0b0，选中行 #5c6ec9。
// 浅色：命中 #834dff，命令名 #644c4c，说明 #939393，选中行 #cbd3fd。
// 选择器多一层，盖过补全库的 monospace、斜体、下划线和 700px 宽。
const completeTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    borderRadius: '5px',
    border: 'none',
    boxShadow: '5px 5px 15px 0 rgba(0, 0, 0, .3)',
    minWidth: '280px',
    maxWidth: '500px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-tooltip > ul': {
    minWidth: '280px',
    maxWidth: '500px',
    padding: '5px',
    fontFamily: 'var(--code-font)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-tooltip > ul > li': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    padding: '5px 8px',
    borderRadius: '5px',
    lineHeight: '16px',
    fontFamily: 'var(--code-font)',
    fontSize: '16px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionLabel': {
    flex: 'none',
    fontFamily: 'var(--code-font)',
    fontStyle: 'normal',
    fontWeight: '700',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionMatchedText': {
    textDecoration: 'none',
    fontWeight: '700',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionDetail': {
    flex: '1 1 auto',
    minWidth: '0',
    marginLeft: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    fontFamily: 'var(--code-font)',
    fontStyle: 'normal',
    fontWeight: '400',
  },
  // 字色写死在深浅色上。终端的变量要等终端页签挂载才有，工作台不能靠它。
  // 命中片段是内层 span；选中行会把整行设成白色，所以字色要压过它。
  '&dark .cm-tooltip.cm-tooltip-autocomplete': { backgroundColor: '#544a4a' },
  '&dark .cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': { background: '#5c6ec9' },
  '&dark .cm-tooltip.cm-tooltip-autocomplete .cm-completionLabel': { color: '#fff !important' },
  '&dark .cm-tooltip.cm-tooltip-autocomplete .cm-completionMatchedText': {
    color: 'yellow !important',
  },
  '&dark .cm-tooltip.cm-tooltip-autocomplete .cm-completionDetail': { color: '#cbb0b0 !important' },
  '&light .cm-tooltip.cm-tooltip-autocomplete': { backgroundColor: '#fff' },
  '&light .cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': { background: '#cbd3fd' },
  '&light .cm-tooltip.cm-tooltip-autocomplete .cm-completionLabel': { color: '#644c4c !important' },
  '&light .cm-tooltip.cm-tooltip-autocomplete .cm-completionMatchedText': {
    color: '#834dff !important',
  },
  '&light .cm-tooltip.cm-tooltip-autocomplete .cm-completionDetail': {
    color: '#939393 !important',
  },
})

/** 编辑器挂载期间保持同一份，避免补全弹层被反复拆掉。 */
export function redisWorkbenchCompletion() {
  return [
    // 输入区 overflow:hidden，弹层挂到 body 才不会被裁掉
    tooltips({ parent: document.body }),
    completeKeys,
    autocompletion({
      override: [redisCompletionSource],
      defaultKeymap: false,
      activateOnTyping: true,
      // 接受命令后立刻再问一次：下一位是键就弹出键名
      activateOnCompletion: () => true,
      maxRenderedOptions: 20,
      icons: false,
    }),
    completeTheme,
  ]
}
