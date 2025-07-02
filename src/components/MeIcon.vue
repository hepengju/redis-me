<script setup>
const {name, placement} = defineProps({
  name: {type: String, default: ''},
  icon: {type: String, default: ''},
  tooltip: {type: Boolean, default: false},
  tooltipContent: {type: String, default: ''},
  placement: {type: String, default: 'right'},
})
</script>

<template>
  <div class="icon-main">
    <!-- 图标 + 文字 + 额外提示 -->
    <template v-if="tooltipContent">
      <el-tooltip :placement="placement" :content="tooltipContent" :show-after="500">
        <el-icon v-if="icon.startsWith('el-icon-')">
          <Component :is="icon"/>
        </el-icon>
        <SvgIcon v-else :name="icon" class="icon"/>
      </el-tooltip>
      <span class="name" v-if="name">{{ name }}</span>
    </template>

    <!-- 图标 + 文字提示 -->
    <template v-else-if="tooltip">
      <el-tooltip :placement="placement" :content="name" :show-after="500">
        <el-icon v-if="icon.startsWith('el-icon-')">
          <Component :is="icon"/>
        </el-icon>
        <SvgIcon v-else :name="icon" class="icon"/>
      </el-tooltip>
    </template>

    <!-- 图标 + 文字 -->
    <template v-else>
      <el-icon v-if="icon.startsWith('el-icon-')">
        <Component :is="icon"/>
      </el-icon>
      <SvgIcon v-else :name="icon" class="icon"/>
      <span class="name" v-if="name">{{ name }}</span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.icon-main {
  display: flex;
  align-items: center;

  .name {
    margin-left: 5px;
  }

  // 避免下拉框里面自带的 .el-dropdown-menu__item i 导致宽度过大
  i {
    margin-right: 0px;

  }
}
</style>