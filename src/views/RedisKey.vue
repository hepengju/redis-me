<script setup>
import KeyHeader from '@/views/key/KeyHeader.vue'
import KeyMain from '@/views/key/KeyMain.vue'
</script>

<template>
  <div class="redis-key">
    <KeyHeader/>
    <KeyMain/>
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