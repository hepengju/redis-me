<script setup lang="ts">
import SearchKey from "./detail/SearchKey.vue";
import SimpleKey from "./detail/SimpleKey.vue";

</script>

<template>
  <div class="key-main">
    <SearchKey/>
    <div class="key-list">
      <SimpleKey/>
    </div>
  </div>
</template>

<style scoped lang="scss">
.key-main {
  //box-sizing: border-box;
  //border: 2px solid red;
  flex-grow: 1;

  // 滚动条显示在键的区域，而不是整个左侧区域
  // 原理：需要指定下高度。此处指定为0，弹性扩展
  height: 0;

  margin-top: 10px;
  display: flex;
  flex-direction: column;

  .key-list {
    flex-grow: 1;
    border: 1px solid var(--el-border-color);
    border-top: none;

    height: 100%;
    padding: 5px;
    overflow: auto;
  }
}
</style>