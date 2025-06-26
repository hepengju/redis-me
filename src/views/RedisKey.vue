<script setup lang="ts">
import KeyHeader from '@/views/key/KeyHeader.vue'
import KeyMain from '@/views/key/KeyMain.vue'
import KeyFooter from '@/views/key/KeyFooter.vue'

</script>

<template>
  <el-container class="container">
    <el-header class="header">
      <KeyHeader/>
    </el-header>
    <el-main class="main">
      <KeyMain/>
    </el-main>
    <el-footer class="footer">
      <KeyFooter/>
    </el-footer>
  </el-container>
</template>

<style scoped lang="scss">
.container {
  position: relative;

  .header {
    height: auto;
    --el-header-padding: 0px;
  }

  .main {
    margin-top: 10px;
    padding: 0;
    border: 1px solid red;
  }

  .footer {
    width: 100%;
    height: auto;
    padding: 10px;

    position: absolute;
    bottom: 0;
    left: 0;
  }
}
</style>