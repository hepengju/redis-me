<script setup>
import {apiConnList} from '@/utils/api.js'
import {invoke_then, PREDEFINE_COLORS} from '@/utils/util.js'
import SaveConn from '@/views/ext/SaveConn.vue'
import {nextTick, useTemplateRef} from 'vue'
import {cloneDeep} from "lodash";
import {nanoid} from "nanoid";
import {Sortable} from 'sortablejs'

const share = inject('share')

// 连接列表
share.connList = apiConnList()

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

// 编辑连接
function editConn(conn) {
  dialog.conn = true
  nextTick(() => connRef.value.open('edit', conn))
}

// 复制连接
function copyConn(conn) {
  dialog.conn = true
  const newConn = cloneDeep(conn)
  newConn.id = nanoid()
  newConn.name = conn.name + '-副本'
  nextTick(() => connRef.value.open('add', newConn))
}

// 删除连接
function deleteConn(conn) {
  const index = share.connList.indexOf(conn)
  if (index > -1) {
    share.connList.splice(index, 1)
  }
}

// 选中连接
async function selectConn(conn) {
  await invoke_then('conn_list', {param: share.connList})
  share.conn = conn
}

// 单元格样式: 颜色显示
function cellStyle({row}) {
  if (row.color) return {color: row.color} // 优先考虑列中定义的颜色
}

// 行可拖拽 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// https://sortablejs.com/options
const table = useTemplateRef('table')

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
</script>

<template>
  <div class="redis-conn">
    <div class="me-flex header">
      <div>
        <el-button icon="el-icon-plus" type="primary" @click="addConn">新增连接</el-button>
      </div>
      <div>
        <el-input v-model="keyword" placeholder="模糊筛选（名称、主机）" style="width: 300px; margin-right: 10px"
                  clearable/>
      </div>
    </div>
    <div class="table">
      <el-table :data="filterDataList" ref="table"
                :cell-style="cellStyle"
                @row-dblclick="selectConn"
                border stripe height="100%">
        <el-table-column label="#" type="index" width="50" align="center" class-name="drag-handle"/>
        <el-table-column label="颜色" prop="color" width="60">
          <template #default="scope">
            <el-color-picker size="small" v-model="scope.row.color" :predefine="PREDEFINE_COLORS"/>
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="name" show-overflow-tooltip/>
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
              <me-icon info="编辑" icon="el-icon-edit" class="icon-btn" @click="editConn(scope.row, scope.$index)"/>
              <el-popconfirm :hide-after="0" title="确定删除吗？" @confirm.stop="deleteConn(scope.row)">
                <template #reference>
                  <me-icon info="删除" icon="el-icon-delete" class="icon-btn"/>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <SaveConn ref="conn" v-if="dialog.conn" @closed="dialog.conn = false"/>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-conn {
  //border: 2px solid red;
  height: 100%;

  .table {
    margin-top: 10px;
  }

  :deep(.drag-handle) {
    cursor: move;
  }

  :deep(.sortable-ghost) {
    background-color: var(--el-color-primary-light-8);
  }
}
</style>