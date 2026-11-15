<script setup lang="ts">
// #region 导入
// 自定义编解码 CRUD：由 RedisValue 编解码下拉头部编辑入口打开；列表顺序即下拉展示顺序
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { TableInstance } from 'element-plus'
import { Sortable, type SortableEvent } from 'sortablejs'
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { pickSavePath } from '@/utils/app/export'
import { meConfirm, meErr, meErrHtml, meOk, meOpenUrl } from '@/utils/app/util'
import {
  buildCodecCommandLine,
  CODEC_TEMPLATES,
  findCodecTemplate,
} from '@/utils/codec/codec-templates'
import {
  buildCodecCommand,
  parseCodecErrorDetail,
  testCodec,
  textUtf8ToBase64,
  type CustomCodec,
} from '@/utils/codec/format'
// #endregion

// #region 核心状态
const visible = defineModel<boolean>({ default: false })
const { t } = useI18n()
const tableRef = useTemplateRef<TableInstance>('table')
const list = computed(() => window.meTauri.settings.customCodecs ?? [])
// #endregion

// #region 拖拽排序
let sortable: Sortable | null = null
function destroySortable() {
  sortable?.destroy()
  sortable = null
}

// 绑定 el-table tbody；顺序写入 settings.customCodecs
function setupSortable() {
  destroySortable()
  const tbody = tableRef.value?.$el.querySelector(
    '.el-table__body-wrapper tbody',
  ) as HTMLElement | null
  if (!tbody) return
  sortable = Sortable.create(tbody, {
    handle: '.drag-handle',
    filter: '.row-actions',
    preventOnFilter: true,
    animation: 150,
    onEnd({ oldIndex, newIndex }: SortableEvent) {
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
      const arr = window.meTauri.settings.customCodecs
      if (!Array.isArray(arr)) return
      const [item] = arr.splice(oldIndex, 1)
      if (item) arr.splice(newIndex, 0, item)
    },
  })
}

watch(
  () => [visible.value, list.value.length] as const,
  ([open]) => {
    if (!open) {
      destroySortable()
      return
    }
    void nextTick(setupSortable)
  },
)

onBeforeUnmount(() => destroySortable())
// #endregion

// #region 表单编辑
const formVisible = ref(false)
const editIndex = ref(-1)
const testingDecode = ref(false)
const testingEncode = ref(false)
const form = reactive<CustomCodec>({ name: '', command: '' })
// 测试样例不预填：默认值是 Hex 模板的 hello，别的编码一测就失败。取消时还原打开前的内容
const testDecodeSample = ref('')
const testEncodeSample = ref('')
let decodeSampleSnap = ''
let encodeSampleSnap = ''
let formAccepted = false

const formValid = computed(() => form.name.trim() !== '' && form.command.trim() !== '')

function readForm(): CustomCodec | null {
  const name = form.name.trim()
  const command = form.command.trim()
  if (!name || !command) return null
  return { name, command }
}

function rememberSamples() {
  decodeSampleSnap = testDecodeSample.value
  encodeSampleSnap = testEncodeSample.value
  formAccepted = false
}

function openAdd(name = '', command = '') {
  editIndex.value = -1
  form.name = name
  form.command = command
  rememberSamples()
  formVisible.value = true
}

function openEdit(row: CustomCodec, index: number) {
  editIndex.value = index
  form.name = row.name
  form.command = row.command
  rememberSamples()
  formVisible.value = true
}

function restoreSamples() {
  if (formAccepted) return
  testDecodeSample.value = decodeSampleSnap
  testEncodeSample.value = encodeSampleSnap
}

function cancelForm(done?: () => void) {
  restoreSamples()
  if (done) done()
  else formVisible.value = false
}

// 从模板导出脚本到本机，再预填添加表单
async function applyTemplate(id: string) {
  const tpl = findCodecTemplate(id)
  if (!tpl) return
  const path = await pickSavePath(tpl.fileName, [tpl.ext], tpl.ext.toUpperCase())
  if (!path) return
  try {
    await writeTextFile(path, tpl.source)
    meOk(t('customCodec.templateExportOk'))
    openAdd(tpl.defaultName, buildCodecCommandLine(tpl.interpreter, path))
  } catch (e: unknown) {
    meErr(e instanceof Error ? e : String(e), t('customCodec.templateExportErr'))
  }
}

function removeAt(row: CustomCodec, index: number) {
  meConfirm(t('customCodec.deleteConfirm', { name: row.name }), () => {
    list.value.splice(index, 1)
  })
}

function saveForm() {
  const name = form.name.trim()
  const command = form.command.trim()
  if (!name) {
    meErr(t('customCodec.nameRequired'))
    return
  }
  if (!command) {
    meErr(t('customCodec.emptyCommand'))
    return
  }
  const dup = list.value.findIndex((f, i) => f.name === name && i !== editIndex.value)
  if (dup >= 0) {
    meErr(t('customCodec.duplicateName'))
    return
  }
  const prev = editIndex.value >= 0 ? list.value[editIndex.value] : undefined
  // 编辑名称/命令时保留表格上的 Auto 勾选
  const item = { name, command, auto: prev?.auto === true }
  if (editIndex.value >= 0) {
    list.value[editIndex.value] = item
  } else {
    list.value.push(item)
  }
  formAccepted = true
  formVisible.value = false
}
// #endregion

// #region 测试
async function runTest(mode: 'decode' | 'encode') {
  const codec = readForm()
  if (!codec) {
    meErr(t('customCodec.emptyCommand'))
    return
  }
  const isDecode = mode === 'decode'
  const sample = (isDecode ? testDecodeSample : testEncodeSample).value.trim()
  if (!sample) {
    meErr(
      t(isDecode ? 'customCodec.testDecodeSampleRequired' : 'customCodec.testEncodeSampleRequired'),
    )
    return
  }
  const loading = isDecode ? testingDecode : testingEncode
  // 解码样例已是原始字节 Base64；编码样例是编辑区明文，这里按保存时同样做成 Base64
  const arg = isDecode ? sample : textUtf8ToBase64(sample)
  const preview = buildCodecCommand(codec, mode, arg)
  loading.value = true
  try {
    const out = await testCodec(codec, mode, arg)
    meOk(
      t('customCodec.testResult', { command: preview, input: sample, output: out }),
      true,
      t('customCodec.testOk'),
      { dangerouslyUseHTMLString: true },
    )
  } catch (e) {
    const detail = parseCodecErrorDetail(e instanceof Error ? e.message : String(e))
    meErrHtml(t('customCodec.testErrorResult', { command: preview, input: sample, detail }))
  } finally {
    loading.value = false
  }
}

function openCodecDoc() {
  meOpenUrl(t('customCodec.docUrl'))
}
// #endregion
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('customCodec.title')"
    width="720px"
    append-to-body
    destroy-on-close
    draggable>
    <div class="toolbar me-flex">
      <el-button link icon="el-icon-question-filled" @click="openCodecDoc">
        {{ t('customCodec.docHelp') }}
      </el-button>
      <div class="toolbar-actions me-flex">
        <el-dropdown trigger="click" @command="applyTemplate">
          <el-button>
            {{ t('customCodec.fromTemplate') }}
            <me-icon icon="el-icon-arrow-down" style="margin-left: 4px" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="tpl in CODEC_TEMPLATES" :key="tpl.id" :command="tpl.id">
                {{ t(`customCodec.template.${tpl.id}`) }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button icon="el-icon-plus" @click="openAdd()">
          {{ t('customCodec.add') }}
        </el-button>
      </div>
    </div>

    <el-table ref="table" :data="list" row-key="name" border stripe>
      <el-table-column label="#" type="index" width="50" align="center" class-name="drag-handle" />
      <el-table-column
        :label="t('customCodec.name')"
        prop="name"
        width="100"
        show-overflow-tooltip />
      <el-table-column :label="t('customCodec.command')" prop="command" show-overflow-tooltip />
      <el-table-column width="128" align="center">
        <template #header>
          <span class="auto-col-header">
            {{ t('customCodec.auto') }}
            <me-icon
              icon="el-icon-question-filled"
              :info="t('customCodec.autoHelp')"
              placement="top"
              raw-content
              :show-after="200" />
          </span>
        </template>
        <template #default="{ row }">
          <el-checkbox v-model="row.auto" />
        </template>
      </el-table-column>
      <el-table-column :label="t('action')" width="80" align="center">
        <template #default="{ row, $index }">
          <div class="row-actions">
            <el-button link type="primary" icon="el-icon-edit" @click="openEdit(row, $index)" />
            <el-button link type="danger" icon="el-icon-delete" @click="removeAt(row, $index)" />
          </div>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>

  <el-dialog
    v-model="formVisible"
    :title="editIndex >= 0 ? t('customCodec.edit') : t('customCodec.add')"
    width="720px"
    append-to-body
    destroy-on-close
    draggable
    :before-close="cancelForm"
    @closed="restoreSamples">
    <el-form label-position="top">
      <el-form-item :label="t('customCodec.name')" required>
        <el-input v-model="form.name" :placeholder="t('customCodec.namePlaceholder')" />
      </el-form-item>
      <el-form-item required class="custom-codec-field">
        <template #label>
          <span class="field-label">
            {{ t('customCodec.command') }}
            <me-icon
              icon="el-icon-question-filled"
              :info="t('customCodec.commandHelp')"
              placement="top-start"
              raw-content
              :show-after="200" />
          </span>
        </template>
        <el-input v-model="form.command" :placeholder="t('customCodec.commandPlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('customCodec.testDecodeSample')">
        <div class="test-row">
          <el-input
            v-model="testDecodeSample"
            clearable
            :placeholder="t('customCodec.testDecodeSamplePh')" />
          <el-button :loading="testingDecode" @click="runTest('decode')">{{
            t('customCodec.testDecode')
          }}</el-button>
        </div>
      </el-form-item>
      <el-form-item :label="t('customCodec.testEncodeSample')">
        <div class="test-row">
          <el-input
            v-model="testEncodeSample"
            clearable
            :placeholder="t('customCodec.testEncodeSamplePh')" />
          <el-button :loading="testingEncode" @click="runTest('encode')">{{
            t('customCodec.testEncode')
          }}</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="cancelForm()">{{ t('cancel') }}</el-button>
      <el-button type="primary" :disabled="!formValid" @click="saveForm">{{ t('ok') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.toolbar {
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.toolbar-actions {
  gap: 8px;
  align-items: center;
}

// 命令标签与必填星号、? 保持同一行
.custom-codec-field :deep(.el-form-item__label) {
  display: inline-flex;
  align-items: center;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.auto-col-header {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}

.test-row {
  display: flex;
  gap: 8px;
  width: 100%;

  :deep(.el-input) {
    flex: 1;
    min-width: 0;
  }
}

:deep(.drag-handle) {
  cursor: move;
}

:deep(.sortable-ghost) {
  background-color: var(--el-color-primary-light-8);
}
</style>
