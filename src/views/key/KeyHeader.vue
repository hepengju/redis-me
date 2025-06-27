<script setup lang="ts">
import MetaIcon from '@/components/MetaIcon.vue'
import store from '@/utils/store.ts'
import {colorStyle} from '@/utils/store.ts'

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
        <MetaIcon icon="my-icon-redis"/>
      </template>
    </el-select>

    <div class="btns">
      <el-tooltip content="刷新">
        <el-button type="primary" icon="el-icon-refresh"></el-button>
      </el-tooltip>

      <el-dropdown style="margin-left: 10px" size="small" placement="bottom-end">
        <el-button type="success"><el-icon><el-icon-operation/></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item><MetaIcon name="编辑连接" icon="el-icon-edit"/></el-dropdown-item>
            <el-dropdown-item divided><MetaIcon name="导入键" icon="el-icon-download"/></el-dropdown-item>
            <el-dropdown-item><MetaIcon name="删除所有键" icon="el-icon-warn-triangle-filled"/></el-dropdown-item>
            <el-dropdown-item><MetaIcon name="应用日志" icon="el-icon-stopwatch"/></el-dropdown-item>
            <el-dropdown-item divided><MetaIcon name="基础设置" icon="el-icon-setting"/></el-dropdown-item>
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