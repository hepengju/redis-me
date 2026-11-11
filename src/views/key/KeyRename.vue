<script setup lang="ts">
// #region 导入
import { inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { BYTES_FORMAT, meFormatBytes, meToBase64 } from '@/utils/format'
import { invalidateKeyMemory } from '@/utils/key-memory-cache'
import { invalidateKeyTtl } from '@/utils/key-ttl-cache'
import { invalidateKeyType } from '@/utils/key-type-cache'
import { redisKeyWireBase64 } from '@/utils/redis-key'
import { bus, KEY_RENAME, meCommands, meErr, meOk } from '@/utils/util'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
defineExpose({ open })

const visible = ref(false)
const loading = ref(false)
const targetKey = ref<RedisKey_Deserialize | null>(null)
const codec = ref('utf8')
const inputValue = ref('')
// #endregion

// #region 面板操作
function open(data: { redisKey: RedisKey_Deserialize }) {
  codec.value = 'utf8'
  targetKey.value = data.redisKey
  inputValue.value = data.redisKey.key
  visible.value = true
}

watch(codec, () => {
  const k = targetKey.value
  if (!k || !visible.value) return
  inputValue.value =
    codec.value === 'utf8' ? k.key : meFormatBytes(redisKeyWireBase64(k), codec.value)
})

async function submit() {
  const k = targetKey.value
  const id = share.conn?.id
  if (!k || !id) return

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

  loading.value = true
  try {
    const oldKey = { key: k.key, bytes: k.bytes }
    const newKey: RedisKey_Deserialize =
      enc === 'utf8' ? { key: value, bytes: '' } : { key: '', bytes: meToBase64(value, enc) }
    const apiNewKey = await meCommands.rename(id, k, newKey)
    invalidateKeyType(id, oldKey)
    invalidateKeyMemory(id, oldKey)
    invalidateKeyTtl(id, oldKey)
    k.key = apiNewKey.key
    k.bytes = apiNewKey.bytes
    // 右侧详情直接绑 redisKey；左侧树靠 shallowRef 重建，需通知 KeyMain flush
    bus.emit(KEY_RENAME, { oldKey, newKey: { key: apiNewKey.key, bytes: apiNewKey.bytes } })
    meOk(t('actionOk'))
    visible.value = false
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
      <me-icon icon="el-icon-edit-pen" :name="t('keyRename.title')" />
    </template>

    <el-input v-model="inputValue" :placeholder="t('keyRename.newKeyName')" />
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
