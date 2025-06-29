<script setup lang="ts">
import KeyHeader from '@/views/key/KeyHeader.vue'
import KeyMain from '@/views/key/KeyMain.vue'
import KeyFooter from '@/views/key/KeyFooter.vue'
</script>

<template>
  <div class="redis-key">
      <KeyHeader/>
      <KeyMain/>
      <KeyFooter/>
  </div>
</template>

<style scoped lang="scss">
.redis-key {
  //border: 2px solid red;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>