<template>
  <el-input class="custom" v-model="keyword" placeholder="Enter 键进行搜索" @keyup.enter="scanKey" clearable>
    <template #prepend>
      <el-tooltip content="精确搜素">
        <el-checkbox size="small" v-model="exact"/>
      </el-tooltip>
    </template>
    <template #append>
      <el-button-group>
        <el-button @click="scanKey"><el-icon><el-icon-search/></el-icon></el-button>
        <el-button @click="addKey" style="border-color: var(--el-button-border-color)" v-if="!isReadonly"><el-icon><el-icon-plus/></el-icon></el-button>
      </el-button-group>
    </template>
  </el-input>
</template>

<script setup>
const keyword = ref('')
const exact = ref(false)
const isReadonly = ref(false)

function scanKey() {
  console.log(keyword.value)
}

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