<script setup lang="ts">
import { useAttrs } from 'vue'
const attrs = useAttrs()
</script>

<template>
  <el-input v-bind="attrs">
    <template #append>
      <el-button type="primary">...</el-button>
    </template>
  </el-input>
</template>

<style scoped lang="scss">

</style>