<script setup>
import {computed, ref} from 'vue'

// 共享数据
const share = inject('share')
const canEdit = computed(() => true)

const emit = defineEmits(['chooseKey', 'chooseFolder', 'contextKey', 'contextFolder'])
const {filterKeyList} = defineProps({
  color: {type: String, default: 'var(--el-color-primary)'},
  redisKey: {type: Object, default: null},
  filterKeyList: {type: Array, default: []},
})

// 左键点击
function nodeClick(_data, node){
  if (node.isLeaf) {
    emit('chooseKey', node.data.redisKey)
  } else {
    emit('chooseFolder', node.key)
  }
}

// 右键点击
const contextMenuNode = ref({})
const meContextRef = useTemplateRef('meContextRef')
function nodeContextMenu(e, _data, node) {
  contextMenuNode.value = node
  meContextRef.value.showMenu(e)
}
function handleCommand(command) {
  if (contextMenuNode.value.isLeaf) {
    const redisKey = contextMenuNode.value.data.redisKey
    emit('contextKey', command, redisKey)
  } else {
    const folder = contextMenuNode.value.key
    emit('contextFolder', command, folder)
  }
}

function handleClose(){
  contextMenuNode.value = {}
}

function getNodeClass(node){
  const clazz = []
  if (node.isLeaf && node.data.redisKey.key === contextMenuNode.value?.data?.redisKey?.key
  || !node.isLeaf && node.key == contextMenuNode.value?.key) {
    clazz.push('context-key')
  }
  return clazz
}

// 计算树的数据
const emptyText = ref('没有数据')
const treeData = computed(() => {
  const root = buildTree(filterKeyList)
  root.forEach(node => countLeaves(node))
  // 排序: 目录下的键个数，名称
  root.sort((n1, n2) =>  n2.keyCount - n1.keyCount === 0 ? (n2.id > n1.id ? -1 : 1) : n2.keyCount - n1.keyCount)
  return root
})

// 构建树：这个方法是由AI（豆包）生成的，非常不赖！
function buildTree(keyList) {
  const root = []
  keyList.forEach(rk => {
    const parts = rk.key.split(/:+/)
    let nowLevel = root
    parts.forEach((part, index) => {
      let node = nowLevel.find(item => item.label === part)
      if (!node) {
        // 避免叶子节点的id与部分非叶子节点一致
        node = {id: parts.slice(0, index + 1).join(':'), label: part, children: []}
        nowLevel.push(node)
      }
      if (index < parts.length - 1) {
        nowLevel = node.children
      } else {
        // 叶子节点显示全称且保存原始值
        node.id = 'leaf-' + rk.key
        node.label = rk.key
        node.redisKey = rk
      }
    })
  })
  return root
}

// 统计叶子节点个数: 循环方式（豆包）  ==> 递归方式在数据量比较大时会栈溢出
function countLeaves(node) {
  // 初始化一个栈，将根节点压入栈中
  const stack = [node]
  // 用于存储每个节点的叶子节点数量
  const keyCounts = new Map()

  while (stack.length > 0) {
    // 取出栈顶节点
    const nowNode = stack[stack.length - 1]

    // 如果当前节点的所有子节点都已经处理过
    if (nowNode.children.every(child => keyCounts.has(child))) {
      // 弹出栈顶节点
      stack.pop()
      if (nowNode.children.length === 0) {
        // 如果是叶子节点，叶子数量为 1
        keyCounts.set(nowNode, 1)
      } else {
        // 计算当前节点的叶子节点数量，等于所有子节点叶子节点数量之和
        let keyCount = 0
        nowNode.children.forEach(child => {
          keyCount += keyCounts.get(child)
        })
        keyCounts.set(nowNode, keyCount)
      }
      // 将计算好的叶子节点数量赋值给节点的 keyCount 属性
      nowNode.keyCount = keyCounts.get(nowNode)
    } else {
      // 如果当前节点的子节点还有未处理的，将未处理的子节点压入栈中
      nowNode.children.forEach(child => {
        if (!keyCounts.has(child)) {
          stack.push(child)
        }
      })
    }
  }
  // 返回根节点的叶子节点数量
  return keyCounts.get(node)
}


</script>

<template>
  <el-auto-resizer>
    <template #default="{ height }">
      <el-tree-v2 ref="tree" :data="treeData"
                  @node-click="nodeClick"
                  @node-contextmenu="nodeContextMenu"
                  highlight-current
                  :style="{'--el-text-color-regular': color,
                           '--el-tree-node-hover-bg-color': 'var(--el-color-info-light-8)'}"
                  :empty-text="emptyText" :height="height" :item-size="20">
        <template #default="{ node }">
          <div style="width: 100%" v-if="node.isLeaf" :class="getNodeClass(node)">
            {{ node.label }}
          </div>
          <div class="me-flex" v-else style="width: 100%" :class="getNodeClass(node)">
            <me-icon :name="node.label" :icon="node.expanded ? 'el-icon-folderOpened' : 'el-icon-folder'"/>
            <div style="color: var(--el-color-info); margin-right: 10px">[ {{ node.data.keyCount }} ]</div>
          </div>
        </template>
      </el-tree-v2>

      <!-- 右键菜单 -->
      <me-context ref="meContextRef" @handle-command="handleCommand" @handle-close="handleClose">
        <template v-if="contextMenuNode.isLeaf">
          <el-dropdown-item command="refreshKey"><me-icon icon="el-icon-refresh"       name="重新载入"/></el-dropdown-item>
          <el-dropdown-item command="copyKey"   ><me-icon icon="el-icon-document-copy" name="复制键名"/></el-dropdown-item>
          <el-dropdown-item command="deleteKey" divided v-if="canEdit"><me-icon icon="el-icon-delete" name="删除键"/></el-dropdown-item>
        </template>
        <template v-else>
          <el-dropdown-item command="addKey"    v-if="canEdit"><me-icon icon="el-icon-circle-plus"   name="添加新键"/></el-dropdown-item>
          <el-dropdown-item command="copyFolder"><me-icon icon="el-icon-document-copy" name="复制路径"/></el-dropdown-item>
          <el-dropdown-item command="loadFolder" divided><me-icon icon="el-icon-search" name="只加载该目录"/></el-dropdown-item>
          <el-dropdown-item command="memoryUsage" v-if="canEdit"><me-icon icon="me-icon-memory" name="目录内存分析"/></el-dropdown-item>
          <el-dropdown-item command="deleteFolder" divided v-if="canEdit"><me-icon icon="el-icon-delete" name="批量删除键"/></el-dropdown-item>
        </template>
      </me-context>
    </template>
  </el-auto-resizer>
</template>

<style scoped lang="scss">
/* 高亮当前行的颜色 */
:deep(.el-tree--highlight-current .el-tree-node.is-current>.el-tree-node__content) {
  background-color: var(--el-color-info-light-8);
}

/* 右键选中的键 */
:deep(.context-key) {
  outline: 1px dashed var(--el-color-primary);
  outline-offset: 1px;
}
</style>