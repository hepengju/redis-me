<script setup lang="ts">
// #region 导入
// 收藏模式上区：单棵 KeyTree，顶层为收藏目录；展开后 SCAN 挂键（跟随 keyShow）。
import { sortBy } from 'lodash'
import { computed, inject, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize, ScanCursor } from '@/types/tauri-specta'
import { meCommands, meCopy, meWarn, sleep } from '@/utils/app/util'
import { folderMatchExpr, getConnKeySeparator, keyUnderFolder } from '@/utils/conn'
import { redisKeyId, sameRedisKey } from '@/utils/redis/redis-key'

import KeyTree from './KeyTree.vue'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const keySep = computed(() => getConnKeySeparator(share.conn))
const props = withDefaults(
  defineProps<{
    folders: string[]
    filterKeyword?: string
    favorites?: RedisKey_Deserialize[]
    keyShowTree?: boolean
    sortByCount?: boolean
    showCheckbox?: boolean
    // 另一区已在多选时为 false，右键不提供进入多选
    allowEnterCheckedMode?: boolean
    color?: string
  }>(),
  {
    filterKeyword: '',
    favorites: () => [],
    keyShowTree: true,
    sortByCount: true,
    showCheckbox: false,
    allowEnterCheckedMode: true,
    color: 'var(--el-color-primary)',
  },
)
const emit = defineEmits<{
  chooseKey: [redisKey: RedisKey_Deserialize]
  contextKey: [command: string, redisKey: RedisKey_Deserialize]
  contextFolder: [command: string, folder: string]
  unfavoriteFolder: [path: string]
  checkChange: [redisKeys: RedisKey_Deserialize[]]
  // 勾选的收藏目录根 path，供批量取消收藏目录
  favoriteFolderCheckChange: [paths: string[]]
}>()

interface FolderScanState {
  keys: RedisKey_Deserialize[]
  cursor: ScanCursor | null
  loading: boolean
  loaded: boolean
  cancelled: boolean
}

const scanMap = reactive(new Map<string, FolderScanState>())
// 已展开的收藏目录（F5 重扫用；展开 UI 由 KeyTree 管理）
const expanded = ref<Set<string>>(new Set())
const SCAN_FETCH_COUNT = computed(() => meTauri.settings.keyScanCount as number)
const keyTreeRef = useTemplateRef<InstanceType<typeof KeyTree>>('keyTreeRef')
// #endregion

// #region 计算属性
const kw = computed(() => props.filterKeyword.trim().toLowerCase())

// path 命中或已加载子键命中则保留目录；子键再按关键字滤
const visibleFolders = computed(() => {
  const q = kw.value
  if (!q) return props.folders
  return props.folders.filter(path => {
    if (path.toLowerCase().includes(q)) return true
    const keys = scanMap.get(path)?.keys
    return keys?.some(k => k.key.toLowerCase().includes(q)) ?? false
  })
})

// 交给 KeyTree 的顶层收藏目录 + 已 SCAN 键
const folderKeyGroups = computed(() =>
  visibleFolders.value.map(path => {
    const s = scanMap.get(path)
    return { path, keys: filteredKeys(path), loaded: Boolean(s?.loaded) }
  }),
)

const folderLoadMorePaths = computed(() =>
  visibleFolders.value.filter(path => {
    const s = scanMap.get(path)
    return Boolean(s && s.loaded && !s.loading && s.cursor && !s.cursor.finished)
  }),
)

// SCAN 中的收藏目录 path（目录图标换成 loading）
const folderLoadingPaths = computed(() =>
  visibleFolders.value.filter(path => scanMap.get(path)?.loading),
)

const anyScanning = computed(() => Array.from(scanMap.values()).some(s => s.loading && !s.loaded))
// #endregion

// #region 扫描逻辑
function ensureState(path: string): FolderScanState {
  let s = scanMap.get(path)
  if (!s) {
    s = { keys: [], cursor: null, loading: false, loaded: false, cancelled: false }
    scanMap.set(path, s)
  }
  return s
}

function filteredKeys(path: string): RedisKey_Deserialize[] {
  const keys = scanMap.get(path)?.keys ?? []
  const q = kw.value
  if (!q) return keys
  return keys.filter(k => k.key.toLowerCase().includes(q))
}

async function onFolderExpand(path: string): Promise<void> {
  const next = new Set(expanded.value)
  next.add(path)
  expanded.value = next
  const s = ensureState(path)
  if (!s.loaded && !s.loading) await scanFolder(path, false, false)
}

function onFolderCollapse(path: string): void {
  const next = new Set(expanded.value)
  next.delete(path)
  expanded.value = next
}

async function scanFolder(path: string, useCursor: boolean, loadAll: boolean): Promise<void> {
  if (!share.conn) return
  const s = ensureState(path)
  if (s.loading) return
  s.loading = true
  s.cancelled = false
  try {
    if (!useCursor) {
      s.keys = []
      s.cursor = null
    }
    const first = await scanOnce(path, s)
    if (s.cancelled) return
    // 首批到位即可上屏；此前 loaded=false 只显示占位。后续批边扫边追加（对齐普通模式）
    s.loaded = true
    if (!loadAll) await scanAuto(path, s, first)
    else await scanAll(path, s)
  } catch (e) {
    if (!s.cancelled) {
      meWarn(e instanceof Error ? e.message : String(e))
      // 失败允许再次展开重试
      s.loaded = false
    }
  } finally {
    s.loading = false
  }
}

// SCAN 可能跨 cursor 重复返回同一键；身份与 sameRedisKey/redisKeyId 一致
function mergeScanKeys(
  prev: RedisKey_Deserialize[],
  batch: RedisKey_Deserialize[],
): RedisKey_Deserialize[] {
  const seen = new Set(prev.map(redisKeyId))
  const merged = prev.slice()
  for (const k of batch) {
    const id = redisKeyId(k)
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(k)
  }
  return sortBy(merged, ['key'])
}

function isKeyUnderFolder(key: string, folder: string): boolean {
  return keyUnderFolder(key, folder, keySep.value)
}

async function scanOnce(path: string, s: FolderScanState): Promise<number> {
  const data = await meCommands.scan(share.conn!.id, {
    match: folderMatchExpr(path, keySep.value),
    type: '',
    cursor: s.cursor,
    exact: false,
    count: SCAN_FETCH_COUNT.value,
  })
  if (s.cancelled) return 0
  s.cursor = data.cursor
  s.keys = mergeScanKeys(s.keys, data.keyList)
  // 返回本批原始条数（含重复），供 auto 阈值累加；勿用去重增量，否则全重复时 fetched 不涨会空转
  return data.keyList.length
}

async function scanAuto(path: string, s: FolderScanState, fetched: number): Promise<void> {
  if (!s.cursor || s.cursor.finished || s.cancelled) return
  if (fetched >= SCAN_FETCH_COUNT.value) return
  const n = await scanOnce(path, s)
  await scanAuto(path, s, fetched + n)
}

async function scanAll(path: string, s: FolderScanState): Promise<void> {
  if (!s.cursor || s.cursor.finished || s.cancelled) return
  await scanOnce(path, s)
  await scanAll(path, s)
}

async function loadMore(path: string, loadAll: boolean): Promise<void> {
  await scanFolder(path, true, loadAll)
}

// 重新扫描目录；loadAll 时扫完全部键，否则按阈值自动续扫
async function reloadFolder(path: string, loadAll = false): Promise<void> {
  const s = ensureState(path)
  if (s.loading) {
    s.cancelled = true
    while (s.loading) await sleep(20)
  }
  s.loaded = false
  const next = new Set(expanded.value)
  next.add(path)
  expanded.value = next
  await scanFolder(path, false, loadAll)
}

// 刷新所有已展开目录（F5）；串行避免多目录同时 cancel/重扫把状态打乱
async function reloadExpanded(): Promise<void> {
  const paths = [...expanded.value]
  for (const p of paths) await reloadFolder(p)
}

function resetScans(): void {
  for (const s of scanMap.values()) s.cancelled = true
  scanMap.clear()
  expanded.value = new Set()
}
// #endregion

// #region 面板操作
// 收藏列表移除某目录时清掉其扫描残留
watch(
  () => props.folders,
  paths => {
    const set = new Set(paths)
    const stale = Array.from(scanMap.keys()).filter(p => !set.has(p))
    if (stale.length === 0) return
    for (const path of stale) {
      const s = scanMap.get(path)
      if (s) s.cancelled = true
      scanMap.delete(path)
      const next = new Set(expanded.value)
      next.delete(path)
      expanded.value = next
    }
  },
)

// 值区删除键后同步上区缓存
function applyKeyDelete(redisKey: RedisKey_Deserialize): void {
  for (const [, s] of scanMap) {
    const next = s.keys.filter(k => !sameRedisKey(k, redisKey))
    if (next.length !== s.keys.length) s.keys = next
  }
}

// 重命名后同步上区缓存：迁出→去掉，迁入→写入，覆盖→去重
function applyKeyRename(oldKey: RedisKey_Deserialize, newKey: RedisKey_Deserialize): void {
  for (const [path, s] of scanMap) {
    const had = s.keys.some(k => sameRedisKey(k, oldKey) || sameRedisKey(k, newKey))
    const under = isKeyUnderFolder(newKey.key, path)
    let next = s.keys.filter(k => !sameRedisKey(k, oldKey) && !sameRedisKey(k, newKey))
    if (s.loaded && under) {
      next = mergeScanKeys(next, [{ key: newKey.key, bytes: newKey.bytes }])
    }
    if (had || (s.loaded && under)) s.keys = next
  }
}

// 多选勾选在 rename 后按 scan 缓存校正（树重建未必触发 checkChange）
function patchCheckedAfterRename(
  checked: RedisKey_Deserialize[],
  oldKey: RedisKey_Deserialize,
  newKey: RedisKey_Deserialize,
): RedisKey_Deserialize[] {
  const stillCached = (rk: RedisKey_Deserialize) => {
    for (const s of scanMap.values()) {
      if (s.keys.some(k => sameRedisKey(k, rk))) return true
    }
    return false
  }
  return checked.flatMap(k => {
    if (!sameRedisKey(k, oldKey) && !sameRedisKey(k, newKey)) return [k]
    const nk = { key: newKey.key, bytes: newKey.bytes }
    return stillCached(nk) ? [nk] : []
  })
}

function onContextFolder(command: string, folder: string): void {
  if (command === 'reloadFolder') void reloadFolder(folder, false)
  else if (command === 'reloadAllFolder') void reloadFolder(folder, true)
  else if (command === 'loadMoreFolder') void loadMore(folder, false)
  else if (command === 'loadAllFolder') void loadMore(folder, true)
  else if (command === 'copyFolder') meCopy(folder)
  else if (command === 'unfavoriteFolder') emit('unfavoriteFolder', folder)
  else emit('contextFolder', command, folder)
}

// 过滤只改子键、path 不变时 KeyTree 不会清勾选；关键字变化时主动回写
watch(kw, () => {
  if (!props.showCheckbox) return
  if (keyTreeRef.value) {
    keyTreeRef.value.clearChecksAndEmit()
  } else {
    // 过滤后上区无树（卸载）时仍要清空父级勾选
    emit('checkChange', [])
    emit('favoriteFolderCheckChange', [])
  }
})

function setCurrentKey(redisKey: RedisKey_Deserialize): void {
  keyTreeRef.value?.setCurrentKey(redisKey)
}

defineExpose({
  resetScans,
  reloadExpanded,
  applyKeyDelete,
  applyKeyRename,
  patchCheckedAfterRename,
  setCurrentKey,
})
// #endregion
</script>

<template>
  <div class="fav-folder-panel">
    <div v-if="folders.length === 0" class="fav-folder-empty">
      {{ t('keyMain.favoriteFolderEmpty') }}
    </div>
    <div v-else-if="visibleFolders.length === 0" class="fav-folder-empty">
      {{ t('keyTree.noData') }}
    </div>
    <KeyTree
      v-else
      ref="keyTreeRef"
      :show-checkbox="showCheckbox"
      :allow-enter-checked-mode="allowEnterCheckedMode"
      :folder-key-groups="folderKeyGroups"
      :folder-load-more-paths="folderLoadMorePaths"
      :folder-loading-paths="folderLoadingPaths"
      :redis-key="share.redisKey"
      :key-show-tree="keyShowTree"
      :sort-by-count="sortByCount"
      :color="color"
      :loading="anyScanning"
      :favorites="favorites"
      :favorite-mode="true"
      @chooseKey="emit('chooseKey', $event)"
      @contextKey="(cmd, key) => emit('contextKey', cmd, key)"
      @contextFolder="onContextFolder"
      @checkChange="emit('checkChange', $event)"
      @favoriteFolderCheckChange="emit('favoriteFolderCheckChange', $event)"
      @folderExpand="path => void onFolderExpand(path)"
      @folderCollapse="onFolderCollapse" />
  </div>
</template>

<style scoped lang="scss">
.fav-folder-panel {
  height: 100%;
  overflow: hidden;
  font-size: var(--el-font-size-base);
}

.fav-folder-empty {
  padding: 16px 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
