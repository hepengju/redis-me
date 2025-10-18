<script setup>
import RedisKey from './RedisKey.vue'
import RedisTag from './RedisTag.vue'
import {sortBy} from 'lodash'
import {invoke_then} from "@/utils/util.js";
import {mockConnList} from "@/utils/api-mock.js";

// 共享数据
const tabShow = ref(false)
const share = reactive({
  conn: '',     // 当前连接
  connList: [], // 连接列表
  color: 'var(--el-color-primary)',
  redisKey: null,
  tabName: 'info',
  nodeList: []
})

share.connList = mockConnList
provide('share', share)

// 当环境发生变化时，销毁整个redisTag组件（避免状态保留）
watch(() => share.conn, async (newValue) => {
  // 生产环境颜色特殊展示
  share.color = newValue.id.indexOf('cluster') > -1 ? 'var(--el-color-danger)' : 'var(--el-color-primary)'
  await apiNodeList()

  tabShow.value = false
  nextTick(() => {
    tabShow.value = true
  })
})

// 获取节点列表
async function apiNodeList() {
  const res = await invoke_then('node_list', {id: share.conn.id})
  if (res.code == 200) {
    share.nodeList = sortBy(res.data, 'node')
  }
}
</script>

<template>
  <div class="redis-main">
    <el-splitter>
      <!-- 左侧键 -->
      <el-splitter-panel :min="250" size="30%">
        <RedisKey/>
      </el-splitter-panel>

      <!-- 右侧值 -->
      <el-splitter-panel :min="250">
        <RedisTag v-if="tabShow"/>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: 100%;
  //border: 2px solid blue;

  /* 中间分隔面板的样式调整 */
  :deep(.el-splitter-bar) {
    width: 5px !important;

    .el-splitter-bar__dragger-horizontal:before {
      width: 0; // 宽度为0，不显示原始的竖线
      background-color: transparent;
    }
  }

  /* icon图标hover变色 */
  :deep(.icon-btn) {
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}
</style>
