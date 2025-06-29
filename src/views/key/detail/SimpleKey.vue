<script setup>
import {filterKeys} from '@/utils/store.ts'
</script>

<template>
  <div v-for="item in filterKeys">
    <el-link type="primary" icon="el-icon-key" underline="never">
      <span class="key">{{ item.key }}</span>
    </el-link>
  </div>
</template>

<style scoped lang="scss">
.key {
    //overflow: hidden;
    white-space: nowrap;
    //text-overflow: ellipsis;
}
</style>