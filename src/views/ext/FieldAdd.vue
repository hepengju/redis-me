<script setup lang="ts">
// #region 导入
import type { FormItemRule } from 'element-plus'
import { cloneDeep } from 'lodash'
import { computed, inject, ref, toRaw, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisFieldAdd_Deserialize, RedisKey_Deserialize } from '@/types/tauri-specta'
import { BYTES_FORMAT, IPC_WIRE_FORMAT, meViewToWire, type ViewBytesFormat } from '@/utils/format'
import { KEY_TYPE_LIST, meType, toKeyTypeLabel, toRedisTypeName } from '@/utils/redis-display'
import { redisKeyWireBase64 } from '@/utils/redis-key'
import { meCommands, meErr, meOk, meJsonParse, meJsonNormal } from '@/utils/util'
import { parseAttrsInput, parseVectorInput } from '@/utils/vector'
// #endregion

// #region 核心状态
const { t } = useI18n()
const emit = defineEmits(['success', 'closed'])
defineExpose({ open })

function open(
  data: Partial<
    RedisFieldAdd_Deserialize & { viewValFmt?: ViewBytesFormat; vectorDim?: number | null }
  >,
) {
  visible.value = true
  Object.assign(form.value, cloneDeep(toRaw(initForm.value)))
  const { viewValFmt, vectorDim, ...rest } = data
  Object.assign(form.value, rest)
  if (viewValFmt) {
    form.value.valFmt = viewValFmt
  }
  expectedVectorDim.value = vectorDim ?? null
}

// 共享数据
const share = inject(shareProvideKey)!

// 表单数据
const visible = ref(false)
const isSaving = ref(false)
const initForm = computed(() => ({
  mode: 'key', // key-新增键，field-新增字段
  key: { key: '', bytes: '' } satisfies RedisKey_Deserialize,
  type: 'string',
  ttl: -1,
  value: '',

  streamId: '*', // stream 格式的 id, 默认为*，表示由 redis 生成

  listPushMethod: 'rpush',
  listPushOptions: [
    { label: t('fieldAdd.append'), value: 'rpush' },
    { label: t('fieldAdd.prepend'), value: 'lpush' },
  ],
  // Array：arset 指定索引 / arinsert 游标插入（非末尾追加）
  arrayWriteMethod: 'arset',
  arrayWriteOptions: [
    { label: t('fieldAdd.arrayWriteArset'), value: 'arset' },
    { label: t('fieldAdd.arrayWriteArinsert'), value: 'arinsert' },
  ],
  fieldValueList: [{ fieldKey: '', fieldValue: '', fieldScore: 0, fieldTtl: -1 }],
  // Vector Set：编辑区文本；提交前 parseVectorInput → IPC vector:number[]
  vectorText: '',
  // Vector Set：attrs JSON 文本；空=不带 SETATTR
  attrsText: '',
  keyFmt: 'utf8' as ViewBytesFormat,
  valFmt: 'utf8' as ViewBytesFormat,
}))
const form = ref(cloneDeep(toRaw(initForm.value)))
const keyTtlRef = useTemplateRef<{ toSeconds: () => number }>('keyTtlRef')

const stringOrJsonType = computed(() => form.value.type === 'string' || form.value.type === 'json')
const jsonType = computed(() => form.value.type === 'json')
const vectorsetType = computed(() => form.value.type === 'vectorset')
// 键的 VDIM（打开时传入；非 vectorset 或未知时为 null）
const expectedVectorDim = ref<number | null>(null)
const arrayArsetMode = computed(
  () => form.value.type === 'array' && form.value.arrayWriteMethod !== 'arinsert',
)

const rules = computed(() => ({
  'key.key': [{ required: true, message: t('fieldAdd.keyRequired') }],
  type: [{ required: true, message: t('fieldAdd.typeRequired') }],
  ttl: [
    { required: true, message: t('fieldAdd.ttlRequired') },
    {
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        const n = keyTtlRef.value?.toSeconds() ?? form.value.ttl
        if (!(n === -1 || n > 0)) {
          callback(new Error(t('fieldAdd.ttlValidator')))
          return
        }
        callback()
      },
    },
  ],
  value: [
    {
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        // string 等类型允许空串；json 类型空串与非法 JSON 均不通过
        if (form.value.type === 'json') {
          if (value === '') {
            callback(new Error(t('fieldAdd.jsonValidator')))
            return
          }
          try {
            meJsonParse(String(value)) // json 输入支持 json5 格式，此处转换为正常 json 字符串
          } catch {
            callback(new Error(t('fieldAdd.jsonValidator')))
            return
          }
        }
        callback()
      },
    },
  ],
  streamId: [
    {
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (form.value.type === 'stream') {
          if (value) return callback()
          return callback(new Error(t('fieldAdd.streamIdRequired')))
        }
        callback()
      },
    },
  ],
}))
// #endregion

// #region 元素操作
function deleteElement(index: number) {
  form.value.fieldValueList.splice(index, 1)
}

function newElement(index: number) {
  const newValue = { fieldKey: '', fieldValue: '', fieldScore: 0, fieldTtl: -1 }
  form.value.fieldValueList.splice(index + 1, 0, newValue)
}
// #endregion

// #region 提交处理
// 提交数据
const formRef = useTemplateRef('formRef')
const fieldTtlRefs = new Map<object, { toSeconds: () => number }>()
function bindFieldTtlRef(item: object) {
  return (el: unknown) => {
    if (el && typeof el === 'object' && 'toSeconds' in el) {
      fieldTtlRefs.set(item, el as { toSeconds: () => number })
    } else {
      fieldTtlRefs.delete(item)
    }
  }
}
function submit() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    const keyViewFmt = form.value.keyFmt as ViewBytesFormat
    const valViewFmt = form.value.valFmt as ViewBytesFormat
    const isJson = form.value.type === 'json'

    let value = isJson ? meJsonNormal(form.value.value) : form.value.value
    let fieldValueList = form.value.fieldValueList
    let key: RedisKey_Deserialize = form.value.key

    // Array ARSET：索引须为十进制明文，不能走值编码 wire
    if (form.value.type === 'array' && form.value.arrayWriteMethod !== 'arinsert') {
      for (const item of form.value.fieldValueList) {
        const idx = String(item.fieldKey ?? '').trim()
        if (!/^\d+$/.test(idx)) {
          meErr(t('fieldAdd.arrayIndexInvalid'))
          return
        }
      }
    }

    // Vector Set：前端解析向量 / attrs → IPC（后端不再解析多格式字符串）
    let vector: number[] = []
    let attrs = ''
    if (vectorsetType.value) {
      const elem = String(form.value.fieldValueList[0]?.fieldKey ?? '').trim()
      if (!elem) {
        meErr(t('fieldAdd.elementRequired'))
        return
      }
      const parsed = parseVectorInput(form.value.vectorText)
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
      const attrsParsed = parseAttrsInput(form.value.attrsText)
      if (!attrsParsed.ok) {
        meErr(t('fieldAdd.attrsInvalid'))
        return
      }
      attrs = attrsParsed.json
    }

    // 与 KeyRename 一致：提交前先做编码转换检查，失败 meErr 并 return，不打后端
    try {
      if (form.value.type === 'string') {
        value = meViewToWire(value, valViewFmt)
      }
      const isArrayArset = form.value.type === 'array' && form.value.arrayWriteMethod !== 'arinsert'
      fieldValueList = form.value.fieldValueList.map(item => ({
        ...item,
        fieldKey: isArrayArset
          ? String(item.fieldKey).trim()
          : meViewToWire(item.fieldKey, valViewFmt),
        // Vector Set 向量走 vector[]，fieldValue 置空避免误 wire
        fieldValue: vectorsetType.value ? '' : meViewToWire(item.fieldValue, valViewFmt),
      }))
      fieldValueList.forEach(item => {
        const sec = fieldTtlRefs.get(item)?.toSeconds()
        if (sec != null) item.fieldTtl = sec
        else if (item.fieldTtl === null) item.fieldTtl = -1
      })
      const badFieldTtl = fieldValueList.find(
        item => !(item.fieldTtl === -1 || (typeof item.fieldTtl === 'number' && item.fieldTtl > 0)),
      )
      if (badFieldTtl) {
        meErr(t('fieldAdd.ttlValidator'))
        return
      }
      // 新建键按 keyFmt；加字段在 SCAN 省略 bytes 时用展示名转 wire
      if (!form.value.key.bytes) {
        key =
          form.value.mode === 'key'
            ? { key: meViewToWire(form.value.key.key, keyViewFmt), bytes: '' }
            : { key: redisKeyWireBase64(form.value.key), bytes: '' }
      }
    } catch (e) {
      meErr(e instanceof Error ? e.message : String(e))
      return
    }

    isSaving.value = true
    try {
      const { vectorText: _vectorText, attrsText: _attrsText, ...fieldAddRest } = form.value
      const redisKey = await meCommands.fieldAdd(share.conn!.id, {
        ...fieldAddRest,
        key,
        value,
        vector,
        attrs,
        ttl: keyTtlRef.value?.toSeconds() ?? form.value.ttl,
        fieldValueList,
        keyFmt: IPC_WIRE_FORMAT,
        valFmt: isJson ? 'utf8' : IPC_WIRE_FORMAT,
      })
      visible.value = false
      emit('success', redisKey)
      meOk(t('addOk'))
    } finally {
      isSaving.value = false
    }
  })
}

const hint = computed(() => {
  if (form.value.type === 'hash')
    return share.capabilities.httlSupported ? t('fieldAdd.hashHintTtl') : t('fieldAdd.hashHint')
  if (form.value.type === 'zset') return t('fieldAdd.zsetHint')
  if (form.value.type === 'stream') return t('fieldAdd.streamHint')
  if (form.value.type === 'array') {
    return arrayArsetMode.value ? t('fieldAdd.arrayHint') : t('fieldAdd.arrayInsertHint')
  }
  return ''
})

// me-code 的值发生变化时进行自动验证
watch(
  () => form.value.value,
  () => {
    formRef?.value?.validate()
  },
)

// json和stream类型不支持编码
function handleKeyTypeChange() {
  if (jsonType.value) {
    form.value.keyFmt = 'utf8'
    form.value.valFmt = 'utf8'
  }
}
// #endregion
</script>

<template>
  <el-dialog
    :title="form.mode === 'key' ? t('fieldAdd.newKey') : t('fieldAdd.newField')"
    v-model="visible"
    :width="666"
    @closed="emit('closed')"
    destroy-on-close
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    draggable>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <!-- 键类型与 TTL: 仅新建键时显示 -->
      <el-row :gutter="20" v-if="form.mode === 'key'">
        <el-col :span="12">
          <el-form-item :label="t('fieldAdd.type')" prop="type">
            <el-select v-model="form.type" style="width: 100%" @change="handleKeyTypeChange">
              <el-option
                v-for="item in KEY_TYPE_LIST"
                :label="item.value"
                :value="toRedisTypeName(item.value)">
                <el-text :type="item.type">{{ item.value }}</el-text>
              </el-option>

              <template #label="{ value }">
                <el-text :type="meType(value)">{{ toKeyTypeLabel(value) }}</el-text>
              </template>
            </el-select>
          </el-form-item>
        </el-col>

        <el-col :span="12">
          <el-form-item :label="t('fieldAdd.ttl')" prop="ttl">
            <me-ttl ref="keyTtlRef" v-model="form.ttl" />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 键：新建键可编辑，新增字段时禁止编辑且前缀补充类型 -->
      <el-form-item :label="t('fieldAdd.key')" prop="key.key">
        <el-input
          class="field-add-key"
          type="text"
          v-model="form.key.key"
          :disabled="form.mode === 'field'">
          <template #prepend v-if="form.mode === 'field'">
            <el-text :type="meType(form.type)">{{ toKeyTypeLabel(form.type) }}</el-text>
          </template>
        </el-input>
      </el-form-item>

      <!-- 值：新建键且类型为 string 或 json 时显示 -->
      <el-form-item
        :label="t('fieldAdd.value')"
        prop="value"
        v-if="form.mode === 'key' && stringOrJsonType">
        <me-code v-model="form.value" style="height: 150px; width: 100%" />
      </el-form-item>

      <!-- list 类型的添加方式：rpush、lpush -->
      <el-form-item
        :label="t('fieldAdd.type')"
        v-if="form.mode === 'field' && form.type === 'list'">
        <el-segmented v-model="form.listPushMethod" :options="form.listPushOptions" />
      </el-form-item>

      <!-- Array：ARSET 指定索引 / ARINSERT 游标插入 -->
      <el-form-item :label="t('fieldAdd.type')" v-if="form.type === 'array'">
        <div>
          <el-segmented v-model="form.arrayWriteMethod" :options="form.arrayWriteOptions" />
          <div v-if="!arrayArsetMode" class="array-write-hint">
            {{ t('fieldAdd.arrayWriteArinsertTip') }}
          </div>
        </div>
      </el-form-item>

      <!-- streamId: 仅 stream 类型显示 -->
      <el-form-item :label="t('fieldAdd.streamId')" prop="streamId" v-if="form.type === 'stream'">
        <el-input v-model="form.streamId" clearable />
      </el-form-item>

      <!-- Vector Set：元素 + 向量文本（提交前归一为 number[]） -->
      <template v-if="vectorsetType">
        <el-form-item :label="t('fieldAdd.element')">
          <el-input
            type="text"
            v-model="form.fieldValueList[0].fieldKey"
            :placeholder="t('fieldAdd.element')"
            :validate-event="false" />
        </el-form-item>
        <el-form-item>
          <template #label>
            {{ t('fieldAdd.vector') }}
            <span class="label-hint">{{ t('fieldAdd.vectorValueHint') }}</span>
          </template>
          <el-input
            type="textarea"
            v-model="form.vectorText"
            :rows="4"
            :placeholder="'[0.1, 0.2, 0.3]'"
            :validate-event="false" />
        </el-form-item>
        <el-form-item :label="t('fieldAdd.attrs')">
          <el-input
            type="textarea"
            v-model="form.attrsText"
            :rows="3"
            placeholder='{"year":2021}'
            :validate-event="false" />
        </el-form-item>
      </template>

      <!-- key, value, score: 非 string / json / vectorset -->
      <el-form-item
        :label="t('fieldAdd.element') + ' ' + hint"
        v-if="!stringOrJsonType && !vectorsetType">
        <div
          v-for="(item, index) in form.fieldValueList"
          class="me-flex"
          style="margin-bottom: 10px; width: 100%"
          :key="index">
          <el-input
            type="text"
            v-model="item.fieldKey"
            :placeholder="
              form.type === 'array'
                ? t('fieldAdd.arrayIndex')
                : form.type === 'hash'
                  ? t('fieldAdd.hashKey')
                  : t('fieldAdd.field')
            "
            style="margin-right: 10px"
            v-if="
              form.type === 'hash' ||
              form.type === 'stream' ||
              (form.type === 'array' && arrayArsetMode)
            "
            :validate-event="false" />
          <el-input
            type="text"
            v-model="item.fieldValue"
            :placeholder="t('fieldAdd.value')"
            style="margin-right: 10px"
            :validate-event="false" />
          <el-input-number
            :controls="false"
            v-model="item.fieldScore"
            style="margin-right: 10px"
            v-if="form.type === 'zset'"
            :validate-event="false" />
          <me-ttl
            v-if="form.type === 'hash' && share.capabilities.httlSupported"
            :ref="bindFieldTtlRef(item)"
            v-model="item.fieldTtl"
            compact />
          <el-button
            icon="el-icon-delete"
            circle
            @click="deleteElement(index)"
            v-if="form.fieldValueList.length > 1" />
          <el-button icon="el-icon-plus" circle @click="newElement(index)" />
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="me-flex">
        <div>
          <!-- 键编码：仅新建键时显示 -->
          <el-text v-show="form.mode === 'key'" type="info"> {{ t('fieldAdd.keyCodec') }}</el-text>
          <el-select
            v-show="form.mode === 'key'"
            v-model="form.keyFmt"
            style="width: 100px; margin: 0 20px 0 10px"
            :disabled="jsonType">
            <el-option v-for="item in BYTES_FORMAT" :label="item" :value="item.toLowerCase()" />
          </el-select>

          <!-- 值编码；Vector Set 仅元素名走 wire，文案改为元素编码 -->
          <el-text type="info">{{
            vectorsetType ? t('fieldAdd.elementCodec') : t('fieldAdd.valueCodec')
          }}</el-text>
          <el-select
            v-model="form.valFmt"
            style="width: 100px; margin: 0 20px 0 10px"
            :disabled="jsonType">
            <el-option v-for="item in BYTES_FORMAT" :label="item" :value="item.toLowerCase()" />
          </el-select>
        </div>

        <!-- 操作按钮 -->
        <div>
          <el-button @click="visible = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="isSaving" @click="submit()">{{
            t('save')
          }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
:deep(.field-add-key .el-input-group__prepend) {
  padding: 0 16px;
}
.array-write-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
.label-hint {
  margin-left: 6px;
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
}
</style>
