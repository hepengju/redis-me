<script setup lang="ts">
// #region 导入
import { readTextFile } from '@tauri-apps/plugin-fs'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { UiConn } from '@/types/me-interface'
import { meErr, meWarn } from '@/utils/app/util'
import { checkConnList } from '@/utils/conn/conn-compat'
import {
  ConnImportParseError,
  connImportFileSuffix,
  parseAnotherRdmFromAno,
  parseRedisInsightConnections,
  parseRedisMeConnections,
  parseTinyRdmFromZipFile,
  type ConnImportSource,
} from '@/utils/conn/rdm'
// #endregion

// #region 核心状态

const emit = defineEmits<{ import: [list: UiConn[]]; closed: [] }>()

const { t } = useI18n()

const visible = ref(false)
const source = ref<ConnImportSource>('redisme')
const filePath = ref('')
const loading = ref(false)

const fileSuffix = computed(() => connImportFileSuffix(source.value))

// 产品名，不做 i18n
const sourceOptions: { label: string; value: ConnImportSource }[] = [
  { label: 'RedisME', value: 'redisme' },
  { label: 'AnotherRDM', value: 'another' },
  { label: 'TinyRDM', value: 'tiny' },
  { label: 'Redis Insight', value: 'insight' },
]

const filePlaceholder = computed(() => {
  if (source.value === 'redisme') return t('conn.importPlaceholderRedisme')
  if (source.value === 'another') return t('conn.importPlaceholderAnother')
  if (source.value === 'tiny') return t('conn.importPlaceholderTiny')
  return t('conn.importPlaceholderInsight')
})

watch(source, () => {
  filePath.value = ''
})
// #endregion

// #region 面板操作

defineExpose({ open })

function open(): void {
  visible.value = true
  source.value = 'redisme'
  filePath.value = ''
}

function close(): void {
  visible.value = false
  emit('closed')
}

async function submit(): Promise<void> {
  if (!filePath.value.trim()) {
    meErr(t('conn.importFileRequired'), t('conn.importErr'))
    return
  }

  loading.value = true
  try {
    let list: UiConn[]
    if (source.value === 'redisme') {
      const text = await readTextFile(filePath.value)
      list = parseRedisMeConnections(text)
    } else if (source.value === 'another') {
      const text = await readTextFile(filePath.value)
      list = parseAnotherRdmFromAno(text)
    } else if (source.value === 'insight') {
      const text = await readTextFile(filePath.value)
      list = parseRedisInsightConnections(text)
    } else {
      const { connections, skippedUnix } = await parseTinyRdmFromZipFile(filePath.value)
      list = connections
      if (skippedUnix > 0 && list.length > 0) {
        meWarn(t('conn.importSkippedUnix', { n: skippedUnix }))
      }
    }

    checkConnList(list as Parameters<typeof checkConnList>[0])
    loading.value = false
    emit('import', list)
    close()
    return
  } catch (e: unknown) {
    if (e instanceof ConnImportParseError) {
      meErr(t(e.i18nKey), t('conn.importErr'))
    } else {
      meErr(e instanceof Error ? e : String(e), t('conn.importErr'))
    }
  } finally {
    loading.value = false
  }
}
// #endregion
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('conn.importTitle')"
    width="500px"
    destroy-on-close
    @update:model-value="(v: boolean) => !v && close()">
    <el-form label-position="top">
      <el-form-item :label="t('conn.importSource')">
        <el-segmented v-model="source" :options="sourceOptions" />
      </el-form-item>
      <el-form-item :label="t('conn.importPickFile')">
        <me-file-input
          v-model="filePath"
          :file-suffix="fileSuffix"
          :placeholder="filePlaceholder"
          class="w-full" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">{{ t('cancel') }}</el-button>
      <el-button type="primary" :loading="loading" @click="submit()">{{ t('ok') }}</el-button>
    </template>
  </el-dialog>
</template>
