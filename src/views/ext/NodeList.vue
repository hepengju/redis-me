<script setup lang="ts">
import { inject, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'

const { t } = useI18n()

const share = inject(shareProvideKey)!
const node = defineModel<string>()
const emit = defineEmits(['update:modelValue'])

const props = defineProps({
  /** 集群模式下默认选中第一个 master（nodeList 异步就绪后也会补设） */
  initNode: { type: Boolean, default: false },
})

function tryInitNode() {
  if (!props.initNode || node.value) return
  const master = share.nodeList.find(item => item.isMaster)
  if (master?.node) emit('update:modelValue', master.node)
}

/** 选中态与下拉项文案一致：host:port | M1 */
function nodeOptionLabel(item: (typeof share.nodeList)[number]): string {
  return `${item.node} | ${item.shortLabel}`
}

watch(() => share.nodeList, tryInitNode, { immediate: true })
</script>

<template>
  <el-select
    v-model="node"
    style="width: 220px"
    :placeholder="t('nodeList.placeholder')"
    v-if="share.conn?.cluster">
    <!-- 终端/配置/慢日志/监控/客户端/信息：选具体节点 -->
    <el-option
      v-for="item in share.nodeList"
      :key="item.node"
      :value="item.node"
      :label="nodeOptionLabel(item)">
      <el-text effect="dark" :type="item.isMaster ? 'primary' : 'info'">
        {{ item.node }} |
        <el-tooltip :content="item.slotsTooltip" placement="top" :disabled="!item.slotsTooltip">
          {{ item.shortLabel }}
        </el-tooltip>
      </el-text>
    </el-option>
  </el-select>
</template>
