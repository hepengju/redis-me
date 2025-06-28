<template>
  <el-input class="custom" v-model="store.keyword" placeholder="Enter 键进行搜索" @keyup.enter="scanKey" clearable>
    <template #prepend>
      <el-tooltip content="精确搜素">
        <el-checkbox size="small" v-model="store.exact"/>
      </el-tooltip>
    </template>
    <template #append>
      <el-button-group>
        <el-button @click="scanKey"><el-icon><el-icon-search/></el-icon></el-button>
        <el-button @click="addKey" style="border-color: var(--el-button-border-color)" v-if="!store.readonly"><el-icon><el-icon-plus/></el-icon></el-button>
      </el-button-group>
    </template>
  </el-input>
</template>

<script setup>
import store, {scanKey} from "@/utils/store.ts";

function addKey() {}
</script>
<style scoped lang="scss">
.custom {
  // 复选框显示尽量为方形
  :deep(.el-input-group__prepend) {
    padding: 0 12px;
  }

  // 查询和新增key不收缩，避免调整侧边栏宽度时变为两行
  :deep(.el-input-group__append) {
    flex-shrink: 0;
  }
}
</style>