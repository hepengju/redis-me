<script setup lang="ts">
import { ref } from 'vue'

import bilibili from '@/assets/images/bilibili.webp'
import wechat from '@/assets/images/wechat.webp'

const visible = ref(false)

function open() {
  visible.value = true
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    width="430"
    align-center
    draggable
    :show-close="false"
    style="--el-dialog-bg-color: unset; box-shadow: unset">
    <div class="app-official">
      <el-image :src="wechat" class="img" />
      <el-image :src="bilibili" class="img" />
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.app-official {
  .img {
    width: 400px;
    margin-top: 5px;
  }
}
</style>
