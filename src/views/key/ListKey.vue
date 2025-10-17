<script setup>
import {useVirtualList} from '@vueuse/core'
import {computed} from 'vue'

// 共享数据
const share = inject('share')
const canEdit = computed(() => true)

const emit = defineEmits(['chooseKey', 'contextKey'])
const {filterKeyList} = defineProps({
  color: {type: String, default: 'var(--el-color-primary)'},
  redisKey: {type: Object, default: null},
  filterKeyList: {type: Array, default: []},
})

// useVirtualList必须这样才能响应式，可能是个BUG
const items = computed(() => filterKeyList)
const {list, containerProps, wrapperProps} = useVirtualList(
  items, {itemHeight: 18},
)

// 右键点击
const contextMenuKey = ref({})
const meContextRef = useTemplateRef('meContextRef')

function keyContextMenu(e, redisKey) {
  contextMenuKey.value = redisKey
  meContextRef.value.showMenu(e)
}

function handleCommand(command) {
  const redisKey = contextMenuKey.value
  emit('contextKey', command, redisKey)
}
</script>

<template>
  <div v-bind="containerProps" :style="{color: color, height: '100%'}">
    <div v-bind="wrapperProps">
      <div v-for="item in list" :key="item.index"
           @click="emit('chooseKey', item.data)"
           @contextmenu="keyContextMenu($event, item.data)"
           :style="item.data.key === redisKey?.key ? {backgroundColor: 'var(--el-color-info-light-7)'} : {}"
           class="key single-line-ellipsis">
        {{ item.data.key }}
      </div>
    </div>

    <!-- 右键菜单 -->
    <me-context ref="meContextRef" @handle-command="handleCommand">
      <el-dropdown-item command="refreshKey"><me-icon icon="el-icon-refresh"       name="重新载入"/></el-dropdown-item>
      <el-dropdown-item command="copyKey"   ><me-icon icon="el-icon-document-copy" name="复制键名"/></el-dropdown-item>
      <el-dropdown-item command="deleteKey" divided v-if="canEdit"><me-icon icon="el-icon-delete" name="删除键"/></el-dropdown-item>
    </me-context>
  </div>
</template>

<style scoped lang="scss">
.key {
  cursor: pointer;
  font-size: 14px;
  line-height: 14px;
  padding: 3px 4px;

  &:hover {
    background-color: var(--el-color-info-light-7);
  }
}
</style>
