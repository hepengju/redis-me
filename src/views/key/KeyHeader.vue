<script setup lang="ts">
import MeIcon from '@/components/MeIcon.vue'
import store, {colorStyle, initMain} from '@/utils/store.ts'
import Conn from '@/views/dialog/Conn.vue'
import {useTemplateRef} from 'vue'
const disabled = computed(() => store.conn === null)

const connRef = useTemplateRef('conn')

// 扩展命令
function handleCommand(command: string) {
  if (command === 'addConn') {
    connRef.value.open('add')
  } else if (command === 'editConn') {
    connRef.value.open('edit')
  } else if (command === 'deleteConn') {
    // TODO 删除连接
  } else if (command === 'refreshConn') {
    initMain()
  } else if (command === 'setting') {
    store.dialog.setting = true
  }
}
</script>

<template>
  <div class="key-header">
    <el-select v-model="store.conn" placeholder="请选择连接" class="conn"
               filterable :disabled="store.connList.length == 0" value-key="id">
      <el-option v-for="item in store.connList" :label="item.name" :value="item" :key="item.id">
        <div :style="{color: item?.color}">{{ item.name }}</div>
      </el-option>

      <template #label="{ value }">
        <div :style="colorStyle">{{ value.name }}</div>
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
            <el-dropdown-item command="refreshConn" :disabled><me-icon name="刷新连接" icon="el-icon-refresh"/></el-dropdown-item>
            <el-dropdown-item command="addConn"><me-icon name="新增连接" icon="el-icon-plus"/></el-dropdown-item>
            <el-dropdown-item command="editConn" :disabled><me-icon name="编辑连接" icon="el-icon-edit"/></el-dropdown-item>
            <el-dropdown-item command="deleteConn" :disabled><me-icon name="删除连接" icon="el-icon-delete"/></el-dropdown-item>
            <el-dropdown-item command="import" divided :disabled><me-icon name="导入键" icon="el-icon-download"/></el-dropdown-item>
            <el-dropdown-item command="flush" :disabled><me-icon name="删除所有键" icon="el-icon-warn-triangle-filled"/></el-dropdown-item>
            <el-dropdown-item command="appLog" divided><me-icon name="命令日志" icon="el-icon-stopwatch"/></el-dropdown-item>
            <el-dropdown-item command="setting"><me-icon name="基础设置" icon="el-icon-setting"/></el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>

  <Conn ref="conn"/>
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