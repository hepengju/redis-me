<script setup lang="ts">
// #region 导入
// csv：DUMP 格式；cmd：redis-cli 命令文本
import { cloneDeep } from 'lodash'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisImportCsv } from '@/types/tauri-specta'
import { meCommands } from '@/utils/app/util'
// #endregion

// #region 核心状态
type KeyImportForm = RedisImportCsv & { importFormat: 'csv' | 'cmd' }

const { t } = useI18n()
const emit = defineEmits(['success', 'closed'])

defineExpose({ open })
function open() {
  visible.value = true
  Object.assign(form.value, cloneDeep(initForm))
}

// 共享数据
const share = inject(shareProvideKey)!

// 表单数据
const visible = ref(false)
const loading = ref(false)
const initForm: KeyImportForm = {
  file: '',
  handleConflict: 'replace',
  handleTtl: 'parse',
  ttl: -1,
  importFormat: 'csv',
}

// 命令文本：.redis 为主后缀，.txt 通用文本
const cmdFileExtensions = ['redis', 'txt']
const isCmdFile = computed(() => form.value.importFormat === 'cmd')
const fileSuffixTip = computed(() => (isCmdFile.value ? cmdFileExtensions.join(', ') : 'csv'))

const form = ref<KeyImportForm>(cloneDeep(initForm))
// #endregion

// #region 计算属性
const importFormatOptions = computed(() => [
  { label: 'CSV', value: 'csv' as const },
  { label: 'CMD', value: 'cmd' as const },
])
const importFormatTip = computed(() =>
  isCmdFile.value ? t('keyImport.importFormatTipCmd') : t('keyImport.importFormatTipCsv'),
)

watch(
  () => form.value.importFormat,
  () => {
    form.value.file = ''
  },
)
const rules = computed(() => ({ file: [{ required: true, message: t('keyImport.fileRequired') }] }))
const handleConflictOptions = computed(() => [
  { label: t('keyImport.replace'), value: 'replace' },
  { label: t('keyImport.ignore'), value: 'ignore' },
])
const handleTtlOptions = computed(() => [
  { label: t('keyImport.parse'), value: 'parse' },
  { label: t('keyImport.forever'), value: 'forever' },
])
// #endregion

// #region 面板操作
// 提交数据
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      if (isCmdFile.value) {
        await meCommands.importCmd(share.conn!.id, form.value.file)
      } else {
        await meCommands.importCsv(share.conn!.id, form.value)
      }
      emit('success')
      visible.value = false
    } finally {
      loading.value = false
    }
  })
}
// #endregion
</script>

<template>
  <el-dialog
    :title="t('keyImport.title')"
    v-model="visible"
    :width="600"
    @closed="emit('closed')"
    destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-row :span="24">
        <el-col :span="8">
          <el-form-item :label="t('keyImport.importFormat')">
            <el-segmented v-model="form.importFormat" :options="importFormatOptions" />
          </el-form-item>
        </el-col>
        <el-col v-if="!isCmdFile" :span="8">
          <el-form-item :label="t('keyImport.handleConflict')">
            <el-segmented v-model="form.handleConflict" :options="handleConflictOptions" />
          </el-form-item>
        </el-col>
        <el-col v-if="!isCmdFile" :span="8">
          <el-form-item :label="t('keyImport.handleTtl')">
            <el-segmented v-model="form.handleTtl" :options="handleTtlOptions" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-text type="info" class="import-format-tip">{{ importFormatTip }}</el-text>

      <el-form-item :label="t('keyImport.file')" prop="file">
        <me-file-input
          v-model="form.file"
          :placeholder="t('keyImport.fileTip', { tip: fileSuffixTip })"
          :file-suffix="isCmdFile ? 'redis' : 'csv'"
          :file-extensions="isCmdFile ? cmdFileExtensions : undefined" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('cancel') }}</el-button>
      <el-button type="primary" :loading="loading" @click="submit" :disabled="!form.file">
        {{ t('keyImport.confirm') }}</el-button
      >
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.import-format-tip {
  display: block;
  margin: -8px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-line;
}
</style>
