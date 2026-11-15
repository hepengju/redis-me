import type { AclUserDetail } from '@/types/tauri-specta'

export interface AclEditModel {
  username: string
  enabled: boolean
  /** 无密码登录（nopass）；与 password / passwordHashes 互斥 */
  nopass: boolean
  password: string
  passwordHashes: string[]
  commandRules: string[]
  keyPatterns: string[]
  channelPatterns: string[]
  /** Redis 7.2+ selector，每条为 SETUSER 括号内规则串 */
  selectors: string[]
}

export type AclPreset = 'normal' | 'readonly' | 'admin'

/** 去掉外层括号，统一存 SETUSER 括号内规则串 */
export function normalizeSelectorInput(text: string): string {
  let v = text.trim()
  if (v.startsWith('(') && v.endsWith(')')) {
    v = v.slice(1, -1).trim()
  }
  return v
}

export function normalizeSelectorList(list: string[]): string[] {
  return uniq(list.map(normalizeSelectorInput).filter(Boolean))
}

/** tag 展示：统一加括号 */
export function formatSelectorLabel(selector: string): string {
  const inner = normalizeSelectorInput(selector)
  return inner ? `(${inner})` : ''
}

/** 只读快捷模板：单机默认 */
export const ACL_READONLY_PRESET_RULES = ['+@read', '+@connection', '-@dangerous'] as const

/** 当前连接为集群时：+cluster 先放开整组，-@dangerous 再按子命令类别去掉危险项（NODES/SLOTS 仅 @slow 会保留） */
export const ACL_READONLY_CLUSTER_PRESET_RULES = [
  '+@read',
  '+@connection',
  '+cluster',
  '-@dangerous',
] as const

/** 快捷模板：普通用户对齐 Redis Cloud Read-Write */
export const ACL_PRESET_COMMAND_RULES: Record<AclPreset, string[]> = {
  normal: ['+@all', '-@dangerous'],
  readonly: [...ACL_READONLY_PRESET_RULES],
  admin: ['+@all'],
}

/** 只读快捷模板默认命令规则；`cluster` 表示当前连接是否为集群模式 */
export function getReadonlyPresetCommandRules(cluster: boolean): string[] {
  return cluster ? [...ACL_READONLY_CLUSTER_PRESET_RULES] : [...ACL_READONLY_PRESET_RULES]
}

/** 快捷模板命令规则；只读项随当前连接是否集群切换默认列表 */
export function getAclPresetCommandRules(
  preset: AclPreset,
  options: { cluster?: boolean } = {},
): string[] {
  if (preset === 'readonly') {
    return getReadonlyPresetCommandRules(!!options.cluster)
  }
  return [...ACL_PRESET_COMMAND_RULES[preset]]
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list))
}

function normalizeRuleList(list: string[]): string[] {
  return uniq(list.map(v => v.trim()).filter(Boolean))
}

function normalizePatternList(list: string[], prefix: '~' | '&'): string[] {
  return uniq(
    list
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => (v.startsWith(prefix) ? v.slice(1) : v)),
  )
}

/** Redis ACL 键模式关键字（不可加 ~ 前缀，如 allkeys 等价 ~*） */
export const ACL_KEY_KEYWORDS = new Set(['allkeys', 'resetkeys'])

/** Redis ACL 频道模式关键字（不可加 & 前缀，如 allchannels 等价 &*） */
export const ACL_CHANNEL_KEYWORDS = new Set(['allchannels', 'resetchannels'])

export function isAclKeyKeyword(pattern: string): boolean {
  return ACL_KEY_KEYWORDS.has(pattern.trim().toLowerCase())
}

export function isAclChannelKeyword(pattern: string): boolean {
  return ACL_CHANNEL_KEYWORDS.has(pattern.trim().toLowerCase())
}

/** 表单 tag 展示：关键字原样，普通模式加 ~ / & */
export function formatKeyPatternLabel(pattern: string): string {
  if (isAclKeyKeyword(pattern)) return pattern
  return `~${pattern.startsWith('~') ? pattern.slice(1) : pattern}`
}

export function formatChannelPatternLabel(pattern: string): string {
  if (isAclChannelKeyword(pattern)) return pattern
  return `&${pattern.startsWith('&') ? pattern.slice(1) : pattern}`
}

function formatKeyPatternForCommand(pattern: string): string {
  if (isAclKeyKeyword(pattern)) return pattern
  return `~${normalizePatternList([pattern], '~')[0]}`
}

function formatChannelPatternForCommand(pattern: string): string {
  if (isAclChannelKeyword(pattern)) return pattern
  return `&${normalizePatternList([pattern], '&')[0]}`
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Redis ACL #<sha256> 规则需要十六进制哈希 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

export function createDefaultAclModel(): AclEditModel {
  return {
    username: '',
    enabled: true,
    nopass: false,
    password: '',
    passwordHashes: [],
    commandRules: [...ACL_PRESET_COMMAND_RULES.normal],
    keyPatterns: ['*'],
    channelPatterns: ['*'],
    selectors: [],
  }
}

/** 编辑态从后端详情回填，保持“密码未改则沿用原 hashes” */
export function createAclModelFromDetail(detail: AclUserDetail): AclEditModel {
  return {
    username: detail.username,
    enabled: detail.enabled,
    nopass: detail.nopass,
    password: '',
    passwordHashes: [...detail.passwordHashes],
    commandRules: [...detail.commandRules],
    keyPatterns: [...detail.keyPatterns],
    channelPatterns: [...detail.channelPatterns],
    selectors: [...detail.selectors],
  }
}

export async function buildAclSavePayload(
  model: AclEditModel,
): Promise<{
  username: string
  enabled: boolean
  passwordHashes: string[]
  commandRules: string[]
  keyPatterns: string[]
  channelPatterns: string[]
  selectors: string[]
}> {
  const username = model.username.trim()
  const commandRules = normalizeRuleList(model.commandRules)
  const keyPatterns = normalizePatternList(model.keyPatterns, '~')
  const channelPatterns = normalizePatternList(model.channelPatterns, '&')

  const password = model.password.trim()
  let passwordHashes: string[]
  if (model.nopass && !password) {
    passwordHashes = []
  } else if (password) {
    passwordHashes = [await sha256Hex(password)]
  } else {
    passwordHashes = [...model.passwordHashes]
  }

  return {
    username,
    enabled: model.enabled,
    passwordHashes,
    commandRules,
    keyPatterns,
    channelPatterns,
    selectors: normalizeSelectorList(model.selectors),
  }
}

function appendAclSelectors(chunks: string[], selectors: string[]): void {
  for (const sel of normalizeSelectorList(selectors)) {
    chunks.push(`(${sel})`)
  }
}

function appendAclCommandRules(chunks: string[], model: AclEditModel): void {
  chunks.push(...normalizeRuleList(model.commandRules))
  chunks.push(...normalizePatternList(model.keyPatterns, '~').map(formatKeyPatternForCommand))
  chunks.push(
    ...normalizePatternList(model.channelPatterns, '&').map(formatChannelPatternForCommand),
  )
  appendAclSelectors(chunks, model.selectors)
}

/** 命令预览：密码用占位符，便于核对规则且避免泄露 hash */
export function buildAclPreviewCommand(model: AclEditModel): string {
  const chunks: string[] = ['ACL', 'SETUSER', model.username || '<username>', 'reset']
  chunks.push(model.enabled ? 'on' : 'off')

  if (model.password.trim()) {
    chunks.push('#<sha256(new-password)>')
  } else if (model.nopass || !model.passwordHashes.length) {
    chunks.push('nopass')
  } else {
    chunks.push(...model.passwordHashes.map(() => '#<saved-hash>'))
  }

  appendAclCommandRules(chunks, model)
  return chunks.join(' ')
}

/** 可执行命令：复制时用真实 #hash，与保存逻辑一致 */
export async function buildAclExecutableCommand(model: AclEditModel): Promise<string> {
  const chunks: string[] = ['ACL', 'SETUSER', model.username.trim() || '<username>', 'reset']
  chunks.push(model.enabled ? 'on' : 'off')

  const password = model.password.trim()
  if (password) {
    chunks.push(`#${await sha256Hex(password)}`)
  } else if (model.nopass || !model.passwordHashes.length) {
    chunks.push('nopass')
  } else {
    chunks.push(...model.passwordHashes.map(h => `#${h}`))
  }

  appendAclCommandRules(chunks, model)
  return chunks.join(' ')
}

export function summarizeRules(rules: string[], max = 3): string {
  if (!rules.length) return '--'
  if (rules.length <= max) return rules.join(' ')
  return `${rules.slice(0, max).join(' ')} ...`
}

/** 列表摘要：选择器带括号展示 */
export function summarizeSelectors(selectors: string[], max = 2): string {
  if (!selectors.length) return '--'
  const labels = selectors.map(formatSelectorLabel)
  return summarizeRules(labels, max)
}
