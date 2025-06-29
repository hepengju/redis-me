<script setup lang="ts">
import RedisMain from '@/views/RedisMain.vue'
</script>

<template>
  <RedisMain/>
</template>

<style lang="scss">
#app {
  padding: 5px;
  height: 100%;
  overflow: hidden;

  //所有元素的box-sizing设置后，下面的计算方法底部有些空白（原因暂不明），因此改为height: 100%（需要html/body也设置height: 100%）
  //height: calc(100vh - 10px);
  //background-color: yellow;
}
</style>