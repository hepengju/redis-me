<script setup lang="ts">
// #region 导入
import type { TreeNode } from 'element-plus/es/components/tree-v2/src/types'
import { nanoid } from 'nanoid'
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import {
  getConnKeySeparator,
  joinKeyPath,
  keyRelativePath,
  keyUnderFolder,
  splitKeyPath,
} from '@/utils/conn'
import { redisKeyId, sameRedisKey } from '@/utils/redis-key'
import { TREE_KEY_ID_PREFIX } from '@/utils/util'

import KeyMemorySize from './KeyMemorySize.vue'
import KeyTypeTag from './KeyTypeTag.vue'
// #endregion

// #region 核心状态
// 收藏单树节点 id 命名空间，避免同时收藏 A 与 A:B 时子树/根 id 冲突。
// 根：`\0fav\0{path}`；其子：`\0fav\0{path}\0{innerId}`
const FAV_ID_MARK = '\0fav\0'

function favRootTreeId(favPath: string): string {
  return FAV_ID_MARK + favPath
}

function favIdPrefix(favPath: string): string {
  return FAV_ID_MARK + favPath + '\0'
}

const { t } = useI18n()
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)
// 当前连接的树形键分隔符（默认 `:`）
const keySep = computed(() => getConnKeySeparator(share.conn))

defineExpose({ setCurrentKey, clearChecksAndEmit })
const emit = defineEmits([
  'chooseKey',
  'chooseFolder',
  'contextKey',
  'contextFolder',
  'checkChange',
  // 收藏单树：勾选的收藏目录根 path 列表（供批量取消收藏目录）
  'favoriteFolderCheckChange',
  'favoriteKey',
  'unfavoriteKey',
  // 收藏目录根被展开（触发 SCAN）
  'folderExpand',
  // 收藏目录根被折叠
  'folderCollapse',
])
const props = withDefaults(
  defineProps<{
    color?: string
    redisKey?: RedisKey_Deserialize | null
    filterKeyList?: RedisKey_Deserialize[]
    showCheckbox?: boolean
    keyShowTree?: boolean
    sortByCount?: boolean
    loading?: boolean
    favorites?: RedisKey_Deserialize[]
    // 当前库已收藏的目录 path 列表（正常模式星标 / 菜单）
    favoriteFolders?: string[]
    favoriteMode?: boolean
    // 收藏目录下挂键时去掉公共前缀，避免与外层目录行重复
    trimRoot?: string
    // 收藏目录单树：顶层为各收藏 path，children 由其 SCAN 键构建。有值时优先于 filterKeyList 建树。
    folderKeyGroups?: { path: string; keys: RedisKey_Deserialize[]; loaded?: boolean }[]
    // 尚有 SCAN cursor 未扫完的收藏目录 path（右键显示加载更多）
    folderLoadMorePaths?: string[]
    // 正在 SCAN 的收藏目录 path（目录图标换成 loading）
    folderLoadingPaths?: string[]
    // 为 false 时右键不提供「多选模式」（另一区已在多选时）
    allowEnterCheckedMode?: boolean
    // 索引查询的目录只是结果分组，没有 SCAN 游标可续
    searchMode?: boolean
  }>(),
  {
    color: 'var(--el-color-primary)',
    redisKey: null,
    filterKeyList: () => [],
    showCheckbox: false,
    keyShowTree: true,
    sortByCount: true,
    favorites: () => [],
    favoriteFolders: () => [],
    favoriteMode: false,
    trimRoot: '',
    folderKeyGroups: () => [],
    folderLoadMorePaths: () => [],
    folderLoadingPaths: () => [],
    allowEnterCheckedMode: true,
    searchMode: false,
  },
)

// 本地构建的树节点（文件夹 / 键叶子）
interface KeyBuildNode {
  id: string
  label: string
  children: KeyBuildNode[]
  redisKey?: RedisKey_Deserialize
  keyCount?: number
  isRootNode?: boolean
  // 收藏目录面板顶层根
  isFavoriteFolderRoot?: boolean
  // 收藏根对应的真实 path（id 已 namespaced）
  favFolderPath?: string
  // 未 SCAN 前占位，保证根节点可展开
  isPending?: boolean
}

// 右键点击
const contextMenuNode = ref<TreeNode | null>(null)
const meContextRef = useTemplateRef('meContextRef')

// 显示复选框时补充根节点
const rootId = nanoid() + Date.now()
const treeRef = useTemplateRef('tree')
// 用户手动展开的节点 id；同步到 defaultExpandedKeys，data 刷新时避免先折叠再恢复
const expandedKeys = ref<string[]>([])
// #endregion

// #region 计算属性
const useFolderGroups = computed(() => props.folderKeyGroups.length > 0)

const emptyText = computed(() => {
  if (useFolderGroups.value) {
    return props.loading ? t('keyMain.scanning') : t('keyTree.noData')
  }
  return props.filterKeyList.length === 0 && !props.loading
    ? t('keyTree.noData')
    : t('keyMain.scanning')
})

const treeData = computed(() => {
  // 收藏目录单树：顶层为各收藏 path
  if (useFolderGroups.value) {
    return props.folderKeyGroups.map(g => buildFavoriteFolderRoot(g))
  }
  // 列表展示
  if (!props.keyShowTree) {
    return buildList(props.filterKeyList)
  }
  // 树形展示
  const root = buildTree(props.filterKeyList, props.trimRoot)
  root.forEach(node => countLeaves(node))
  // 根节点排序及其子节点排序
  root.sort((n1, n2) => nodesSort(n1, n2))
  root.forEach(node => sortNodeChildrenLoop(node))
  return root
})

const defaultExpandedKeys = computed(() => {
  if (props.showCheckbox) {
    return expandedKeys.value.length > 0 ? [...new Set([rootId, ...expandedKeys.value])] : [rootId]
  }
  return [...expandedKeys.value]
})

const rootTreeData = computed((): KeyBuildNode[] => {
  if (props.showCheckbox) {
    const keyCount = useFolderGroups.value
      ? props.folderKeyGroups.reduce((n, g) => n + g.keys.length, 0)
      : props.filterKeyList.length || 0
    return [
      {
        id: rootId,
        label: 'db' + String(share.conn?.db ?? ''),
        children: treeData.value as KeyBuildNode[],
        keyCount,
        isRootNode: true,
      },
    ]
  }
  return treeData.value as KeyBuildNode[]
})

// 键高度配置
const keyHeight = computed(() => meTauri.settings.keyHeight ?? 20)
// 菜单开关 + 服务端支持 MEMORY USAGE 才显示，避免不支持时还去请求
const showKeyMemory = computed(
  () => !!meTauri.settings.keyShowMemory && share.capabilities.memoryUsageSupported,
)

const isContextNodeFavorited = computed(() => {
  if (!contextMenuNode.value?.isLeaf) return false
  return isFavoritedLocal(contextMenuNode.value.data.redisKey)
})

const isContextFolderFavorited = computed(() => {
  if (!contextMenuNode.value || contextMenuNode.value.isLeaf) return false
  return isFolderFavoritedLocal(String(contextMenuNode.value.key))
})

const isContextFavoriteFolderRoot = computed(() =>
  Boolean(contextMenuNode.value?.data?.isFavoriteFolderRoot),
)

const contextFolderHasMore = computed(() => {
  if (!isContextFavoriteFolderRoot.value || !contextMenuNode.value) return false
  const path =
    (contextMenuNode.value.data as KeyBuildNode).favFolderPath ??
    logicalFolderPath(contextMenuNode.value)
  return props.folderLoadMorePaths.includes(path)
})
// #endregion

// #region 树构建
// 从树节点取出逻辑文件夹 path（供 copy / SCAN / 右键），而非 namespaced id
function logicalFolderPath(node: TreeNode): string {
  const data = node.data as KeyBuildNode | undefined
  if (data?.favFolderPath) return data.favFolderPath
  const key = String(node.key)
  if (key.startsWith(FAV_ID_MARK)) {
    const rest = key.slice(FAV_ID_MARK.length)
    const i = rest.indexOf('\0')
    return i < 0 ? rest : rest.slice(i + 1)
  }
  return key
}

// 收藏目录根：未 SCAN 时挂占位以便展开触发扫描；已加载无子键则 children 为空
function buildFavoriteFolderRoot(g: {
  path: string
  keys: RedisKey_Deserialize[]
  loaded?: boolean
}): KeyBuildNode {
  const idPrefix = favIdPrefix(g.path)
  let children: KeyBuildNode[]
  if (!g.loaded) {
    children = [{ id: idPrefix + 'pending', label: '', children: [], isPending: true }]
  } else if (g.keys.length === 0) {
    children = []
  } else if (!props.keyShowTree) {
    children = buildList(g.keys, idPrefix)
  } else {
    children = buildTree(g.keys, g.path, idPrefix)
    children.forEach(node => countLeaves(node))
    children.sort((n1, n2) => nodesSort(n1, n2))
    children.forEach(node => sortNodeChildrenLoop(node))
  }
  return {
    id: favRootTreeId(g.path),
    label: g.path,
    children,
    // 未 SCAN 完不显示 [0]，避免误导
    keyCount: g.loaded ? g.keys.length : undefined,
    isFavoriteFolderRoot: true,
    favFolderPath: g.path,
  }
}

// 循环方式排序节点的子节点（避免递归栈溢出）
function sortNodeChildrenLoop(rootNode: KeyBuildNode) {
  const stack = [rootNode]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) continue
    if (node.children && node.children.length > 0) {
      node.children.sort((n1, n2) => nodesSort(n1, n2))
      node.children.forEach(child => stack.push(child))
    }
  }
}

function nodesSort(n1: KeyBuildNode, n2: KeyBuildNode) {
  let cmp: number
  if (props.sortByCount) {
    // 文件夹在上面，叶子在下面（将叶子节点的数量归零，避免和只有1个键的文件夹混在一起）
    const n1Count: number = n1.children.length > 0 ? (n1.keyCount ?? 0) : 0
    const n2Count: number = n2.children.length > 0 ? (n2.keyCount ?? 0) : 0
    cmp = n2Count - n1Count
  } else {
    // 保存文件夹在上面，叶子在下面（文件夹的数量为都设置为1）
    const n1Count: number = n1.children.length > 0 ? 1 : 0
    const n2Count: number = n2.children.length > 0 ? 1 : 0
    cmp = n2Count - n1Count
  }
  // 键数量或文件夹/叶子分组相同时按 id 排序
  return cmp === 0 ? (n2.id > n1.id ? -1 : 1) : cmp
}

// 构建树：同层文件夹用 Map 查找，避免 find 线性扫描；idPrefix 用于收藏单树命名空间
function buildTree(keyList: RedisKey_Deserialize[], trim = '', idPrefix = '') {
  const root: KeyBuildNode[] = []
  // 每层 children 数组 → label → 文件夹节点（不含叶子）
  const folderMaps = new WeakMap<KeyBuildNode[], Map<string, KeyBuildNode>>()

  function folderMapOf(level: KeyBuildNode[]): Map<string, KeyBuildNode> {
    let m = folderMaps.get(level)
    if (!m) {
      m = new Map()
      folderMaps.set(level, m)
    }
    return m
  }

  const sep = keySep.value
  keyList.forEach(rk => {
    // trim 时只展示相对路径段，叶子仍挂完整 redisKey
    let pathForParts = rk.key
    if (trim) {
      const rel = keyRelativePath(rk.key, trim, sep)
      if (rel !== null) pathForParts = rel
    }
    const parts = pathForParts === '' ? [''] : splitKeyPath(pathForParts, sep)
    let nowLevel = root
    parts.forEach((part, index) => {
      // 叶子节点：hepengju 这种无分隔符的键直接作为叶子
      if (index === parts.length - 1) {
        const label = part
        let node = { id: idPrefix + TREE_KEY_ID_PREFIX + rk.key, label, children: [], redisKey: rk }
        nowLevel.push(node)
        return
      }
      // 文件夹 id 仍用完整路径（单 sep 拼接），便于展开定位
      const folders = folderMapOf(nowLevel)
      let node = folders.get(part)
      if (!node) {
        const fullParts = trim ? [trim, ...parts.slice(0, index + 1)] : parts.slice(0, index + 1)
        node = { id: idPrefix + joinKeyPath(fullParts, sep), label: part, children: [] }
        nowLevel.push(node)
        folders.set(part, node)
      }
      nowLevel = node.children
    })
  })
  return root
}

// 统计叶子节点个数: 循环方式（豆包） ==> 递归方式在数据量比较大时会栈溢出
function countLeaves(node: KeyBuildNode) {
  const stack = [node]
  const keyCounts = new Map()

  while (stack.length > 0) {
    const nowNode = stack[stack.length - 1]
    if (nowNode.children.every(child => keyCounts.has(child))) {
      stack.pop()
      if (nowNode.children.length === 0) {
        keyCounts.set(nowNode, 1)
      } else {
        let keyCount = 0
        nowNode.children.forEach(child => {
          keyCount += keyCounts.get(child)
        })
        keyCounts.set(nowNode, keyCount)
      }
      nowNode.keyCount = keyCounts.get(nowNode)
    } else {
      nowNode.children.forEach(child => {
        if (!keyCounts.has(child)) {
          stack.push(child)
        }
      })
    }
  }
  return keyCounts.get(node)
}

// 构建树: 仅仅叶子节点（即List显示）
function buildList(keyList: RedisKey_Deserialize[], idPrefix = '') {
  return keyList.map(rk => ({
    id: idPrefix + TREE_KEY_ID_PREFIX + rk.key,
    label: rk.key,
    children: [],
    redisKey: rk,
  }))
}
// #endregion

// #region 面板操作
// 左键点击（收藏根即使无子键也会被树标成 leaf，仍按文件夹处理）
function nodeClick(_data: unknown, node: TreeNode) {
  if (node.data?.isFavoriteFolderRoot || !node.isLeaf) {
    emit('chooseFolder', logicalFolderPath(node))
  } else {
    emit('chooseKey', node.data.redisKey)
  }
}

function nodeContextMenu(e: MouseEvent, _data: unknown, node: TreeNode) {
  // db0根节点 / SCAN 占位不显示上下文
  if (node.data.isRootNode || node.data.isPending) return
  contextMenuNode.value = node
  meContextRef.value?.showMenu(e)
}

function handleCommand(command: string) {
  const ctx = contextMenuNode.value
  if (!ctx) return
  if (ctx.data?.isFavoriteFolderRoot || !ctx.isLeaf) {
    emit('contextFolder', command, logicalFolderPath(ctx))
  } else {
    const redisKey = ctx.data.redisKey as RedisKey_Deserialize
    emit('contextKey', command, redisKey)
  }
}

function handleClose() {
  contextMenuNode.value = null
}

// 右键选中的键, 加入样式
function getNodeClass(node: TreeNode) {
  const clazz = []
  if (
    (node.isLeaf && node.data.redisKey?.key === contextMenuNode.value?.data?.redisKey?.key) ||
    (!node.isLeaf && node.key === contextMenuNode.value?.key)
  ) {
    clazz.push('context-key')
  }
  return clazz
}

function onNodeExpand(_data: unknown, node: TreeNode) {
  const key = String(node.key)
  if (!expandedKeys.value.includes(key)) {
    expandedKeys.value = [...expandedKeys.value, key]
  }
  if (node.data?.isFavoriteFolderRoot) {
    emit('folderExpand', node.data.favFolderPath ?? logicalFolderPath(node))
  }
}

// 判断 key 是否属于 folderKey 文件夹或其子树（含叶子键）。
// 收藏 namespaced id 只用 `\0` 分隔判断，避免折叠 `\0fav\0A` 误伤根 `\0fav\0A:B`。
function isUnderFolder(key: string, folderKey: string): boolean {
  if (key === folderKey) return true
  if (folderKey.startsWith(FAV_ID_MARK)) {
    return key.startsWith(folderKey + '\0')
  }
  const sep = keySep.value
  if (keyUnderFolder(key, folderKey, sep)) return true
  if (key.startsWith(TREE_KEY_ID_PREFIX)) {
    const redisKey = key.slice(TREE_KEY_ID_PREFIX.length)
    return keyUnderFolder(redisKey, folderKey, sep)
  }
  return false
}

function onNodeCollapse(_data: unknown, node: TreeNode) {
  const key = String(node.key)
  // 折叠父节点时子节点不会触发 collapse，需一并移除，否则刷新后会因 setExpandedKeys 沿父链展开而"弹回"
  if (key === rootId) {
    expandedKeys.value = []
  } else {
    expandedKeys.value = expandedKeys.value.filter(k => !isUnderFolder(k, key))
  }
  if (node.data?.isFavoriteFolderRoot) {
    emit('folderCollapse', node.data.favFolderPath ?? logicalFolderPath(node))
  }
}

// 程序清空勾选并回写父级（setCheckedKeys 不会触发 check-change）
function clearChecksAndEmit(): void {
  treeRef.value?.setCheckedKeys([])
  emit('checkChange', [])
  if (useFolderGroups.value) emit('favoriteFolderCheckChange', [])
}

// 多选清空：切换多选、换键列表、或收藏目录 path 集合变化（勿在 SCAN 追加键时清）
watch(
  () =>
    [
      props.showCheckbox,
      useFolderGroups.value
        ? props.folderKeyGroups.map(g => g.path).join('\0')
        : props.filterKeyList,
    ] as const,
  () => {
    clearChecksAndEmit()
  },
)

// 获取选中的节点键；收藏单树额外上报勾选的收藏目录根
function checkChange() {
  const nodes = (treeRef.value?.getCheckedNodes(true) ?? []) as KeyBuildNode[]
  const redisKeys = nodes.map(n => n.redisKey).filter((k): k is RedisKey_Deserialize => k != null)
  if (useFolderGroups.value) {
    const seen = new Set<string>()
    const unique: RedisKey_Deserialize[] = []
    for (const k of redisKeys) {
      const id = redisKeyId(k)
      if (seen.has(id)) continue
      seen.add(id)
      unique.push(k)
    }
    emit('checkChange', unique)
    const all = (treeRef.value?.getCheckedNodes(false) ?? []) as KeyBuildNode[]
    const paths = all
      .filter(n => n.isFavoriteFolderRoot && n.favFolderPath)
      .map(n => n.favFolderPath!)
    emit('favoriteFolderCheckChange', paths)
    return
  }
  emit('checkChange', redisKeys)
}

// 定位键时优先落在最长匹配的已加载收藏目录下
function resolveFavPathForKey(key: string): string | null {
  const sep = keySep.value
  let best: string | null = null
  for (const g of props.folderKeyGroups) {
    if (!g.loaded) continue
    if (keyUnderFolder(key, g.path, sep)) {
      if (!best || g.path.length > best.length) best = g.path
    }
  }
  return best
}

// 设置选中节点并滚动到视口中间（新建键 / 键值页定位复用）
function setCurrentKey(redisKey: RedisKey_Deserialize) {
  const sep = keySep.value
  const favPath = useFolderGroups.value ? resolveFavPathForKey(redisKey.key) : null
  const idPrefix = favPath ? favIdPrefix(favPath) : ''
  const nodeId = idPrefix + TREE_KEY_ID_PREFIX + redisKey.key

  // 展开父节点并同步 expandedKeys，等 flatten 更新后再 scroll
  const parentIds: string[] = []
  if (favPath) {
    parentIds.push(favRootTreeId(favPath))
    if (props.keyShowTree) {
      const rel = keyRelativePath(redisKey.key, favPath, sep)
      const parts = rel === null || rel === '' ? [] : splitKeyPath(rel, sep)
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = joinKeyPath([favPath, ...parts.slice(0, i + 1)], sep)
        parentIds.push(idPrefix + folderPath)
      }
    }
  } else {
    const parts = splitKeyPath(redisKey.key, sep)
    for (let i = 0; i < parts.length - 1; i++) {
      parentIds.push(joinKeyPath(parts.slice(0, i + 1), sep))
    }
  }
  if (parentIds.length > 0) {
    const nextExpanded = [...expandedKeys.value]
    let changed = false
    for (const parentId of parentIds) {
      if (!nextExpanded.includes(parentId)) {
        nextExpanded.push(parentId)
        changed = true
      }
    }
    if (changed) expandedKeys.value = nextExpanded
  }

  nextTick(() => {
    treeRef.value?.scrollToNode(nodeId, 'center')
    treeRef.value?.setCurrentKey(nodeId)
  })
}

function isFavoritedLocal(redisKey: RedisKey_Deserialize | undefined): boolean {
  if (!redisKey) return false
  return props.favorites.some(f => sameRedisKey(f, redisKey))
}

function isFolderFavoritedLocal(folder: string | undefined): boolean {
  if (!folder) return false
  return props.favoriteFolders.includes(folder)
}

// 收藏目录根是否正在 SCAN
function isFavoriteFolderLoading(node: TreeNode): boolean {
  if (!node.data?.isFavoriteFolderRoot) return false
  const path = node.data.favFolderPath ?? logicalFolderPath(node)
  return props.folderLoadingPaths.includes(path)
}

// 收藏目录用实心 me-icon；普通目录仍用 Element 线框图标；SCAN 中换 loading
function folderIconName(node: TreeNode): string {
  if (node.data.isRootNode) return 'me-icon-db'
  if (isFavoriteFolderLoading(node)) return 'el-icon-loading'
  const favorited =
    node.data.isFavoriteFolderRoot ||
    (!props.favoriteMode && isFolderFavoritedLocal(String(node.key)))
  if (favorited) {
    return node.expanded ? 'me-icon-folder-opened-favorited' : 'me-icon-folder-favorited'
  }
  return node.expanded ? 'el-icon-folder-opened' : 'el-icon-folder'
}
// #endregion
</script>

<template>
  <el-auto-resizer>
    <template #default="{ height }">
      <el-tree-v2
        ref="tree"
        :class="{ 'is-key-list': !keyShowTree && !showCheckbox && !useFolderGroups }"
        :data="rootTreeData"
        :default-expanded-keys="defaultExpandedKeys"
        @check-change="checkChange"
        @node-click="nodeClick"
        @node-expand="onNodeExpand"
        @node-collapse="onNodeCollapse"
        @node-contextmenu="nodeContextMenu"
        highlight-current
        :style="{
          '--el-text-color-regular': color,
          '--el-tree-node-hover-bg-color': 'var(--el-color-info-light-8)',
        }"
        :empty-text="emptyText"
        :height="height"
        :item-size="keyHeight"
        :show-checkbox="showCheckbox">
        <template #default="{ node }">
          <!-- 未 SCAN 占位：不展示文案，仅撑开可展开根 -->
          <div v-if="node.data.isPending" class="folder-pending" />
          <!-- 收藏根无子键时树会标成 leaf，仍按文件夹行渲染 -->
          <div
            v-else-if="node.isLeaf && !node.data.isFavoriteFolderRoot"
            :class="getNodeClass(node)"
            class="me-flex key-leaf-row">
            <div class="me-flex key-leaf-main">
              <KeyTypeTag :redis-key="node.data.redisKey" />
              <div class="key-leaf-label">
                <span v-if="node.label">{{ node.label }}</span>
                <span v-else style="color: var(--el-color-info-light-3)">[EMPTY]</span>
              </div>
            </div>
            <div
              v-if="showKeyMemory || isFavoritedLocal(node.data.redisKey)"
              class="key-leaf-actions"
              :class="{ 'is-star-only': !showKeyMemory }">
              <me-icon
                v-if="isFavoritedLocal(node.data.redisKey)"
                icon="el-icon-star-filled"
                style="color: #f7ba2a"
                class="key-favorite-btn"
                @click.stop="emit('contextKey', 'unfavoriteKey', node.data.redisKey)" />
              <KeyMemorySize v-if="showKeyMemory" :redis-key="node.data.redisKey" />
            </div>
          </div>
          <div v-else :class="getNodeClass(node)" class="me-flex folder-row">
            <!-- 已收藏 / 收藏目录根：实心金色文件夹；SCAN 中换 loading 并旋转（不着金色） -->
            <me-icon
              class="folder-icon"
              :class="{
                rotating: isFavoriteFolderLoading(node),
                'is-favorited':
                  !node.data.isRootNode &&
                  !isFavoriteFolderLoading(node) &&
                  (node.data.isFavoriteFolderRoot ||
                    (!favoriteMode && isFolderFavoritedLocal(String(node.key)))),
              }"
              :icon="folderIconName(node)" />
            <div class="folder-label">{{ node.label }}</div>
            <div v-if="node.data.keyCount != null" class="folder-count">
              [ {{ node.data.keyCount }} ]
            </div>
          </div>
        </template>
      </el-tree-v2>

      <!-- 右键按键/目录两大块；收藏与普通的小差异用 v-if -->
      <me-context ref="meContextRef" @handle-command="handleCommand" @handle-close="handleClose">
        <!-- 键（收藏目录根无子键时也是 leaf，归目录菜单） -->
        <template v-if="contextMenuNode?.isLeaf && !isContextFavoriteFolderRoot">
          <!-- 仅普通模式提供从键新建 -->
          <el-dropdown-item v-if="!favoriteMode && canEdit" command="addKey">
            <me-icon icon="el-icon-circle-plus" :name="t('keyTree.addKey')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="!showCheckbox && allowEnterCheckedMode" command="checkedMode">
            <me-icon icon="me-icon-checked" :name="t('keyMain.checkedMode')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="showCheckbox" command="exitCheckedMode">
            <me-icon icon="el-icon-circle-close" :name="t('keyMain.exitCheckedMode')" />
          </el-dropdown-item>
          <el-dropdown-item command="copyKey">
            <me-icon icon="el-icon-document-copy" :name="t('keyTree.copyKey')" />
          </el-dropdown-item>
          <el-dropdown-item command="copyAsCommand">
            <me-icon icon="me-icon-copy-command" :name="t('redisValue.copyAsCommand')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="canEdit" command="renameKey">
            <me-icon icon="el-icon-edit" :name="t('redisValue.renameKey')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="canEdit" command="duplicateKey">
            <me-icon icon="el-icon-copy-document" :name="t('redisValue.duplicateKey')" />
          </el-dropdown-item>
          <el-dropdown-item :command="isContextNodeFavorited ? 'unfavoriteKey' : 'favoriteKey'">
            <me-icon
              icon="el-icon-star-filled"
              :name="
                isContextNodeFavorited ? t('keyTree.unfavoriteKey') : t('keyTree.favoriteKey')
              " />
          </el-dropdown-item>
          <!-- 删除置底并用分割线与上方操作区分 -->
          <el-dropdown-item
            v-if="canEdit && !showCheckbox && !favoriteMode"
            command="deleteKey"
            divided>
            <me-icon icon="el-icon-delete" :name="t('keyTree.deleteKey')" />
          </el-dropdown-item>
        </template>

        <!-- 目录（含收藏目录根） -->
        <template v-else>
          <!-- 仅收藏目录根：加载更多/重新加载置顶 -->
          <el-dropdown-item
            v-if="isContextFavoriteFolderRoot && contextFolderHasMore"
            command="loadMoreFolder">
            <me-icon icon="me-icon-load-more" :name="t('keyMain.loadMore')" />
          </el-dropdown-item>
          <el-dropdown-item
            v-if="isContextFavoriteFolderRoot && contextFolderHasMore"
            command="loadAllFolder">
            <me-icon icon="me-icon-load-all" :name="t('keyMain.loadAll')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="isContextFavoriteFolderRoot" command="reloadFolder">
            <me-icon icon="el-icon-refresh" :name="t('keyTree.reloadFolder')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="isContextFavoriteFolderRoot" command="reloadAllFolder">
            <me-icon icon="me-icon-search-all" :name="t('keyTree.reloadAllFolder')" />
          </el-dropdown-item>

          <el-dropdown-item v-if="canEdit" command="addKey" :divided="isContextFavoriteFolderRoot">
            <me-icon icon="el-icon-circle-plus" :name="t('keyTree.addKey')" />
          </el-dropdown-item>
          <el-dropdown-item command="copyFolder" :divided="isContextFavoriteFolderRoot && !canEdit">
            <me-icon icon="el-icon-document-copy" :name="t('keyTree.copyFolder')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="!showCheckbox && allowEnterCheckedMode" command="checkedMode">
            <me-icon icon="me-icon-checked" :name="t('keyMain.checkedMode')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="showCheckbox" command="exitCheckedMode">
            <me-icon icon="el-icon-circle-close" :name="t('keyMain.exitCheckedMode')" />
          </el-dropdown-item>

          <!-- 收藏目录根：取消收藏；普通模式目录：收藏/取消 -->
          <el-dropdown-item v-if="isContextFavoriteFolderRoot" command="unfavoriteFolder">
            <me-icon icon="el-icon-star-filled" :name="t('keyTree.unfavoriteFolder')" />
          </el-dropdown-item>
          <el-dropdown-item
            v-else-if="!favoriteMode"
            :command="isContextFolderFavorited ? 'unfavoriteFolder' : 'favoriteFolder'">
            <me-icon
              icon="el-icon-star-filled"
              :name="
                isContextFolderFavorited
                  ? t('keyTree.unfavoriteFolder')
                  : t('keyTree.favoriteFolder')
              " />
          </el-dropdown-item>

          <!-- 仅普通模式：只加载该目录 / 加载目录所有（后者扫完全部键） -->
          <el-dropdown-item
            v-if="!favoriteMode && !isContextFavoriteFolderRoot && !searchMode"
            command="loadFolder"
            divided>
            <me-icon icon="el-icon-search" :name="t('keyTree.loadFolder')" />
          </el-dropdown-item>
          <el-dropdown-item
            v-if="!favoriteMode && !isContextFavoriteFolderRoot && !searchMode"
            command="loadFolderAll">
            <me-icon icon="me-icon-search-all" :name="t('keyTree.loadFolderAll')" />
          </el-dropdown-item>
          <!-- 收藏模式（含根）在上方项后分隔；普通模式已有「只加载」分隔 -->
          <el-dropdown-item
            v-if="share.capabilities.memoryUsageSupported"
            command="memoryUsage"
            :divided="favoriteMode || isContextFavoriteFolderRoot || searchMode">
            <me-icon icon="me-icon-memory" :name="t('keyTree.memoryUsage')" />
          </el-dropdown-item>
          <el-dropdown-item command="exportFolder" :disabled="share.exportImporting" divided>
            <me-icon icon="el-icon-upload" :name="t('keyTree.exportFolder')" />
          </el-dropdown-item>
          <el-dropdown-item v-if="canEdit" command="deleteFolder" :disabled="share.exportImporting">
            <me-icon icon="el-icon-delete" :name="t('keyTree.deleteFolder')" />
          </el-dropdown-item>
        </template>
      </me-context>
    </template>
  </el-auto-resizer>
</template>

<style scoped lang="scss">
/* 高亮当前行的颜色 */
:deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) {
  background-color: var(--el-color-info-light-8);
}

/* 自定义节点可收缩，长名才能 ellipsis，右侧数量/图标不被挤出 */
:deep(.el-tree-node__content) {
  overflow: hidden;
}

/* 右键选中的键 */
:deep(.context-key) {
  outline: 1px dashed var(--el-color-primary);
  outline-offset: 1px;
}

/* 平铺键列表没有目录。藏掉只占位的叶子箭头。收藏目录树仍要展开箭头，不走这套 */
.is-key-list :deep(.el-tree-node__expand-icon) {
  display: none;
}

.is-key-list .key-leaf-row {
  padding-left: 6px;
}

/* 占满 content 剩余宽度（勿用 width:100%，会和展开图标叠宽溢出） */
.key-leaf-row,
.folder-row {
  flex: 1;
  min-width: 0;
  align-items: center;
  overflow: hidden;
}

.key-leaf-main {
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}

.key-leaf-main :deep(.el-tag) {
  flex-shrink: 0;
}

.key-leaf-label,
.folder-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.key-leaf-label {
  margin-left: 5px;
}

.folder-icon {
  flex-shrink: 0;

  &.is-favorited {
    color: #f7ba2a;
  }

  &.rotating {
    animation: folder-icon-rotate 1s linear infinite;
  }
}

@keyframes folder-icon-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.folder-label {
  margin: 0 5px;
}

/* 数量区固定右侧；操作图标右缘大致对齐到 [ n ] 的最后一个数字 */
.folder-count {
  flex-shrink: 0;
  margin-right: 10px;
  color: var(--el-color-info);
}

.folder-pending {
  flex: 1;
  min-width: 0;
  height: 100%;
}

/* 开内存：右缘与目录 [ n ] 的括号对齐。关内存：树形 16px 对齐数字；平铺没有括号，8px 靠右 */
.key-leaf-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-right: 10px;

  &.is-star-only {
    margin-right: 16px;
  }
}

.is-key-list .key-leaf-actions.is-star-only {
  margin-right: 8px;
}

/* 收藏星标图标 */
.key-favorite-btn {
  flex-shrink: 0;
  font-size: 14px;
}

/*  键类型TAG设置 */
:deep(.el-tag--small) {
  height: 14px;
  width: 14px;
  padding: 0 4px;
  font-size: 10px;
}
</style>
