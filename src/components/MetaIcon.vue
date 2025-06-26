<script setup>
import {pascal} from '@/utils/tool.js';

const {name} = defineProps({
  name: {type: String, default: ''},
  icon: {type: String, default: ''},
  tooltip: {type: Boolean, default: false},
});
</script>

<template>
  <div class="icon-main">
    <template v-if="tooltip">
      <el-tooltip placement="right" :content="name">
        <el-icon v-if="icon.startsWith('el-icon-')"><Component :is="icon"/></el-icon>
        <SvgIcon v-else :name="(icon || name).toLowerCase()" class="icon"/>
      </el-tooltip>
    </template>
    <template v-else>
      <el-icon v-if="icon.startsWith('el-icon-')"><Component :is="icon"/></el-icon>
      <SvgIcon v-else :name="(icon || name).toLowerCase()" class="icon"/>
      <span class="name">{{ pascal(name) }}</span>
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
}
</style>