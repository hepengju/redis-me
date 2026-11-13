import type { Update } from '@tauri-apps/plugin-updater'
import type { InjectionKey } from 'vue'

import { commands as spectaCommands } from '@/types/tauri-specta'
import type { ConnConfig, RedisKey_Deserialize, RedisNode_Serialize } from '@/types/tauri-specta'

/** node_list 原始项经 enrich 后供 UI 使用（后端序列化形态 + UI 字段） */
export interface EnrichedRedisNode extends RedisNode_Serialize {
  isMaster: boolean
  isSlave: boolean
  shortLabel: string
  masterSlots?: string | null
  slotsTooltip: string
}

export interface KeyTypeListItem {
  short: string
  value: string
  type: string
}

/** 检查更新 / 下载安装时的 UI 状态（由注入的 app 提供） */
export interface MeAppUpdateState {
  downloading: boolean
  downloadPercentage: number
}

/** 存储/列表中的连接 + 界面字段（颜色、只读等）；meta 在 ConnConfig 上 */
export type UiConn = ConnConfig & { color?: string; readonly?: boolean }

/** App.vue 注入的共享状态（与 `shareProvideKey` 配对，AppTitle 与 AppMain 共用） */
export interface ServerCapabilities {
  version: string
  isValkey: boolean
  infoSupported: boolean
  aclSupported: boolean
  aclDryrunSupported: boolean
  aclSelectorSupported: boolean
  httlSupported: boolean
  clusterDbSupported: boolean
  redisSearchSupported: boolean
  /** 连接时探测 MEMORY USAGE；不支持则列表、目录分析和内存页都不发这条命令 */
  memoryUsageSupported: boolean
}

export interface AppMainShare {
  conn: UiConn | null
  connList: UiConn[]
  nodeList: EnrichedRedisNode[]
  loading: boolean
  color: string
  readonly: boolean
  redisKey: RedisKey_Deserialize | null
  tabName: string
  dbSizeMap: Record<string, string | number>
  exportImporting: boolean
  exportImportingTip: string
  exportImportingPercentage: number
  capabilities: ServerCapabilities
}

/** AppMain 注入的更新/下载状态（与 `appProvideKey` 配对） */
export interface AppMainInject extends MeAppUpdateState {
  update: Update | null
}

/** 与 `App.vue` 中 `provide(shareProvideKey, share)` 配对，子组件使用 `inject(shareProvideKey)!` */
export const shareProvideKey: InjectionKey<AppMainShare> = Symbol('redis-me.share')

/** 与 `AppMain` 中 `provide(appProvideKey, app)` 配对，子组件使用 `inject(appProvideKey)!` */
export const appProvideKey: InjectionKey<AppMainInject> = Symbol('redis-me.app')

/** ConnEmpty / 全局快捷键：新增连接、导入、全屏、设置等（由 AppMain provide） */
export type ConnShortcutAction =
  | 'add'
  | 'import'
  | 'newWindow'
  | 'setting'
  | 'shortcuts'
  | 'fullscreen'

export interface ConnUiInject {
  openConnSave: (mode: 'add' | 'edit', conn?: UiConn) => void
  openConnImport: () => void
  /** 由 KeyHeader 挂载时赋值，打开左侧菜单同款设置弹窗 */
  openSetting: () => void
  /** 由 KeyHeader 挂载时赋值，打开三列快捷键弹窗 */
  openShortcuts: () => void
  /** 由 KeyMain 挂载时赋值，打开创建副本弹窗 */
  openKeyCopy: (redisKey: RedisKey_Deserialize) => void
  /** 由 KeyMain 挂载时赋值，左侧键树滚动到指定键（复用新建键定位） */
  scrollKeyToTree: (redisKey: RedisKey_Deserialize) => void
  /** 由 KeyMain 挂载时赋值，键区切到索引查询并选中该索引 */
  browseSearchIndex: (name: string) => void
  runConnAction: (action: ConnShortcutAction) => void
}

export const connUiProvideKey: InjectionKey<ConnUiInject> = Symbol('redis-me.connUi')

/** 多窗口连接列表同步（与 `CONN_LIST_WINDOWS_SYNC` 事件对应） */
export interface ConnListWindowsSyncPayload {
  connList: UiConn[]
  label: string
}

/** vue-web-terminal 命令提示项（与 commands-help 等本地 JSON 结构兼容） */
export interface MeXtermCommandItem {
  key: string
  summary?: string
  description?: string
  usage?: string
  group?: string
  title?: string
  since?: string
}

type UnwrapSpectaPromise<R> =
  R extends Promise<infer P> ? (P extends { status: 'ok'; data: infer D } ? D : never) : never

/** specta ≥ rc.29 末尾可选 `InvokeOptions` 不对外暴露 */
type DropTrailingArg<A extends unknown[]> = A extends [...infer Rest, unknown?] ? Rest : A

type WrapSpectaCommand<F> = F extends (...args: infer A) => infer R
  ? R extends Promise<unknown>
    ? (...args: DropTrailingArg<A>) => Promise<UnwrapSpectaPromise<R>>
    : F
  : F

type SpectaCommandsMap = typeof spectaCommands

/**
 * `MeCommands`：与 specta `commands` 同键、同业务入参；成功返回解包后的 `data`。
 * 是否弹错由 `meCommands` / `meCommandsQuiet` 两套入口区分，不再用末尾 `false`。
 */
export type MeCommands = {
  [K in keyof SpectaCommandsMap]: SpectaCommandsMap[K] extends (...args: never[]) => unknown
    ? WrapSpectaCommand<SpectaCommandsMap[K]>
    : SpectaCommandsMap[K]
}
