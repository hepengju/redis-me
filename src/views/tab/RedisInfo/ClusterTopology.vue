<script setup lang="ts">
// 集群拓扑：把已经拉好的 nodeList 画成主从卡片。不发命令。
import { computed } from 'vue'

import type { EnrichedRedisNode } from '@/types/me-interface'

const props = defineProps<{ nodes: EnrichedRedisNode[] }>()

const groups = computed(() => {
  const masters = props.nodes.filter(node => node.isMaster)
  return masters.map(master => ({
    master,
    slaves: props.nodes.filter(node => node.isSlave && node.slaveOfNode === master.node),
  }))
})
</script>

<template>
  <div class="cluster-topology-wrap">
    <el-card
      v-for="(group, groupIdx) in groups"
      :key="group.master.node"
      shadow="hover"
      :style="{ marginTop: groupIdx ? '10px' : '0' }">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0">
          <el-tag type="primary" effect="dark" size="small">{{ group.master.shortLabel }}</el-tag>
          <el-text effect="dark" type="primary" style="font-size: 13px; font-weight: 600">
            {{ group.master.node }}
          </el-text>
        </div>
        <el-text type="info" style="font-size: 12px">
          {{ group.master.id }}
        </el-text>
      </div>
      <div
        v-if="group.slaves.length"
        style="
          margin-top: 10px;
          padding-left: 14px;
          border-left: 2px solid var(--el-border-color-lighter);
        ">
        <div
          v-for="(slave, idx) in group.slaves"
          :key="slave.node"
          style="display: flex; align-items: center; justify-content: space-between; gap: 10px"
          :style="{ marginTop: idx ? '8px' : '0' }">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0">
            <el-tag type="info" effect="dark" size="small">{{ slave.shortLabel }}</el-tag>
            <el-text effect="dark" type="info" style="font-size: 13px; font-weight: 500">
              {{ slave.node }}
            </el-text>
          </div>
          <el-text type="info" style="font-size: 12px">
            {{ slave.id }}
          </el-text>
        </div>
      </div>
      <el-text
        v-if="group.master.slots"
        effect="dark"
        type="info"
        size="small"
        style="display: block; margin-top: 10px; text-align: right">
        Slots: {{ group.master.slots }}
      </el-text>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.cluster-topology-wrap {
  height: 100%;
  overflow: auto;
  padding: 4px 2px 12px;
}
</style>
