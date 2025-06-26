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
  margin-top: 10px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;

  .key-list {
    flex-grow: 1;
    border: 1px solid var(--el-border-color);
    border-top: none;
  }
}
</style>