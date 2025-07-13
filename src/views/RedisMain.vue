<script setup>
import useGlobalStore from '@/utils/store.js'
import RedisKey from './RedisKey.vue'
import RedisTag from './RedisTag.vue'
import RedisConn from './RedisConn.vue'

const global = useGlobalStore()
</script>

<template>
  <div class="redis-main">
    <el-splitter>
      <!-- 左侧键 -->
      <el-splitter-panel :min="250" size="30%">
        <RedisKey/>
      </el-splitter-panel>

      <!-- 右侧值 -->
      <el-splitter-panel :min="250">
        <!-- 默认显示连接列表，选中后显示连接详情Tab页面 (为了监听事件的正常运行，此处使用v-show） -->
        <RedisConn v-if="global.conn === null"/>
        <RedisTag v-else/>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: 100%;
  //border: 2px solid blue;
}

//中间分隔面板的样式调整
:deep(.el-splitter-bar) {
  width: 5px !important;

  .el-splitter-bar__dragger-horizontal:before {
    width: 0; // 宽度为0，不显示原始的竖线
    background-color: transparent;
  }
}
</style>