<script setup lang="ts">
import SearchKey from "./detail/SearchKey.vue";
import SimpleKey from "./detail/SimpleKey.vue";

</script>

<template>
  <div class="container">
    <SearchKey/>
    <SimpleKey/>
  </div>
</template>

<style scoped lang="scss">
.container {
  height: 100%;
  overflow: hidden;
}
</style>