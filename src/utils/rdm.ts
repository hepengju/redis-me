/**
 * 各类 RDM / 工具导出格式的连接导入解析（Another Redis Desktop Manager、TinyRDM、Redis Insight 等）。
 * 各来源字段含义见下方 `#region` 内文档化类型；实现与 `UiConn` 的映射见各 `*ToUiConn` 函数。
 */
import { readFile } from '@tauri-apps/plugin-fs'
import { unzipSync } from 'fflate'
import { nanoid } from 'nanoid'
import { parse as parseYaml } from 'yaml'

import type { UiConn } from '@/types/me-interface'
import { setConnGroup } from '@/utils/conn'
import { DEFAULT_PROXY_OPTION } from '@/utils/conn-compat'
import { meJsonParse } from '@/utils/util'

// #region 错误与来源标识

/** 携带 i18n key，由 UI 层 `t(key)` 展示 */
export class ConnImportParseError extends Error {
  constructor(readonly i18nKey: string) {
    super(i18nKey)
    this.name = 'ConnImportParseError'
  }
}

export type ConnImportSource = 'redisme' | 'another' | 'tiny' | 'insight'

export function connImportFileSuffix(source: ConnImportSource): string {
  if (source === 'redisme') return 'mec'
  if (source === 'another') return 'ano'
  if (source === 'tiny') return 'zip'
  return 'json'
}

// #endregion

// #region 共享工具（编码 / 空连接模板 / 标量解析）

/** Base64(UTF-8)，与 Another RDM `.ano` 一致 */
function decodeBase64Utf8(b64: string): string {
  const t = b64.trim().replace(/\s+/g, '')
  const bin = atob(t)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff
  return new TextDecoder().decode(bytes)
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

/** 导出 `.mec` 文件内容（单行 Base64） */
export function encodeRedisMeConnectionsToMec(connList: UiConn[]): string {
  return encodeBase64Utf8(JSON.stringify(connList))
}

/** 竞品转换用空连接（proxy 默认未开）。RedisME 自身 .mec 不走这里，JSON 原样解析。 */
function emptyConn(overrides: Partial<UiConn>): UiConn {
  const base: UiConn = {
    id: '',
    name: '',
    host: '127.0.0.1',
    port: 6379,
    username: '',
    password: '',
    db: 0,
    cluster: false,
    ssl: false,
    sslOption: { key: '', cert: '', ca: '' },
    sentinel: false,
    sentinelOption: { masterName: '', masterUsername: '', masterPassword: '' },
    ssh: false,
    sshOption: {
      host: '',
      port: 22,
      loginType: 'pwd',
      username: '',
      password: '',
      pkfile: '',
      passphrase: '',
    },
    proxy: false,
    proxyOption: { ...DEFAULT_PROXY_OPTION },
    meta: {},
  }
  return { ...base, ...overrides }
}

/** 仅将原始 JSON/YAML 中的标量安全转为字符串，避免 `String(object)` */
function asStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return ''
}

function parsePortU16(raw: unknown, errKey = 'conn.importPortErr'): number {
  const n = typeof raw === 'string' ? parseInt(raw.trim(), 10) : Number(raw)
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new ConnImportParseError(errKey)
  }
  return Math.floor(n)
}

function parseDb(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(255, Math.max(0, Math.floor(raw)))
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw.trim(), 10)
    if (Number.isFinite(n) && n >= 0) return Math.min(255, Math.floor(n))
  }
  return 0
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return undefined
}

// #endregion

// #region RedisME（.mec / 明文 JSON）

/** 避免将 Redis Insight 导出误当作 RedisME 明文 JSON 导入 */
function looksLikeRedisInsightExportItem(conn: unknown): boolean {
  if (!conn || typeof conn !== 'object' || Array.isArray(conn)) return false
  const o = conn as Record<string, unknown>
  if (!('connectionType' in o)) return false
  const ct = asStr(o.connectionType).toUpperCase()
  return ct === 'STANDALONE' || ct === 'CLUSTER' || ct === 'SENTINEL'
}

function validateRedisMeConnList(connList: unknown): UiConn[] {
  if (!Array.isArray(connList) || connList.length === 0) {
    throw new ConnImportParseError('conn.importConnErr')
  }
  for (const conn of connList as UiConn[]) {
    if (looksLikeRedisInsightExportItem(conn)) {
      throw new ConnImportParseError('conn.importWrongSourceInsight')
    }
    if (!conn.id || !conn.name || !conn.host || !conn.port) {
      throw new ConnImportParseError('conn.importFormatErr')
    }
  }
  return connList as UiConn[]
}

/**
 * RedisME 连接列表：支持 `.mec`（Base64(UTF-8 JSON 数组)）及旧版明文 JSON 数组。
 * 结构与 `UiConn[]` 一致，无第三方字段映射。
 */
export function parseRedisMeConnections(content: string): UiConn[] {
  const trimmed = content.trim()
  if (/^\s*\[/.test(content)) {
    let connList: unknown
    try {
      connList = meJsonParse(trimmed)
    } catch {
      throw new ConnImportParseError('conn.importJsonErr')
    }
    return validateRedisMeConnList(connList)
  }

  let jsonText: string
  try {
    jsonText = decodeBase64Utf8(trimmed)
  } catch {
    throw new ConnImportParseError('conn.importMecDecodeErr')
  }
  let arr: unknown
  try {
    arr = JSON.parse(jsonText)
  } catch {
    throw new ConnImportParseError('conn.importJsonErr')
  }
  return validateRedisMeConnList(arr)
}

// #endregion

// #region Another Redis Desktop Manager（.ano）

/**
 * Another Redis Desktop Manager 导出连接（`.ano` 为 Base64 包裹的 UTF-8 JSON）。
 * 旧版顶层是连接数组；1.7.2+ 为 `{ connections, groups }`（`storage.exportConnectionsBundle`）。
 * 参考源码：`AnotherRedisDesktopManager` 的 `storage.js`、`NewConnectionDialog.vue`、`redisClient.js`。
 */
interface AnotherRdmSslOptionsJson {
  /** 原始：TLS 客户端私钥路径（FileInput）。→ RedisME：`UiConn.sslOption.key` */
  key?: unknown
  /** 原始：客户端证书路径。→ RedisME：`UiConn.sslOption.cert` */
  cert?: unknown
  /** 原始：CA 证书路径。→ RedisME：`UiConn.sslOption.ca` */
  ca?: unknown
  /** 原始：TLS SNI servername（另存字段，导入未映射）。→ RedisME：无直接字段 */
  servername?: unknown
  keybookmark?: unknown
  cabookmark?: unknown
  certbookmark?: unknown
}

/**
 * 原始：经 SSH 跳板连接时的隧道配置。
 * → RedisME：`UiConn.ssh` / `UiConn.sshOption`（`privatekey` 非空则 `loginType` 为 `pkfile`）
 */
interface AnotherRdmSshOptionsJson {
  host?: unknown
  port?: unknown
  username?: unknown
  password?: unknown
  /** 原始：SSH 私钥文件路径。→ RedisME：`UiConn.sshOption.pkfile` */
  privatekey?: unknown
  privatekeybookmark?: unknown
  passphrase?: unknown
  timeout?: unknown
}

/**
 * 原始：Sentinel 模式下的 master 组与 Redis 节点认证。
 * → RedisME：`UiConn.sentinel` / `sentinelOption`（`nodePassword` → `masterPassword`）
 */
interface AnotherRdmSentinelOptionsJson {
  masterName?: unknown
  nodePassword?: unknown
}

interface AnotherRdmAnoConnectionJson {
  /** 原始：存储用唯一键（`storage.getConnectionKey`）。→ RedisME：`UiConn.id` 前缀 `another-${key}` */
  key?: unknown
  /** 原始：Redis 地址。→ RedisME：`UiConn.host` */
  host?: unknown
  /** 原始：Redis 端口。→ RedisME：`UiConn.port` */
  port?: unknown
  /** 原始：连接显示名；与 `name` 二选一。→ RedisME：`UiConn.name` */
  connectionName?: unknown
  name?: unknown
  /** 原始：Redis ACL 用户名。→ RedisME：`UiConn.username` */
  username?: unknown
  /** 原始：Redis 密码。→ RedisME：`UiConn.password` */
  auth?: unknown
  /** 原始：是否集群。→ RedisME：`UiConn.cluster` */
  cluster?: unknown
  /** 原始：连接只读。→ RedisME：`UiConn.readonly` */
  connectionReadOnly?: unknown
  /** 原始：侧边栏标记色（`ConnectionWrapper.setColor`）。→ RedisME：`UiConn.color` */
  color?: unknown
  /** 原始：所属分组 id（1.7.2+）。→ RedisME：经 groups 表解析为 `meta.group`；空组不导入 */
  groupId?: unknown
  sshOptions?: unknown
  sslOptions?: unknown
  sentinelOptions?: unknown
}

/** Another 分组项：`id` + `name`；缺一则忽略（对齐 `importConnectionsBundle` 的 `group.id && group.name`） */
interface AnotherRdmGroupJson {
  id?: unknown
  name?: unknown
}

function anotherSslEnabled(ssl: AnotherRdmSslOptionsJson | undefined): boolean {
  if (!ssl) return false
  return !!(asStr(ssl.key) || asStr(ssl.cert) || asStr(ssl.ca))
}

/** 分组 id → 名称；无连接的空分组不会出现在结果里，故不必单独登记 */
function anotherGroupsById(groups: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(groups)) return map
  for (const item of groups) {
    const g = asRecord(item) as AnotherRdmGroupJson | undefined
    if (!g) continue
    const id = asStr(g.id).trim()
    const name = asStr(g.name).trim()
    if (!id || !name || map.has(id)) continue
    map.set(id, name)
  }
  return map
}

/**
 * 旧版：顶层连接数组。新版：`{ connections, groups }`（对齐 Another `importConnectionsBundle`）。
 * 旧文件即使偶带 `groupId` 也无 groups 表，一律当未分组。
 */
function unwrapAnotherAnoJson(parsed: unknown): {
  connections: unknown[]
  groupsById: Map<string, string>
} {
  if (Array.isArray(parsed)) {
    return { connections: parsed, groupsById: new Map() }
  }
  const o = asRecord(parsed)
  if (o && Array.isArray(o.connections)) {
    return { connections: o.connections, groupsById: anotherGroupsById(o.groups) }
  }
  throw new ConnImportParseError('conn.importConnErr')
}

function anotherGroupOrderIndex(raw: unknown, order: Map<string, number>): number {
  const o = asRecord(raw)
  if (!o) return order.size
  const gid = asStr(o.groupId).trim()
  if (!gid || !order.has(gid)) return order.size
  return order.get(gid)!
}

/** 按 groups 数组顺序聚拢同组连接，未分组垫底，便于 mergeConnGroupsFromList 按首次出现登记 */
function sortAnotherItemsByGroup(items: unknown[], groupsById: Map<string, string>): unknown[] {
  if (groupsById.size === 0) return items
  const order = new Map<string, number>()
  let i = 0
  for (const id of groupsById.keys()) order.set(id, i++)
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const d = anotherGroupOrderIndex(a.item, order) - anotherGroupOrderIndex(b.item, order)
      return d !== 0 ? d : a.idx - b.idx
    })
    .map(x => x.item)
}

function anotherItemToUiConn(raw: unknown, groupsById: Map<string, string>): UiConn {
  if (!raw || typeof raw !== 'object') {
    throw new ConnImportParseError('conn.importFormatErr')
  }
  const o = raw as AnotherRdmAnoConnectionJson
  const host = asStr(o.host).trim()
  if (!host) throw new ConnImportParseError('conn.importFormatErr')
  const port = parsePortU16(o.port)

  const name = asStr(o.connectionName ?? o.name).trim() || `${host}:${port}`

  const keyStr = o.key != null ? asStr(o.key) : ''
  const id = keyStr ? `another-${keyStr}` : nanoid()

  const sshOpt = asRecord(o.sshOptions) as AnotherRdmSshOptionsJson | undefined
  const sshOn = !!(sshOpt && asStr(sshOpt.host).trim())
  const pk = sshOpt ? asStr(sshOpt.privatekey) : ''
  const loginType = pk.trim() ? 'pkfile' : 'pwd'

  const sslOpt = asRecord(o.sslOptions) as AnotherRdmSslOptionsJson | undefined
  const sslOn = anotherSslEnabled(sslOpt)

  const sentOpt = asRecord(o.sentinelOptions) as AnotherRdmSentinelOptionsJson | undefined
  const masterName = sentOpt ? asStr(sentOpt.masterName).trim() : ''
  const sentinelOn = !!masterName

  const conn = emptyConn({
    id,
    name,
    host,
    port,
    username: asStr(o.username),
    password: asStr(o.auth),
    db: 0,
    cluster: !!o.cluster,
    readonly: !!o.connectionReadOnly,
    color: typeof o.color === 'string' ? o.color : undefined,
    ssl: sslOn,
    sslOption: sslOpt
      ? { key: asStr(sslOpt.key), cert: asStr(sslOpt.cert), ca: asStr(sslOpt.ca) }
      : { key: '', cert: '', ca: '' },
    sentinel: sentinelOn,
    sentinelOption: {
      masterName,
      masterUsername: '',
      masterPassword: sentOpt ? asStr(sentOpt.nodePassword) : '',
    },
    ssh: sshOn,
    sshOption: sshOn
      ? {
          host: asStr(sshOpt!.host),
          port: parsePortU16(sshOpt!.port ?? 22),
          loginType,
          username: asStr(sshOpt!.username),
          password: asStr(sshOpt!.password),
          pkfile: pk,
          passphrase: asStr(sshOpt!.passphrase),
        }
      : {
          host: '',
          port: 22,
          loginType: 'pwd',
          username: '',
          password: '',
          pkfile: '',
          passphrase: '',
        },
  })

  const gid = asStr(o.groupId).trim()
  const gname = gid ? groupsById.get(gid) : undefined
  if (gname) setConnGroup(conn, gname)
  return conn
}

/** Another RDM `.ano`：Base64(UTF-8 JSON)；兼容旧版数组与 1.7.2+ `{connections, groups}` */
export function parseAnotherRdmFromAno(content: string): UiConn[] {
  let jsonText: string
  try {
    jsonText = decodeBase64Utf8(content)
  } catch {
    throw new ConnImportParseError('conn.importAnoDecodeErr')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new ConnImportParseError('conn.importJsonErr')
  }

  const { connections, groupsById } = unwrapAnotherAnoJson(parsed)
  if (connections.length === 0) {
    throw new ConnImportParseError('conn.importConnErr')
  }
  return sortAnotherItemsByGroup(connections, groupsById).map(a =>
    anotherItemToUiConn(a, groupsById),
  )
}

// #endregion

// #region TinyRDM（zip 内 connections.yaml）

/**
 * TinyRDM 连接 YAML/JSON 形状。
 * 参考源码：`tiny-rdm/backend/types/connection.go`（`Connection`、`ConnectionConfig` 等）。
 */
interface TinyRdmSslYaml {
  /** 原始：是否启用 TLS。→ RedisME：`UiConn.ssl` */
  enable?: unknown
  /** 原始：客户端私钥文件路径。→ RedisME：`UiConn.sslOption.key` */
  keyFile?: unknown
  keyfile?: unknown
  /** 原始：客户端证书路径。→ RedisME：`UiConn.sslOption.cert` */
  certFile?: unknown
  certfile?: unknown
  /** 原始：CA 路径。→ RedisME：`UiConn.sslOption.ca` */
  caFile?: unknown
  cafile?: unknown
  allowInsecure?: unknown
  sni?: unknown
}

interface TinyRdmSshYaml {
  enable?: unknown
  /** 原始：SSH 主机。→ RedisME：`UiConn.sshOption.host` */
  addr?: unknown
  port?: unknown
  /** 原始：`pwd` / `pkfile`。→ RedisME：`UiConn.sshOption.loginType` */
  loginType?: unknown
  login_type?: unknown
  username?: unknown
  password?: unknown
  pkFile?: unknown
  pk_file?: unknown
  passphrase?: unknown
}

interface TinyRdmSentinelYaml {
  enable?: unknown
  /** 原始：Sentinel master 名。→ RedisME：`UiConn.sentinelOption.masterName` */
  master?: unknown
  username?: unknown
  password?: unknown
}

interface TinyRdmClusterYaml {
  /** 原始：是否集群模式。→ RedisME：`UiConn.cluster` */
  enable?: unknown
}

/**
 * 单条连接或分组节点。`type === 'group'` 时含 `connections` 子列表。
 * → RedisME：递归展平后每条映射为一个 `UiConn`。
 */
interface TinyRdmYamlNode {
  type?: unknown
  connections?: unknown
  /** 原始：`tcp` / `unix` 等。→ RedisME：unix 跳过 */
  network?: unknown
  sock?: unknown
  name?: unknown
  /** 原始：Redis 地址。→ RedisME：`UiConn.host` */
  addr?: unknown
  host?: unknown
  port?: unknown
  username?: unknown
  password?: unknown
  /** 原始：上次使用的 DB 索引。→ RedisME：`UiConn.db` */
  last_db?: unknown
  lastDB?: unknown
  mark_color?: unknown
  markColor?: unknown
  ssl?: unknown
  ssh?: unknown
  sentinel?: TinyRdmSentinelYaml
  cluster?: boolean | TinyRdmClusterYaml
}

type TinyRaw = Record<string, unknown>

function getStr(o: TinyRaw, ...keys: string[]): string {
  for (const k of keys) {
    if (!(k in o)) continue
    const s = asStr(o[k]).trim()
    if (s !== '') return s
  }
  return ''
}

function tinyClusterOn(o: TinyRaw): boolean {
  const c = o.cluster
  if (typeof c === 'boolean') return c
  const co = asRecord(c) as TinyRdmClusterYaml | undefined
  return !!(co && co.enable)
}

function tinySslOn(ssl: TinyRdmSslYaml | undefined): boolean {
  return !!(ssl && ssl.enable)
}

function tinySshOn(ssh: TinyRdmSshYaml | undefined): boolean {
  return !!(ssh && ssh.enable)
}

function tinySentinelOn(s: TinyRaw | undefined): boolean {
  return !!(s && s.enable && getStr(s, 'master').trim())
}

function flattenTinyConnections(items: unknown[]): TinyRaw[] {
  const out: TinyRaw[] = []
  if (!Array.isArray(items)) return out
  for (const item of items) {
    const o = asRecord(item) as TinyRdmYamlNode | undefined
    if (!o) continue
    if (o.type === 'group' && Array.isArray(o.connections) && o.connections.length > 0) {
      out.push(...flattenTinyConnections(o.connections))
    } else if (o.type !== 'group') {
      out.push(o as TinyRaw)
    }
  }
  return out
}

function mapTinyItemToUiConn(o: TinyRaw): UiConn | 'skip-unix' {
  const network = getStr(o, 'network').toLowerCase() || 'tcp'
  const sock = getStr(o, 'sock')
  if (network === 'unix' || (sock && !getStr(o, 'addr'))) {
    return 'skip-unix'
  }

  const name = getStr(o, 'name').trim() || 'imported'
  const host = getStr(o, 'addr', 'host').trim() || '127.0.0.1'
  const port = parsePortU16(o.port ?? 6379)

  const sslRec = asRecord(o.ssl)
  const sslOn = tinySslOn(sslRec as TinyRdmSslYaml | undefined)
  const sshRec = asRecord(o.ssh)
  const sshOn = tinySshOn(sshRec as TinyRdmSshYaml | undefined)
  const sentRec = asRecord(o.sentinel)
  const sentinelOn = tinySentinelOn(sentRec)

  const loginRaw = asStr(sshRec?.login_type ?? sshRec?.loginType) || 'pwd'
  const loginType = loginRaw === 'pkfile' ? 'pkfile' : 'pwd'

  const id = `tinyrdm-${name}`

  return emptyConn({
    id,
    name,
    host,
    port,
    username: getStr(o, 'username'),
    password: getStr(o, 'password'),
    db: parseDb(o.last_db ?? o.lastDB),
    cluster: tinyClusterOn(o),
    color: getStr(o, 'mark_color', 'markColor') || undefined,
    ssl: sslOn,
    sslOption: sslRec
      ? {
          key: getStr(sslRec, 'keyFile', 'keyfile'),
          cert: getStr(sslRec, 'certFile', 'certfile'),
          ca: getStr(sslRec, 'caFile', 'cafile'),
        }
      : { key: '', cert: '', ca: '' },
    sentinel: sentinelOn,
    sentinelOption: sentinelOn
      ? {
          masterName: getStr(sentRec!, 'master'),
          masterUsername: getStr(sentRec!, 'username'),
          masterPassword: getStr(sentRec!, 'password'),
        }
      : { masterName: '', masterUsername: '', masterPassword: '' },
    ssh: sshOn,
    sshOption: sshRec
      ? {
          host: getStr(sshRec, 'addr'),
          port: parsePortU16(sshRec.port ?? 22),
          loginType,
          username: getStr(sshRec, 'username'),
          password: getStr(sshRec, 'password'),
          pkfile: getStr(sshRec, 'pkFile', 'pk_file'),
          passphrase: getStr(sshRec, 'passphrase'),
        }
      : {
          host: '',
          port: 22,
          loginType: 'pwd',
          username: '',
          password: '',
          pkfile: '',
          passphrase: '',
        },
  })
}

const TINY_YAML_NAMES = ['connections.yaml']

/** TinyRDM 导出 zip（内含 connections.yaml） */
export async function parseTinyRdmFromZipFile(
  path: string,
): Promise<{ connections: UiConn[]; skippedUnix: number }> {
  let bytes: Uint8Array
  try {
    bytes = await readFile(path)
  } catch {
    throw new ConnImportParseError('conn.importZipReadErr')
  }

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new ConnImportParseError('conn.importZipErr')
  }

  let yamlText: string | null = null
  for (const [fname, data] of Object.entries(files)) {
    if (TINY_YAML_NAMES.includes(fname) || fname.endsWith('/connections.yaml')) {
      yamlText = new TextDecoder().decode(data)
      break
    }
  }
  if (yamlText == null) {
    throw new ConnImportParseError('conn.importYamlMissing')
  }

  let root: unknown
  try {
    root = parseYaml(yamlText)
  } catch {
    throw new ConnImportParseError('conn.importYamlErr')
  }

  if (!Array.isArray(root)) {
    throw new ConnImportParseError('conn.importYamlErr')
  }

  const flat = flattenTinyConnections(root)
  const connections: UiConn[] = []
  let skippedUnix = 0
  for (const item of flat) {
    const mapped = mapTinyItemToUiConn(item)
    if (mapped === 'skip-unix') {
      skippedUnix += 1
      continue
    }
    connections.push(mapped)
  }

  if (connections.length === 0) {
    throw new ConnImportParseError(skippedUnix > 0 ? 'conn.importAllUnixErr' : 'conn.importConnErr')
  }

  return { connections, skippedUnix }
}

// #endregion

// #region Redis Insight（RedisInsight_connections_*.json）

/**
 * Redis Insight 导出的连接项（JSON 数组元素）。
 * 参考：`redisinsight/api/.../database/models/database.ts`、`ui/src/slices/interfaces/instances.ts`。
 */
interface RedisInsightSshOptionsJson {
  host?: unknown
  port?: unknown
  username?: unknown
  password?: unknown
  /** 原始：私钥 PEM 或密钥文件路径字符串。→ RedisME：`sshOption.pkfile` / `loginType`（见实现内 PEM 判断） */
  privateKey?: unknown
  passphrase?: unknown
}

interface RedisInsightSentinelMasterJson {
  /** 原始：Sentinel master 组名。→ RedisME：`sentinelOption.masterName` */
  name?: unknown
  username?: unknown
  password?: unknown
}

interface RedisInsightConnectionJson {
  id?: unknown
  name?: unknown
  host?: unknown
  port?: unknown
  username?: unknown
  password?: unknown
  db?: unknown
  /**
   * 原始：`STANDALONE` | `CLUSTER` | `SENTINEL`。
   * → RedisME：`cluster` / `sentinel`（与 `forceStandalone` 组合见映射函数）
   */
  connectionType?: unknown
  /** 原始：集群库上强制按单机连接。→ RedisME：为 true 时关闭 `cluster` */
  forceStandalone?: unknown
  /** 原始：使用 TLS。→ RedisME：`ssl`（证书路径对象未映射，见 `parseRedisInsightConnections` 注释） */
  tls?: unknown
  ssh?: unknown
  sshOptions?: unknown
  sentinelMaster?: unknown
}

/** Redis Insight 导出中密码字段可能为布尔占位（已脱敏） */
function insightSecretStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return ''
}

function insightItemToUiConn(raw: unknown): UiConn {
  if (!raw || typeof raw !== 'object') {
    throw new ConnImportParseError('conn.importFormatErr')
  }
  const o = raw as RedisInsightConnectionJson
  const host = asStr(o.host).trim()
  if (!host) throw new ConnImportParseError('conn.importFormatErr')
  const port = parsePortU16(o.port)

  const name = asStr(o.name).trim() || `${host}:${port}`
  const idStr = asStr(o.id).trim()
  const id = idStr || nanoid()

  const ct = asStr(o.connectionType).toUpperCase() || 'STANDALONE'
  const forceStandalone = !!o.forceStandalone

  const clusterOn = ct === 'CLUSTER' && !forceStandalone
  const sentinelOn = ct === 'SENTINEL'
  const sentMaster = sentinelOn
    ? (asRecord(o.sentinelMaster) as RedisInsightSentinelMasterJson | undefined)
    : undefined
  if (sentinelOn) {
    const masterName = sentMaster ? asStr(sentMaster.name).trim() : ''
    if (!masterName) throw new ConnImportParseError('conn.importFormatErr')
  }

  const tlsOn = !!o.tls

  const sshOpt = asRecord(o.sshOptions) as RedisInsightSshOptionsJson | undefined
  const sshOn = !!o.ssh && !!sshOpt && asStr(sshOpt.host).trim()
  const pkRaw = sshOpt ? insightSecretStr(sshOpt.privateKey) : ''
  const pkIsPem = /-----BEGIN\b/.test(pkRaw)
  const pkfile = pkRaw.trim() && !pkIsPem ? pkRaw.trim() : ''
  const loginType = pkfile ? 'pkfile' : 'pwd'

  return emptyConn({
    id,
    name,
    host,
    port,
    username: insightSecretStr(o.username),
    password: insightSecretStr(o.password),
    db: parseDb(o.db),
    cluster: clusterOn,
    ssl: tlsOn,
    sslOption: { key: '', cert: '', ca: '' },
    sentinel: sentinelOn,
    sentinelOption: sentinelOn
      ? {
          masterName: sentMaster ? asStr(sentMaster.name).trim() : '',
          masterUsername: sentMaster ? insightSecretStr(sentMaster.username) : '',
          masterPassword: sentMaster ? insightSecretStr(sentMaster.password) : '',
        }
      : { masterName: '', masterUsername: '', masterPassword: '' },
    ssh: !!sshOn,
    sshOption: sshOn
      ? {
          host: asStr(sshOpt!.host),
          port: parsePortU16(sshOpt!.port ?? 22),
          loginType,
          username: asStr(sshOpt!.username),
          password: insightSecretStr(sshOpt!.password),
          pkfile: pkRaw.trim(),
          passphrase: insightSecretStr(sshOpt!.passphrase),
        }
      : {
          host: '',
          port: 22,
          loginType: 'pwd',
          username: '',
          password: '',
          pkfile: '',
          passphrase: '',
        },
  })
}

/**
 * Redis Insight 导出的 `RedisInsight_connections_*.json`：JSON 数组，元素含 `connectionType` 等字段。
 * `sslOption` 需本地文件路径：此处仅设置 `ssl: true`，证书请在连接编辑中重新指定。
 * SSH：`privateKey` 为 PEM 正文时无法映射为文件路径，需用户保存为文件后在编辑中填写 `pkfile`。
 */
export function parseRedisInsightConnections(content: string): UiConn[] {
  let arr: unknown
  try {
    arr = JSON.parse(content.trim())
  } catch {
    throw new ConnImportParseError('conn.importJsonErr')
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new ConnImportParseError('conn.importConnErr')
  }
  return arr.map(a => insightItemToUiConn(a))
}

// #endregion

// #region 合并导入列表

export function mergeImportedConnList(existing: UiConn[], imported: UiConn[]): UiConn[] {
  const impIds = imported.map(c => c.id)
  const next: UiConn[] = []
  next.push(...existing.filter(c => !impIds.includes(c.id)))
  next.push(...imported)
  return next
}

// #endregion
