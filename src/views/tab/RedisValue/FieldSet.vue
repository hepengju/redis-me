<script setup lang="ts">
// #region 导入
import { cloneDeep } from 'lodash'
import { computed, inject, nextTick, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MeSelectUpDownIcon from '@/components/MeSelectUpDownIcon.vue'
import { shareProvideKey } from '@/types/me-interface'
import type {
  BytesFormat,
  RedisFieldGet_Deserialize,
  RedisFieldSet_Deserialize,
  RedisFieldValue,
} from '@/types/tauri-specta'
import { detectViewFormatAuto, detectedViewLabel } from '@/utils/detect-view-format'
import {
  IPC_WIRE_FORMAT,
  base64WireToUtf8Display,
  customFormatName,
  fieldViewOptions,
  isCustomView,
  isReadonlyView,
  isViewDecodeError,
  meFormatViewValue,
  meFormatViewValueAsync,
  meViewToWire,
  meViewToWireAsync,
  needsJsonNormalize,
  readonlyViewTip,
  type ViewBytesFormat,
} from '@/utils/format'
import { meCommands, meCopy, meErr, meFormatDisplayValue, meJsonNormal, meOk } from '@/utils/util'
import { parseAttrsInput, parseVectorInput } from '@/utils/vector'
// #endregion

// 字段编辑面板：fieldScan 返回的 wire（恒 base64）→ 前端按编码展示/编辑 → field_set 写回。
// 数据流：srcFieldWire 为权威源，不被展示层覆盖；切编码只重算展示，不打 Redis。

// #region 类型定义与组件接口
// FieldSetForm / FieldSetOpen / Props / Emits / Expose / 注入
/** 提交时剔除 type / wireFieldKey 等 UI 辅助字段 */
type FieldSetForm = RedisFieldSet_Deserialize & {
  type: string
  wireFieldKey?: string
  streamId?: string
}

type FieldSetOpen = Partial<FieldSetForm> & {
  keyWireFmt?: BytesFormat // fieldScan 返回的 wire 形态（恒 base64）
  streamId?: string
  readonly?: boolean // 查看模式：表单只读，隐藏保存
  vectorDim?: number | null // Vector Set：键的 VDIM（用于维度预检）
  srcFieldAttrs?: string // Vector Set：field_get 已拿到的 attrs（跳过 VGETATTR）
  fieldExpireAt?: Date // 表格扫描时钉死的字段过期时刻
}

const props = withDefaults(
  defineProps<{
    pretty?: boolean // 与 RedisValue 值区美化开关一致，open 时同步为初始状态
    hashFieldTtlEnabled?: boolean // 与值页 HTTL 开关一致；关则隐藏 TTL 展示/编辑，保存时由后端保留原有过期
  }>(),
  { pretty: true, hashFieldTtlEnabled: false },
)

const { t } = useI18n()
const emit = defineEmits<{ success: []; closed: []; refreshed: [data: RedisFieldValue] }>()
defineExpose({ open, close })

const share = inject(shareProvideKey)!
// #endregion

// #region 核心状态
// 面板可见性 / 加载态 / 表单 / wire 快照 / 编码
const visible = ref(false)
const readonly = ref(false)
const isSaving = ref(false)
const initForm: FieldSetForm = {
  key: { key: '', bytes: '' },
  type: 'string',
  srcFieldValue: '',
  fieldIndex: 0,
  fieldKey: '',
  fieldValue: '',
  fieldScore: 0,
  fieldTtl: -1,
  includeFieldTtl: false,
  valFmt: IPC_WIRE_FORMAT,
  vector: [],
  attrs: '',
}
const form = ref<FieldSetForm>(cloneDeep(initForm))

const srcFieldWire = ref('') // fieldScan 返回的原始 base64；切换编码时以此为源，不被展示覆盖
const expectedVectorDim = ref<number | null>(null) // Vector Set：键的 VDIM，打开时传入，提交前预检维度
const attrsText = ref('') // Vector Set：attrs 展示文本，打开时由 field_get 提供，保存时全量提交
const fieldViewFmt = ref<ViewBytesFormat>('auto') // 编码下拉；默认 Auto，与 STRING 键级一致
const fieldPretty = ref(true)
const editorLoading = ref(false)
const isRefreshing = ref(false)
const decodeFailed = ref(false)
const codeRemountKey = ref(0)
// #endregion

// #region 计算属性
// 编码选项 / 生效视图 / 保存按钮
const customNames = computed(() => (window.meTauri.settings.customCodecs ?? []).map(f => f.name))
const fieldViewOptionList = computed(() => fieldViewOptions(customNames.value))
const detectedAuto = computed(() => detectViewFormatAuto(srcFieldWire.value)) // Auto 识别（含 Gzip 剥壳）
const detectedView = computed(() => detectedAuto.value.view)
const gzipReadonly = computed(() => fieldViewFmt.value === 'auto' && detectedAuto.value.gzip)
const effectiveFieldViewFmt = computed<ViewBytesFormat>(() =>
  // Auto 时为识别结果，否则等于下拉选中项；驱动展示 / 保存 / 只读
  fieldViewFmt.value === 'auto' ? detectedView.value : fieldViewFmt.value,
)
const detectedViewText = computed(() =>
  fieldViewFmt.value === 'auto'
    ? detectedViewLabel(detectedView.value, detectedAuto.value.gzip)
    : '',
)
const vectorsetType = computed(() => form.value.type === 'vectorset')
const prettyEnabled = computed(
  // Vector Set 为 JSON 明文，始终可美化；其它类型随 utf8/strjson
  () =>
    vectorsetType.value ||
    effectiveFieldViewFmt.value === 'utf8' ||
    effectiveFieldViewFmt.value === 'strjson',
)
const isViewReadonlyFmt = computed(
  () => isReadonlyView(effectiveFieldViewFmt.value) || gzipReadonly.value,
) // JdkSerial / Pickle / PhpSerial / Gzip 剥壳不支持写回 → 按钮禁用 + tooltip
const canSaveField = computed(
  () =>
    !readonly.value &&
    !share.readonly &&
    !editorLoading.value &&
    (vectorsetType.value || (!isViewReadonlyFmt.value && !decodeFailed.value)),
)
const saveFieldTip = computed(() => {
  if (!vectorsetType.value && gzipReadonly.value) return t('util.gzipReadonly')
  if (!vectorsetType.value && isReadonlyView(effectiveFieldViewFmt.value)) {
    return readonlyViewTip(effectiveFieldViewFmt.value)
  }
  if (!vectorsetType.value && decodeFailed.value) return t('util.saveDecodeFailed')
  return ''
})
const showSaveField = computed(() => !readonly.value && !share.readonly) // 连接只读 / 查看模式 → 隐藏保存钮
const supportsFieldRefresh = computed(() => {
  // hash / list / zset / array 支持 field_get 单行刷新（vectorset 不做）
  const type = form.value.type
  return type === 'hash' || type === 'list' || type === 'zset' || type === 'array'
})
// #endregion

// #region 编辑器同步
// wire + 生效 view → 编辑区文本；切编码只重算展示，不打 Redis
async function syncFieldEditor() {
  // Vector Set：向量为 JSON 明文，attrs 由 open 中一并设置
  if (vectorsetType.value) {
    form.value.fieldValue = meFormatDisplayValue(srcFieldWire.value, fieldPretty.value)
    decodeFailed.value = false
    return
  }
  const wire =
    fieldViewFmt.value === 'auto' && detectedAuto.value.gzip
      ? detectedAuto.value.wire
      : srcFieldWire.value
  const fmt = effectiveFieldViewFmt.value
  if (!wire) {
    form.value.fieldValue = ''
    decodeFailed.value = false
    return
  }
  if (!fieldPretty.value && fmt === 'strjson') {
    form.value.fieldValue = base64WireToUtf8Display(wire)
    decodeFailed.value = false
    return
  }
  editorLoading.value = true
  try {
    if (isCustomView(fmt)) {
      form.value.fieldValue = await meFormatViewValueAsync(wire, fmt)
    } else if (fmt === 'utf8') {
      form.value.fieldValue = meFormatDisplayValue(
        meFormatViewValue(wire, 'utf8'),
        fieldPretty.value,
      )
    } else {
      form.value.fieldValue = meFormatViewValue(wire, fmt)
    }
    decodeFailed.value = isViewDecodeError(form.value.fieldValue)
  } catch (e) {
    form.value.fieldValue = e instanceof Error ? e.message : String(e)
    decodeFailed.value = true
  } finally {
    editorLoading.value = false
  }
}
// #endregion

// #region 面板操作
// 打开 / 关闭 / 编码切换 / 美化 / Escape 键 / 自定义编解码监听
function open(data: FieldSetOpen) {
  visible.value = true
  readonly.value = !!data.readonly
  expectedVectorDim.value = data.vectorDim ?? null
  const { fieldExpireAt, ...rest } = data
  Object.assign(form.value, cloneDeep(initForm), rest)
  srcFieldWire.value = String(data.srcFieldValue ?? '')
  attrsText.value = ''
  // VectorSet：attrs 已由 field_get 一并返回，直接设置
  if (vectorsetType.value && data.srcFieldAttrs != null) {
    attrsText.value = meFormatDisplayValue(data.srcFieldAttrs || '', fieldPretty.value)
  }
  // Hash / VectorSet 元素名：wireFieldKey 为 base64，fieldKey 为展示用 UTF-8
  const wireKey = String(data.wireFieldKey || data.fieldKey || '')
  if ((form.value.type === 'hash' || vectorsetType.value) && wireKey) {
    form.value.wireFieldKey = wireKey
    form.value.fieldKey = meFormatViewValue(wireKey, 'utf8')
  }
  fieldViewFmt.value = 'auto'
  fieldPretty.value = props.pretty
  void syncFieldEditor()
  void nextTick(() => {
    if (form.value.type === 'hash' && props.hashFieldTtlEnabled) {
      if (fieldExpireAt) fieldTtlRef.value?.syncFromAt(fieldExpireAt)
      else fieldTtlRef.value?.syncFromSeconds(form.value.fieldTtl ?? -1)
    }
  })
}

function onFieldViewFmtChange() {
  void syncFieldEditor()
  codeRemountKey.value++
}

function togglePretty() {
  if (!prettyEnabled.value) return
  fieldPretty.value = !fieldPretty.value
  // Vector Set：美化当前编辑区，不回源（避免丢掉未保存的向量/属性）
  if (vectorsetType.value) {
    const vec = parseVectorInput(form.value.fieldValue)
    if (vec.ok) {
      form.value.fieldValue = meFormatDisplayValue(JSON.stringify(vec.nums), fieldPretty.value)
    }
    const attrs = parseAttrsInput(attrsText.value)
    if (attrs.ok) {
      attrsText.value = meFormatDisplayValue(attrs.json, fieldPretty.value)
    }
  } else {
    void syncFieldEditor()
  }
  codeRemountKey.value++
}

function close() {
  visible.value = false
}

function cancel() {
  visible.value = false
  emit('closed')
}

function onEscapeKey(e: KeyboardEvent) {
  if (!visible.value || e.key !== 'Escape') return
  e.stopPropagation()
  cancel()
}

watch(visible, val => {
  if (val) window.addEventListener('keydown', onEscapeKey, true)
  else window.removeEventListener('keydown', onEscapeKey, true)
})

// 自定义编解码删除/改名后，当前字段 view 失效则回退 Auto
watch(customNames, names => {
  if (!visible.value || !isCustomView(fieldViewFmt.value)) return
  const name = customFormatName(fieldViewFmt.value)
  if (!name || !names.includes(name)) {
    fieldViewFmt.value = 'auto'
    void syncFieldEditor()
  }
})
// #endregion

// #region 表单提交
// 校验规则 / 编码写入 / field_set 提交
const rules = computed(() => ({
  fieldScore: [{ required: true, message: t('fieldSet.fieldScoreRequired') }],
}))

const formRef = useTemplateRef('formRef')
const fieldTtlRef = useTemplateRef<{
  toSeconds: () => number
  syncFromSeconds: (sec: number) => void
  syncFromAt: (at: Date) => void
}>('fieldTtlRef')
function submit() {
  if (!canSaveField.value) return
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    const { type: _type, wireFieldKey, ...rest } = form.value
    const fmt = effectiveFieldViewFmt.value
    let fieldValue = form.value.fieldValue
    let vector: number[] = []
    let attrsJson = ''
    // Vector Set：提交当前全量向量 + attrs，field_set 一次完成 VADD + VSETATTR
    if (vectorsetType.value) {
      const parsed = parseVectorInput(form.value.fieldValue)
      if (!parsed.ok) {
        meErr(t('fieldAdd.vectorInvalid'))
        return
      }
      vector = parsed.nums
      // 维度预检：已知 VDIM 时拦截不一致，避免 Redis 服务端报错
      if (expectedVectorDim.value != null && vector.length !== expectedVectorDim.value) {
        meErr(
          t('fieldAdd.vectorDimMismatch', {
            dim: vector.length,
            expected: expectedVectorDim.value,
          }),
        )
        return
      }
      fieldValue = ''
      const attrsParsed = parseAttrsInput(attrsText.value)
      if (!attrsParsed.ok) {
        meErr(t('fieldAdd.attrsInvalid'))
        return
      }
      attrsJson = attrsParsed.json
    } else {
      // 与 KeyRename / FieldAdd 一致：提交前先编码检查，失败 meErr 并 return
      try {
        if (needsJsonNormalize(fmt)) {
          fieldValue = fieldValue === '' ? '' : meJsonNormal(fieldValue)
        }
        if (isCustomView(fmt)) {
          fieldValue = await meViewToWireAsync(fieldValue, fmt)
        } else {
          fieldValue = meViewToWire(fieldValue, fmt)
        }
      } catch (e) {
        meErr(e instanceof Error ? e.message : String(e))
        return
      }
    }

    // srcFieldValue：Set/ZSet 替换成员时定位用，须与 valFmt 同为 base64
    const srcFieldValue =
      form.value.type === 'zset' || form.value.type === 'set'
        ? srcFieldWire.value
        : form.value.srcFieldValue

    const useWireKey = (form.value.type === 'hash' || vectorsetType.value) && !!wireFieldKey

    let fieldTtl = form.value.fieldTtl
    if (form.value.type === 'hash' && props.hashFieldTtlEnabled) {
      fieldTtl = fieldTtlRef.value?.toSeconds() ?? form.value.fieldTtl
      if (!(fieldTtl === -1 || fieldTtl > 0)) {
        meErr(t('fieldAdd.ttlValidator'))
        return
      }
    }

    isSaving.value = true
    try {
      await meCommands.fieldSet(share.conn!.id, {
        ...rest,
        srcFieldValue,
        fieldKey: useWireKey ? wireFieldKey! : form.value.fieldKey,
        fieldValue,
        vector,
        attrs: vectorsetType.value ? attrsJson : '',
        valFmt: IPC_WIRE_FORMAT,
        includeFieldTtl: form.value.type === 'hash' ? props.hashFieldTtlEnabled : null,
        fieldTtl,
      })
      visible.value = false
      emit('success')
      meOk(t('editOk'))
    } finally {
      isSaving.value = false
    }
  })
}
// #endregion

// #region 字段刷新
// field_get 回写 / 表单同步（hash / list / zset / array）
function buildFieldGetParam(): RedisFieldGet_Deserialize | null {
  if (!form.value.key?.key || !supportsFieldRefresh.value) return null
  const type = form.value.type
  return {
    key: form.value.key,
    fieldIndex: form.value.fieldIndex,
    fieldKey:
      type === 'hash' && form.value.wireFieldKey ? form.value.wireFieldKey : form.value.fieldKey,
    fieldValue: type === 'zset' ? srcFieldWire.value : '',
    valFmt: IPC_WIRE_FORMAT,
    includeFieldTtl: type === 'hash' ? props.hashFieldTtlEnabled : null,
  }
}

function applyFieldGetToForm(data: RedisFieldValue) {
  const type = form.value.type
  srcFieldWire.value = data.fieldValue
  if (type === 'hash') {
    form.value.wireFieldKey = data.fieldKey
    form.value.fieldKey = meFormatViewValue(data.fieldKey, 'utf8')
    if (props.hashFieldTtlEnabled) {
      form.value.fieldTtl = data.fieldTtl
      fieldTtlRef.value?.syncFromSeconds(data.fieldTtl)
    }
  } else if (type === 'zset' && data.fieldScore != null) {
    form.value.fieldScore = data.fieldScore
  }
}

async function refreshField() {
  const conn = share.conn
  const param = buildFieldGetParam()
  if (!conn || !param || isRefreshing.value) return
  isRefreshing.value = true
  try {
    const data = await meCommands.fieldGet(conn.id, param, false)
    applyFieldGetToForm(data)
    await syncFieldEditor()
    codeRemountKey.value++
    emit('refreshed', data)
    meOk(t('redisValue.refreshFieldRowOk'))
  } catch (e) {
    meErr(e instanceof Error ? e.message : String(e))
  } finally {
    isRefreshing.value = false
  }
}
// #endregion

// #region 生命周期
onUnmounted(() => window.removeEventListener('keydown', onEscapeKey, true))
// #endregion
</script>

<template>
  <!-- 字段编辑面板：查看/编辑字段值，支持编码切换、美化、单行刷新 -->
  <el-card
    :header="readonly ? t('fieldSet.viewField') : t('fieldSet.editField')"
    v-show="visible"
    class="field-set">
    <el-form ref="formRef" class="field-set-form" :model="form" :rules="rules" label-position="top">
      <el-form-item :label="t('fieldSet.fieldKey')" v-if="form.type === 'hash'">
        <el-input v-model="form.fieldKey" disabled />
      </el-form-item>
      <el-form-item :label="t('fieldSet.streamId')" v-if="form.type === 'stream'">
        <el-input :model-value="form.streamId || ''" disabled />
      </el-form-item>
      <el-form-item :label="t('fieldSet.element')" v-if="vectorsetType">
        <el-input v-model="form.fieldKey" disabled />
      </el-form-item>
      <el-form-item
        :label="t('fieldSet.fieldTtl')"
        v-if="form.type === 'hash' && share.capabilities.httlSupported && hashFieldTtlEnabled">
        <me-ttl ref="fieldTtlRef" v-model="form.fieldTtl" :disabled="readonly" />
      </el-form-item>
      <el-form-item
        :label="t('fieldSet.index')"
        v-if="form.type === 'list' || form.type === 'array'">
        <el-input v-model="form.fieldIndex" disabled />
      </el-form-item>
      <el-form-item :label="t('fieldSet.score')" prop="fieldScore" v-if="form.type === 'zset'">
        <el-input-number
          :controls="false"
          v-model="form.fieldScore"
          :disabled="readonly"
          align="left"
          style="width: 100%" />
      </el-form-item>
      <el-form-item
        :label="vectorsetType ? t('fieldSet.vector') : t('fieldSet.value')"
        class="field-value-item">
        <me-code
          :key="codeRemountKey"
          v-model="form.fieldValue"
          :read-only="
            editorLoading || readonly || (!vectorsetType && isViewReadonlyFmt) || decodeFailed
          "
          :error="decodeFailed"
          class="field-code-editor" />
      </el-form-item>
      <!-- Vector Set：打开时自动 VGETATTR；空内容保存即删除 -->
      <el-form-item v-if="vectorsetType" :label="t('fieldSet.attrs')" class="field-value-item">
        <me-code
          :key="`attrs-${codeRemountKey}`"
          v-model="attrsText"
          mode="json"
          :read-only="editorLoading || readonly"
          class="field-code-editor" />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="field-set-footer me-flex">
        <div class="field-set-footer-left">
          <me-icon
            placement="top-start"
            :info="t('fieldSet.prettyHint')"
            class="icon-btn"
            :style="{
              opacity: prettyEnabled && fieldPretty ? 1 : 0.2,
              cursor: prettyEnabled ? 'pointer' : 'default',
            }"
            icon="el-icon-magic-stick"
            @click="togglePretty" />
          <me-icon
            placement="top-start"
            :info="vectorsetType ? t('redisValue.copyVector') : t('redisValue.copyValue')"
            class="icon-btn"
            style="font-size: 18px; margin-left: 5px"
            icon="el-icon-document-copy"
            @click="meCopy(form.fieldValue)" />
          <me-icon
            v-if="supportsFieldRefresh"
            placement="top-start"
            :info="t('redisValue.refreshFieldRow')"
            class="icon-btn"
            style="font-size: 18px; margin-left: 5px"
            icon="el-icon-refresh-right"
            :style="{ opacity: isRefreshing ? 0.5 : 1, cursor: isRefreshing ? 'wait' : 'pointer' }"
            @click="refreshField" />
          <!-- Auto 识别结果：下拉右侧；Vector Set 向量非 wire 不展示编码 -->
          <div v-if="!vectorsetType" class="field-set-enc me-flex">
            <!-- 底栏贴底：下拉固定向上，避免翻到窗口外 -->
            <el-select
              v-model="fieldViewFmt"
              class="field-set-enc-select me-select-plain"
              :suffix-icon="MeSelectUpDownIcon"
              :disabled="editorLoading"
              placement="top-start"
              :fallback-placements="['top', 'top-end']"
              @change="onFieldViewFmtChange">
              <el-option
                v-for="item in fieldViewOptionList"
                :key="item.value"
                :label="item.label"
                :value="item.value" />
            </el-select>
            <el-text
              v-if="detectedViewText"
              class="field-set-auto-label"
              :title="t('redisValue.autoDetected')">
              {{ detectedViewText }}
            </el-text>
          </div>
        </div>
        <div>
          <el-button @click="cancel">{{ t('cancel') }}</el-button>
          <!-- 连接只读/查看模式：隐藏；禁用时 tooltip 说明原因 -->
          <el-tooltip
            v-if="showSaveField"
            :content="saveFieldTip"
            placement="top"
            :disabled="!saveFieldTip">
            <span style="margin-left: 12px; display: inline-block">
              <el-button
                type="primary"
                :loading="isSaving"
                :disabled="!canSaveField"
                @click="submit"
                >{{ t('save') }}</el-button
              >
            </span>
          </el-tooltip>
        </div>
      </div>
    </template>
  </el-card>
</template>

<style scoped lang="scss">
// 根布局：卡片容器 + 表单 + 底栏
.field-set {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  :deep(.el-card__body) {
    padding: 20px 20px 0 20px;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :deep(.el-card__footer) {
    border-top: none;
    flex-shrink: 0;
  }

  // 表单
  .field-set-form {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
  }

  // 底栏
  .field-set-footer {
    align-items: center;
  }

  .field-set-footer-left {
    display: flex;
    align-items: center;
    font-size: 20px;
  }

  // 编码下拉
  .field-set-enc {
    align-items: center;
  }

  .field-set-auto-label {
    margin-left: 2px;
    white-space: nowrap;
    color: var(--el-color-primary);
    font-weight: 600;
  }

  .field-set-enc-select {
    font-size: var(--el-font-size-base);

    :deep(.el-select__wrapper) {
      min-height: 0;
      height: 30px;
      padding: 4px;
    }
  }

  // 值/向量编辑区：撑满剩余高度，最后一项贴底
  .field-value-item {
    display: flex;
    flex-direction: column;
    flex: 1;
    margin-bottom: 18px;
    min-width: 0;
    min-height: 0;
    width: 100%;

    &:last-child {
      margin-bottom: 0;
    }

    :deep(.el-form-item__content) {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      min-width: 0;
      width: 100%;
      overflow: hidden;
    }
  }

  .field-code-editor {
    flex: 1;
    width: 100%;
    max-width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;

    :deep(.cm-editor) {
      width: 100%;
      max-width: 100%;
      height: 100%;
    }

    :deep(.cm-scroller) {
      overflow: auto;
    }
  }
}
</style>
