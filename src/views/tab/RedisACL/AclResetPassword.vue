<script setup lang="ts">
// #region 导入
// ACL 重置密码：保留用户现有规则，仅更新密码 hash
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type { AclUserDetail } from '@/types/tauri-specta'
import { meCommands, meCopy, meOk, meWarn } from '@/utils/app/util'
import { buildAclSavePayload, createAclModelFromDetail } from '@/utils/redis/acl'
// #endregion

// #region 核心状态
const visible = defineModel<boolean>({ default: false })
const props = defineProps<{ user: AclUserDetail | null }>()
const emit = defineEmits<{ success: [] }>()
const { t } = useI18n()
const share = inject(shareProvideKey)!
const loading = ref(false)
const password = ref('')
// #endregion

// #region 计算属性
const canEdit = computed(() => !share.readonly)
// #endregion

// #region 面板操作
watch(visible, val => {
  if (val) password.value = ''
})

async function genPassword() {
  password.value = await meCommands.aclGenpass(share.conn!.id, 128)
  meOk(t('redisACL.passwordGenerated'))
}

function copyPassword() {
  const pwd = password.value.trim()
  if (!pwd) {
    meWarn(t('redisACL.passwordRequired'))
    return
  }
  meCopy(pwd)
}

async function save() {
  if (!canEdit.value) return
  if (!props.user) return
  if (!password.value.trim()) {
    meWarn(t('redisACL.passwordRequired'))
    return
  }

  loading.value = true
  try {
    const model = createAclModelFromDetail(props.user)
    model.password = password.value.trim()
    const payload = await buildAclSavePayload(model)
    await meCommands.aclSetuser(share.conn!.id, payload)
    meOk(t('redisACL.resetPasswordOk'))
    visible.value = false
    emit('success')
  } finally {
    loading.value = false
  }
}
// #endregion
</script>

<template>
  <el-dialog
    v-model="visible"
    width="480"
    align-center
    draggable
    destroy-on-close
    :show-close="true">
    <template #header>
      <span>{{ t('redisACL.resetPassword') }}</span>
      <el-tag v-if="user" size="small" type="info" style="margin-left: 8px">{{
        user.username
      }}</el-tag>
    </template>

    <div class="password-row">
      <el-input
        v-model="password"
        show-password
        clearable
        :placeholder="t('redisACL.resetPasswordPlaceholder')"
        @keyup.enter="save" />
      <el-button-group>
        <el-button @click="genPassword">GenPass</el-button>
        <el-button icon="el-icon-document-copy" @click="copyPassword" />
      </el-button-group>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('cancel') }}</el-button>
      <el-button type="primary" :loading="loading" :disabled="!password.trim()" @click="save">
        {{ t('ok') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.password-row {
  display: flex;
  gap: 8px;
  align-items: center;

  .el-input {
    flex: 1;
  }
}
</style>
