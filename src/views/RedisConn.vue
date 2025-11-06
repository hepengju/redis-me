<script setup>
import {invoke_then, PREDEFINE_COLORS} from '@/utils/util.js'
import SaveConn from '@/views/ext/SaveConn.vue'
import {nextTick, useTemplateRef} from 'vue'
import {debounce} from "lodash";
import {Sortable} from 'sortablejs'
import {ElMessageBox} from "element-plus";

const share = inject('share')

const keyword = ref('')
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return share.connList.filter(row => !key
      || row.name?.toLowerCase().indexOf(key) > -1
      || row.host?.toLowerCase().indexOf(key) > -1
  )
})

const connRef = useTemplateRef('conn')
const dialog = reactive({
  conn: false
})

// 新增连接
function addConn() {
  dialog.conn = true
  nextTick(() => connRef.value.open('add'))
}

// 复制连接
function copyConn(conn) {
  dialog.conn = true
  nextTick(() => connRef.value.open('add', conn))
}

// 编辑连接
function editConn(conn) {
  dialog.conn = true
  nextTick(() => connRef.value.open('edit', conn))
}

// 删除连接
function deleteConn(conn) {
  ElMessageBox.confirm(
      `确定删除连接【${conn.name}】吗？`,
      '提示',
      {type: 'warning'},
  ).then(async () => {
    const index = share.connList.indexOf(conn)
    if (index > -1) {
      share.connList.splice(index, 1)
    }
  }).catch(() => {})
}

// 选中连接: 添加防抖函数，避免连接不可用时多次点击导致的多次报错
const selectConn = debounce(async (conn) => {
  // 测试连接成功后再发送所有连接信息到后端，AppMain中监控连接变化自动处理
  await invoke_then('test_conn', {redisConn: conn})
  share.conn = conn
}, 200)

// 单元格样式: 颜色显示
function cellStyle({row}) {
  if (row.color) return {color: row.color} // 优先考虑列中定义的颜色
}

// 行可拖拽 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// https://sortablejs.com/options
const table = useTemplateRef('table')
// 正常浏览器中式可以的，但tauri中不支持
// 原因: tauri v2里的配置文件默认监听了tauri的webview的拖拽功能，导致了HTML5的拖拽功能失效。
// 参考: https://owl.xylib.top/posts/tauri-drag-drop
function rowDrag() {
  Sortable.create(
      table.value.$el.querySelector('.el-table__body-wrapper tbody'),
      {
        // handle：selector 格式为简单css选择器的字符串，使列表单元中符合选择器的元素成为拖动的手柄，只有按住拖动手柄才能使列表单元进行拖动；
        handle: '.drag-handle',
        onEnd: ({oldIndex, newIndex}) => {
          console.log('oldIndex:', oldIndex, 'newIndex:', newIndex)
          const dragRow = share.connList.splice(oldIndex, 1)[0]
          share.connList.splice(newIndex, 0, dragRow)
        }
      }
  )
}
onMounted(() => rowDrag())
// rowDrag()

// 扩展功能
function handleCommand(command){
  if (command === 'export') {

  } else if (command === 'import') {

  }
}
</script>

<template>
  <div class="redis-conn">
    <div class="me-flex header">
      <div>
        <el-button icon="el-icon-plus" type="primary" @click="addConn">新增连接</el-button>
      </div>
      <div>
        <el-dropdown placement="bottom-start" @command="handleCommand" style="margin-right: 10px">
          <el-button>...</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="export" :disabled="share.connList.length === 0 ">
                <me-icon name="导出" icon="el-icon-upload"/>
              </el-dropdown-item>
              <el-dropdown-item command="import">
                <me-icon name="导入" icon="el-icon-download"/>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-input v-model="keyword" placeholder="模糊筛选（名称、主机）" style="width: 300px; margin-right: 10px" clearable/>
      </div>
    </div>
    <el-table ref="table"
              :data="filterDataList"
              :cell-style="cellStyle"
              @row-dblclick="selectConn"
              border stripe
              height="100%">
      <el-table-column label="#" type="index" width="50" align="center" class-name="drag-handle"/>
      <el-table-column label="颜色" prop="color" width="60">
        <template #default="scope">
          <el-color-picker size="small" v-model="scope.row.color" :predefine="PREDEFINE_COLORS"/>
        </template>
      </el-table-column>
      <el-table-column label="名称" prop="name" show-overflow-tooltip>
        <template #default="scope">
          <div style="display: flex">
            <el-link :underline="'never'" type="primary"
                     @click="selectConn(scope.row)"
                     :style="{'--el-link-text-color': scope.row.color}">
              <me-icon icon="el-icon-connection" :name="scope.row.name"/>
            </el-link>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="主机端口" prop="host" width="160" show-overflow-tooltip>
        <template #default="scope">
          {{ scope.row.host + ':' + scope.row.port }}
        </template>
      </el-table-column>
      <el-table-column label="其他属性" width="180">
        <template #default="scope">
          <el-checkbox disabled size="small" v-model="scope.row.cluster">集群</el-checkbox>
          <el-checkbox disabled size="small" v-model="scope.row.ssl">SSL</el-checkbox>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right" align="center">
        <template #default="scope">
          <div class="me-flex">
            <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn" @click="copyConn(scope.row) "/>
            <me-icon info="编辑" icon="el-icon-edit"          class="icon-btn" @click="editConn(scope.row)"/>
            <me-icon info="删除" icon="el-icon-delete"        class="icon-btn" @click="deleteConn(scope.row)"/>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <SaveConn ref="conn" v-if="dialog.conn" @closed="dialog.conn = false"/>
  </div>
</template>

<style scoped lang="scss">
.redis-conn {
  //border: 2px solid red;
  height: 100%;
  display: flex;
  flex-direction: column;

  .header {
    margin: 0px 0 10px 0px;
  }

  :deep(.drag-handle) {
    cursor: move;
  }

  :deep(.sortable-ghost) {
    background-color: var(--el-color-primary-light-8);
  }
}
</style>