<script setup lang="ts">
import { inject, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'

const { t } = useI18n()

const share = inject(shareProvideKey)!
const node = defineModel<string>()

const props = withDefaults(
  defineProps<{
    /** 集群模式下默认选中第一个 master（nodeList 异步就绪后也会补设） */
    initNode?: boolean
  }>(),
  { initNode: false },
)

function tryInitNode() {
  if (!props.initNode || node.value) return
  const master = share.nodeList.find(item => item.isMaster)
  if (master?.node) node.value = master.node
}

/** 选中态与下拉项文案一致：host:port | M1 */
function nodeOptionLabel(item: (typeof share.nodeList)[number]): string {
  return `${item.node} | ${item.shortLabel}`
}

watch(() => share.nodeList, tryInitNode, { immediate: true })
</script>

<template>
  <el-select
    v-if="share.conn?.cluster"
    v-model="node"
    class="me-node-list"
    :placeholder="t('nodeList.placeholder')">
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

<style scoped lang="scss">
.me-node-list {
  width: 220px;
}
</style>
