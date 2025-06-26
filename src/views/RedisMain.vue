<script setup lang="ts">
import RedisKey from './RedisKey.vue'
import RedisTag from './RedisTag.vue'
</script>

<template>
  <div class="container">
    <el-splitter>
      <!-- 左侧键 -->
      <el-splitter-panel :min="250" size="30%">
        <RedisKey/>
      </el-splitter-panel>

      <!-- 右侧值 -->
      <el-splitter-panel :min="250">
        <RedisTag/>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped lang="scss">
.container {
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

// 中间分隔面板的样式调整
:deep(.el-splitter-bar) {
  width: 10px !important;

  .el-splitter-bar__dragger-horizontal:before {
    width: 0; // 宽度为0，不显示原始的竖线
    background-color: transparent;

    // 定制化两个竖线
    display: inline-block;
    width: 4px;
    height: 20px;
    border-left: 1px solid #adabab;
    border-right: 1px solid #adabab;

    position: absolute;
    top: 0;
    bottom: 0;
    left: 5px;
    right: 0;
    margin: auto;
  }
}
</style>