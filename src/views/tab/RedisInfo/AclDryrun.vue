<script setup lang="ts">
// #region 导入
// ACL DRYRUN 模拟测试对话框
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import { meCommands } from '@/utils/app/util'
// #endregion

// #region 核心状态
const visible = defineModel<boolean>({ default: false })
const props = defineProps<{ username: string }>()
const { t } = useI18n()
const share = inject(shareProvideKey)!
const loading = ref(false)
const command = ref('')
const result = ref('')
// #endregion

// #region 计算属性
const allowed = computed(() => result.value.trim() === 'OK')
const canExecute = computed(() => !!command.value.trim())
// #endregion

// #region 面板操作
watch(visible, val => {
  if (val) {
    command.value = ''
    result.value = ''
  }
})

async function execute() {
  if (!canExecute.value) return
  loading.value = true
  try {
    result.value = await meCommands.aclDryrun(share.conn!.id, props.username, command.value.trim())
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
      <span>{{ t('redisACL.dryrun') }}</span>
      <el-tag size="small" type="info" style="margin-left: 8px">{{ username }}</el-tag>
    </template>

    <div class="command-row">
      <el-input
        v-model="command"
        :placeholder="t('redisACL.dryrunCommandPlaceholder')"
        clearable
        @keyup.enter="execute" />
      <el-button type="primary" :loading="loading" :disabled="!canExecute" @click="execute">
        {{ t('redisACL.dryrunBtn') }}
      </el-button>
    </div>

    <div v-if="result" class="result" :class="allowed ? 'ok' : 'deny'">
      <el-text :type="allowed ? 'success' : 'danger'">{{ result }}</el-text>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.command-row {
  display: flex;
  gap: 8px;

  .el-input {
    flex: 1;
  }
}

.result {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 4px;
  line-height: 1.5;
  word-break: break-word;

  &.ok {
    background: var(--el-color-success-light-9);
  }

  &.deny {
    background: var(--el-color-danger-light-9);
  }
}
</style>
