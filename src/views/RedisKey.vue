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
  //position: relative;

  display: flex;
  flex-direction: column;

  //// 高度占据全部
  //.redis-key-container {
  //  //border: 2px solid pink;
  //  height: 100%;
  //
  //  // 让redis-main可以弹性扩充
  //  display: flex;
  //  flex-direction: column;
  //}
  //
  //// 绝对定位，放在左下角和右下角
  //.redis-key-footer {
  //  position: absolute;
  //  left: 5px;
  //  right: 5px;
  //  bottom: 5px;
  //}
}
</style>