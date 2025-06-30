<script setup lang="ts">
import MeIcon from '@/components/MeIcon.vue'
import store, {colorStyle, initMain} from '@/utils/store.ts'

/**
 * 下拉框命令
 */
function handleCommand(command: string){
  if (command === 'setting') {
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
      <me-button content="刷新连接" type="primary" icon="el-icon-refresh" @click="initMain"></me-button>

      <el-dropdown style="margin-left: 10px" placement="bottom-end" @command="handleCommand">
        <el-button type="success"><el-icon><el-icon-operation/></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="editConn"><me-icon name="编辑连接" icon="el-icon-edit"/></el-dropdown-item>
            <el-dropdown-item command="import" divided><me-icon name="导入键" icon="el-icon-download"/></el-dropdown-item>
            <el-dropdown-item command="flush"><me-icon name="删除所有键" icon="el-icon-warn-triangle-filled"/></el-dropdown-item>
            <el-dropdown-item command="appLog"><me-icon name="应用日志" icon="el-icon-stopwatch"/></el-dropdown-item>
            <el-dropdown-item command="setting" divided><me-icon name="基础设置" icon="el-icon-setting"/></el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
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
</style>