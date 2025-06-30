<script setup lang="ts">
import { useAttrs } from 'vue'
const attrs = useAttrs()

const {tooltip} = defineProps({
  tooltip: {type: String, default: '请添加按钮提示'},
})
</script>

<template>
  <el-tooltip :content="tooltip" :show-after="500">
    <el-button v-bind="attrs"></el-button>
  </el-tooltip>
</template>
