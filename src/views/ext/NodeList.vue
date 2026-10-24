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
  /** 图表页专用：在节点列表上方追加「全部/仅主/仅从」快捷筛选项（值为显式 token，不用空串） */
  filterable: { type: Boolean, default: false },
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
    <!-- filterable：快捷筛选组 + 指定节点组（仅图表页开启，其它调用点不走此分支） -->
    <template v-if="props.filterable">
      <el-option-group :label="t('nodeList.groupQuick')">
        <el-option value="all" :label="t('nodeList.all')" />
        <el-option value="master" :label="t('nodeList.masterOnly')" />
        <el-option value="slave" :label="t('nodeList.slaveOnly')" />
      </el-option-group>
      <el-option-group :label="t('nodeList.groupNode')">
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
      </el-option-group>
    </template>
    <!-- 默认（终端/配置/慢日志/监控/客户端/信息）：外观与行为完全不变 -->
    <template v-else>
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
    </template>
  </el-select>
</template>
