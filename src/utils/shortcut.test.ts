import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
  displayShortcutKey,
  getConnGlobalShortcuts,
  getTerminalShortcuts,
  getValueShortcuts,
  isAppFullscreenHotkeyBlocked,
  isConnHotkeyBlocked,
  isOptionalShortcutKey,
  matchAppFullscreenHotkey,
  matchConnShortcutAction,
  shortcutItemKeys,
  shortcutKbdClass,
} from '@/utils/shortcut'

/** 测试里没有 DOM。只实现 closest / classList，供快捷键拦截判断。 */
const HotkeyElement: new () => object = (() => {
  const g = globalThis as unknown as { HTMLElement?: new () => object; document?: object }
  if (typeof g.HTMLElement !== 'function') g.HTMLElement = class {}
  if (typeof g.document === 'undefined') {
    Object.defineProperty(g, 'document', { configurable: true, writable: true, value: {} })
  }
  return g.HTMLElement!
})()

let fullscreenNode: HotkeyNode | null = null
Object.defineProperty(document, 'fullscreenElement', {
  configurable: true,
  get: () => fullscreenNode,
})

class HotkeyNode extends HotkeyElement {
  parent: HotkeyNode | null = null
  tag = 'div'
  classNames: string[] = []
  contentEditable = 'false'
  classList = { contains: (name: string) => this.classNames.includes(name) }

  closest(selector: string): HotkeyNode | null {
    const parts = selector.split(',').map(part => part.trim())
    if (parts.some(part => this.matches(part))) return this
    return this.parent?.closest(selector) ?? null
  }

  matches(sel: string): boolean {
    if (sel.startsWith('.')) return this.classNames.includes(sel.slice(1))
    if (sel === '[contenteditable="true"]') return this.contentEditable === 'true'
    return this.tag === sel
  }
}

function el(tag = 'div', className = ''): HotkeyNode {
  const node = new HotkeyNode()
  node.tag = tag
  if (className) node.classNames = className.split(/\s+/).filter(Boolean)
  return node
}

function inside(parent: HotkeyNode, child: HotkeyNode): HotkeyNode {
  child.parent = parent
  return child
}

function key(init: {
  key?: string
  code?: string
  ctrl?: boolean
  meta?: boolean
  alt?: boolean
  shift?: boolean
  target?: HotkeyNode | null
}): KeyboardEvent {
  return {
    key: init.key ?? '',
    code: init.code ?? '',
    ctrlKey: init.ctrl ?? false,
    metaKey: init.meta ?? false,
    altKey: init.alt ?? false,
    shiftKey: init.shift ?? false,
    target: init.target ?? null,
  } as KeyboardEvent
}

describe('shortcut display', () => {
  it('修饰键按平台显示，单字母大写', () => {
    expect(isOptionalShortcutKey('[shift]')).toBe(true)
    expect(isOptionalShortcutKey('shift')).toBe(false)
    expect(displayShortcutKey('mod', true)).toBe('⌘')
    expect(displayShortcutKey('mod', false)).toBe('Ctrl')
    expect(displayShortcutKey('shift', true)).toBe('⇧')
    expect(displayShortcutKey('[shift]', false)).toBe('Shift')
    expect(displayShortcutKey('alt', true)).toBe('⌥')
    expect(displayShortcutKey('alt', false)).toBe('Alt')
    expect(displayShortcutKey(',', false)).toBe(',')
    expect(displayShortcutKey('?', false)).toBe('?')
    expect(displayShortcutKey('n', false)).toBe('N')
    expect(displayShortcutKey('F11', false)).toBe('F11')
    expect(displayShortcutKey('=', false)).toBe('=')
  })

  it('kbd 类名', () => {
    expect(shortcutKbdClass('[shift]', 0, 3)).toBe('kbd-mod kbd-optional')
    expect(shortcutKbdClass('mod', 0, 2)).toBe('kbd-mod')
    expect(shortcutKbdClass('F11', 0, 1)).toBe('kbd-mod')
    expect(shortcutKbdClass('n', 1, 2)).toBe('kbd-last')
    expect(shortcutKbdClass('n', 0, 2)).toBe('kbd-mod')
    expect(shortcutKbdClass(',', 2, 3)).toBe('kbd-mod')
  })

  it('三页快捷键列表的按键', () => {
    const t = ((key: string) => key) as never
    expect(getConnGlobalShortcuts(t).map(item => [item.id, item.keys.join('+')])).toEqual([
      ['fullscreen', 'F11'],
      ['add', 'mod+shift+N'],
      ['import', 'mod+shift+O'],
      ['newWindow', 'mod+shift+W'],
      ['setting', 'mod+[shift]+,'],
      ['shortcuts', 'mod+[shift]+?'],
    ])
    const value = getValueShortcuts(t)
    expect(shortcutItemKeys(value[0], false).join('+')).toBe('F11')
    expect(shortcutItemKeys(value[0], true).join('+')).toBe('mod+shift+F')
    expect(value.find(item => item.keys.includes('='))?.gapBefore).toBe(true)
    expect(value.find(item => item.keys.includes('F'))?.gapBefore).toBe(true)
    const terminal = getTerminalShortcuts(t)
    expect(shortcutItemKeys(terminal[0], false).join('+')).toBe('F11')
    expect(shortcutItemKeys(terminal[0], true).join('+')).toBe('mod+shift+F')
    const appFullscreen = getConnGlobalShortcuts(t).find(item => item.id === 'fullscreen')
    expect(shortcutItemKeys(appFullscreen!, true).join('+')).toBe('mod+shift+F')
    expect(terminal.find(item => item.keys.includes('L'))?.gapBefore).toBe(true)
    expect(terminal.find(item => item.keys.includes('clear'))?.gapBefore).toBe(true)
  })
})

describe('matchConnShortcutAction', () => {
  it('Ctrl/Cmd + Shift + N/O/W', () => {
    expect(matchConnShortcutAction(key({ ctrl: true, shift: true, code: 'KeyN', key: 'N' }))).toBe(
      'add',
    )
    expect(matchConnShortcutAction(key({ meta: true, shift: true, code: 'KeyO', key: 'o' }))).toBe(
      'import',
    )
    expect(matchConnShortcutAction(key({ ctrl: true, shift: true, code: 'KeyW', key: 'w' }))).toBe(
      'newWindow',
    )
    expect(matchConnShortcutAction(key({ ctrl: true, code: 'KeyN', key: 'n' }))).toBe(null)
    expect(matchConnShortcutAction(key({ shift: true, code: 'KeyN', key: 'N' }))).toBe(null)
    expect(matchConnShortcutAction(key({ ctrl: true, alt: true, shift: true, code: 'KeyN' }))).toBe(
      null,
    )
  })

  it('设置和快捷键提示：Shift 可选，输入框里也响应，Alt 不响应', () => {
    const input = el('input')
    expect(matchConnShortcutAction(key({ ctrl: true, code: 'Comma', key: ',' }))).toBe('setting')
    expect(matchConnShortcutAction(key({ ctrl: true, shift: true, key: '，' }))).toBe('setting')
    expect(matchConnShortcutAction(key({ ctrl: true, code: 'Slash', key: '/' }))).toBe('shortcuts')
    expect(matchConnShortcutAction(key({ meta: true, key: '？' }))).toBe('shortcuts')
    expect(
      matchConnShortcutAction(key({ ctrl: true, code: 'Comma', key: ',', target: input })),
    ).toBe('setting')
    expect(matchConnShortcutAction(key({ ctrl: true, alt: true, code: 'Comma', key: ',' }))).toBe(
      null,
    )
    expect(matchConnShortcutAction(key({ ctrl: true, alt: true, code: 'Slash', key: '/' }))).toBe(
      null,
    )
  })

  it('输入框、编辑器和终端里不触发新增', () => {
    const input = el('input')
    const editor = inside(el('div', 'cm-editor'), el('span'))
    const terminal = inside(el('div', 't-container'), el('span'))
    const editable = el('div')
    editable.contentEditable = 'true'
    const press = { ctrl: true, shift: true, code: 'KeyN', key: 'N' }
    expect(matchConnShortcutAction(key({ ...press, target: input }))).toBe(null)
    expect(matchConnShortcutAction(key({ ...press, target: editor }))).toBe(null)
    expect(matchConnShortcutAction(key({ ...press, target: terminal }))).toBe(null)
    expect(matchConnShortcutAction(key({ ...press, target: editable }))).toBe(null)
    expect(matchConnShortcutAction(key({ ...press, target: el('span') }))).toBe('add')
  })
})

describe('fullscreen hotkey', () => {
  afterEach(() => {
    fullscreenNode = null
  })

  it('F11，以及 macOS 的 ⌘⇧F', () => {
    expect(matchAppFullscreenHotkey(key({ key: 'F11' }))).toBe(true)
    expect(matchAppFullscreenHotkey(key({ key: 'F11', ctrl: true }))).toBe(false)
    expect(matchAppFullscreenHotkey(key({ key: 'F11', shift: true }))).toBe(false)
    expect(matchAppFullscreenHotkey(key({ key: 'f11' }))).toBe(false)
    const macChord = { key: 'f', code: 'KeyF', meta: true, shift: true }
    expect(matchAppFullscreenHotkey(key(macChord), true)).toBe(true)
    expect(matchAppFullscreenHotkey(key(macChord), false)).toBe(false)
    expect(matchAppFullscreenHotkey(key({ ...macChord, ctrl: true }), true)).toBe(false)
    expect(matchAppFullscreenHotkey(key({ key: 'f', code: 'KeyF', meta: true }), true)).toBe(false)
  })

  it('焦点拦截：编辑器、终端、图表页、已经全屏的编辑区', () => {
    expect(isConnHotkeyBlocked(key({ target: null }))).toBe(false)
    expect(isConnHotkeyBlocked(key({ target: el('textarea') }))).toBe(true)
    expect(isAppFullscreenHotkeyBlocked(key({}), { tabName: 'chart' })).toBe(true)
    expect(
      isAppFullscreenHotkeyBlocked(key({ target: inside(el('div', 'cm-editor'), el()) })),
    ).toBe(true)
    expect(
      isAppFullscreenHotkeyBlocked(key({ target: inside(el('div', 't-container'), el()) })),
    ).toBe(true)
    fullscreenNode = el('div', 'charts')
    expect(isAppFullscreenHotkeyBlocked(key({}))).toBe(true)
    fullscreenNode = el('div', 'cm-editor')
    expect(isAppFullscreenHotkeyBlocked(key({}))).toBe(true)
    fullscreenNode = el('div')
    expect(isAppFullscreenHotkeyBlocked(key({}), { tabName: 'value' })).toBe(false)
  })
})
