<script setup lang="ts">
// MeTable 溢出单元格：tooltip disabled 留在本格，避免全表共用 ref 导致悬停重渲所有可见格。
// 虚拟列表复用实例时随 content 复位；过长文本跳过 scrollWidth 测量（几乎必截断）。
import { ref, watch } from 'vue'

const props = defineProps<{ content: string }>()

const tooltipDisabled = ref(true)

/** 超过此长度几乎必被列宽截断，省一次强制布局 */
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
    <div class="me-cell-ellipsis" @mouseenter="updateTooltipDisabled">
      <slot>{{ content }}</slot>
    </div>
  </el-tooltip>
</template>

<style scoped lang="scss">
.me-cell-ellipsis {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
