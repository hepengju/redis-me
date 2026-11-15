<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MeShortcut from '@/components/MeShortcut.vue'
import {
  getConnGlobalShortcuts,
  getTerminalShortcuts,
  getValueShortcuts,
} from '@/utils/app/shortcut'

const { t } = useI18n()
const visible = ref(false)

const globalShortcuts = computed(() => getConnGlobalShortcuts(t))
const codeMirrorShortcuts = computed(() => getValueShortcuts(t))
const terminalShortcuts = computed(() => getTerminalShortcuts(t))

function open() {
  visible.value = true
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    width="900"
    align-center
    draggable
    :show-close="false"
    header-class="me-shortcut-dialog__header">
    <div class="setting-shortcut-cols">
      <div class="setting-shortcut-col">
        <div class="setting-shortcut-col__title">{{ t('setting.shortcutGlobal') }}</div>
        <MeShortcut :items="globalShortcuts" compact />
      </div>
      <div class="setting-shortcut-col">
        <div class="setting-shortcut-col__title">{{ t('setting.shortcutCodeMirror') }}</div>
        <MeShortcut :items="codeMirrorShortcuts" compact />
      </div>
      <div class="setting-shortcut-col">
        <div class="setting-shortcut-col__title">{{ t('setting.shortcutTerminal') }}</div>
        <MeShortcut :items="terminalShortcuts" compact />
      </div>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.setting-shortcut-cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.setting-shortcut-col__title {
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.setting-shortcut-col {
  display: flex;
  flex-direction: column;
  min-width: 0;

  &:first-child {
    align-items: flex-start;
  }

  &:nth-child(2) {
    align-items: center;
  }

  &:last-child {
    align-items: flex-end;
  }
}
</style>
