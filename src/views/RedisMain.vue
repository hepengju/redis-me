<script setup lang="ts">
import RedisKey from './RedisKey.vue'
import RedisTag from './RedisTag.vue'
import RedisConn from './RedisConn.vue'
import useGlobalStore from '@/utils/store'
import Setting from "@/views/key/detail/Setting.vue";

const global = useGlobalStore()
</script>

<template>
  <div class="redis-main">
    <!-- 连接列表 -->
    <RedisConn v-if="global.conn == null"/>

    <!-- 选定连接 -->
    <el-splitter  v-else>
      <el-splitter-panel :min="250" size="30%">
        <RedisKey/>
      </el-splitter-panel>
      <el-splitter-panel :min="250">
        <RedisTag/>
      </el-splitter-panel>
    </el-splitter>

    <!-- 系统设置: 初始化主题、语言等 -->
    <Setting/>
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: 100%;
  border: 2px solid blue;
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