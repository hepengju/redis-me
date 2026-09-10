<script setup lang="ts">
// #region 导入
import type { FormItemRule } from 'element-plus'
import { cloneDeep } from 'lodash'
import { computed, inject, nextTick, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { meCommands, meOk } from '@/utils/util'
// #endregion

// #region 核心状态

type TtlForm = { ttl: number; keyList: RedisKey_Deserialize[] }

const { t } = useI18n()
const emit = defineEmits(['success', 'closed'])
defineExpose({ open })
function open(data: { ttl?: number; at?: Date; keyList?: RedisKey_Deserialize[] }) {
  visible.value = true
  Object.assign(form.value, cloneDeep(initForm))
  form.value.ttl = data.ttl ?? -1
  form.value.keyList = data.keyList ?? []
  const at = data.at
  syncTtlInput(at)
}

function syncTtlInput(at?: Date, attempt = 0) {
  void nextTick(() => {
    const input = ttlInputRef.value
    if (!input) {
      if (attempt < 5) syncTtlInput(at, attempt + 1)
      return
    }
    if (at) input.syncFromAt(at)
    else input.syncFromSeconds(form.value.ttl)
  })
}

// 共享数据
const share = inject(shareProvideKey)!

// 表单数据
const visible = ref(false)
const loading = ref(false)
const initForm: TtlForm = { ttl: -1, keyList: [] }
const form = ref<TtlForm>(cloneDeep(initForm))
const ttlInputRef = useTemplateRef<{
  toSeconds: () => number
  setDuration: (sec: number) => void
  syncFromSeconds: (sec: number) => void
  syncFromAt: (at: Date) => void
}>('ttlInputRef')
// #endregion

// #region 计算属性
const rules = computed(() => ({
  ttl: [
    { required: true, message: t('ttlSet.ttlRequired') },
    {
      validator: (
        _rule: FormItemRule,
        _value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        const n = ttlInputRef.value?.toSeconds() ?? form.value.ttl
        if (!(n === -1 || n > 0)) {
          callback(new Error(t('ttlSet.ttlValidator')))
          return
        }
        callback()
      },
    },
  ],
}))
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      const seconds = ttlInputRef.value?.toSeconds() ?? form.value.ttl
      if (isBatch.value) {
        const param = { ttl: seconds, keyList: form.value.keyList }
        await meCommands.batchTtl(share.conn!.id, param)
        meOk(t('ttlSet.ttlOkBatch'))
      } else {
        await meCommands.ttl(share.conn!.id, share.redisKey!, seconds)
        meOk(t('ttlSet.ttlOk'))
      }

      emit('success', seconds)
      visible.value = false
    } finally {
      loading.value = false
    }
  })
}
// #endregion

// #region 面板操作
function quickSet(ttl: number) {
  ttlInputRef.value?.setDuration(ttl)
}

const isBatch = computed(() => form.value.keyList.length > 0)
const title = computed(() =>
  isBatch.value ? t('ttlSet.batchTitle') + ` (${form.value.keyList.length})` : t('ttlSet.title'),
)
// #endregion
</script>

<template>
  <el-dialog :title v-model="visible" :width="500" destroy-on-close @closed="emit('closed')">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item :label="t('ttlSet.key')" v-if="!isBatch">
        <!-- 此处保留可编辑，使用更加方便 -->
        <el-input type="text" :modelValue="share.redisKey?.key" disabled />
      </el-form-item>

      <el-form-item :label="t('ttlSet.ttl')" prop="ttl">
        <me-ttl ref="ttlInputRef" v-model="form.ttl" />
      </el-form-item>
      <el-form-item :label="t('ttlSet.quickSet')">
        <div class="me-flex" style="width: 100%">
          <el-button round type="primary" plain @click="quickSet(-1)">
            {{ t('ttlSet.quick01') }}</el-button
          >
          <el-button round type="success" plain @click="quickSet(10)">{{
            t('ttlSet.quick02')
          }}</el-button>
          <el-button round type="success" plain @click="quickSet(60)">{{
            t('ttlSet.quick03')
          }}</el-button>
          <el-button round type="success" plain @click="quickSet(3600)">{{
            t('ttlSet.quick04')
          }}</el-button>
          <el-button round type="success" plain @click="quickSet(86400)">{{
            t('ttlSet.quick05')
          }}</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('cancel') }}</el-button>
      <el-button type="primary" :loading="loading" @click="submit">{{ t('save') }}</el-button>
    </template>
  </el-dialog>
</template>
