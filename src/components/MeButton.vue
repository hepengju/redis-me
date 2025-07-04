<script>
export default {
  props: {
    info: {type: String, default: '请添加按钮提示'},
    placement: {type: String, default: 'auto'},
  }
}
</script>

<template>
  <el-tooltip :content="info" :show-after="500" :placement="placement">
    <el-button v-bind="$attrs"></el-button>
  </el-tooltip>
</template>
