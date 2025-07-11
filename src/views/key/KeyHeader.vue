<script setup>
import {apiConnList} from '@/utils/api.js'
import useGlobalStore from '@/utils/store.js'
import {bus, CONN_REFRESH, randomString} from '@/utils/util.js'
import {ElMessage, ElMessageBox} from 'element-plus'
import {nanoid} from 'nanoid'
import {nextTick, reactive, ref, useTemplateRef, computed, watch} from 'vue'
import SaveConn from '@/views/conn/SaveConn.vue'
import Setting from '@/views/key/detail/Setting.vue'

// 全局对象
const global = useGlobalStore()

// 监控全局连接的变化，发出事件
// watch(() => global.conn, (newValue, oldValue) => {
//   console.log('全局连接发生变化', newValue, oldValue)
//   if (newValue.id !== oldValue.id) {
//     bus.emit(CONN_REFRESH)
//   }
// })

const btnDisable = computed(() => global.conn == null)

// 弹出框
const dialog = reactive({
  conn: false,         // 编辑连接
  setting: false,      // 基础设置
})

// 连接列表
const connList = ref([])
function getConnList() {
  connList.value = apiConnList()
  if (connList.value.length > 0) {
    global.conn = connList.value[0]
  }
}
// getConnList()

// 保存连接
function saveConn(conn, mode) {
  if (mode === 'add') {
    conn.id = nanoid()
    if (!conn.name) {
      conn.name = conn.host + '@' + conn.port
    }

    if (connList.value.find(c => c.name === conn.name)) {
      conn.name += ' (' + randomString(3) + ')'
    }
    connList.value.push(conn)
    ElMessage.success('新增成功')
  } else if (mode === 'edit') {
    global.conn = conn

    ElMessage.success('保存成功')
  }
}

// 处理额外命令
const connRef = useTemplateRef('conn')
const settingRef = useTemplateRef('setting')
function handleCommand(command) {
  if (command === 'addConn') {
    dialog.conn = true
    nextTick(() => connRef.value.open('add'))
  } else if (command === 'editConn') {
    dialog.conn = true
    nextTick(() => connRef.value.open('edit', global.conn))
  } else if (command === 'deleteConn') {
    ElMessageBox.confirm(`确认删除连接【${global.conn.name}】吗`, {type: 'warning'})
        .then(() => {
          const index = connList.value.findIndex(c => c.id === global.conn.id)
          if (index > -1) {
            connList.value.splice(index, 1)
          }
          global.conn = null
          ElMessage.success('删除成功')
        })
        .catch(() => {
        })
  } else if (command === 'refreshConn') {
    bus.emit(CONN_REFRESH)
  } else if (command === 'setting') {
    dialog.setting = true
    nextTick(() => settingRef.value.open())
  }
}
</script>

<template>
  <div class="key-header">
    <el-select v-model="global.conn" placeholder="请选择连接" class="conn"
               filterable :disabled="connList.length == 0" value-key="id">
      <el-option v-for="item in connList" :label="item.name" :value="item" :key="item.id">
        <div :style="{color: item?.color}">{{ item.name }}</div>
      </el-option>

      <template #label="{ value }">
        <div :style="{color: global.conn?.color}">{{ value.name }}</div>
      </template>
      <template #prefix>
        <me-icon icon="me-icon-redis"/>
      </template>
    </el-select>

    <div class="btns">
      <el-dropdown placement="bottom-end" @command="handleCommand">
        <el-button type="success" icon="el-icon-operation"/>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="refreshConn" :disabled="btnDisable"><me-icon name="刷新连接" icon="el-icon-refresh"/></el-dropdown-item>
            <el-dropdown-item command="addConn"><me-icon name="新增连接" icon="el-icon-plus"/></el-dropdown-item>
            <el-dropdown-item command="editConn" :disabled="btnDisable"><me-icon name="编辑连接" icon="el-icon-edit"/></el-dropdown-item>
            <el-dropdown-item command="deleteConn" :disabled="btnDisable"><me-icon name="删除连接" icon="el-icon-delete"/></el-dropdown-item>
            <el-dropdown-item command="appLog" divided><me-icon name="命令日志" icon="el-icon-stopwatch"/></el-dropdown-item>
            <el-dropdown-item command="setting"><me-icon name="基础设置" icon="el-icon-setting"/></el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>

  <SaveConn ref="conn" v-if="dialog.conn" @success="saveConn" @closed="dialog.conn = false"/>

  <!--为了方便主题语言等初始化，组件一直存在；为了方便v-model直接绑定弹框是否显示直接传入dialog-->
  <Setting :dialog="dialog"/>
</template>

<style scoped lang="scss">
.key-header {
  display: flex;

  .conn {
    flex-shrink: 1;
  }

  .btns {
    margin-left: 10px;
    flex-shrink: 0;
  }
}

// 避免点击后，鼠标浮动上去的outline（缺点：Tab键聚集到此按钮没有outline了）
.el-dropdown .el-button:focus-visible {
  outline: none;
}
</style>