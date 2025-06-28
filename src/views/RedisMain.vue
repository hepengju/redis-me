<script setup lang="ts">
import RedisKey from './RedisKey.vue'
import RedisTag from './RedisTag.vue'
import {onMounted} from 'vue'

import store, {scanKeys} from '@/utils/store.js'
import {connList} from '@/api/index.ts'

onMounted(() => {
  // TODO 应用进入选择连接
  store.connList = connList()
  store.conn = store.connList[0]

  // 选择连接后，调用scan扫描
  scanKeys()
})
</script>

<template>
  <el-splitter class="redis-main">
    <el-splitter-panel :min="250" size="30%">
      <RedisKey/>
    </el-splitter-panel>
    <el-splitter-panel :min="250">
      <RedisTag/>
    </el-splitter-panel>
  </el-splitter>
</template>

<style scoped lang="scss">
.redis-main {
  //box-sizing: border-box;
  //border: 2px solid blue;
}

//中间分隔面板的样式调整
:deep(.el-splitter-bar) {
  width: 10px !important;

  .el-splitter-bar__dragger-horizontal:before {
    width: 0; // 宽度为0，不显示原始的竖线
    background-color: transparent;

    // 定制化两个竖线
    display: inline-block;
    width: 3px;
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