<script setup lang="ts">
// #region 导入
// 批量删除/导出：查看受影响键时按 cursor 续扫至完成，支持暂停/继续/取消
import { useVirtualList } from '@vueuse/core'
import type { FormItemRule } from 'element-plus'
import { cloneDeep } from 'lodash'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize, ScanCursor } from '@/types/tauri-specta'
import { clearKeyMemoryCacheForConn } from '@/utils/key-memory-cache'
import { clearKeyTtlCacheForConn } from '@/utils/key-ttl-cache'
import { clearKeyTypeCacheForConn } from '@/utils/key-type-cache'
import { meCommands, meOk, sleep } from '@/utils/util'
// #endregion

// #region 核心状态
// 打开对话框时合并进表单的字段（与 initForm 一致）
type KeyBatchForm = {
  match: string
  keyList: RedisKey_Deserialize[]
  deleteDirect: boolean
  file: string
  withTtl: boolean
  // csv：DUMP 格式；cmd：redis-cli 可执行命令文本
  exportFormat: 'csv' | 'cmd'
}

type KeyBatchOpenData = Partial<KeyBatchForm>

const { t } = useI18n()
const emit = defineEmits(['success', 'closed'])

defineExpose({ open })
function open(data: KeyBatchOpenData, mode: string = 'export') {
  resetScanState()
  visible.value = true
  checkedKeys.value = (data.keyList?.length ?? 0) > 0
  showScan.value = !checkedKeys.value
  batchMode.value = mode
  Object.assign(form.value, cloneDeep(initForm))
  Object.assign(form.value, data)
  if (checkedKeys.value) scanFinished.value = true
}

// 共享数据
const share = inject(shareProvideKey)!

// 表单数据
const checkedKeys = ref(false)
const batchMode = ref('export')
const visible = ref(false)
const loading = ref(false)
const initForm: KeyBatchForm = {
  match: '',
  keyList: [],
  deleteDirect: false,
  file: '',
  withTtl: true,
  exportFormat: 'csv',
}

const form = ref<KeyBatchForm>(cloneDeep(initForm))
// #endregion

// #region 扫描与状态
// 扫描：续扫至 finished；暂停保留列表与游标，取消则回到初始
const scanning = ref(false)
const scanPaused = ref(false)
const scanCancelled = ref(false)
const scanFinished = ref(false)
const scanCursor = ref<ScanCursor | null>(null)

watch(
  () => form.value.match,
  () => {
    if (!checkedKeys.value) {
      void abortScanAndResetList()
    }
  },
)

function resetScanState() {
  scanCancelled.value = true
  scanPaused.value = false
  scanFinished.value = false
  scanCursor.value = null
}

async function abortScanAndResetList() {
  scanCancelled.value = true
  scanPaused.value = false
  // 等当前一轮 scan 的 finally 把 scanning 置回 false
  while (scanning.value) {
    await sleep(20)
  }
  showScan.value = true
  form.value.keyList = []
  scanCursor.value = null
  scanFinished.value = false
}

const rules = computed((): Record<string, FormItemRule[]> => {
  const rules: Record<string, FormItemRule[]> = {
    match: [{ required: true, message: t('keyBatch.matchRequired') }],
  }
  if (isExport.value) {
    rules.file = [{ required: true, message: t('keyBatch.exportFileRequired') }]
  }
  return rules
})

// 提交数据
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      if (isExport.value) {
        await meCommands.exportCsv(share.conn!.id, form.value)
      } else {
        const count = await meCommands.batchDel(share.conn!.id, form.value)
        clearKeyTypeCacheForConn(share.conn!.id)
        clearKeyMemoryCacheForConn(share.conn!.id)
        clearKeyTtlCacheForConn(share.conn!.id)
        meOk(t('batchDeleteOk', { count }))
      }
      emit('success', batchMode.value)
      visible.value = false
    } finally {
      loading.value = false
    }
  })
}

// 扫描受影响的键（可暂停/继续；确认仅在扫完后）
const showScan = ref(true)
async function startOrResumeScan() {
  if (!share.conn || scanning.value) return

  // 全新开始
  if (showScan.value) {
    form.value.keyList = []
    scanCursor.value = null
    scanFinished.value = false
    showScan.value = false
  }

  scanning.value = true
  scanCancelled.value = false
  scanPaused.value = false
  try {
    const count = (meTauri.settings.keyScanCount as number) || 1000
    while (!scanCancelled.value && !scanPaused.value) {
      const data = await meCommands.scan(share.conn.id, {
        match: form.value.match,
        type: '',
        cursor: scanCursor.value,
        exact: false,
        count,
      })
      if (scanCancelled.value) break
      form.value.keyList = form.value.keyList.concat(data.keyList)
      scanCursor.value = data.cursor
      if (data.cursor.finished) {
        scanFinished.value = true
        break
      }
    }
  } catch {
    // meCommands 已弹错；停在暂停态便于继续或取消
    scanPaused.value = true
  } finally {
    scanning.value = false
  }
}

function pauseScan() {
  scanPaused.value = true
}

function cancelScan() {
  void abortScanAndResetList()
}

function onDialogClosed() {
  resetScanState()
  emit('closed')
}

// 虚拟列表
const items = computed(() => form.value.keyList)
const { list, containerProps, wrapperProps } = useVirtualList(items, { itemHeight: 14 })
// #endregion

// #region 提交与面板操作
const scanStatusText = computed(() => {
  if (scanFinished.value) return t('keyBatch.scanDone')
  if (scanning.value) return t('keyBatch.scanScanning')
  if (scanPaused.value) return t('keyBatch.scanPaused')
  return ''
})

// 批量删除和导出数据同时支持
const isExport = computed(() => batchMode.value === 'export')
const title = computed(() => (isExport.value ? t('keyBatch.export') : t('keyBatch.delete')))
const directTip = computed(() =>
  isExport.value ? t('keyBatch.exportDirect') : t('keyBatch.deleteDirect'),
)
const confirmBtn = computed(() =>
  isExport.value ? t('keyBatch.confirmExport') : t('keyBatch.confirmDelete'),
)
const confirmSizeBtn = computed(() => {
  const count = form.value.keyList.length
  return isExport.value
    ? t('keyBatch.confirmExportSize', { count }, count)
    : t('keyBatch.confirmDeleteSize', { count }, count)
})
const exportBtnEnabled = computed(() => (isExport.value ? !!form.value.file : true))
// 列表路径：扫完才可确认；多选打开时已是完整列表
const listConfirmEnabled = computed(
  () =>
    scanFinished.value &&
    form.value.keyList.length > 0 &&
    exportBtnEnabled.value &&
    !scanning.value,
)

// 导出文件名称添加服务器及版本（不同版本的redisdump命令可能不兼容，便于分析问题）
const exportFilePrefix = computed(
  () =>
    'RedisME_export_' +
    (share.capabilities.isValkey ? 'Valkey' : 'Redis') +
    share.capabilities.version,
)
const exportFormatOptions = computed(() => [
  { label: 'CSV', value: 'csv' as const },
  { label: 'CMD', value: 'cmd' as const },
])
const exportFileSuffix = computed(() => (form.value.exportFormat === 'cmd' ? 'redis' : 'csv'))
const exportFormatTip = computed(() =>
  form.value.exportFormat === 'cmd'
    ? t('keyBatch.exportFormatTipCmd')
    : t('keyBatch.exportFormatTipCsv'),
)
// #endregion
</script>

<template>
  <el-dialog :title v-model="visible" :width="600" @closed="onDialogClosed" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item :label="t('keyBatch.match')" prop="match" v-if="!checkedKeys">
        <!-- 此处保留可编辑，使用更加方便 -->
        <el-input type="text" v-model="form.match" :disabled="scanning" />
        <el-checkbox v-model="form.deleteDirect" v-if="form.keyList.length === 0 && !scanning">{{
          directTip
        }}</el-checkbox>
      </el-form-item>

      <el-row :span="24" v-if="isExport">
        <el-col :span="12">
          <el-form-item :label="t('keyBatch.ttl')">
            <el-checkbox v-model="form.withTtl">{{ t('keyBatch.expireTip') }}</el-checkbox>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('keyBatch.exportFormat')">
            <el-segmented v-model="form.exportFormat" :options="exportFormatOptions" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-text v-if="isExport" type="info" class="export-format-tip">{{ exportFormatTip }}</el-text>

      <el-form-item :label="t('keyBatch.exportFile')" v-if="isExport" prop="file">
        <me-file-input
          v-model="form.file"
          :placeholder="t('keyBatch.exportFileTip')"
          :file-prefix="exportFilePrefix"
          :file-suffix="exportFileSuffix" />
      </el-form-item>

      <el-form-item
        :label="t('keyBatch.impactKeys', { count: form.keyList.length }, form.keyList.length)"
        v-if="!showScan">
        <div v-bind="containerProps" :style="{ height: '150px', width: '100%' }">
          <div v-bind="wrapperProps">
            <div v-for="item in list" :key="item.index" class="key single-line-ellipsis">
              {{ item.data.key }}
            </div>
          </div>
        </div>
        <el-text type="info" class="scan-progress-tip">
          {{ t('keyBatch.scanProgress', { count: form.keyList.length }) }}
          <template v-if="scanStatusText"> · {{ scanStatusText }}</template>
        </el-text>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="loading"
        @click="submit"
        v-if="form.deleteDirect"
        :disabled="!exportBtnEnabled || scanning"
        >{{ confirmBtn }}</el-button
      >
      <template v-else>
        <!-- 尚未开始扫描 -->
        <el-button type="primary" :loading="scanning" @click="startOrResumeScan" v-if="showScan">{{
          t('keyBatch.showImpactKeys')
        }}</el-button>
        <!-- 扫描中：暂停 / 取消 -->
        <template v-else-if="scanning">
          <el-button @click="cancelScan">{{ t('keyBatch.cancelScan') }}</el-button>
          <el-button type="warning" @click="pauseScan">{{ t('keyMain.pauseScan') }}</el-button>
        </template>
        <!-- 已暂停：继续 / 取消 -->
        <template v-else-if="scanPaused && !scanFinished">
          <el-button @click="cancelScan">{{ t('keyBatch.cancelScan') }}</el-button>
          <el-button type="primary" @click="startOrResumeScan">{{
            t('keyMain.resumeScan')
          }}</el-button>
        </template>
        <!-- 扫完：确认 -->
        <el-button
          v-else
          type="primary"
          :loading="loading"
          @click="submit"
          :disabled="!listConfirmEnabled">
          {{ confirmSizeBtn }}</el-button
        >
      </template>
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

.export-format-tip {
  display: block;
  margin: -8px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-line;
}

.scan-progress-tip {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
}
</style>
