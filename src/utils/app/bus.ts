/** 全局事件总线与跨窗/跨页常量 */
import mitt from 'mitt'

import type { RedisKey_Deserialize } from '@/types/tauri-specta'

/** 全局 `bus` 事件载荷（与 `bus.emit` / `bus.on` 一致） */
export type MeBusEvents = {
  KEY_DELETE: RedisKey_Deserialize
  /** 重命名成功：oldKey 为改名前快照，newKey 为服务端返回；用于刷新键树 / 收藏 */
  KEY_RENAME: { oldKey: RedisKey_Deserialize; newKey: RedisKey_Deserialize }
  /** 载荷未使用；监听器应 `() => refreshKey()` 包装，避免与多参函数签名冲突 */
  KEY_REFRESH: undefined
  /** Hash/JSON 键详情预填的 FT.CREATE。搜索页可能尚未挂载，配合 takeSearchCreateDraft */
  SEARCH_CREATE: string
  INFO_REFRESH: boolean | undefined
  CONN_REFRESH: void
  /** 打开设置弹窗：顶部栏设置图标 emit，KeyHeader（挂载 AppSetting）监听 */
  OPEN_SETTING: void
  /** 顶部栏检查更新：AppTitle emit，AppMain 监听后走 meCheckUpdate */
  CHECK_UPDATE: void
  /** 打开键传输对话框；KeyHeader 挂载 KeyMigrate 并监听 */
  OPEN_KEY_MIGRATE: {
    sourceLocked?: boolean
    sourceConnId?: string
    sourceDb?: number
    keyList?: RedisKey_Deserialize[]
    match?: string
  }
  /** 终端里 SELECT 成功：终端 emit（载荷为切到的库号），KeyMain 监听后重载键区 */
  DB_SWITCH: number
}

// 全局事件总线：setup 直接导入，app 全局属性也添加
export const bus = mitt<MeBusEvents>()

export const KEY_DELETE = 'KEY_DELETE'
export const KEY_RENAME = 'KEY_RENAME'
export const KEY_REFRESH = 'KEY_REFRESH'
export const SEARCH_CREATE = 'SEARCH_CREATE'

/** 搜索页还没挂载时先记下草稿，挂载后再打开新建索引。 */
let searchCreateDraft: string | null = null

export function requestSearchCreate(draft: string): void {
  searchCreateDraft = draft
  bus.emit(SEARCH_CREATE, draft)
}

export function takeSearchCreateDraft(): string | null {
  const draft = searchCreateDraft
  searchCreateDraft = null
  return draft
}

export const INFO_REFRESH = 'INFO_REFRESH'
export const CONN_REFRESH = 'CONN_REFRESH'
export const OPEN_SETTING = 'OPEN_SETTING'
export const CHECK_UPDATE = 'CHECK_UPDATE'
export const OPEN_KEY_MIGRATE = 'OPEN_KEY_MIGRATE'
export const DB_SWITCH = 'DB_SWITCH'
export const CONN_LIST_WINDOWS_SYNC = 'CONN_LIST_WINDOWS_SYNC'
export const TREE_KEY_ID_PREFIX = '_TREE_KEY_ID_PREFIX_'

// 预设颜色
export const PREDEFINE_COLORS = [
  '#409eff', // primary
  '#67c23a', // success
  '#e6a23c', // warning
  '#f56c6c', // danger
  '#909399', // info
] as const

// 图表多折线专用色板（与连接颜色选择器解耦，节点数多时循环取色）
export const CHART_COLORS: string[] = [
  '#409eff', // blue
  '#67c23a', // green
  '#e6a23c', // amber
  '#f56c6c', // red
  '#13c2c2', // cyan
  '#9254de', // purple
  '#eb2f96', // pink
  '#faad14', // gold
  '#52c41a', // lime
  '#2f54eb', // geekblue
  '#fa541c', // volcano
  '#73d13d', // grass
]
