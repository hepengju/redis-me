<script setup lang="ts">
import store from "@/utils/store.ts";
</script>

<template>
  <div class="redis-info" v-loading="store.loading.info">
    <pre>
{{ store.info }}
    </pre>
  </div>

</template>

<style scoped lang="scss">
.redis-info {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>