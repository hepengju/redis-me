<script setup lang="ts">
// 单行省略 + 溢出才开 tooltip；disabled 留在本实例，避免多处共用 ref 悬停时整片重渲。
// 内容变化时复位；过长文本跳过 scrollWidth 测量（几乎必截断）。
import { ref, watch } from 'vue'

const props = defineProps<{ content: string }>()

const tooltipDisabled = ref(true)

/** 超过此长度几乎必被容器截断，省一次强制布局 */
const SKIP_MEASURE_MIN_CHARS = 128

watch(
  () => props.content,
  () => {
    tooltipDisabled.value = true
  },
)

function updateTooltipDisabled(e: MouseEvent): void {
  if (props.content.length >= SKIP_MEASURE_MIN_CHARS) {
    tooltipDisabled.value = false
    return
  }
  const el = e.currentTarget as HTMLElement
  tooltipDisabled.value = el.scrollWidth <= el.clientWidth
}
</script>

<template>
  <el-tooltip
    :content="content"
    placement="top"
    :persistent="false"
    :show-after="300"
    :disabled="tooltipDisabled">
    <div class="me-overflow-text" @mouseenter="updateTooltipDisabled">
      <slot>{{ content }}</slot>
    </div>
  </el-tooltip>
</template>

<style scoped lang="scss">
.me-overflow-text {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
