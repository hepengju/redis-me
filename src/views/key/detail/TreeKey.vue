<script setup>
// 全局对象
import useGlobalStore from '@/utils/store.js'

const global = useGlobalStore()

const {filterKeyList} = defineProps({
  filterKeyList: {type: Array, default: []},
})

const emptyText = ref('没有数据')
const treeData = computed(() => buildTree(filterKeyList))

// 这个方法是由AI（豆包）生成的
function buildTree(keyList) {
  const root = []
  keyList.forEach(rk => {
    const parts = rk.key.split(':')
    let currentLevel = root
    parts.forEach((part, index) => {
      let node = currentLevel.find(item => item.label === part)
      if (!node) {
        node = {
          id: part,
          label: part,
          children: [],
        }
        currentLevel.push(node)
      }
      if (index < parts.length - 1) {
        currentLevel = node.children
      } else {
        // 最后的叶子节点显示全称且保存原始值
        node.label = rk.key
        node.raw = rk
      }
    })
  })
  return root
}

function getKey(item) {
  global.redisKey = item
}
</script>

<template>
  <div :style="{color: global.conn?.color, height: '100%'}">
    <el-auto-resizer>
      <template #default="{ height, width }">
        <el-tree-v2 :data="treeData" :empty-text="emptyText" :height="height">
          <template #default="{ node }">
            <div @click="getKey(node.raw)" v-if="node.isLeaf"
                 class="key single-line-ellipsis">
              <span>{{ node.label }}</span>
            </div>
            <me-flex v-else>
              <me-icon :name="node.label"
                       :icon="node.expanded ? 'el-icon-folderOpened' : 'el-icon-folder'"/>
              <div>( {{node.children.length}} )</div>
            </me-flex>
            <!--            <el-icon class="node-icon" :class="{ 'is-leaf': node.isLeaf }">
              <el-icon-document v-if="node.isLeaf" />
              <el-icon-folder v-else-if="!node.expanded" />
              <el-icon-folderOpened v-else />
            </el-icon>
            <span style="margin-left: 5px">{{ node.label }}</span>-->
          </template>
        </el-tree-v2>
      </template>
    </el-auto-resizer>
  </div>
</template>

<style scoped lang="scss">
.key {
  cursor: pointer;
  font-size: 12px;
  line-height: 12px;
  padding: 3px;

  &:hover {
    background-color: var(--el-color-info-light-7);
  }
}
</style>