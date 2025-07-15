<script setup>
// 全局对象
import useGlobalStore from '@/utils/store.js'

const global = useGlobalStore()

const {filterKeyList} = defineProps({
  filterKeyList: {type: Array, default: []},
})

// 计算树的数据
const emptyText = ref('没有数据')
const treeData = computed(() => {
  const root = buildTree(filterKeyList)
  root.forEach(node => countLeaves(node))
  return root
})

// 构建树：这个方法是由AI（豆包）生成的
function buildTree(keyList) {
  const root = []
  keyList.forEach(rk => {
    const parts = rk.key.split(':')
    let currentLevel = root
    parts.forEach((part, index) => {
      let node = currentLevel.find(item => item.label === part)
      if (!node) {
        node = {id: part, label: part, children: []}
        currentLevel.push(node)
      }
      if (index < parts.length - 1) {
        currentLevel = node.children
      } else {
        // 叶子节点显示全称且保存原始值
        node.label = rk.key
        node.redisKey = rk
      }
    })
  })
  return root
}

// 统计叶子节点个数
function countLeaves(node) {
  if (node.children.length === 0) {
    // 如果是叶子节点，叶子数量为 1
    node.keyCount = 1;
    return 1;
  }
  let keyCount = 0;
  // 递归统计子节点的叶子数量
  node.children.forEach(child => {
    keyCount += countLeaves(child);
  });
  // 当前节点的叶子数量等于所有子节点叶子数量之和
  node.keyCount = keyCount;
  return keyCount;
}

function getKey(redisKey) {
  global.redisKey = redisKey
}
</script>

<template>
  <el-auto-resizer>
    <template #default="{ height, width }">
      <el-tree-v2 ref="tree" :data="treeData"
                  :style="{'--el-text-color-regular': global.conn?.color,
                           '--el-tree-node-hover-bg-color': 'var(--el-color-info-light-7)'}"
                  :empty-text="emptyText" :height="height" :item-size="20">
        <template #default="{ node }">
          <div @click="getKey(node.data.redisKey)" v-if="node.isLeaf">
            <span>{{ node.label }}</span>
          </div>
          <me-flex v-else style="width: 100%">
            <me-icon :name="node.label" :icon="node.expanded ? 'el-icon-folderOpened' : 'el-icon-folder'"/>
            <div style="color: var(--el-color-info)">[ {{ node.data.keyCount }} ]</div>
          </me-flex>
        </template>
      </el-tree-v2>
    </template>
  </el-auto-resizer>
</template>

<style scoped lang="scss">
.key {
  //width: 100%;
  //font-size: 12px;
  //line-height: 12px;
}
</style>