<script>
export default {
  props: {
    icon: {type: String, default: ''},     // 图标
    name: {type: String, default: ''},     // 文字
    hint: {type: Boolean, default: false}, // 文字是否显示为提示(tooltip)
    info: {type: String, default: ''},     // 图标 + 文字 + 额外的提示
    placement: {type: String, default: 'auto'},
    rawContent: {type: Boolean, default: false},
    showAfter: {type: Number, default: 1000}
  }
}
</script>

<template>
  <div class="icon-main">
    <!-- 图标 + 文字 + 额外提示 -->
    <template v-if="info">
      <el-tooltip :placement="placement" :content="info" :raw-content="rawContent" :show-after="showAfter">
        <el-icon v-if="icon.startsWith('el-icon-')">
          <Component :is="icon"/>
        </el-icon>
        <SvgIcon v-else :name="icon" class="icon"/>
      </el-tooltip>
      <span class="name" v-if="name">{{ name }}</span>
    </template>

    <!-- 图标 + 文字提示 -->
    <template v-else-if="hint">
      <el-tooltip :placement="placement" :content="name" :show-after="showAfter">
        <el-icon v-if="icon.startsWith('el-icon-')">
          <Component :is="icon"/>
        </el-icon>
        <SvgIcon v-else :name="icon"/>
      </el-tooltip>
    </template>

    <!-- 图标 + 文字 -->
    <template v-else>
      <el-icon v-if="icon.startsWith('el-icon-')">
        <Component :is="icon"/>
      </el-icon>
      <SvgIcon v-else :name="icon"/>
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