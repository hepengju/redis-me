/**
 * 工作台命令提示。整篇文档是一条命令，换行当空格。
 * 还在输入命令名时补命令；到了键槽则补左侧已扫描键和收藏键。和终端同一套判断。
 */

import {
  isTypingTerminalCommandName,
  parseTerminalKeyHintContext,
  rankTerminalKeyHints,
  type TerminalKeyHintDescriptions,
  type TerminalKeyHintEntry,
} from '@/utils/redis/terminal-key-hints'

import { rankCommandHints } from './command-hints'

export interface WorkbenchCompletionOption {
  label: string
  detail: string
  /** 写回文档的文本，末尾留一个空格，方便接着写参数 */
  apply: string
}

export interface WorkbenchCompletion {
  from: number
  to: number
  /** 在 label 里画下划线的片段 */
  matchParts: string[]
  options: WorkbenchCompletionOption[]
}

interface CommandHint {
  key: string
  summary?: string
  description?: string
}

interface Span {
  from: number
  to: number
}

function spansOf(doc: string): Span[] {
  const spans: Span[] = []
  const re = /\S+/g
  let match: RegExpExecArray | null
  while ((match = re.exec(doc))) {
    spans.push({ from: match.index, to: match.index + match[0].length })
  }
  return spans
}

/** 命令名可能跨多个词。光标后面仍属于命令名的词一并替换，参数留下。 */
function commandReplaceRange(
  doc: string,
  pos: number,
  commandKeys: readonly string[],
): { from: number; to: number } | null {
  const spans = spansOf(doc)
  const started = spans.filter(span => span.from < pos)
  if (started.length === 0) return null
  let to = pos
  const inside = spans.find(span => span.from < pos && pos <= span.to)
  if (inside) to = inside.to
  for (const span of spans) {
    if (span.to <= to) continue
    if (!isTypingTerminalCommandName(doc.slice(0, span.to), commandKeys)) break
    to = span.to
  }
  const from = started[0]?.from ?? pos
  return from <= to ? { from, to } : null
}

/**
 * 键槽只替换当前这一个参数。引号里的空格仍是同一个参数。
 * 光标停在空白处则插在光标上，不改后面的文字。
 */
function keyReplaceRange(doc: string, pos: number): { from: number; to: number } {
  if (pos <= 0 || /\s$/.test(doc.slice(0, pos))) return { from: pos, to: pos }

  let argStart = 0
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < pos) {
    const c = doc[i] ?? ''
    if (quote) {
      if (c === '\\' && i + 1 < pos) {
        i += 2
        continue
      }
      if (c === quote) quote = null
      i++
      continue
    }
    if ((c === '"' || c === "'") && (i === 0 || /\s/.test(doc[i - 1] ?? ''))) {
      quote = c
      argStart = i
      i++
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (i === 0 || /\s/.test(doc[i - 1] ?? '')) argStart = i
    i++
  }

  let end = pos
  if (quote) {
    while (end < doc.length) {
      const c = doc[end] ?? ''
      if (c === '\\' && end + 1 < doc.length) {
        end += 2
        continue
      }
      end++
      if (c === quote) break
    }
  } else {
    while (end < doc.length && /\S/.test(doc[end] ?? '')) end++
  }
  return { from: argStart, to: end }
}

/** 光标前的文本决定提示。pos 按 UTF-16，和 CodeMirror 的位置一致。 */
export function workbenchCompletionAt(
  doc: string,
  pos: number,
  commands: readonly CommandHint[],
  keys: readonly TerminalKeyHintEntry[],
  keyDetail: TerminalKeyHintDescriptions,
): WorkbenchCompletion | null {
  const at = Math.max(0, Math.min(pos, doc.length))
  const input = doc.slice(0, at)
  if (!input.trim()) return null

  const keyCtx = parseTerminalKeyHintContext(input)
  if (keyCtx) {
    if (keys.length === 0) return null
    const matched = rankTerminalKeyHints(keyCtx.keyPrefix, keys)
    if (matched.length === 0) return null
    const range = keyReplaceRange(doc, at)
    return {
      ...range,
      matchParts: keyCtx.keyPrefix ? [keyCtx.keyPrefix] : [],
      options: matched.map(item => ({
        label: item.name,
        detail: item.source === 'favorite' ? keyDetail.favorite : keyDetail.scanned,
        apply: `${item.formatted} `,
      })),
    }
  }

  const names = commands.map(cmd => cmd.key)
  if (!isTypingTerminalCommandName(input, names)) return null
  const ranked = rankCommandHints(input, commands)
  if (ranked.length === 0) return null
  const range = commandReplaceRange(doc, at, names)
  if (!range) return null
  return {
    ...range,
    matchParts: input.trim().split(/\s+/),
    options: ranked.map(({ item }) => ({
      label: item.key,
      detail: item.summary ?? item.description ?? '',
      apply: `${item.key} `,
    })),
  }
}

/** 补全列表里命中片段的下划线区间，成对的起止下标。 */
export function completionMatchRanges(label: string, parts: readonly string[]): number[] {
  const lower = label.toLowerCase()
  const raw: [number, number][] = []
  for (const part of parts) {
    if (!part) continue
    const needle = part.toLowerCase()
    let idx = lower.indexOf(needle)
    while (idx !== -1) {
      raw.push([idx, idx + part.length])
      idx = lower.indexOf(needle, idx + needle.length)
    }
  }
  raw.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of raw) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  return merged.flat()
}
