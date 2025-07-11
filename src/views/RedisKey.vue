<script setup>
import KeyFooter from './key/KeyFooter.vue'
import KeyHeader from './key/KeyHeader.vue'
import KeyMain from './key/KeyMain.vue'
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