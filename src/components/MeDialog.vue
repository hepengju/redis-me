<script setup lang="ts">
import { ref } from 'vue'

// 说明: 自定义弹框，支持最大化；关闭/最大化图标与标题栏一致，不用 EP 自带关闭
const visible = defineModel<boolean>({ default: false })
const fullscreen = ref(false)
// bodyHeight 默认 60vh。短表单传 auto，避免正文被撑出大块空白
const props = withDefaults(defineProps<{ title?: string; icon?: string; bodyHeight?: string }>(), {
  title: '',
  icon: '',
  bodyHeight: '60vh',
})
</script>

<template>
  <el-dialog
    v-model="visible"
    v-bind="$attrs"
    class="me-dialog"
    align-center
    draggable
    overflow
    :show-close="false"
    :fullscreen="fullscreen"
    @closed="fullscreen = false"
    destroy-on-close
    append-to-body>
    <template #header>
      <div class="me-dialog-header">
        <div class="me-dialog-heading">
          <me-icon :name="title" :icon="icon" />
          <!-- 紧挨标题的补充，如索引名 -->
          <slot name="title-extra" />
        </div>
        <!-- 标题栏右侧扩展区（如外链），默认靠右贴近窗口操作按钮 -->
        <slot name="header-extra" />
        <div class="me-dialog-actions">
          <me-icon
            :icon="fullscreen ? 'me-icon-window-restore' : 'me-icon-window-maximize'"
            class="me-dialog-action"
            @click="fullscreen = !fullscreen" />
          <me-icon icon="me-icon-window-close" class="me-dialog-action" @click="visible = false" />
        </div>
      </div>
    </template>

    <template #default>
      <!-- 全屏用 flex 占满剩余高度，避免 100vh 再加 padding/header 撑出滚动条 -->
      <div
        class="me-dialog-body"
        :class="{ 'is-fullscreen': fullscreen }"
        :style="fullscreen ? undefined : { height: props.bodyHeight }">
        <slot name="default" />
      </div>
    </template>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.me-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 与弹框右侧 padding 拉开一点，避免贴边 */
  margin-right: 4px;
}

.me-dialog-heading {
  display: flex;
  align-items: center;
  min-width: 0;
  /* 与 .el-dialog__title 一致。不设的话会停在正文的 14px */
  font-size: var(--el-dialog-title-font-size);
  line-height: var(--el-dialog-font-line-height);
  color: var(--el-text-color-primary);
}

.me-dialog-actions {
  display: flex;
  align-items: center;
  /* 热区缩到 20px 后补间距，两图标中心距仍约 28px */
  gap: 8px;
  font-size: 14px;
}

.me-dialog-action {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-color-info);

  &:hover {
    color: var(--el-color-primary);
  }
}

.me-dialog-body.is-fullscreen {
  height: 100%;
}
</style>

<!-- append-to-body 后改 EP 全屏容器布局 -->
<style lang="scss">
/* overflow 拖出视口时 transform 会撑开蒙层；两层都是 overflow:auto，右下角会各出滚动条 */
.el-overlay:has(.me-dialog),
.el-overlay-dialog:has(.me-dialog) {
  overflow: hidden;
}

.me-dialog.el-dialog.is-fullscreen {
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .el-dialog__header {
    flex-shrink: 0;
  }

  .el-dialog__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
</style>
