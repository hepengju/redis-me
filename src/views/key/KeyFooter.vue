<script setup lang="ts">
import store, {filterKeys} from '@/utils/store.ts'
</script>

<template>
  <div class="key-footer">
    <div class="db-select" v-if="!store.conn?.cluster">
      <el-select v-model="store.db" filterable value-key="index">
        <el-option v-for="item in store.dbList"
                   :label="item.label"
                   :value="item"
                   :key="item.index"></el-option>
      </el-select>
    </div>
    <div class="key-count">
      <el-tag size="large" type="success">{{filterKeys.length}} / {{store.keys.length}}</el-tag>
    </div>
  </div>
</template>

<style scoped lang="scss">
.key-footer {
  display: flex;
  justify-content: space-between;

  .db-select {
    width: 100px;
  }

  .key-count {
  }
}
</style>