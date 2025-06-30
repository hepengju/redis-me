<script setup lang="ts">
import store, {filterKeys, scanKey} from '@/utils/store.ts'
</script>

<template>
  <div class="key-footer">
      <el-select v-model="store.db" filterable value-key="index" style="width: 100px" @change="scanKey">
        <el-option v-for="item in store.dbList"
                   :label="item.label"
                   :value="item"
                   :key="item.index"/>
      </el-select>
      <el-text size="large" type="primary">{{ filterKeys.length }} / {{ store.redisKeyList.length }}</el-text>

      <el-button-group>
        <me-button tooltip="加载更多" icon="el-icon-bottom" type="primary"   @click="scanMore"/>
        <me-button tooltip="加载所有" icon="el-icon-download" type="warning" @click="scanAll"/>
      </el-button-group>
  </div>
</template>

<style scoped lang="scss">
.key-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>