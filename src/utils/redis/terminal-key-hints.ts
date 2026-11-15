import { shallowRef } from 'vue'
import type { Command, InputTipItem } from 'vue-web-terminal'

import { enCommands } from '@/locales/cmd/en'

export type TerminalKeyHintSource = 'scanned' | 'favorite'

export interface TerminalKeyHintEntry {
  name: string
  source: TerminalKeyHintSource
}

/** 终端键名补全数据源（左侧 SCAN + 当前连接收藏键） */
export const terminalKeyHints = shallowRef<TerminalKeyHintEntry[]>([])

export function setTerminalKeyHints(scanned: string[], favorites: string[] = []): void {
  const seen = new Set<string>()
  const entries: TerminalKeyHintEntry[] = []

  for (const name of favorites) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    entries.push({ name, source: 'favorite' })
  }
  for (const name of scanned) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    entries.push({ name, source: 'scanned' })
  }
  terminalKeyHints.value = entries
}

type KeySlotMode = 'fixed' | 'repeat-keys' | 'key-value-pairs'

interface KeyHintRule {
  /** 与 commandHelp.key 一致，保留大小写与空格 */
  cmdKey: string
  keySlotMode: KeySlotMode
  /** 重复键 / 键值对：该下标起才进入循环；之前的 keySlotIndexes 仍可补全（如 STORE destination） */
  prefixArgCount: number
  /** fixed：各键槽下标；repeat-keys：循环段之前额外的键槽（destination / destkey） */
  keySlotIndexes: number[]
  /** key-value-pairs：一组循环长度，键在组内偏移 0。MSET=2，JSON.MSET=3 */
  period?: number
}

/** usage 中视为 Redis 键名的占位符 */
const KEY_LIKE_TOKENS = new Set([
  'key',
  'newkey',
  'source',
  'destination',
  'destkey',
  'sourcekey',
  'dst',
  'src',
  'key1',
  'key2',
  'destination-key',
  'source-key',
])

/** 可重复的键占位符（长名优先，避免 source 误吃 sourcekey） */
const REPEATABLE_KEY_NAMES = [
  'sourcekey',
  'source-key',
  'destination-key',
  'destkey',
  'source',
  'key',
]

function collapseAngleChoices(s: string): string {
  return s.replace(/<([^>]+)>/g, (_, inner: string) => {
    const opts = inner.split('|').map(t =>
      t
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .toLowerCase()
        .trim(),
    )
    const keyLike = opts.find(t => KEY_LIKE_TOKENS.has(t))
    return keyLike ?? '_or'
  })
}

function tokenizeUsageArgs(usageTail: string): string[] {
  let s = collapseAngleChoices(usageTail).replace(/\u00a0/g, ' ')
  while (/\[[^\]]*\]/.test(s)) {
    s = s.replace(/\[[^\]]*\]/g, '')
  }
  return s
    .split(/\s+/)
    .map(t => t.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase())
    .filter(Boolean)
}

function findRepeatableKeyName(tail: string): string | null {
  for (const name of REPEATABLE_KEY_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const nested = new RegExp(
      `\\[\\s*${escaped}\\s+\\[\\s*${escaped}\\s+\\.\\.\\.\\s*\\]\\s*\\]`,
      'i',
    )
    const simple = new RegExp(`\\[\\s*${escaped}\\s+\\.\\.\\.\\s*\\]`, 'i')
    const requiredThenRepeat = new RegExp(
      `\\b${escaped}\\s+\\[\\s*${escaped}\\s+\\.\\.\\.\\s*\\]`,
      'i',
    )
    if (nested.test(tail) || simple.test(tail) || requiredThenRepeat.test(tail)) return name
  }
  return null
}

function parseKeyHintRule(cmdKey: string, usage: string): KeyHintRule | null {
  // 换行只是 usage 排版，键槽可能在第二行（如 XREADGROUP ... STREAMS key）
  const usageLine = usage
    .replace(/\n/g, ' ')
    .trim()
    .replace(/\u00a0/g, ' ')
  if (!usageLine.toUpperCase().startsWith(cmdKey.toUpperCase())) return null

  const tail = usageLine.slice(cmdKey.length).trim()
  const tokens = tokenizeUsageArgs(tail)

  if (/\bkey\s+path\s+value\s+\[\s*key\s+path\s+value\s+\.\.\.\s*\]/i.test(tail)) {
    const keyIdx = tokens.indexOf('key')
    if (keyIdx === -1) return null
    return {
      cmdKey,
      keySlotMode: 'key-value-pairs',
      prefixArgCount: keyIdx,
      keySlotIndexes: [],
      period: 3,
    }
  }

  if (/\bkey\s+value\s+\[\s*key\s+value\s+\.\.\.\s*\]/i.test(tail)) {
    const keyIdx = tokens.indexOf('key')
    if (keyIdx === -1) return null
    return {
      cmdKey,
      keySlotMode: 'key-value-pairs',
      prefixArgCount: keyIdx,
      keySlotIndexes: [],
      period: 2,
    }
  }

  const repeatName = findRepeatableKeyName(tail)
  if (repeatName) {
    // 重复段若在可选括号内会被 strip 掉（如 PFMERGE 的 sourcekey），回退到第一个键占位符
    let keyIdx = tokens.indexOf(repeatName)
    if (keyIdx === -1) keyIdx = tokens.findIndex(t => KEY_LIKE_TOKENS.has(t))
    if (keyIdx === -1) return null
    const keySlotIndexes: number[] = []
    tokens.forEach((t, i) => {
      if (i < keyIdx && KEY_LIKE_TOKENS.has(t)) keySlotIndexes.push(i)
    })
    return { cmdKey, keySlotMode: 'repeat-keys', prefixArgCount: keyIdx, keySlotIndexes }
  }

  const keySlotIndexes: number[] = []
  tokens.forEach((t, i) => {
    if (KEY_LIKE_TOKENS.has(t)) keySlotIndexes.push(i)
  })
  if (keySlotIndexes.length === 0) return null

  return { cmdKey, keySlotMode: 'fixed', prefixArgCount: 0, keySlotIndexes }
}

function buildKeyHintRules(): KeyHintRule[] {
  const rules: KeyHintRule[] = []
  for (const cmd of enCommands) {
    const rule = parseKeyHintRule(cmd.key, cmd.usage)
    if (rule) rules.push(rule)
  }
  return rules.sort((a, b) => b.cmdKey.length - a.cmdKey.length)
}

const KEY_HINT_RULES = buildKeyHintRules()

/** @internal 单测用：查看命令解析出的键位规则 */
export function getKeyHintRuleForTest(cmdKey: string): KeyHintRule | undefined {
  return KEY_HINT_RULES.find(r => r.cmdKey.toUpperCase() === cmdKey.toUpperCase())
}

export interface TerminalKeyHintContext {
  cmd: string
  /** 当前键名之前已确定的命令片段（含尾部空格） */
  commandPrefix: string
  keyPrefix: string
}

interface ActiveKeySlot {
  slotIndex: number
  keyPrefix: string
}

interface ParsedAfterCommandArgs {
  parts: string[]
  endsWithSpace: boolean
}

/** 按 redis-cli 引号拆参数；引号只在 token 开头生效，避免 user's:id 被拆开 */
function parseAfterCommandArgs(afterCmd: string): ParsedAfterCommandArgs {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let i = 0

  while (i < afterCmd.length) {
    const c = afterCmd[i] ?? ''
    if (quote) {
      if (c === '\\' && i + 1 < afterCmd.length) {
        current += afterCmd[i + 1]
        i += 2
        continue
      }
      if (c === quote) {
        quote = null
        i++
        continue
      }
      current += c
      i++
      continue
    }
    if ((c === '"' || c === "'") && current === '') {
      quote = c
      i++
      continue
    }
    if (/\s/.test(c)) {
      if (current !== '') {
        parts.push(current)
        current = ''
      }
      i++
      continue
    }
    current += c
    i++
  }

  if (quote || current !== '') parts.push(current)
  const endsWithSpace = !quote && afterCmd.length > 0 && /\s$/.test(afterCmd)
  return { parts, endsWithSpace }
}

function getActiveKeySlot(
  parts: string[],
  endsWithSpace: boolean,
  rule: KeyHintRule,
): ActiveKeySlot | null {
  const slotIndex = endsWithSpace ? parts.length : Math.max(0, parts.length - 1)
  const keyPrefix = endsWithSpace ? '' : (parts[slotIndex] ?? '')

  if (rule.keySlotMode === 'repeat-keys') {
    if (slotIndex >= rule.prefixArgCount || rule.keySlotIndexes.includes(slotIndex)) {
      return { slotIndex, keyPrefix }
    }
    return null
  }

  if (rule.keySlotMode === 'key-value-pairs') {
    const period = rule.period ?? 2
    if (slotIndex < rule.prefixArgCount) return null
    if ((slotIndex - rule.prefixArgCount) % period !== 0) return null
    return { slotIndex, keyPrefix }
  }

  if (!rule.keySlotIndexes.includes(slotIndex)) return null
  return { slotIndex, keyPrefix }
}

function buildCommandPrefix(
  cmd: string,
  parts: string[],
  active: ActiveKeySlot,
  endsWithSpace: boolean,
): string {
  if (endsWithSpace && active.keyPrefix === '') {
    const formatted = parts.map(formatRedisKeyForTerminal).join(' ')
    return formatted ? `${cmd} ${formatted} ` : `${cmd} `
  }

  const before = parts.slice(0, active.slotIndex).map(formatRedisKeyForTerminal)
  return before.length > 0 ? `${cmd} ${before.join(' ')} ` : `${cmd} `
}

/** vue-web-terminal 在 @input 里给出的 cursorIndex 仍是按键前的位置（比 command 少 1） */
export function terminalHintInput(command: string, cursorIndex: unknown): string {
  if (typeof cursorIndex !== 'number' || cursorIndex < 0) return command
  if (cursorIndex < command.length - 1) return command.slice(0, cursorIndex)
  return command
}

/**
 * 是否仍在输入命令名（含 CONFIG GET 等多词子命令）。
 * 已进入参数（HGET 的 field、MSET 的 value）时为 false，避免回退成命令列表。
 */
export function isTypingTerminalCommandName(input: string, commandKeys: string[]): boolean {
  const raw = input.trimStart()
  if (!raw) return true
  const endsWithSpace = /\s$/.test(raw)
  const userTokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.toUpperCase())
  if (userTokens.length === 0) return true
  if (userTokens.length === 1 && !endsWithSpace) return true

  return commandKeys.some(key => {
    const cmdTokens = key.replace(/\s+/g, ' ').trim().toUpperCase().split(' ').filter(Boolean)
    if (userTokens.length > cmdTokens.length) return false
    for (let i = 0; i < userTokens.length; i++) {
      const ut = userTokens[i] ?? ''
      const ct = cmdTokens[i] ?? ''
      const tokenComplete = endsWithSpace || i < userTokens.length - 1
      if (tokenComplete) {
        if (ct !== ut) return false
      } else if (!ct.startsWith(ut)) return false
    }
    if (endsWithSpace) return cmdTokens.length > userTokens.length
    return true
  })
}

/** 解析是否处于「命令 + 键名」输入阶段 */
export function parseTerminalKeyHintContext(command: string): TerminalKeyHintContext | null {
  const trimmed = command.trimStart()

  for (const rule of KEY_HINT_RULES) {
    const escaped = rule.cmdKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = trimmed.match(new RegExp(`^${escaped}(\\s+)(.*)$`, 'i'))
    if (!m) continue

    const afterCmd = m[2]
    const { parts, endsWithSpace } = parseAfterCommandArgs(afterCmd)
    const active = getActiveKeySlot(parts, endsWithSpace, rule)
    if (!active) continue

    return {
      cmd: rule.cmdKey,
      commandPrefix: buildCommandPrefix(rule.cmdKey, parts, active, endsWithSpace),
      keyPrefix: active.keyPrefix,
    }
  }

  return null
}

export function formatRedisKeyForTerminal(key: string): string {
  if (/[\s"'\\]/.test(key)) return `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return key
}

function escapeTipHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightKeyName(key: string, prefix: string): string {
  if (!prefix) return escapeTipHtml(key)
  const keyLower = key.toLowerCase()
  const prefixLower = prefix.toLowerCase()
  const idx = keyLower.indexOf(prefixLower)
  if (idx === -1) return escapeTipHtml(key)
  const before = key.slice(0, idx)
  const hit = key.slice(idx, idx + prefix.length)
  const after = key.slice(idx + prefix.length)
  return `${escapeTipHtml(before)}<span class="t-cmd-key">${escapeTipHtml(hit)}</span>${escapeTipHtml(after)}`
}

function scoreKeyName(
  key: string,
  prefix: string,
  source: TerminalKeyHintSource,
): [number, number, number, number] {
  const keyLower = key.toLowerCase()
  const prefixLower = prefix.toLowerCase()
  const favoriteBoost = source === 'favorite' ? 1 : 0

  if (!prefixLower) return [favoriteBoost, 0, 0, key.length]
  if (keyLower === prefixLower) return [favoriteBoost, 2, 0, key.length]
  if (keyLower.startsWith(prefixLower)) return [favoriteBoost, 1, 0, key.length]
  const idx = keyLower.indexOf(prefixLower)
  return [favoriteBoost, 0, idx === -1 ? Number.MAX_SAFE_INTEGER : idx, key.length]
}

export interface TerminalKeyHintDescriptions {
  scanned: string
  favorite: string
}

/** 从提示源生成终端提示项；commandHelp 用于右侧命令说明，避免只剩 key 时出现空面板 */
export function buildTerminalKeyHintTips(
  ctx: TerminalKeyHintContext,
  entries: TerminalKeyHintEntry[],
  descriptions: TerminalKeyHintDescriptions,
  commandHelp?: Pick<Command, 'title' | 'group' | 'usage' | 'description'>,
): InputTipItem[] {
  const prefix = ctx.keyPrefix
  const prefixLower = prefix.toLowerCase()

  const matched = entries
    .filter(entry => !prefixLower || entry.name.toLowerCase().includes(prefixLower))
    .map(entry => ({ entry, score: scoreKeyName(entry.name, prefix, entry.source) }))
    .sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) {
        if (a.score[i] !== b.score[i]) {
          if (i === 0 || i === 1) return b.score[i] - a.score[i]
          return a.score[i] - b.score[i]
        }
      }
      return 0
    })
    .slice(0, 20)

  return matched.map(({ entry }) => {
    const formattedKey = formatRedisKeyForTerminal(entry.name)
    return {
      content: highlightKeyName(entry.name, prefix),
      description: entry.source === 'favorite' ? descriptions.favorite : descriptions.scanned,
      command: {
        key: `${ctx.commandPrefix}${formattedKey}`,
        title: commandHelp?.title,
        group: commandHelp?.group,
        usage: commandHelp?.usage,
        description: commandHelp?.description,
      } satisfies Command,
    }
  })
}
