<script setup lang="ts">
import KeyHeader from '@/views/key/KeyHeader.vue'
import KeyMain from '@/views/key/KeyMain.vue'
import KeyFooter from '@/views/key/KeyFooter.vue'
</script>

<template>
  <div class="container">
    <div class="key">
      <KeyHeader/>
      <KeyMain/>
    </div>
    <div class="footer">
      <KeyFooter/>
    </div>
  </div>
</template>

<style scoped lang="scss">
.container {
  position: relative;

  .key {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .footer {
    position: absolute;
    left: 5px;
    right: 5px;
    bottom: 5px;
  }
}



</style>