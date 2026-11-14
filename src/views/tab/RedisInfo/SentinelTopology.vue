<script setup lang="ts">
// 哨兵拓扑：挂载时临时连配置里的哨兵，只画当前 master。失败时通知父组件关掉弹窗。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SentinelPeer, SentinelTopology } from '@/types/tauri-specta'
import { meCommands } from '@/utils/util'

const props = defineProps<{ connId: string }>()

const emit = defineEmits<{ failed: [] }>()

const { t } = useI18n()

const topology = ref<SentinelTopology | null>(null)
const loading = ref(true)
const ROLE_FLAGS = new Set(['master', 'slave', 'sentinel'])

type SentinelPeerRow = SentinelPeer & { self: boolean }

const peers = computed<SentinelPeerRow[]>(() => {
  const topo = topology.value
  if (!topo) return []
  return [
    { addr: topo.selfAddr, flags: '', linkDownMs: 0, self: true },
    ...topo.sentinels.map(peer => ({ ...peer, self: false })),
  ]
})

function sentinelAlert(flags: string): string {
  return flags
    .split(',')
    .map(part => part.trim())
    .filter(part => part && !ROLE_FLAGS.has(part))
    .join(', ')
}

function formatLinkDown(ms: number): string {
  if (ms >= 1000) {
    const sec = ms / 1000
    const text = Number.isInteger(sec) ? String(sec) : sec.toFixed(1)
    return `${text}s`
  }
  return `${ms}ms`
}

function peerStatus(peer: SentinelPeer): string {
  const alert = sentinelAlert(peer.flags)
  const down =
    peer.linkDownMs > 0
      ? t('redisInfo.sentinelLinkDown', { time: formatLinkDown(peer.linkDownMs) })
      : ''
  return [alert, down].filter(Boolean).join(' · ')
}

let alive = true
onUnmounted(() => {
  alive = false
})

onMounted(async () => {
  try {
    const data = await meCommands.sentinelTopology(props.connId)
    if (!alive) return
    topology.value = data
  } catch {
    if (alive) emit('failed')
  } finally {
    if (alive) loading.value = false
  }
})
</script>

<template>
  <div v-loading="loading" class="cluster-topology-wrap">
    <template v-if="topology">
      <el-card shadow="hover">
        <div
          v-for="(peer, idx) in peers"
          :key="`${peer.addr}-${idx}`"
          class="topo-row"
          :style="{ marginTop: idx ? '8px' : '0' }">
          <div class="topo-row-main">
            <el-tag
              :type="peer.self ? 'primary' : peerStatus(peer) ? 'danger' : 'info'"
              effect="dark"
              size="small">
              {{ peer.self ? t('redisInfo.sentinelSelf') : t('redisInfo.sentinelPeer') }}
            </el-tag>
            <el-text
              effect="dark"
              :type="peer.self ? 'primary' : 'info'"
              style="font-size: 13px; font-weight: 500">
              {{ peer.addr }}
            </el-text>
          </div>
          <el-text v-if="peerStatus(peer)" type="danger" style="font-size: 12px; flex-shrink: 0">
            {{ peerStatus(peer) }}
          </el-text>
        </div>
      </el-card>
      <el-card shadow="hover" style="margin-top: 10px">
        <div class="topo-row">
          <div class="topo-row-main">
            <el-tag
              :type="peerStatus(topology.master) ? 'danger' : 'primary'"
              effect="dark"
              size="small">
              {{ t('redisInfo.sentinelMaster') }}
            </el-tag>
            <el-text effect="dark" type="primary" style="font-size: 13px; font-weight: 600">
              {{ topology.master.addr }}
            </el-text>
          </div>
          <div class="topo-row-side">
            <el-text type="info" style="font-size: 12px">{{ topology.masterName }}</el-text>
            <el-text v-if="peerStatus(topology.master)" type="danger" style="font-size: 12px">
              {{ peerStatus(topology.master) }}
            </el-text>
          </div>
        </div>
        <div v-if="topology.replicas.length" class="topo-replicas">
          <div
            v-for="(replica, idx) in topology.replicas"
            :key="`${replica.addr}-${idx}`"
            class="topo-row"
            :style="{ marginTop: idx ? '8px' : '0' }">
            <div class="topo-row-main">
              <el-tag :type="peerStatus(replica) ? 'danger' : 'info'" effect="dark" size="small">
                {{ t('redisInfo.sentinelReplica') }}
              </el-tag>
              <el-text effect="dark" type="info" style="font-size: 13px; font-weight: 500">
                {{ replica.addr }}
              </el-text>
            </div>
            <el-text
              v-if="peerStatus(replica)"
              type="danger"
              style="font-size: 12px; flex-shrink: 0">
              {{ peerStatus(replica) }}
            </el-text>
          </div>
        </div>
        <el-text
          v-if="topology.quorum > 0"
          class="topo-quorum"
          effect="dark"
          type="info"
          size="small">
          <me-icon
            :name="`${t('redisInfo.sentinelQuorum')}: ${topology.quorum}`"
            icon="el-icon-question-filled"
            :info="t('redisInfo.sentinelQuorumTip')"
            placement="top" />
        </el-text>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
.cluster-topology-wrap {
  height: 100%;
  overflow: auto;
  padding: 4px 2px 12px;
  min-height: 80px;
}

.topo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.topo-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.topo-row-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.topo-replicas {
  margin-top: 10px;
  padding-left: 14px;
  border-left: 2px solid var(--el-border-color-lighter);
}

.topo-quorum {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-top: 10px;
}
</style>
