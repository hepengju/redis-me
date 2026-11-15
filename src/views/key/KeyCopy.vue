<script setup lang="ts">
// #region 导入
import { inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { meCommands, meErr, meOk } from '@/utils/app/util'
import { BYTES_FORMAT, meFormatBytes, meToBase64 } from '@/utils/codec/format'
import { redisKeyWireBase64 } from '@/utils/redis/redis-key'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const emit = defineEmits<{ success: [redisKey: RedisKey_Deserialize] }>()
defineExpose({ open })

const visible = ref(false)
const loading = ref(false)
const sourceKey = ref<RedisKey_Deserialize | null>(null)
const codec = ref('utf8')
const inputValue = ref('')
// #endregion

// #region 面板操作
function open(data: { redisKey: RedisKey_Deserialize }) {
  codec.value = 'utf8'
  sourceKey.value = data.redisKey
  inputValue.value = data.redisKey.key + '-copy'
  visible.value = true
}

watch(codec, () => {
  const k = sourceKey.value
  if (!k || !visible.value) return
  const suffix = '-copy'
  if (codec.value === 'utf8') {
    inputValue.value = k.key + suffix
  } else {
    inputValue.value = meFormatBytes(redisKeyWireBase64(k), codec.value) + suffix
  }
})

async function submit() {
  const k = sourceKey.value
  const conn = share.conn
  if (!k || !conn) return

  const value = inputValue.value.trim()
  const enc = codec.value
  if (enc !== 'utf8') {
    try {
      meToBase64(value, enc)
    } catch (e) {
      meErr(e instanceof Error ? e.message : String(e))
      return
    }
  }

  const destination: RedisKey_Deserialize =
    enc === 'utf8' ? { key: value, bytes: '' } : { key: '', bytes: meToBase64(value, enc) }

  loading.value = true
  try {
    const newKey = await meCommands.copy(conn.id, { source: k, destination, db: conn.db })
    meOk(t('actionOk'))
    visible.value = false
    emit('success', newKey)
  } finally {
    loading.value = false
  }
}
// #endregion
</script>

<template>
  <el-dialog
    v-model="visible"
    width="500px"
    destroy-on-close
    align-center
    :close-on-press-escape="false"
    :close-on-click-modal="false"
    draggable>
    <template #header>
      <me-icon icon="el-icon-copy-document" :name="t('keyCopy.title')" />
    </template>

    <el-input v-model="inputValue" :placeholder="t('keyCopy.newKeyName')" />
    <template #footer>
      <div class="me-flex">
        <el-select v-model="codec" style="width: 100px">
          <el-option
            v-for="item in BYTES_FORMAT"
            :key="item"
            :label="item"
            :value="item.toLowerCase()" />
        </el-select>
        <div>
          <el-button @click="visible = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="loading" @click="submit" :disabled="!inputValue">{{
            t('save')
          }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>
