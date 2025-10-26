<script setup>
import {bus, CONN_REFRESH, invoke_then} from "@/utils/util.js"
import {ElMessage, ElMessageBox} from 'element-plus'
import SaveConn from '@/views/ext/SaveConn.vue'
import Setting from '@/views/ext/Setting.vue'

// 共享数据
const share = inject('share')

// 新增模拟数据
async function mockData() {
  await invoke_then('mock_data', {id: share.conn.id, count: 10})
  ElMessage.success("模拟数据插入完成")
  if (share.conn) {
    bus.emit(CONN_REFRESH)
  }
}

// 弹出框
const dialog = reactive({
  conn: false,         // 编辑连接
  setting: false,      // 基础设置
})

// 处理额外命令
const connRef = useTemplateRef('conn')
async function handleCommand(command) {
  if (command === 'addConn') {
    dialog.conn = true
    await nextTick(() => connRef.value.open('add'))
  } else if (command === 'copyConn') {
    dialog.conn = true
    await nextTick(() => connRef.value.open('add', share.conn))
  } else if (command === 'editConn') {
    dialog.conn = true
    await nextTick(() => connRef.value.open('edit', share.conn))
  } else if (command === 'deleteConn') {
    ElMessageBox.confirm(
        `确定删除连接【${share.conn.name}】吗？`,
        '提示',
        {type: 'warning'},
    ).then(async () => {
      const index = share.connList.indexOf(share.conn)
      if (index > -1) {
        share.connList.splice(index, 1)
      }
      share.conn = null
    }).catch(() => {})
  } else if (command === 'refreshConn') {
    await invoke_then('connect', {id: share.conn.id})
    bus.emit(CONN_REFRESH)
  } else if (command === 'setting') {
    dialog.setting = true
  } else if ('mockData' === command) {
    await mockData()
  }
}
</script>

<template>
  <div class="key-header">
    <el-select v-model="share.conn" placeholder="请选择连接" class="conn" clearable
               filterable :disabled="share.connList.length == 0" value-key="id">
      <el-option v-for="item in share.connList" :label="item.name" :value="item" :key="item.id">
        <div :style="{color: item?.color}">{{ item.name }}</div>
      </el-option>

      <template #label="{ value }">
        <div :style="{color: share.color}">{{ value.name }}</div>
      </template>
      <template #prefix>
        <me-icon icon="me-icon-redis"/>
      </template>
    </el-select>

    <el-dropdown placement="bottom-end" @command="handleCommand" style="margin-left: 10px">
      <el-button type="success" icon="el-icon-operation"/>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="refreshConn" :disabled="!share.conn">
            <me-icon name="刷新连接" icon="el-icon-refresh"/>
          </el-dropdown-item>
          <el-dropdown-item command="addConn">
            <me-icon name="新增连接" icon="el-icon-plus"/>
          </el-dropdown-item>
          <el-dropdown-item command="copyConn" :disabled="!share.conn">
            <me-icon name="复制连接" icon="el-icon-document-copy"/>
          </el-dropdown-item>
          <el-dropdown-item command="editConn" :disabled="!share.conn">
            <me-icon name="编辑连接" icon="el-icon-edit"/>
          </el-dropdown-item>
          <el-dropdown-item command="deleteConn" :disabled="!share.conn">
            <me-icon name="删除连接" icon="el-icon-delete"/>
          </el-dropdown-item>
          <el-dropdown-item command="mockData" divided :disabled="!share.conn">
            <me-icon name="模拟数据" icon="el-icon-coffee-cup"/>
          </el-dropdown-item>
          <el-dropdown-item command="appLog" divided>
            <me-icon name="命令日志" icon="el-icon-stopwatch"/>
          </el-dropdown-item>
          <el-dropdown-item command="setting">
            <me-icon name="基础设置" icon="el-icon-setting"/>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <SaveConn ref="conn" v-if="dialog.conn" @closed="dialog.conn = false"/>

    <!--为了方便主题语言等初始化，组件一直存在；为了方便v-model直接绑定弹框是否显示直接传入dialog-->
    <Setting :dialog="dialog"/>
  </div>
</template>

<style scoped lang="scss">
.key-header {
  display: flex;
}
</style>
