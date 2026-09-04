<script setup lang="ts">
// #region 导入
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useStorage } from '@vueuse/core'
import { sortBy } from 'lodash'
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

import MeSelectUpDownIcon from '@/components/MeSelectUpDownIcon.vue'
import { shareProvideKey, connUiProvideKey } from '@/types/me-interface'
import type { RedisDB, RedisKey_Deserialize, ScanCursor } from '@/types/tauri-specta'
import { folderKeyPrefix, folderMatchExpr, getConnKeySeparator } from '@/utils/conn'
import {
  useFavorites,
  useFavoriteFolders,
  useFavoriteSplitLayout,
  addFavorite,
  removeFavorite,
  clearFavoritesForDb,
  isFavorited,
  addFavoriteFolder,
  removeFavoriteFolder,
  clearFavoriteFoldersForDb,
} from '@/utils/favorite'
import { clearKeyTypeCacheForConn } from '@/utils/key-type-cache'
import { KEY_TYPE_LIST, meKeyShort, toRedisTypeName } from '@/utils/redis-display'
import {
  buildScanPattern,
  buildLocalFilterPattern,
  compileRedisGlobFilter,
  computeScanProgress,
} from '@/utils/redis-glob'
import { redisKeyId, sameRedisKey } from '@/utils/redis-key'
import { setTerminalKeyHints } from '@/utils/terminal-key-hints'
import {
  bus,
  CONN_REFRESH,
  INFO_REFRESH,
  KEY_DELETE,
  KEY_RENAME,
  KEY_REFRESH,
  meConfirm,
  meCommands,
  meCopy,
  meDeleteKey,
  meOk,
  mePrompt,
  meWarn,
  sleep,
} from '@/utils/util'
import FieldAdd from '@/views/ext/FieldAdd.vue'
import TTLSet from '@/views/ext/TTLSet.vue'
import KeyCopy from '@/views/key/KeyCopy.vue'
import KeyImport from '@/views/key/KeyImport.vue'
import KeyRename from '@/views/key/KeyRename.vue'

import KeyBatch from './key/KeyBatch.vue'
import KeyFavoriteFolder from './key/KeyFavoriteFolder.vue'
import KeyMemory from './key/KeyMemory.vue'
import KeyTree from './key/KeyTree.vue'
// #endregion

interface ImportExportProgressPayload {
  id: string
  okCount: number
  errCount: number
  ignoreCount: number
  totalCount: number
  finished: boolean
}

const { t } = useI18n()
const share = inject(shareProvideKey)!
const connUi = inject(connUiProvideKey)!
const canEdit = computed(() => !share.readonly)

async function refresh(): Promise<void> {
  if (!share.conn) return
  await syncDbToVisibleList()
  // 必须先停旧扫描再 initReset：scanKey(restart) 会在等待期间仍写缓冲，不能先清空再 restart
  await stopScanIfRunning()
  initReset()
  await scanKey()
}
onMounted(async () => {
  await refreshDbList()
  await refresh()
})

function initReset(): void {
  keyType.value = 'ALL'
  exact.value = false
  keyword.value = ''
  scanBuffer = []
  keyList.value = []
  cursor.value = null
  share.redisKey = null
  if (favoriteMode.value) favFolderPanelRef.value?.resetScans()
  favoriteMode.value = false
  showCheckbox.value = false
  favoriteCheckedZone.value = 'none'
  clearFavoriteChecked()
}

const keyType = ref('ALL')
const keyTypeTag = computed(() => {
  const v = keyType.value
  if (v === 'ALL') return { value: 'ALL' as const, type: 'info' as const }
  return KEY_TYPE_LIST.find(k => k.value === v) ?? { value: v, type: 'info' as const }
})
function chooseKeyType(keyTypeSelected: string): void {
  keyType.value = keyTypeSelected
  keyword.value = ''
  void scanKey(false, false)
}

const exact = ref(false)
const keyword = ref('')
const loading = ref(false)
const loadFolder = ref(false)
const scanCancelled = ref(false) // 扫描是否被取消
const scanPaused = ref(false) // 用户主动暂停后可用继续扫描
const scanLoadAll = ref(false) // 暂停前是「加载更多」还是「加载全部」
const scanBatchCount = ref(0) // 本轮搜索已执行的 SCAN 次数（用于进度估算）
// 前若干轮扫描通常很快完成，不必闪一下暂停/继续控件
const SCAN_CONTROL_MIN_BATCHES = 10
const showScanControl = computed(
  () => scanPaused.value || (loading.value && scanBatchCount.value >= SCAN_CONTROL_MIN_BATCHES),
)

const scanToggleTip = computed(() =>
  loading.value ? t('keyMain.pauseScan') : t('keyMain.resumeScan'),
)

// 收藏相关
const favoriteMode = ref(false)
const favorites = useFavorites()
const favoriteFolders = useFavoriteFolders()
const favSplit = useFavoriteSplitLayout()
// 纠正损坏的比例字符串
if (typeof favSplit.value.folderSize !== 'string' || !/^\d+%$/.test(favSplit.value.folderSize)) {
  favSplit.value = { ...favSplit.value, folderSize: '40%' }
}
const favFolderPanelRef =
  useTemplateRef<InstanceType<typeof KeyFavoriteFolder>>('favFolderPanelRef')
const favFlexRef = useTemplateRef<HTMLElement>('favFlexRef')

// 收藏模式跨区多选暂存（声明靠前供 initReset 使用）
const favFolderChecked = ref<RedisKey_Deserialize[]>([])
const favKeysChecked = ref<RedisKey_Deserialize[]>([])
// 上区勾选的收藏目录根 path（批量取消收藏目录）
const favFolderPathsChecked = ref<string[]>([])

const currentFavorites = computed(() => {
  if (!share.conn) return []
  return favorites.value
    .filter(f => f.connId === share.conn!.id && f.db === share.conn!.db)
    .map(f => f.redisKey)
})

// 当前库收藏目录 path（字典序）
const currentFavoriteFolderPaths = computed(() => {
  if (!share.conn) return []
  return favoriteFolders.value
    .filter(f => f.connId === share.conn!.id && f.db === share.conn!.db)
    .map(f => f.path)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
})

const hasAnyFavorite = computed(
  () => currentFavorites.value.length > 0 || currentFavoriteFolderPaths.value.length > 0,
)

// 两侧都展开时可拖分割条；折叠态用 flex，避免 el-splitter 把固定高度放大导致一侧「消失」
const favBothExpanded = computed(
  () => !favSplit.value.folderCollapsed && !favSplit.value.keysCollapsed,
)

const folderPaneClass = computed(() => ({
  'is-collapsed': favSplit.value.folderCollapsed,
  'is-grow': !favSplit.value.folderCollapsed && !favBothExpanded.value,
  'is-fixed': favBothExpanded.value,
}))

const keysPaneClass = computed(() => ({
  'is-collapsed': favSplit.value.keysCollapsed,
  'is-grow': !favSplit.value.keysCollapsed,
}))

const folderPaneStyle = computed(() =>
  favBothExpanded.value ? { flexBasis: favSplit.value.folderSize } : undefined,
)

function toggleFolderPane(): void {
  favSplit.value = { ...favSplit.value, folderCollapsed: !favSplit.value.folderCollapsed }
}

function toggleKeysPane(): void {
  favSplit.value = { ...favSplit.value, keysCollapsed: !favSplit.value.keysCollapsed }
}

function onFavResizeStart(e: MouseEvent): void {
  if (!favBothExpanded.value) return
  const root = favFlexRef.value
  if (!root) return
  e.preventDefault()
  const top = root.getBoundingClientRect().top
  const height = root.getBoundingClientRect().height
  if (height <= 0) return

  const onMove = (ev: MouseEvent) => {
    const pct = Math.min(80, Math.max(20, Math.round(((ev.clientY - top) / height) * 100)))
    favSplit.value = { ...favSplit.value, folderSize: `${pct}%` }
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function pauseScan() {
  scanCancelled.value = true
  scanPaused.value = true
}

function onScanAction() {
  hideSearchHistory()
  if (loading.value) pauseScan()
  else if (scanPaused.value) {
    scanPaused.value = false
    void scanKey(true, scanLoadAll.value)
  }
}

// 搜索历史记录
const SEARCH_HISTORY_KEY = 'redis-me:search-history'
const searchHistory = useStorage<string[]>(SEARCH_HISTORY_KEY, [])
const showHistory = ref(false)
let historyHideTimer: ReturnType<typeof setTimeout> | null = null

// 过滤后的搜索历史（输入时实时过滤）
const filteredSearchHistory = computed(() => {
  const k = keyword.value.toLowerCase().trim()
  if (!k) return searchHistory.value
  return searchHistory.value.filter(h => h.toLowerCase().includes(k))
})

function addSearchHistory(query: string) {
  if (!query || query === '*' || loadFolder.value) return
  const trimmed = query.trim()
  if (!trimmed) return
  searchHistory.value = [trimmed, ...searchHistory.value.filter(h => h !== trimmed)].slice(0, 10)
}

function removeSearchHistory(item: string) {
  searchHistory.value = searchHistory.value.filter(h => h !== item)
}

function clearSearchHistory() {
  searchHistory.value = []
}

function selectHistory(item: string) {
  keyword.value = item
  showHistory.value = false
  void scanKey(false, false)
}

// 仅点击输入框本体时展开历史；suffix 内控件（含复选框）不触发
function handleKeywordClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('el-input__inner')) {
    showHistory.value = true
  }
}

function handleInputBlur() {
  historyHideTimer = setTimeout(() => {
    showHistory.value = false
  }, 150)
}

function handleHistoryMouseDown() {
  if (historyHideTimer) {
    clearTimeout(historyHideTimer)
    historyHideTimer = null
  }
}

function hideSearchHistory() {
  showHistory.value = false
  if (historyHideTimer) {
    clearTimeout(historyHideTimer)
    historyHideTimer = null
  }
}

async function onRefreshKey() {
  hideSearchHistory()
  // 收藏模式 F5：重载已展开的收藏目录，不触发主列表 SCAN
  if (favoriteMode.value) {
    await favFolderPanelRef.value?.reloadExpanded()
    return
  }
  await scanKey(false, false, true)
}

// F5 刷新键列表（连接内全局生效，需阻止浏览器默认刷新）
function onKeyListRefreshHotkey(e: KeyboardEvent) {
  if (e.key !== 'F5') return
  e.preventDefault()
  void onRefreshKey()
}

// 搜索模式：关闭完全匹配时 buildScanPattern 补 * 后 SCAN；开启时原样 EXISTS
const keySep = computed(() => getConnKeySeparator(share.conn))
const match = computed(() =>
  buildScanPattern(keyword.value, exact.value, loadFolder.value, keySep.value),
)

// Redis SCAN COUNT / 自动续扫阈值 / 进度估算：均取 settings.keyScanCount
const SCAN_FETCH_COUNT = computed(() => meTauri.settings.keyScanCount as number)
const scanBatchSize = SCAN_FETCH_COUNT

// 当前库键总量：单机取 INFO dbN；集群为单 master 键数 × master 节点数
const dbSize = computed(() => {
  if (!share.conn) return 0
  const perDb = Number(share.dbSizeMap['db' + share.conn.db] ?? 0)
  if (!share.conn.cluster) return perDb
  const masterCount = share.nodeList.filter(n => n.isMaster).length
  return masterCount > 0 ? perDb * masterCount : perDb
})

// 扫描进度：按 SCAN 批次估算（与匹配结果数量无关，稀有键搜索时进度仍正常推进）
const scanProgress = computed(() => {
  if (!share.conn) return 0
  return computeScanProgress(
    scanBatchCount.value,
    scanBatchSize.value,
    dbSize.value,
    Boolean(cursor.value?.finished),
  )
})

const cursor = ref<ScanCursor | null>(null)
// 仅在一次扫描结束且仍有未加载 key 时显示「加载更多」
const showLoadMoreButtons = computed(
  () => !loading.value && cursor.value != null && !cursor.value.finished,
)

// 本地过滤：精确转义字面，扫描用 match（切换勾选仅更新过滤，回车/查询才重新扫描）
const filterPattern = computed(() =>
  buildLocalFilterPattern(keyword.value, exact.value && !loadFolder.value, match.value),
)
const filterMatch = computed(() => compileRedisGlobFilter(filterPattern.value))

// 扫描工作缓冲：每轮 SCAN 结束后 push → 排序 → flush 到 keyList（边扫边看）。
let scanBuffer: RedisKey_Deserialize[] = []

const keyList = shallowRef<RedisKey_Deserialize[]>([])

// 同步左侧 SCAN + 收藏键供终端键名补全
watch(
  [keyList, currentFavorites],
  () => {
    setTerminalKeyHints(
      keyList.value.map(k => k.key),
      currentFavorites.value.map(k => k.key),
    )
  },
  { immediate: true },
)
onUnmounted(() => {
  setTerminalKeyHints([])
})

function flushScanToUi() {
  scanBuffer = sortBy(scanBuffer, ['key'])
  // 必须新数组引用：否则 KeyTree 的 prop 引用不变，树不会重建
  keyList.value = scanBuffer.slice()
}

const filterKeyList = computed(() => {
  // 收藏模式下，只显示当前连接的收藏键
  let source: RedisKey_Deserialize[] = favoriteMode.value ? currentFavorites.value : keyList.value

  // 收藏模式与上区一致：子串 includes，不受 exact / glob 影响
  if (favoriteMode.value) {
    const q = keyword.value.trim().toLowerCase()
    if (!q) return source
    return source.filter(k => k.key.toLowerCase().includes(q))
  }

  const matchFn = filterMatch.value
  if (!matchFn) return source
  return source.filter(k => matchFn(k.key))
})

// 若正在扫描则取消并等到 loading 结束（refresh / scanKey restart 共用）
async function stopScanIfRunning(): Promise<void> {
  if (!loading.value) return
  scanCancelled.value = true
  scanPaused.value = false
  while (loading.value) {
    await sleep(20)
  }
}

// 扫描键；restart=true 时中断进行中的扫描并重新开始
async function scanKey(useCursor = false, loadAll = false, restart = false): Promise<void> {
  if (!share.conn) return
  if (loading.value) {
    if (!restart) return
    await stopScanIfRunning()
  }

  scanLoadAll.value = loadAll
  loading.value = true
  scanCancelled.value = false // 每次扫描都重置取消标志
  if (!useCursor) scanPaused.value = false
  try {
    if (!useCursor) {
      addSearchHistory(keyword.value)
      cursor.value = null
      scanBatchCount.value = 0
      scanBuffer = []
    }

    const firstScanKeys = await scanKeyCore()

    // loadAll=false 时自动继续加载（达到阈值停止）
    if (!loadAll) {
      await scanKeyAuto(firstScanKeys)
    } else {
      await scanKeyAll()
    }
  } finally {
    loading.value = false
    if (cursor.value?.finished) scanPaused.value = false
  }
}

// 核心：执行一次 SCAN 请求，返回新扫描的 key 数量
async function scanKeyCore(): Promise<number> {
  const params = {
    match: match.value,
    type: keyType.value === 'ALL' ? '' : toRedisTypeName(keyType.value),
    cursor: cursor.value,
    exact: exact.value && !loadFolder.value,
    count: SCAN_FETCH_COUNT.value,
  }

  // 延迟一下，方便观察加载过程（不要删除，未来还是测试验证）
  // await new Promise(r => setTimeout(r, 5000))

  const data = await meCommands.scan(share.conn!.id, params)
  cursor.value = data.cursor
  scanBatchCount.value++

  // Redis SCAN 保证「全程存在的键至少出现一次」，但不保证不重复（rehash 等场景会跨 cursor 重复）。
  // 新搜索由 scanKey 已清空缓冲；续扫按 redisKeyId 去重后再排序上屏（与收藏目录 mergeScanKeys 一致）。
  const seen = new Set(scanBuffer.map(redisKeyId))
  for (const k of data.keyList) {
    const id = redisKeyId(k)
    if (seen.has(id)) continue
    seen.add(id)
    scanBuffer.push(k)
  }
  flushScanToUi()

  return data.keyList.length
}

// 自动加载：递归执行直到满足停止条件（async/await 不会栈溢出）
async function scanKeyAuto(fetchedCount: number = 0): Promise<void> {
  if (!cursor.value || cursor.value.finished) return
  if (scanCancelled.value) return
  if (fetchedCount >= SCAN_FETCH_COUNT.value) return

  const newKeys = await scanKeyCore()
  await scanKeyAuto(fetchedCount + newKeys)
}

// 加载全部：递归执行直到扫描完成（async/await 不会栈溢出）
async function scanKeyAll(): Promise<void> {
  if (!cursor.value || cursor.value.finished) return
  if (scanCancelled.value) return

  await scanKeyCore()
  await scanKeyAll() // 继续递归
}

function deleteKey(redisKey: RedisKey_Deserialize): void {
  scanBuffer = scanBuffer.filter(rk => !sameRedisKey(rk, redisKey))
  flushScanToUi()
  share.redisKey = null
  favFolderPanelRef.value?.applyKeyDelete(redisKey)
  if (favoriteMode.value) {
    favFolderChecked.value = favFolderChecked.value.filter(k => !sameRedisKey(k, redisKey))
    favKeysChecked.value = favKeysChecked.value.filter(k => !sameRedisKey(k, redisKey))
    syncFavoriteChecked()
  }
}

// 重命名后：flush 键树（label/id 按新 key 重建），并同步收藏里的键身份
function renameKey(payload: { oldKey: RedisKey_Deserialize; newKey: RedisKey_Deserialize }): void {
  const { oldKey, newKey } = payload
  // KeyRename 已原地改过列表里的对象；再写一遍以兼容非同一引用
  for (const rk of scanBuffer) {
    if (sameRedisKey(rk, oldKey) || sameRedisKey(rk, newKey)) {
      rk.key = newKey.key
      rk.bytes = newKey.bytes
    }
  }
  flushScanToUi()

  if (share.conn) {
    const { id, db } = share.conn
    favorites.value = favorites.value.map(f => {
      if (f.connId !== id || f.db !== db) return f
      if (!sameRedisKey(f.redisKey, oldKey) && !sameRedisKey(f.redisKey, newKey)) return f
      return { ...f, redisKey: { key: newKey.key, bytes: newKey.bytes } }
    })
  }

  // 上区缓存先改；勾选列表不能依赖树 checkChange（重建时常不触发）
  favFolderPanelRef.value?.applyKeyRename(oldKey, newKey)
  if (favoriteMode.value) {
    favFolderChecked.value =
      favFolderPanelRef.value?.patchCheckedAfterRename(favFolderChecked.value, oldKey, newKey) ??
      favFolderChecked.value
    favKeysChecked.value = favKeysChecked.value.map(k =>
      sameRedisKey(k, oldKey) || sameRedisKey(k, newKey)
        ? { key: newKey.key, bytes: newKey.bytes }
        : k,
    )
    syncFavoriteChecked()
  }

  nextTick(() => {
    scrollKeyToTrees(newKey)
  })
}

const dbList = ref<RedisDB[]>([])

/** 当前 db 不在可见列表时切到第一项，并同步 Redis SELECT */
async function syncDbToVisibleList(): Promise<boolean> {
  if (!share.conn || dbList.value.length === 0) return false
  const prevDb = share.conn.db
  if (dbList.value.some(d => d.db === prevDb)) return false
  share.conn.db = dbList.value[0].db
  await meCommands.selectDb(share.conn.id, share.conn.db)
  return true
}

async function refreshDbList(): Promise<boolean> {
  if (!share.conn) return false
  let list = await meCommands.dbList(share.conn!.id)
  // meta.dbShowLimit：下拉只显示 db0 .. db(N-1)，未设则不限制
  const limit = share.conn.meta?.dbShowLimit
  if (typeof limit === 'number' && limit > 0) {
    list = list.filter(d => d.db < limit)
  }
  dbList.value = list
  return syncDbToVisibleList()
}

async function onDbShowLimitChange(val: number | undefined | null): Promise<void> {
  if (!share.conn) return
  share.conn.meta ??= {}
  if (typeof val === 'number' && val > 0) {
    share.conn.meta.dbShowLimit = val
  } else {
    delete share.conn.meta.dbShowLimit
  }
  const dbChanged = await refreshDbList()
  if (dbChanged) await refresh()
}

async function selectDB(): Promise<void> {
  if (!share.conn) return
  await meCommands.selectDb(share.conn!.id, share.conn.db)
  await refresh()
}

/** db 下拉展示文案：db0 (123) */
function formatDbLabel(db: number): string {
  return `db${db} (${share.dbSizeMap['db' + db] ?? 0})`
}

/** el-option :label，含自定义库名，供 filterable 搜索 */
function formatDbOptionLabel(db: number): string {
  return formatDbLabel(db) + (share.conn?.meta?.['db' + db] || '')
}

/** 集群 Valkey 9+ 多库：el-select 位置仅展示当前 db，不支持切换 */
const showClusterDbLabel = computed(() =>
  Boolean(share.conn?.cluster && share.capabilities.clusterDbSupported),
)

const keyPrefix = ref('')

// 选中键
function chooseKey(redisKey: RedisKey_Deserialize): void {
  keyPrefix.value = redisKey.key + '-copy'
  share.redisKey = redisKey
  share.tabName = 'value'
  bus.emit(KEY_REFRESH)
}

function chooseFolder(folder: string): void {
  keyPrefix.value = folderKeyPrefix(folder, keySep.value)
}

function contextKey(command: string, redisKey: RedisKey_Deserialize): void {
  if (!share.conn) return
  if (command === 'refreshKey') {
    void scanKey(false, false)
  } else if (command === 'reloadKey') {
    chooseKey(redisKey)
  } else if (command === 'addKey') {
    keyPrefix.value = redisKey.key + '-copy'
    addKey()
  } else if (command === 'copyKey') {
    meCopy(redisKey.key)
  } else if (command === 'deleteKey') {
    meDeleteKey(share.conn!.id, redisKey)
  } else if (command === 'renameKey') {
    keyRenameRef.value?.open({ redisKey })
  } else if (command === 'duplicateKey') {
    keyCopyRef.value?.open({ redisKey })
  } else if (command === 'checkedMode') {
    enterCheckedMode()
  } else if (command === 'exitCheckedMode') {
    exitCheckedMode()
  } else if (command === 'favoriteKey') {
    favorites.value = addFavorite(favorites.value, share.conn.id, share.conn.db, redisKey)
    meOk(t('keyTree.favoriteOk'))
  } else if (command === 'unfavoriteKey') {
    favorites.value = removeFavorite(favorites.value, share.conn.id, share.conn.db, redisKey)
    meOk(t('keyTree.unfavoriteOk'))
  } else {
    meOk(`TODO: ${command}`)
  }
}

function contextFolder(command: string, folder: string): void {
  if (!share.conn) return
  if (command === 'refreshKey') {
    void scanKey(false, false)
  } else if (command === 'addKey') {
    keyPrefix.value = folderKeyPrefix(folder, keySep.value)
    addKey()
  } else if (command === 'copyFolder') {
    meCopy(folder)
  } else if (command === 'loadFolder' || command === 'loadFolderAll') {
    // 须 await：loadFolder 标志要覆盖整轮 SCAN，否则续扫会退回 *keyword* 模式
    void (async () => {
      loadFolder.value = true
      try {
        exact.value = false
        keyword.value = folder
        await scanKey(false, command === 'loadFolderAll')
      } finally {
        loadFolder.value = false
      }
    })()
  } else if (command === 'memoryUsage') {
    keyMemory(folder)
  } else if (command === 'deleteFolder') {
    deleteFolder(folder)
  } else if (command === 'exportFolder') {
    exportFolder(folder)
  } else if (command === 'checkedMode') {
    enterCheckedMode()
  } else if (command === 'exitCheckedMode') {
    exitCheckedMode()
  } else if (command === 'favoriteFolder') {
    favoriteFolders.value = addFavoriteFolder(
      favoriteFolders.value,
      share.conn.id,
      share.conn.db,
      folder,
    )
    meOk(t('keyTree.favoriteOk'))
  } else if (command === 'unfavoriteFolder') {
    favoriteFolders.value = removeFavoriteFolder(
      favoriteFolders.value,
      share.conn.id,
      share.conn.db,
      folder,
    )
    meOk(t('keyTree.unfavoriteOk'))
  } else {
    meOk(`TODO: ${command}`)
  }
}

function onUnfavoriteFolder(path: string): void {
  if (!share.conn) return
  favoriteFolders.value = removeFavoriteFolder(
    favoriteFolders.value,
    share.conn.id,
    share.conn.db,
    path,
  )
  meOk(t('keyTree.unfavoriteOk'))
}

const keyRenameRef = useTemplateRef<InstanceType<typeof KeyRename>>('keyRenameRef')
const keyCopyRef = useTemplateRef<InstanceType<typeof KeyCopy>>('keyCopyRef')

onMounted(() => {
  bus.on(KEY_DELETE, deleteKey)
  bus.on(KEY_RENAME, renameKey)
  bus.on(CONN_REFRESH, refresh)
  window.addEventListener('keydown', onKeyListRefreshHotkey, true)
  connUi.openKeyCopy = (redisKey: RedisKey_Deserialize) => {
    keyCopyRef.value?.open({ redisKey })
  }
  connUi.scrollKeyToTree = (redisKey: RedisKey_Deserialize) => {
    scrollKeyToTrees(redisKey)
  }
})
onUnmounted(() => {
  bus.off(KEY_DELETE, deleteKey)
  bus.off(KEY_RENAME, renameKey)
  bus.off(CONN_REFRESH, refresh)
  window.removeEventListener('keydown', onKeyListRefreshHotkey, true)
})

const fieldAddRef = useTemplateRef<InstanceType<typeof FieldAdd>>('fieldAddRef')

// 新增键下拉：选中类型后直接打开对话框并预设该类型
function chooseAddKeyType(keyTypeSelected: string): void {
  addKey(keyTypeSelected)
}

function addKey(type?: string): void {
  fieldAddRef.value?.open({
    mode: 'key',
    key: { key: keyPrefix.value, bytes: '' },
    // 不传 type 时不能出现 type: undefined，避免 open 内 Object.assign 覆盖默认类型
    ...(type ? { type: toRedisTypeName(type) } : {}),
  })
}

const keyTreeRef = useTemplateRef<InstanceType<typeof KeyTree>>('keyTreeRef')

/** 收藏模式上区 + 下区两棵树都尝试定位（键可能只在其中一区） */
function scrollKeyToTrees(redisKey: RedisKey_Deserialize): void {
  if (favoriteMode.value) favFolderPanelRef.value?.setCurrentKey(redisKey)
  keyTreeRef.value?.setCurrentKey(redisKey)
}

function addKeyOk(redisKey: RedisKey_Deserialize): void {
  scanBuffer.push(redisKey)
  flushScanToUi()
  chooseKey(redisKey)
  nextTick(() => {
    scrollKeyToTrees(redisKey)
  })
  bus.emit(INFO_REFRESH)
}

const keyBatchRef = useTemplateRef<InstanceType<typeof KeyBatch>>('keyBatchRef')
function deleteFolder(folder: string): void {
  keyBatchRef.value?.open({ match: folderMatchExpr(folder, keySep.value), keyList: [] }, 'delete')
}
function exportFolder(folder: string): void {
  keyBatchRef.value?.open({ match: folderMatchExpr(folder, keySep.value), keyList: [] }, 'export')
}

function batchKeyOk(mode: string): void {
  if (mode === 'delete') {
    // 收藏模式上区有独立 SCAN 缓存，需与 F5 一样重扫已展开目录
    if (favoriteMode.value) {
      void favFolderPanelRef.value?.reloadExpanded()
      // 与批量取消收藏一致：删完退出多选，避免勾选残留已删键
      exitCheckedMode()
    }
    scanKey(false, false)
    bus.emit(INFO_REFRESH)
  } else {
    share.exportImportingPercentage = 0
    share.exportImporting = true
    share.exportImportingTip = t('keyMain.exporting')
    tauriListen('export')
  }
}

const keyImportRef = useTemplateRef<InstanceType<typeof KeyImport>>('keyImportRef')
function importData(): void {
  keyImportRef.value?.open()
}
function importStart(): void {
  share.exportImportingPercentage = 0
  share.exportImporting = true
  share.exportImportingTip = t('keyMain.importing')
  tauriListen('import')
}
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

let unlisten: UnlistenFn | null = null
async function tauriListen(eventName: 'export' | 'import'): Promise<void> {
  unlisten = await listen<ImportExportProgressPayload>(eventName, event => {
    const payload = event.payload
    if (!share.conn || payload.id !== share.conn!.id) return
    share.exportImportingPercentage = Math.round(
      ((payload.okCount + payload.errCount + payload.ignoreCount) / payload.totalCount) * 100,
    )

    if (payload.finished) {
      tauriUnlisten()
      share.exportImportingPercentage = 100
      share.exportImporting = false
      meOk(
        t(`keyMain.${eventName}Result`, payload as unknown as Record<string, unknown>),
        true,
        t(`keyMain.${eventName}Done`),
      )

      // 导入完成后刷新键列表与连接信息
      if (eventName === 'import') {
        void scanKey(false, false)
        bus.emit(INFO_REFRESH)
      }
    }
  })
}

function tauriUnlisten(): void {
  if (unlisten) {
    unlisten()
    unlisten = null
  }
}
onUnmounted(() => tauriUnlisten())
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const keyMemoryRef = useTemplateRef<InstanceType<typeof KeyMemory>>('keyMemoryRef')
function keyMemory(folder: string): void {
  keyMemoryRef.value?.open({ match: folderMatchExpr(folder, keySep.value) })
}

// 键显示类型: tree/list; 树形列表排序方式: 字母排序/数量排序
const keyShowTree = computed({
  get() {
    return meTauri.settings.keyShow === 'tree'
  },
  set(newValue: boolean) {
    meTauri.settings.keyShow = newValue ? 'tree' : 'list'
  },
})

const sortByCount = computed({
  get() {
    return meTauri.settings.keySort === 'count'
  },
  set(newValue: boolean) {
    meTauri.settings.keySort = newValue ? 'count' : 'alphabet'
  },
})
async function handleCommand(command: string): Promise<void> {
  if (command === 'toggleKeyShow') {
    keyShowTree.value = !keyShowTree.value
  } else if (command === 'toggleKeySort') {
    sortByCount.value = !sortByCount.value
  } else if ('mockData' === command) {
    await mockData()
  } else if ('exportData' === command) {
    exportFolder('*')
  } else if ('importData' === command) {
    importData()
  } else if ('batchDelete' === command) {
    deleteFolder('*')
  } else if ('flushDb' === command) {
    flushDb()
  } else if ('checkedMode' === command) {
    enterCheckedMode()
  } else if ('clearFavorites' === command) {
    clearFavorites()
  }
}

function clearFavorites(): void {
  if (!share.conn || !hasAnyFavorite.value) return
  meConfirm(t('keyMain.clearFavoritesConfirm'), () => {
    const id = share.conn!.id
    const db = share.conn!.db
    favorites.value = clearFavoritesForDb(favorites.value, id, db)
    favoriteFolders.value = clearFavoriteFoldersForDb(favoriteFolders.value, id, db)
    favFolderPanelRef.value?.resetScans()
    meOk(t('keyMain.clearFavoritesOk'))
  })
}

function flushDb(): void {
  if (!share.conn) return
  meConfirm(t('keyMain.flushDbConfirm'), async () => {
    await meCommands.flushDb(share.conn!.id)
    clearKeyTypeCacheForConn(share.conn!.id)
    meOk(t('keyMain.flushDbOk'))
    bus.emit(CONN_REFRESH)
    bus.emit(INFO_REFRESH)
  })
}

async function mockData(): Promise<void> {
  if (!share.conn) return
  mePrompt(
    t('keyHeader.mockHint'),
    {
      inputValue: '100',
      inputType: 'number',
      inputValidator: value => {
        const n = Number(value)
        if (n < 1 || n > 10000) {
          return t('keyHeader.mockValidator')
        }
        return true
      },
    },
    async ({ value }) => {
      let total = Number(value)
      share.exportImportingPercentage = 0
      share.exportImporting = true
      share.exportImportingTip = t('keyHeader.mocking')

      try {
        let remaining = total
        while (remaining > 0) {
          const count = Math.min(remaining, 10)
          await meCommands.mockData(share.conn!.id, count)
          remaining -= count
          share.exportImportingPercentage = Math.round(((total - remaining) / total) * 100)
          await sleep(100) // 睡眠10ms以便其他动作可以获取到锁, 同时避免UI界面卡顿
        }
        meOk(t('keyHeader.mockOk'))
        bus.emit(INFO_REFRESH)
      } finally {
        share.exportImporting = false
      }
    },
  )
}

// 多选：正常模式用 showCheckbox；收藏模式用 favoriteCheckedZone（上下区互斥勾选，两侧列表始终展示）
const showCheckbox = ref(false)
/** 收藏模式：none | 仅上区目录勾选 | 仅下区键勾选 */
const favoriteCheckedZone = ref<'none' | 'folders' | 'keys'>('none')
const checkedKeyList = ref<RedisKey_Deserialize[]>([])

const inCheckedMode = computed(() =>
  favoriteMode.value ? favoriteCheckedZone.value !== 'none' : showCheckbox.value,
)
const folderPaneCheckbox = computed(
  () => favoriteMode.value && favoriteCheckedZone.value === 'folders',
)
const keysPaneCheckbox = computed(() => favoriteMode.value && favoriteCheckedZone.value === 'keys')

function syncFavoriteChecked(): void {
  if (favoriteCheckedZone.value === 'folders') {
    checkedKeyList.value = favFolderChecked.value
    return
  }
  if (favoriteCheckedZone.value === 'keys') {
    checkedKeyList.value = favKeysChecked.value
    return
  }
  checkedKeyList.value = []
}

/** 收藏多选计数：目录区含键+目录根；键区仅键 */
const favoriteCheckedCount = computed(() => {
  if (favoriteCheckedZone.value === 'folders') {
    return checkedKeyList.value.length + favFolderPathsChecked.value.length
  }
  if (favoriteCheckedZone.value === 'keys') return checkedKeyList.value.length
  return 0
})

function clearFavoriteChecked(): void {
  checkedKeyList.value = []
  favFolderChecked.value = []
  favKeysChecked.value = []
  favFolderPathsChecked.value = []
}

function toggleChecked(): void {
  if (favoriteMode.value) {
    if (favoriteCheckedZone.value === 'none') return
    exitCheckedMode()
  } else {
    showCheckbox.value = !showCheckbox.value
    if (!showCheckbox.value) checkedKeyList.value = []
  }
}

async function toggleFavoriteMode(): Promise<void> {
  if (favoriteMode.value) {
    favFolderPanelRef.value?.resetScans()
    favoriteMode.value = false
    showCheckbox.value = false
    favoriteCheckedZone.value = 'none'
    clearFavoriteChecked()
  } else {
    // 进入收藏前停掉主列表 SCAN，避免与目录 SCAN 抢连接锁
    await stopScanIfRunning()
    keyword.value = ''
    exact.value = false
    showCheckbox.value = false
    favoriteCheckedZone.value = 'none'
    clearFavoriteChecked()
    favoriteMode.value = true
  }
}

/** zone：收藏模式指定上/下区；正常模式忽略 */
function enterCheckedMode(zone: 'folders' | 'keys' | 'main' = 'main'): void {
  if (favoriteMode.value) {
    if (zone === 'main') return
    // 切到目标区勾选：另一区退出勾选模式，但分区内容仍展示
    favoriteCheckedZone.value = zone
    clearFavoriteChecked()
    return
  }
  if (showCheckbox.value) return
  showCheckbox.value = true
  checkedKeyList.value = []
}

function exitCheckedMode(): void {
  if (favoriteMode.value) {
    if (favoriteCheckedZone.value === 'none') return
    favoriteCheckedZone.value = 'none'
    clearFavoriteChecked()
    return
  }
  if (!showCheckbox.value) return
  showCheckbox.value = false
  checkedKeyList.value = []
}

function checkChange(redisKeys: RedisKey_Deserialize[]): void {
  if (favoriteMode.value) {
    if (favoriteCheckedZone.value !== 'keys') return
    favKeysChecked.value = redisKeys
    syncFavoriteChecked()
  } else {
    checkedKeyList.value = redisKeys
  }
}

function onFolderCheckChange(redisKeys: RedisKey_Deserialize[]): void {
  if (favoriteCheckedZone.value !== 'folders') return
  favFolderChecked.value = redisKeys
  syncFavoriteChecked()
}

function onFavoriteFolderPathCheckChange(paths: string[]): void {
  if (favoriteCheckedZone.value !== 'folders') return
  favFolderPathsChecked.value = paths
}

/** 上区右键：多选只进目录区 */
function onFolderPanelContextKey(command: string, redisKey: RedisKey_Deserialize): void {
  if (command === 'checkedMode') {
    enterCheckedMode('folders')
    return
  }
  if (command === 'exitCheckedMode') {
    exitCheckedMode()
    return
  }
  contextKey(command, redisKey)
}

function onFolderPanelContextFolder(command: string, folder: string): void {
  if (command === 'checkedMode') {
    enterCheckedMode('folders')
    return
  }
  if (command === 'exitCheckedMode') {
    exitCheckedMode()
    return
  }
  contextFolder(command, folder)
}

// 下区右键：多选只进键区
function onKeysPanelContextKey(command: string, redisKey: RedisKey_Deserialize): void {
  if (command === 'checkedMode') {
    enterCheckedMode('keys')
    return
  }
  if (command === 'exitCheckedMode') {
    exitCheckedMode()
    return
  }
  contextKey(command, redisKey)
}

function onKeysPanelContextFolder(command: string, folder: string): void {
  if (command === 'checkedMode') {
    enterCheckedMode('keys')
    return
  }
  if (command === 'exitCheckedMode') {
    exitCheckedMode()
    return
  }
  contextFolder(command, folder)
}

// 多选底栏批处理设计：
// - 普通模式：导出 | TTL | 删除 | 收藏；对象=勾选叶子键
// - 收藏上区（目录）：导出 | TTL | 删除 | 取消收藏
// - 收藏下区（键）：仅取消收藏
// - 导出/TTL/删除只处理「已 SCAN 上屏且已勾选」的叶子键（扫描多少处理多少），
//   不因勾选目录根再去 path:* 二次 SCAN；仅勾选空目录根时这三项禁用
// - 取消收藏：目录根 path + 勾选键都算（目录根不依赖是否已扫出子键）
// 取消收藏等：键或目录根任一即可
const checkedDisabled = computed(() => {
  if (share.exportImporting) return true
  if (favoriteMode.value) return favoriteCheckedCount.value === 0
  return checkedKeyList.value.length === 0
})
// 导出/TTL/删除：必须有已上屏的勾选叶子键
const checkedKeysDisabled = computed(() => {
  if (share.exportImporting) return true
  return checkedKeyList.value.length === 0
})
const checkedBtnClass = computed(() => (checkedDisabled.value ? ['icon-disabled'] : ['icon-btn']))
const checkedKeysBtnClass = computed(() =>
  checkedKeysDisabled.value ? ['icon-disabled'] : ['icon-btn'],
)
// 收藏上区多选：展示导出/TTL/删除；下区走仅取消收藏的分支
const favFolderBatchOps = computed(
  () => favoriteMode.value && favoriteCheckedZone.value === 'folders',
)

function exportChecked(): void {
  if (checkedKeyList.value.length === 0) return
  keyBatchRef.value?.open({ match: '', keyList: checkedKeyList.value }, 'export')
}

const ttlSetRef = useTemplateRef<InstanceType<typeof TTLSet>>('ttlSetRef')
function ttlChecked(): void {
  if (checkedKeyList.value.length === 0) return
  ttlSetRef.value?.open({ keyList: checkedKeyList.value })
}

function deleteChecked(): void {
  if (checkedKeyList.value.length === 0) return
  keyBatchRef.value?.open({ match: '', keyList: checkedKeyList.value }, 'delete')
}

function favoriteChecked(): void {
  if (!share.conn || checkedKeyList.value.length === 0) return
  const connId = share.conn.id
  const db = share.conn.db
  const allAlready = checkedKeyList.value.every(redisKey =>
    isFavorited(favorites.value, connId, db, redisKey),
  )
  if (allAlready) {
    meWarn(t('keyMain.favoriteCheckedAllAlready'))
    return
  }
  let newFavorites = favorites.value
  let count = 0
  checkedKeyList.value.forEach(redisKey => {
    const beforeLen = newFavorites.length
    newFavorites = addFavorite(newFavorites, connId, db, redisKey)
    if (newFavorites.length > beforeLen) count++
  })
  if (count > 0) {
    favorites.value = newFavorites
    meOk(t('keyMain.favoriteCheckedOk', { count }))
  }
}

function unfavoriteChecked(): void {
  if (!share.conn) return
  const connId = share.conn.id
  const db = share.conn.db
  const keys = checkedKeyList.value
  const folderPaths = favoriteMode.value ? favFolderPathsChecked.value : []
  if (keys.length === 0 && folderPaths.length === 0) return

  let newFavorites = favorites.value
  const beforeKeyLen = newFavorites.length
  for (const redisKey of keys) {
    newFavorites = removeFavorite(newFavorites, connId, db, redisKey)
  }
  const keyCount = beforeKeyLen - newFavorites.length

  let newFolders = favoriteFolders.value
  const beforeFolderLen = newFolders.length
  for (const path of folderPaths) {
    newFolders = removeFavoriteFolder(newFolders, connId, db, path)
  }
  const folderCount = beforeFolderLen - newFolders.length

  if (keyCount === 0 && folderCount === 0) {
    meWarn(t('keyMain.unfavoriteCheckedNoneAlready'))
    return
  }
  if (keyCount > 0) favorites.value = newFavorites
  if (folderCount > 0) favoriteFolders.value = newFolders

  if (keyCount > 0 && folderCount > 0) {
    meOk(t('keyMain.unfavoriteCheckedMixedOk', { keyCount, folderCount }))
  } else if (folderCount > 0) {
    meOk(t('keyMain.unfavoriteCheckedFoldersOk', { count: folderCount }))
  } else {
    meOk(t('keyMain.unfavoriteCheckedOk', { count: keyCount }))
  }
  // 成功后退出多选，避免底栏计数残留 / 误点二次取消
  exitCheckedMode()
}

function editDbName(db: number): void {
  if (!share.conn) return
  mePrompt(
    t('keyMain.editDbName', { index: db }),
    {
      inputValue: String(share.conn.meta?.['db' + db] ?? ''),
      inputPlaceholder: t('keyMain.editDbNamePlaceholder'),
    },
    ({ value }) => {
      share.conn!.meta ??= {}
      share.conn!.meta['db' + db] = value
    },
  )
}
</script>

<template>
  <div class="key-main">
    <div class="key-header">
      <template v-if="favoriteMode">
        <el-input v-model="keyword" :placeholder="t('keyMain.favoriteFilter')" clearable />
      </template>
      <template v-else>
        <el-input
          v-model="keyword"
          :readonly="loading"
          :placeholder="t('keyMain.keyword')"
          clearable
          @keyup.enter="scanKey(false, false)"
          @click="handleKeywordClick"
          @blur="handleInputBlur">
          <template #prepend>
            <el-dropdown placement="bottom-start" @command="chooseKeyType">
              <el-tag :type="keyTypeTag.type" effect="plain" class="key-type-tag">
                <!-- ALL 状态用减号图标，与右侧新增键的 + 同款同尺寸 -->
                <me-icon v-if="keyType === 'ALL'" icon="el-icon-minus" />
                <template v-else>{{ meKeyShort(keyType) }}</template>
              </el-tag>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="ALL">
                    <el-tag
                      type="info"
                      :effect="'ALL' === keyType ? 'plain' : 'dark'"
                      style="width: 26px"
                      hit>
                      ‒
                    </el-tag>
                    <el-text style="margin-left: 6px" type="info">ALL</el-text>
                  </el-dropdown-item>
                  <el-dropdown-item v-for="item in KEY_TYPE_LIST" :command="item.value">
                    <el-tag
                      :type="item.type"
                      :effect="item.value === keyType ? 'plain' : 'dark'"
                      style="width: 26px"
                      hit>
                      {{ meKeyShort(item.value) }}
                    </el-tag>
                    <el-text style="margin-left: 6px">{{ item.value }}</el-text>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <template #suffix>
            <div class="keyword-suffix">
              <me-scan-control
                v-if="showScanControl"
                :percentage="scanProgress"
                :loading="loading"
                :tip="scanToggleTip"
                @click="onScanAction" />
              <me-icon
                icon="me-icon-search"
                class="suffix-icon-btn"
                :style="{ color: share.color }"
                :info="t('keyMain.refreshKey')"
                placement="bottom"
                @click.stop="onRefreshKey" />
              <el-tooltip
                :content="t('keyMain.exactSearch')"
                placement="bottom"
                raw-content
                :show-after="1000">
                <el-checkbox size="small" v-model="exact" class="suffix-exact-checkbox" />
              </el-tooltip>
            </div>
          </template>
          <template v-if="canEdit" #append>
            <!-- 与左侧类型下拉同款：tag 触发器 + 浮动菜单，选类型后直接打开新增对话框 -->
            <el-dropdown placement="bottom-start" @command="chooseAddKeyType">
              <el-tag type="info" effect="plain" class="key-add-tag">
                <me-icon icon="el-icon-plus" />
              </el-tag>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="item in KEY_TYPE_LIST" :command="item.value">
                    <el-tag :type="item.type" effect="dark" style="width: 26px" hit>
                      {{ meKeyShort(item.value) }}
                    </el-tag>
                    <el-text style="margin-left: 6px">{{ item.value }}</el-text>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-input>
      </template>
    </div>

    <div class="key-list" :class="{ 'is-favorite-mode': favoriteMode }">
      <template v-if="favoriteMode">
        <div ref="favFlexRef" class="fav-flex">
          <div class="fav-pane" :class="folderPaneClass" :style="folderPaneStyle">
            <div class="fav-pane-title" @click="toggleFolderPane">
              <me-icon icon="me-icon-folder-favorited" class="fav-pane-title-icon is-star" />
              <span class="fav-pane-title-text">
                {{ t('keyMain.favoriteFolders') }}
                ({{ currentFavoriteFolderPaths.length }})
              </span>
              <me-icon
                class="fav-pane-chevron"
                :icon="favSplit.folderCollapsed ? 'el-icon-arrow-right' : 'el-icon-arrow-down'" />
            </div>
            <div v-show="!favSplit.folderCollapsed" class="fav-pane-body">
              <KeyFavoriteFolder
                ref="favFolderPanelRef"
                :folders="currentFavoriteFolderPaths"
                :filter-keyword="keyword"
                :favorites="currentFavorites"
                :key-show-tree="keyShowTree"
                :sort-by-count="sortByCount"
                :show-checkbox="folderPaneCheckbox"
                :color="share.color"
                @chooseKey="chooseKey"
                @contextKey="onFolderPanelContextKey"
                @contextFolder="onFolderPanelContextFolder"
                @unfavoriteFolder="onUnfavoriteFolder"
                @checkChange="onFolderCheckChange"
                @favoriteFolderCheckChange="onFavoriteFolderPathCheckChange" />
            </div>
          </div>

          <div v-show="favBothExpanded" class="fav-resizer" @mousedown="onFavResizeStart" />

          <div class="fav-pane" :class="keysPaneClass">
            <div class="fav-pane-title" @click="toggleKeysPane">
              <me-icon icon="el-icon-star-filled" class="fav-pane-title-icon is-star" />
              <span class="fav-pane-title-text">
                {{ t('keyMain.favoriteKeys') }} ({{ currentFavorites.length }})
              </span>
              <me-icon
                class="fav-pane-chevron"
                :icon="favSplit.keysCollapsed ? 'el-icon-arrow-right' : 'el-icon-arrow-down'" />
            </div>
            <div v-show="!favSplit.keysCollapsed" class="fav-pane-body">
              <KeyTree
                ref="keyTreeRef"
                :show-checkbox="keysPaneCheckbox"
                :filter-key-list="filterKeyList"
                :redis-key="share.redisKey"
                :key-show-tree="keyShowTree"
                :sort-by-count="sortByCount"
                :color="share.color"
                :loading="false"
                :favorites="currentFavorites"
                :favorite-mode="true"
                @chooseKey="chooseKey"
                @contextKey="onKeysPanelContextKey"
                @chooseFolder="chooseFolder"
                @contextFolder="onKeysPanelContextFolder"
                @checkChange="checkChange" />
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <KeyTree
          ref="keyTreeRef"
          :show-checkbox="showCheckbox"
          :filter-key-list="filterKeyList"
          :redis-key="share.redisKey"
          :key-show-tree="keyShowTree"
          :sort-by-count="sortByCount"
          :color="share.color"
          :loading="loading"
          :favorites="currentFavorites"
          :favorite-folders="currentFavoriteFolderPaths"
          :favorite-mode="false"
          @chooseKey="chooseKey"
          @contextKey="contextKey"
          @chooseFolder="chooseFolder"
          @contextFolder="contextFolder"
          @checkChange="checkChange" />

        <!-- 搜索历史记录下拉  -->
        <div
          class="search-history-dropdown"
          v-if="showHistory && filteredSearchHistory.length > 0"
          @mousedown.prevent="handleHistoryMouseDown">
          <div
            v-for="(item, index) in filteredSearchHistory"
            :key="index"
            class="history-item"
            @click="selectHistory(item)">
            <span class="history-text">{{ item }}</span>
            <span class="history-delete" @click.stop="removeSearchHistory(item)">×</span>
          </div>
          <div class="history-clear" @click="clearSearchHistory">
            {{ t('keyMain.clearHistory') }}
          </div>
        </div>
      </template>
    </div>

    <div class="key-footer">
      <!-- 左侧: 数据库|游标 -->
      <div class="me-flex" v-if="!inCheckedMode && share.conn">
        <template v-if="favoriteMode">
          <div
            class="me-flex exit-favorite"
            style="cursor: pointer; margin-left: 5px"
            @click="void toggleFavoriteMode()">
            <me-icon icon="el-icon-back" />
            <div class="me-flex" style="gap: 10px; margin-left: 5px">
              <div>{{ t('keyMain.exitFavoriteMode') }}</div>
              <me-icon
                icon="me-icon-db"
                :name="'db' + share.conn.db"
                v-if="!share.conn.cluster || share.capabilities.clusterDbSupported" />
            </div>
          </div>
        </template>
        <template v-else>
          <div v-if="showClusterDbLabel" class="cluster-db-label">
            <me-icon icon="me-icon-db" :name="'db' + share.conn!.db" />
          </div>
          <el-select
            v-model="share.conn.db"
            @change="selectDB"
            class="db-select me-select-plain"
            :suffix-icon="MeSelectUpDownIcon"
            filterable
            v-else-if="!share.conn.cluster">
            <!-- 隐藏 prefix 只定宽：filterable 输入时 EP 会卸掉 #label，避免宽度跟着输入字收缩 -->
            <template #prefix>
              <me-icon
                class="db-select-sizer"
                aria-hidden="true"
                icon="me-icon-db"
                :name="formatDbLabel(share.conn.db)" />
            </template>
            <template #header>
              <div
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 8px;
                  padding: 4px 8px;
                  font-size: 12px;
                ">
                <span>{{ t('keyMain.dbShowLimit') }}</span>
                <el-input-number
                  :model-value="share.conn.meta?.dbShowLimit as number | undefined"
                  :min="1"
                  :controls="false"
                  clearable
                  size="small"
                  style="width: 72px"
                  @update:model-value="onDbShowLimitChange" />
              </div>
            </template>
            <el-option
              v-for="item in dbList"
              :key="item.db"
              :value="item.db"
              :label="formatDbOptionLabel(item.db)">
              <div class="me-flex db-option">
                <me-icon icon="me-icon-db" :name="formatDbLabel(item.db)" />
                <div class="me-flex db-option-extra">
                  <el-text type="info" style="margin: 0 10px">{{
                    share.conn?.meta?.['db' + item.db]
                  }}</el-text>
                  <me-icon icon="el-icon-edit" class="icon-btn" @click.stop="editDbName(item.db)" />
                </div>
              </div>
            </el-option>
            <template #label>
              <me-icon icon="me-icon-db" :name="formatDbLabel(share.conn.db)" />
            </template>
          </el-select>
          <div class="me-flex" style="width: 45px; margin: 0 5px" v-if="showLoadMoreButtons">
            <me-icon
              :name="t('keyMain.loadMore')"
              icon="me-icon-load-more"
              hint
              placement="top"
              class="icon-btn"
              @click="scanKey(true, false)" />
            <me-icon
              :name="t('keyMain.loadAll')"
              icon="me-icon-load-all"
              hint
              placement="top"
              class="icon-btn"
              @click="scanKey(true, true)" />
          </div>
        </template>
      </div>

      <!-- 多选底栏：见 script 中「多选底栏批处理设计」；导出/TTL/删除仅针对已上屏勾选键 -->
      <div class="me-flex" v-else style="margin-left: 10px; gap: 5px">
        <template v-if="!favoriteMode || favFolderBatchOps">
          <el-link underline="never" :disabled="checkedKeysDisabled" @click="exportChecked">
            <me-icon
              :name="t('keyMain.exportChecked')"
              icon="me-icon-export"
              hint
              :class="checkedKeysBtnClass"
              placement="top" />
          </el-link>
          <el-link
            underline="never"
            :disabled="checkedKeysDisabled"
            @click="ttlChecked"
            v-if="canEdit">
            <me-icon
              :name="t('keyMain.ttlChecked')"
              icon="el-icon-timer"
              hint
              :class="checkedKeysBtnClass"
              placement="top" />
          </el-link>
          <el-link
            underline="never"
            :disabled="checkedKeysDisabled"
            @click="deleteChecked"
            v-if="canEdit">
            <me-icon
              :name="t('keyMain.deleteChecked')"
              icon="el-icon-delete"
              hint
              :class="checkedKeysBtnClass"
              placement="top" />
          </el-link>
          <!-- 普通：批量收藏；收藏上区：批量取消收藏（含目录根） -->
          <el-link
            v-if="!favoriteMode"
            underline="never"
            :disabled="checkedDisabled"
            @click="favoriteChecked">
            <me-icon
              :name="t('keyMain.favoriteChecked')"
              icon="el-icon-star-filled"
              hint
              :class="checkedBtnClass"
              placement="top" />
          </el-link>
          <el-link v-else underline="never" :disabled="checkedDisabled" @click="unfavoriteChecked">
            <me-icon
              :name="t('keyMain.unfavoriteChecked')"
              icon="el-icon-star"
              hint
              :class="checkedBtnClass"
              placement="top" />
          </el-link>
        </template>
        <!-- 收藏下区：仅取消收藏 -->
        <template v-else>
          <el-link underline="never" :disabled="checkedDisabled" @click="unfavoriteChecked">
            <me-icon
              :name="t('keyMain.unfavoriteChecked')"
              icon="el-icon-star"
              hint
              :class="checkedBtnClass"
              placement="top" />
          </el-link>
        </template>
      </div>

      <!-- 中间: 选中/过滤；收藏模式计数已在分区标题，此处不展示 -->
      <div class="center">
        <el-text class="tip" size="large" :style="{ color: share.color }">
          <!-- 收藏多选仅单区，只显示已选数量 -->
          <span v-if="inCheckedMode && favoriteMode">{{ favoriteCheckedCount }}</span>
          <span v-else-if="inCheckedMode"
            >{{ checkedKeyList.length }} / {{ filterKeyList.length }}</span
          >
          <span v-else-if="!favoriteMode">{{ filterKeyList.length }} / {{ keyList.length }}</span>
        </el-text>
      </div>

      <!-- 右侧: 收藏|扩展 -->
      <div class="me-flex" v-if="!inCheckedMode">
        <me-icon
          v-if="!favoriteMode"
          icon="el-icon-star-filled"
          class="icon-btn"
          @click="void toggleFavoriteMode()"
          placement="top"
          :name="t('keyMain.myFavorites')"
          hint />
        <el-dropdown placement="top-end" @command="handleCommand" style="margin: 5px">
          <me-icon icon="el-icon-more-filled" class="icon-btn" />
          <template #dropdown>
            <el-dropdown-menu>
              <template v-if="!favoriteMode">
                <el-dropdown-item command="exportData">
                  <me-icon :name="t('keyMain.exportData')" icon="me-icon-export" />
                </el-dropdown-item>
                <el-dropdown-item command="importData" v-if="canEdit">
                  <me-icon :name="t('keyMain.importData')" icon="me-icon-import" />
                </el-dropdown-item>
                <el-dropdown-item command="mockData" v-if="canEdit">
                  <me-icon :name="t('keyMain.mockData')" icon="el-icon-coffee-cup" />
                </el-dropdown-item>

                <el-dropdown-item command="batchDelete" v-if="canEdit" divided>
                  <me-icon :name="t('keyMain.batchDelete')" icon="el-icon-delete" />
                </el-dropdown-item>
                <el-dropdown-item command="flushDb" v-if="canEdit">
                  <me-icon :name="t('keyMain.flushDb')" icon="el-icon-delete-filled" />
                </el-dropdown-item>
              </template>

              <el-dropdown-item command="toggleKeyShow" :divided="!favoriteMode">
                <me-icon
                  :name="keyShowTree ? t('keyMain.listView') : t('keyMain.treeView')"
                  :icon="keyShowTree ? 'me-icon-list' : 'me-icon-tree'"></me-icon>
              </el-dropdown-item>
              <el-dropdown-item command="toggleKeySort" v-if="keyShowTree">
                <me-icon
                  :name="sortByCount ? t('keyMain.sortByAlphabet') : t('keyMain.sortByCount')"
                  icon="me-icon-alphabet"></me-icon>
              </el-dropdown-item>
              <el-dropdown-item
                v-if="favoriteMode && hasAnyFavorite"
                command="clearFavorites"
                divided>
                <me-icon :name="t('keyMain.clearFavorites')" icon="el-icon-delete" />
              </el-dropdown-item>
              <!-- 收藏模式仅右键进多选（进一边会清另一边勾选） -->
              <el-dropdown-item v-if="!favoriteMode" command="checkedMode">
                <me-icon :name="t('keyMain.checkedMode')" icon="me-icon-checked" />
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <!-- 右侧: 关闭多选 （多选时显示） -->
      <div class="me-flex" v-else style="width: 30px">
        <me-icon
          :name="t('keyMain.exitCheckedMode')"
          icon="el-icon-circle-close"
          @click="toggleChecked"
          hint
          class="icon-btn"
          placement="top" />
      </div>
    </div>
    <!-- 字段新增、批量删除键、目录内存分析 -->
    <FieldAdd ref="fieldAddRef" @success="addKeyOk" />
    <KeyBatch ref="keyBatchRef" @success="batchKeyOk" />
    <KeyImport ref="keyImportRef" @success="importStart" />
    <KeyMemory ref="keyMemoryRef" />
    <TTLSet ref="ttlSetRef" />
    <KeyRename ref="keyRenameRef" />
    <KeyCopy ref="keyCopyRef" @success="addKeyOk" />
  </div>
</template>

<style scoped lang="scss">
.key-main {
  flex-grow: 1;
  position: relative;

  .empty {
    height: 100%;
    border: 1px solid var(--el-border-color);
  }

  .key-header {
    :deep(.el-tag) {
      border-color: var(--el-border-color);
    }

    // 类型选择与输入框衔接：prepend/append 只负责布局，外框由两侧 tag 承担，避免双边框
    :deep(.el-input-group__prepend),
    :deep(.el-input-group__append) {
      padding: 0;
      box-shadow: none;
    }

    .key-type-tag {
      width: 32px;
      min-height: var(--el-component-size);
      font-weight: bold;
      border-radius: 0;
      border-top-left-radius: var(--el-input-border-radius, var(--el-border-radius-base));
      border-bottom-left-radius: var(--el-input-border-radius, var(--el-border-radius-base));
      border-right: none;
    }

    // 新增键触发器：镜像左侧类型 tag（圆角/边框在右侧）；须用元素根节点组件，否则下拉指令失效
    .key-add-tag {
      width: 40px;
      min-height: var(--el-component-size);
      font-weight: bold;
      border-radius: 0;
      border-top-right-radius: var(--el-input-border-radius, var(--el-border-radius-base));
      border-bottom-right-radius: var(--el-input-border-radius, var(--el-border-radius-base));
      border-left: none;
    }

    // EP 的 .el-tag .el-icon 会把图标锁死 12px（关闭按钮场景），两侧触发器 tag 内图标解锁并对齐新增连接按钮的 +
    .key-type-tag :deep(.el-icon),
    .key-add-tag :deep(.el-icon) {
      width: 1em;
      height: 1em;
      font-size: 15px;
    }

    // 新增键按钮不收缩，避免调整侧边栏宽度时变为两行
    :deep(.el-input-group__append) {
      flex-shrink: 0;
    }

    // 输入框内右侧：暂停/继续 + 刷新 + 精确查询
    .keyword-suffix {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 6px;

      // 与 suffix 图标同色，选中时用主题色
      :deep(.suffix-exact-checkbox) {
        height: auto;

        .el-checkbox__inner {
          border-color: var(--el-text-color-secondary);
          background-color: transparent;
        }

        &:hover .el-checkbox__inner {
          border-color: var(--el-color-primary);
        }

        &.is-checked .el-checkbox__inner {
          background-color: var(--el-color-primary);
          border-color: var(--el-color-primary);
        }
      }
    }

    .suffix-icon-btn {
      cursor: pointer;
      font-size: 16px;

      &:hover {
        opacity: 0.75;
      }
    }
  }

  // 滚动条显示在键的区域，而不是整个左侧区域
  // 原理：需要指定下高度。此处指定为0，弹性扩展
  height: 0;

  margin-top: 10px;
  display: flex;
  flex-direction: column;

  .key-list {
    flex-grow: 1;
    border: 1px solid var(--el-border-color);
    border-top: none;
    border-bottom: none;
    position: relative;

    height: 100%;
    padding: 5px;
    overflow: hidden; // 隐藏水平滚动条，仅显示竖直滚动条

    &.is-favorite-mode {
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .fav-flex {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .fav-pane {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;

      &.is-collapsed {
        flex: 0 0 32px;
        height: 32px;
      }

      &.is-grow {
        flex: 1 1 auto;
      }

      &.is-fixed {
        flex-grow: 0;
        flex-shrink: 0;
        // flexBasis 由 folderPaneStyle 提供（如 40%）
      }
    }

    .fav-resizer {
      flex: 0 0 5px;
      cursor: ns-resize;
      background: transparent;

      &:hover {
        background: var(--el-border-color-lighter);
      }
    }

    .fav-pane-title {
      flex-shrink: 0;
      height: 32px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      cursor: pointer;
      user-select: none;
      border-bottom: 1px solid var(--el-border-color-lighter);
      background: var(--el-fill-color-blank);
      color: var(--el-text-color-regular);

      &:hover {
        background: var(--el-fill-color-light);
      }
    }

    .fav-pane-title-icon {
      flex-shrink: 0;
      font-size: 14px;
      color: var(--el-text-color-secondary);

      &.is-star {
        color: #f7ba2a;
      }
    }

    .fav-pane-title-text {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fav-pane-chevron {
      flex-shrink: 0;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    .fav-pane-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 2px 4px 4px;
    }

    :deep(.el-link) {
      font-size: 12px;
    }

    .search-history-dropdown {
      position: absolute;
      // top: 100%;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      background-color: color-mix(in srgb, var(--el-bg-color) 70%, transparent);
      border: 1px solid var(--el-border-color);
      border-top: none;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
      max-height: 300px;
      overflow-y: auto;

      .history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 13px;
        color: var(--el-text-color-regular);

        &:hover {
          background-color: var(--el-color-info-light-8);
        }

        .history-text {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .history-delete {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: var(--el-text-color-secondary);
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;

          &:hover {
            color: var(--el-color-danger);
            background-color: var(--el-color-danger-light-9);
          }
        }
      }

      .history-clear {
        padding: 8px 12px;
        text-align: center;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        border-top: 1px solid var(--el-border-color-lighter);
        cursor: pointer;

        &:hover {
          color: var(--el-color-primary);
        }
      }
    }
  }

  .key-footer {
    height: 30px;
    border: 1px solid var(--el-border-color);
    border-top: none;
    display: flex;
    align-items: center;
    justify-content: space-between;

    /* Linux system-ui 字面度量与 Win 不同，收紧行高并统一交叉轴居中 */
    .me-flex {
      align-items: center;
    }

    .center {
      display: flex;
      align-items: center;
    }

    :deep(.icon-btn) {
      font-size: 18px;
    }

    :deep(.icon-disabled) {
      font-size: 18px;
    }

    :deep(.el-select__wrapper) {
      min-height: 0;
      height: 30px;
      padding: 4px;
      line-height: 1;
    }

    /* 隐藏 sizer(prefix) 定宽；可见 #label 叠层显示；输入过滤不改变宽度 */
    .db-select {
      :deep(.icon-main) {
        white-space: nowrap;
        line-height: 1;
      }

      /* 无额外 padding：避免 sizer 比可见文案更宽，箭头前留白过大 */
      :deep(.el-select__prefix) {
        flex-shrink: 0;
        visibility: hidden;
        pointer-events: none;
      }

      /* selection 不占宽；label/input 相对 wrapper 叠在 sizer 上 */
      :deep(.el-select__selection) {
        position: static;
        flex: 0 0 0;
        width: 0;
        min-width: 0;
        padding: 0;
        overflow: visible;
      }

      :deep(.el-select__selected-item.el-select__placeholder) {
        position: absolute;
        inset: 0 14px 0 4px;
        display: flex;
        align-items: center;
        width: auto;
        transform: none;
        z-index: 1; /* 覆盖 EP 默认 -1，避免透明背景下看不见 */
      }

      :deep(.el-select__input-wrapper) {
        inset: 0 14px 0 4px;
      }
    }

    .cluster-db-label {
      flex-shrink: 0;
      padding: 0 4px;
      font-size: 14px;
      line-height: 1;
      color: var(--el-text-color-regular);
    }

    .db-option {
      align-items: center;
      width: 100%;

      .db-option-extra {
        align-items: center;
        margin-left: auto;
      }
    }

    .tip {
      white-space: nowrap;
      line-height: 1;
    }

    :deep(.el-select-dropdown__item) {
      padding: 0 20px 0 20px;
    }
  }

  /* 选中的键 */
  :deep(.choose-key) {
    background-color: var(--el-color-info-light-8);
  }
}
</style>
