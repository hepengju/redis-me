<script>
export default {
  props: {
    info: {type: String, default: '请添加按钮提示'},
    placement: {type: String, default: 'auto'},
    icon: {type: String, default: ''},
  }
}
</script>

<template>
    <el-tooltip :content="info" :show-after="500" :placement="placement">
      <el-button v-bind="$attrs" :icon="icon" v-if="icon.startsWith('el-icon')"/>
      <el-button v-bind="$attrs" v-else>
        <template #icon>
          <SvgIcon :name="icon"/>
        </template>
      </el-button>
    </el-tooltip>
</template>
