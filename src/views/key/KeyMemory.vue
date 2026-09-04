<script setup lang="ts">
// 键树文件夹右键：对该目录 MATCH 做内存分析（与内存页同一套扫描循环）
import { useVirtualList } from '@vueuse/core'
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import { useMemoryScan } from '@/utils/memory-scan'
import { meHumanSize } from '@/utils/util'

const { t } = useI18n()
defineExpose({ open })
const share = inject(shareProvideKey)!
const visible = ref(false)
const match = ref('')

const {
  scanning,
  paused,
  dataList,
  showScanControl,
  scanProgress,
  scanToggleTip,
  start,
  stop,
  onRingClick,
  onStartStop,
} = useMemoryScan({
  connId: () => share.conn?.id,
  param: () => ({
    match: match.value,
    sizeLimit: 0,
    scanCount: 1000,
    sleepMillis: 0,
    needKeyType: false,
  }),
  totalEstimate: () => 0,
})

async function open(data: { match: string }) {
  match.value = data.match
  visible.value = true
  await stop()
  await start()
}

async function onClosed() {
  // 关闭动画中又打开时，本次 closed 不能停掉新扫描
  if (visible.value) return
  await stop()
  if (!visible.value) dataList.value = []
}

const totalSize = computed(() =>
  dataList.value.map(item => item.size).reduce((sum, cur) => sum + cur, 0),
)
const items = computed(() => dataList.value)
const { list, containerProps, wrapperProps } = useVirtualList(items, { itemHeight: 14 })
</script>

<template>
  <el-dialog :title="t('keyMemory.title')" v-model="visible" :width="600" @closed="onClosed">
    <el-form label-position="top">
      <el-form-item :label="t('keyMemory.match')">
        <el-input type="text" v-model="match" disabled />
      </el-form-item>

      <el-form-item
        :label="t('keyMemory.info', { total: dataList.length, size: meHumanSize(totalSize) })">
        <div
          v-bind="containerProps"
          v-loading="scanning && dataList.length === 0"
          :style="{ height: '300px', width: '100%' }">
          <div v-bind="wrapperProps">
            <div v-for="item in list" :key="item.index" class="key me-flex">
              <div class="single-line-ellipsis">{{ item.data.key }}</div>
              <div>{{ meHumanSize(item.data.size) }}</div>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="memory-footer">
        <me-scan-control
          v-if="showScanControl"
          :percentage="scanProgress"
          :loading="scanning"
          :tip="scanToggleTip"
          @click="onRingClick" />
        <el-button v-if="!scanning && !paused" @click="visible = false">{{
          t('cancel')
        }}</el-button>
        <el-button v-else type="danger" icon="el-icon-video-pause" @click="onStartStop">{{
          t('redisMemory.stopScan')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.key {
  font-size: 14px;
  line-height: 14px;
  padding: 3px 4px;
  color: var(--el-color-info);
}

.memory-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
