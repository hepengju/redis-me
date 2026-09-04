<script setup lang="ts">
// 扫描进度环：点击暂停/继续（键列表、字段扫描、内存分析共用）
defineProps<{ percentage: number; loading: boolean; tip: string }>()

defineEmits<{ click: [e: MouseEvent] }>()
</script>

<template>
  <el-tooltip :content="tip" placement="bottom" :show-after="1000">
    <div class="scan-control" @click.stop="$emit('click', $event)">
      <el-progress
        type="circle"
        :percentage="percentage"
        :width="22"
        :stroke-width="2"
        :show-text="false"
        color="var(--el-color-danger)"
        class="scan-ring" />
      <me-icon :icon="loading ? 'el-icon-video-pause' : 'el-icon-video-play'" class="scan-icon" />
    </div>
  </el-tooltip>
</template>

<style scoped lang="scss">
.scan-control {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;

  .scan-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    line-height: 1;
  }

  .scan-icon {
    position: relative;
    z-index: 1;
    font-size: 16px;

    :deep(.icon),
    :deep(svg) {
      width: 16px;
      height: 16px;
    }
  }
}
</style>
