<script setup>
import {bus, CONN_REFRESH, meInvoke, meOk, mePrompt} from '@/utils/util.js'
import Setting from '@/views/ext/Setting.vue'
import AppInfo from '@/views/ext/AppInfo.vue'

// 共享数据
const share = inject('share')

// 新增模拟数据
async function mockData() {
  mePrompt('请输入每种数据类型条数（N×5）', {
        inputValue: 10,
        inputType: 'number'
      },
      async ({value}) => {
        await meInvoke('mock_data', {id: share.conn.id, count: parseInt(value)})
        meOk('模拟数据插入完成')
        bus.emit(CONN_REFRESH)
      })
}

// 弹出框
const dialog = reactive({
  setting: false,      // 基础设置
  info: false,         // 应用信息
})

// 处理额外命令
async function handleCommand(command) {
  if (command === 'refreshConn') {
    await meInvoke('connect', {id: share.conn.id})
    bus.emit(CONN_REFRESH)
  } else if (command === 'closeConn') {
    share.conn = null
  } else if (command === 'setting') {
    dialog.setting = true
  } else if (command === 'info') {
    dialog.info = true
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
          <el-dropdown-item command="closeConn" :disabled="!share.conn">
            <me-icon name="关闭连接" icon="el-icon-circle-close"/>
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
          <el-dropdown-item command="info" divided>
            <me-icon name="关于" icon="me-icon-info"/>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!--为了方便主题语言等初始化，组件一直存在；为了方便v-model直接绑定弹框是否显示直接传入dialog-->
    <el-dialog title="基础设置" v-model="dialog.setting" width="500" align-center draggable>
      <Setting/>
    </el-dialog>
    <el-dialog v-model="dialog.info" width="400" align-center draggable>
      <AppInfo/>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.key-header {
  display: flex;
}
</style>
