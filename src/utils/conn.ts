/**
 * 首页连接分组：数据与排序工具。
 *
 * 数据约定：
 * - 每条连接的分组名存在 `conn.meta.group`（空字符串 = 默认分组，UI 显示「默认分组」）
 * - 命令映射存在 `conn.meta.commandMap`（原命令小写 → 重命名后的命令，随 meta 同步后端）
 * - 树形键分隔符存在 `conn.meta.keySeparator`（默认 `:`，等于默认时不写入；连续分隔符视为一次）
 * - 通信协议存在 `conn.meta.protocol`（`resp2`/`resp3`，默认 resp2 不写入；resp3 需 Redis ≥ 6.0）
 * - `settings.connGroups` 为分组名的有序列表（可含空分组占位，用于控制展示顺序）
 * - `settings.connShow`：`'flat'` 平铺表格 | `'group'` 分组树形列表
 * - `connList` 在分组模式下按「分组顺序 + 组内顺序」扁平存储，拖拽后需写回此顺序
 */
import type { UiConn } from '@/types/me-interface'

/** 连接 meta 中存放分组名的字段 */
export const CONN_META_GROUP = 'group'

/** 连接 meta 中界面模式：normal 全功能，minimal 仅键值与终端（连接时跳过 SETNAME） */
export const CONN_META_UI_MODE = 'uiMode'

/** 连接 meta 中命令映射：原命令名（小写）→ 服务端重命名后的命令 */
export const CONN_META_COMMAND_MAP = 'commandMap'

/** 连接 meta 中树形浏览键分隔符 */
export const CONN_META_KEY_SEPARATOR = 'keySeparator'

/** 连接 meta 中通信协议：resp2（默认）/ resp3 */
export const CONN_META_PROTOCOL = 'protocol'

/** 树形浏览默认分隔符（与历史硬编码一致） */
export const DEFAULT_KEY_SEPARATOR = ':'

export type ConnCommandMap = Record<string, string>
export type ConnUiMode = 'normal' | 'minimal'
export type ConnProtocol = 'resp2' | 'resp3'

export function normalizeGroupName(name: unknown): string {
  if (typeof name !== 'string') return ''
  return name.trim()
}

export function getConnGroup(conn: UiConn): string {
  return normalizeGroupName(conn.meta?.[CONN_META_GROUP])
}

/** 连接列表/分组行图标：集群不变，哨兵、单机分别用对应 SVG */
export function getConnIcon(conn: Pick<UiConn, 'cluster' | 'sentinel'>): string {
  if (conn.cluster) return 'me-icon-cluster'
  if (conn.sentinel) return 'me-icon-sentinel'
  return 'el-icon-monitor'
}

export function setConnGroup(conn: UiConn, group: string): void {
  conn.meta ??= {}
  const g = normalizeGroupName(group)
  if (g) conn.meta[CONN_META_GROUP] = g
  else delete conn.meta[CONN_META_GROUP]
}

export function getConnUiMode(conn: UiConn): ConnUiMode {
  return conn.meta?.[CONN_META_UI_MODE] === 'minimal' ? 'minimal' : 'normal'
}

export function setConnUiMode(conn: UiConn, mode: ConnUiMode): void {
  conn.meta ??= {}
  if (mode === 'minimal') conn.meta[CONN_META_UI_MODE] = 'minimal'
  else delete conn.meta[CONN_META_UI_MODE]
}

export function isConnMinimalMode(conn: UiConn | null | undefined): boolean {
  return !!conn && getConnUiMode(conn) === 'minimal'
}

export function getConnCommandMap(conn: UiConn): ConnCommandMap {
  const raw = conn.meta?.[CONN_META_COMMAND_MAP]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const map: ConnCommandMap = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const cmd = typeof k === 'string' ? k.trim().toLowerCase() : ''
    const mapped = typeof v === 'string' ? v.trim() : ''
    if (cmd && mapped) map[cmd] = mapped
  }
  return map
}

export function setConnCommandMap(conn: UiConn, map: ConnCommandMap): void {
  conn.meta ??= {}
  const cleaned = getConnCommandMap({ ...conn, meta: { [CONN_META_COMMAND_MAP]: map } })
  if (Object.keys(cleaned).length) conn.meta[CONN_META_COMMAND_MAP] = cleaned
  else delete conn.meta[CONN_META_COMMAND_MAP]
}

/** 读取连接的树形键分隔符；空 / 未设 → 默认 `:` */
export function getConnKeySeparator(conn: UiConn | null | undefined): string {
  const raw = conn?.meta?.[CONN_META_KEY_SEPARATOR]
  if (typeof raw !== 'string') return DEFAULT_KEY_SEPARATOR
  const sep = raw.trim()
  return sep || DEFAULT_KEY_SEPARATOR
}

/** 写入键分隔符；默认 `:` 或空串时删除 meta 字段 */
export function setConnKeySeparator(conn: UiConn, value: string): void {
  conn.meta ??= {}
  const sep = typeof value === 'string' ? value.trim() : ''
  if (!sep || sep === DEFAULT_KEY_SEPARATOR) delete conn.meta[CONN_META_KEY_SEPARATOR]
  else conn.meta[CONN_META_KEY_SEPARATOR] = sep
}

/** 读取连接通信协议；未设 / 非法 → 默认 resp2 */
export function getConnProtocol(conn: UiConn | null | undefined): ConnProtocol {
  return conn?.meta?.[CONN_META_PROTOCOL] === 'resp3' ? 'resp3' : 'resp2'
}

/** 写入通信协议；默认 resp2 时删除 meta 字段 */
export function setConnProtocol(conn: UiConn, protocol: ConnProtocol): void {
  conn.meta ??= {}
  if (protocol === 'resp3') conn.meta[CONN_META_PROTOCOL] = 'resp3'
  else delete conn.meta[CONN_META_PROTOCOL]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 按分隔符拆键路径；连续相同分隔符折叠为一次（`:` 时等价原 `/:+/`） */
export function splitKeyPath(key: string, sep: string): string[] {
  if (key === '') return ['']
  const s = sep || DEFAULT_KEY_SEPARATOR
  return key.split(new RegExp(`(?:${escapeRegExp(s)})+`))
}

export function joinKeyPath(parts: string[], sep: string): string {
  return parts.join(sep || DEFAULT_KEY_SEPARATOR)
}

/** 键是否属于 folder 或其子树（folder 后紧跟至少一个分隔符） */
export function keyUnderFolder(key: string, folder: string, sep: string): boolean {
  if (key === folder) return true
  const s = sep || DEFAULT_KEY_SEPARATOR
  return key.startsWith(folder + s)
}

/**
 * 相对 folder 的子路径；不相属返回 null。
 * 会吞掉 folder 后连续分隔符，避免 `user::a` 相对 `user` 时残留前导空段。
 */
export function keyRelativePath(key: string, folder: string, sep: string): string | null {
  if (key === folder) return ''
  const s = sep || DEFAULT_KEY_SEPARATOR
  const re = new RegExp(`^${escapeRegExp(folder)}(?:${escapeRegExp(s)})+`)
  if (!re.test(key)) return null
  return key.replace(re, '')
}

/** 目录 SCAN / 批量 MATCH：`folder` + sep + `*`；`*` 目录仍为 `*` */
export function folderMatchExpr(folder: string, sep: string): string {
  if (folder === '*') return '*'
  return folder + (sep || DEFAULT_KEY_SEPARATOR) + '*'
}

/** 在目录下新建键时的名称前缀 */
export function folderKeyPrefix(folder: string, sep: string): string {
  return folder + (sep || DEFAULT_KEY_SEPARATOR)
}

/** 仅 network=unix 走套接字。缺省和其它值都当 TCP。 */
export function isUnixNetwork(network?: string): boolean {
  return (network ?? '').toLowerCase() === 'unix'
}

/** 列表和信息页上的地址：套接字显示路径，TCP 显示 host:port。 */
export function connEndpoint(conn: {
  network?: string
  socketPath?: string
  host?: string
  port?: number
}): string {
  if (isUnixNetwork(conn.network)) {
    const path = conn.socketPath?.trim()
    if (path) return path
  }
  const host = conn.host ?? ''
  if (conn.port == null || conn.port === 0) return host
  return `${host}:${conn.port}`
}

/** 套接字路径保留 `/`，其余百分号编码。 */
function encodeUnixPath(path: string): string {
  return path
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
}

/**
 * 从连接参数构建 Redis URL（redis[s]://[user[:pass]@]host[:port][/db][?protocol=resp3]）。
 * Unix 套接字为 unix:///path?user=&pass=&db=&protocol=resp3，与 redis-rs 的解析方式一致。
 * IPv6 地址自动加方括号；密码中的特殊字符自动编码。
 */
export function buildRedisUrl(params: {
  host: string
  port: number
  username?: string
  password?: string
  ssl?: boolean
  db?: number
  protocol?: string
  network?: string
  socketPath?: string
}): string {
  if (isUnixNetwork(params.network)) {
    const path = encodeUnixPath((params.socketPath ?? '').trim() || '/tmp/redis.sock')
    const q = new URLSearchParams()
    if (params.username) q.set('user', params.username)
    if (params.password) q.set('pass', params.password)
    if (params.db && params.db > 0) q.set('db', String(params.db))
    if (params.protocol === 'resp3') q.set('protocol', 'resp3')
    const qs = q.toString()
    return qs ? `unix://${path}?${qs}` : `unix://${path}`
  }
  const scheme = params.ssl ? 'rediss' : 'redis'
  let host = params.host || '127.0.0.1'
  if (host.includes(':') && !host.startsWith('[')) host = `[${host}]`
  let url = `${scheme}://`
  if (params.username) {
    url += encodeURIComponent(params.username)
    if (params.password) url += `:${encodeURIComponent(params.password)}`
    url += '@'
  } else if (params.password) {
    url += `:${encodeURIComponent(params.password)}@`
  }
  url += `${host}:${params.port}`
  if (params.db && params.db > 0) url += `/${params.db}`
  if (params.protocol === 'resp3') url += '?protocol=resp3'
  return url
}

export function connMatchesKeyword(conn: UiConn, keyword: string): boolean {
  const key = keyword.trim().toLowerCase()
  if (!key) return true
  return (
    (conn.name?.toLowerCase().includes(key) ?? false) ||
    (conn.host?.toLowerCase().includes(key) ?? false) ||
    (conn.socketPath?.toLowerCase().includes(key) ?? false)
  )
}

export interface ConnGroupSection {
  key: string
  title: string
  conns: UiConn[]
}

/** 分组区块的展示顺序：先 connGroups，再连接里出现但未登记的分组，最后固定为默认分组 '' */
export function getSectionKeys(connGroups: string[], connList: UiConn[]): string[] {
  const keys: string[] = []
  const add = (g: string) => {
    const n = normalizeGroupName(g)
    if (n && !keys.includes(n)) keys.push(n)
  }
  for (const g of connGroups) add(g)
  for (const c of connList) add(getConnGroup(c))
  keys.push('') // 默认分组始终排在最底部
  return keys
}

/** 按分组拆成 ConnGroup 组件所需的 sections；keyword 非空时只保留仍有匹配连接的分组 */
export function buildConnGroupSections(
  connList: UiConn[],
  connGroups: string[],
  keyword: string,
): ConnGroupSection[] {
  const key = keyword.trim().toLowerCase()
  const byGroup = new Map<string, UiConn[]>()
  for (const conn of connList) {
    const g = getConnGroup(conn)
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(conn)
  }

  const filter = (list: UiConn[]) => (key ? list.filter(c => connMatchesKeyword(c, key)) : list)
  const groupNames = new Set(connGroups.map(normalizeGroupName).filter(Boolean))

  return getSectionKeys(connGroups, connList)
    .map(groupKey => ({
      key: groupKey,
      title: groupKey,
      conns: filter(byGroup.get(groupKey) ?? []),
    }))
    .filter(s => {
      // 无搜索词：有名分组在 connGroups 登记则保留空壳；默认分组仅在有连接时展示
      if (!key) return s.conns.length > 0 || groupNames.has(s.key)
      return s.conns.length > 0
    })
}

/** 跨分组拖放连接后，更新 meta.group 并按分组顺序重排 connList */
export function moveConnToGroup(
  connList: UiConn[],
  connGroups: string[],
  conn: UiConn,
  targetGroup: string,
  indexInGroup: number,
): void {
  setConnGroup(conn, targetGroup)
  const byGroup = new Map<string, UiConn[]>()
  for (const c of connList) {
    const g = getConnGroup(c)
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(c)
  }
  const list = byGroup.get(targetGroup) ?? []
  const cur = list.indexOf(conn)
  if (cur > -1) list.splice(cur, 1)
  list.splice(Math.min(Math.max(indexInGroup, 0), list.length), 0, conn)
  byGroup.set(targetGroup, list)
  const keys = getSectionKeys(connGroups, connList)
  const next = keys.flatMap(k => byGroup.get(k) ?? [])
  connList.splice(0, connList.length, ...next)
}

/** 组内拖放排序后，重排 connList（仅调整顺序，不改分组名） */
export function moveConnInGroup(
  connList: UiConn[],
  connGroups: string[],
  groupKey: string,
  oldIndex: number,
  newIndex: number,
): void {
  const byGroup = new Map<string, UiConn[]>()
  for (const c of connList) {
    const g = getConnGroup(c)
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(c)
  }
  const list = byGroup.get(groupKey) ?? []
  if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0 || oldIndex >= list.length) return
  const [moved] = list.splice(oldIndex, 1)
  if (!moved) return
  list.splice(newIndex, 0, moved)
  byGroup.set(groupKey, list)
  const keys = getSectionKeys(connGroups, connList)
  const next = keys.flatMap(k => byGroup.get(k) ?? [])
  connList.splice(0, connList.length, ...next)
}

/** 按 UI 顺序更新文件夹列表，并同步连接在 connList 中的分组顺序 */
export function applyConnGroupOrder(
  connList: UiConn[],
  connGroups: string[],
  orderedNamedKeys: string[],
): void {
  const named = orderedNamedKeys.map(normalizeGroupName).filter(Boolean)
  const set = new Set(named)
  for (const g of connGroups) {
    const n = normalizeGroupName(g)
    if (n && !set.has(n)) named.push(n)
  }
  connGroups.splice(0, connGroups.length, ...named)

  const byGroup = new Map<string, UiConn[]>()
  for (const c of connList) {
    const g = getConnGroup(c)
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(c)
  }
  const keys = getSectionKeys(connGroups, connList)
  connList.splice(0, connList.length, ...keys.flatMap(k => byGroup.get(k) ?? []))
}

/** 导入连接后，把连接里出现的新分组名合并进 connGroups */
export function mergeConnGroupsFromList(connList: UiConn[], connGroups: string[]): void {
  const set = new Set(connGroups.map(normalizeGroupName).filter(Boolean))
  for (const c of connList) {
    const g = getConnGroup(c)
    if (g && !set.has(g)) {
      connGroups.push(g)
      set.add(g)
    }
  }
}

/** 导入前已存在的分组名：connGroups 登记项 + 既有连接的 meta.group */
export function collectKnownConnGroupNames(connGroups: string[], connList: UiConn[]): Set<string> {
  const known = new Set(connGroups.map(normalizeGroupName).filter(Boolean))
  for (const c of connList) {
    const g = getConnGroup(c)
    if (g) known.add(g)
  }
  return known
}

/** 导入批次中新出现的分组设为折叠，避免 ConnGroup 对未登记键默认展开 */
export function collapseImportedConnGroups(
  imported: UiConn[],
  knownGroups: Set<string>,
  expanded: Record<string, boolean>,
): void {
  for (const c of imported) {
    const g = getConnGroup(c)
    if (g && !knownGroups.has(g)) {
      expanded[g] = false
      knownGroups.add(g)
    }
  }
}

/** 重命名分组：同步 conn.meta、connGroups 与折叠状态键名 */
export function renameConnGroup(
  connList: UiConn[],
  connGroups: string[],
  oldName: string,
  newName: string,
  expanded?: Record<string, boolean>,
): boolean {
  const from = normalizeGroupName(oldName)
  const to = normalizeGroupName(newName)
  if (!from || !to || from === to) return false
  if (connGroups.some(g => normalizeGroupName(g) === to)) return false
  for (const c of connList) {
    if (getConnGroup(c) === from) setConnGroup(c, to)
  }
  const i = connGroups.findIndex(g => normalizeGroupName(g) === from)
  if (i > -1) connGroups[i] = to
  if (expanded && from in expanded) {
    expanded[to] = expanded[from]!
    delete expanded[from]
  }
  return true
}

/** 删除分组：组内连接移至默认分组（meta.group 清空） */
export function removeConnGroup(
  connList: UiConn[],
  connGroups: string[],
  name: string,
  expanded?: Record<string, boolean>,
): void {
  const key = normalizeGroupName(name)
  if (!key) return
  for (const c of connList) {
    if (getConnGroup(c) === key) setConnGroup(c, '')
  }
  const i = connGroups.findIndex(g => normalizeGroupName(g) === key)
  if (i > -1) connGroups.splice(i, 1)
  if (expanded) delete expanded[key]
}
