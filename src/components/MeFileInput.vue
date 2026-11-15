<script setup lang="ts">
// 说明: 支持文件选择，SSL证书相关文件
import { open, save } from '@tauri-apps/plugin-dialog'
import { computed } from 'vue'

import { buildTimestampedFileName } from '@/utils/app/export'

const props = withDefaults(
  defineProps<{
    filePrefix?: string
    /** 单扩展名（与 fileExtensions 二选一，优先 fileExtensions） */
    fileSuffix?: string
    /** 文件对话框允许的扩展名列表 */
    fileExtensions?: string[]
  }>(),
  { filePrefix: '', fileSuffix: '', fileExtensions: undefined },
)
const model = defineModel<string>({ default: '' })

const dialogExtensions = computed(() =>
  props.fileExtensions?.length ? props.fileExtensions : props.fileSuffix ? [props.fileSuffix] : [],
)

const defaultExt = computed(() => dialogExtensions.value[0] ?? props.fileSuffix)

async function openDialog(): Promise<void> {
  const exts = dialogExtensions.value
  const filters = exts.length ? [{ name: '', extensions: exts }] : []
  let file: string | null = null
  if (props.filePrefix) {
    const fileName = buildTimestampedFileName(props.filePrefix, defaultExt.value)
    file = await save({ filters, defaultPath: fileName })
  } else {
    file = await open({ multiple: false, directory: false, filters })
  }
  if (file) model.value = file
}
</script>
<template>
  <el-input v-bind="$attrs" v-model="model">
    <template #append>
      <el-button type="primary" @click="openDialog">...</el-button>
    </template>
  </el-input>
</template>
