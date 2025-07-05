<script>
export default {
  data() {
    return {
      keyword: '',
      exact: true,
    }
  },
  methods: {
    scanKey() {
    },
    addKey() {
    }
  }
}
</script>

<template>
  <el-input class="custom" v-model="keyword" placeholder="Enter 键进行搜索" @keyup.enter="scanKey" clearable>
<!--    <template #prepend>
      <el-tooltip content="精确搜素">
        <el-checkbox size="small" v-model="exact"/>
      </el-tooltip>
    </template>-->
    <template #append>
      <el-button-group>
        <me-button info="刷新键" @click="scanKey" icon="el-icon-search"></me-button>
        <me-button info="新增键" @click="addKey" style="border-color: var(--el-button-border-color)" icon="el-icon-plus"></me-button>
      </el-button-group>
    </template>
  </el-input>
</template>

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