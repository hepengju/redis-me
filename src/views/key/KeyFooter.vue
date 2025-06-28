<script setup lang="ts">
import store, {filterKeys} from '@/utils/store.ts'
</script>

<template>
  <div class="key-footer">
      <el-select v-model="store.db" filterable value-key="index" style="width: 100px">
        <el-option v-for="item in store.dbList"
                   :label="item.label"
                   :value="item"
                   :key="item.index"/>
      </el-select>
      <el-text size="large" type="primary">{{filterKeys.length}} / {{store.keys.length}}</el-text>

      <el-button-group>
        <MetaButton tooltip="获取更多" icon="el-icon-bottom" type="primary"/>
        <MetaButton tooltip="获取所有" icon="el-icon-download" type="warning"/>
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