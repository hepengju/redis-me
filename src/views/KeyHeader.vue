<script setup lang="ts">
// #region 导入
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey, connUiProvideKey } from '@/types/me-interface'
import { openNewWindow } from '@/utils/app-window'
import { connsInGroupOrder, getConnIcon } from '@/utils/conn'
import { bus, CONN_REFRESH, meCommands, meOk, OPEN_SETTING } from '@/utils/util'
import AppAbout from '@/views/ext/AppAbout.vue'
import AppSetting from '@/views/ext/AppSetting.vue'
import AppShortcut from '@/views/ext/AppShortcut.vue'
import CommandLog from '@/views/ext/CommandLog.vue'
// #endregion

// #region 核心状态
const share = inject(shareProvideKey)!
const connUi = inject(connUiProvideKey)!
const { t } = useI18n()

// 下拉顺序与分组视图一致，不跟 connList 的原始存放顺序
const orderedConnList = computed(() =>
  connsInGroupOrder(
    share.connList,
    Array.isArray(meTauri.settings.connGroups) ? meTauri.settings.connGroups : [],
  ),
)

const dialog = reactive({ commandLog: false })
const settingRef = ref<InstanceType<typeof AppSetting>>()
const shortcutRef = ref<InstanceType<typeof AppShortcut>>()
const aboutRef = ref<InstanceType<typeof AppAbout>>()
function openSetting(): void {
  settingRef.value?.open()
}

function openShortcuts(): void {
  shortcutRef.value?.open()
}

onMounted(() => {
  connUi.openSetting = openSetting
  connUi.openShortcuts = openShortcuts
  // 顶部栏设置图标与本组件非父子关系，经 bus 通知打开本处挂载的设置弹窗
  bus.on(OPEN_SETTING, openSetting)
})
onUnmounted(() => {
  bus.off(OPEN_SETTING, openSetting)
})
// #endregion

// #region 命令处理
async function handleCommand(command: string): Promise<void> {
  if (command === 'refreshConn') {
    if (!share.conn) return
    const capabilities = await meCommands.connect(share.conn!.id)
    Object.assign(share.capabilities, capabilities)
    bus.emit(CONN_REFRESH)
  } else if ('closeConn' === command) {
    share.conn = null
  } else if ('commandLog' === command) {
    if (!share.conn) {
      meOk(t('keyHeader.commandLogNeedConn'))
      return
    }
    // 延迟到下一帧显示弹框，确保 dropdown 菜单先完成收起，避免弹框创建干扰 dropdown 状态
    nextTick(() => {
      dialog.commandLog = true
    })
  } else if ('setting' === command) {
    openSetting()
  } else if ('window' === command) {
    await openNewWindow()
  } else if ('info' === command) {
    aboutRef.value?.open()
    // } else if ('social' === command) {
    //   officialRef.value?.open()
  } else {
    meOk(`TODO: ${command}`)
  }
}
// #endregion
</script>

<template>
  <div class="key-header">
    <el-select
      v-model="share.conn"
      :placeholder="t('keyHeader.connHint')"
      class="conn"
      clearable
      filterable
      :disabled="share.connList.length === 0"
      value-key="id">
      <el-option v-for="item in orderedConnList" :label="item.name" :value="item" :key="item.id">
        <div :style="{ color: item?.color }">
          <me-icon :icon="getConnIcon(item)" :name="item.name" />
        </div>
      </el-option>

      <template #label="{ value }">
        <div :style="{ color: share.color }">
          <me-icon :icon="getConnIcon(value)" :name="value.name" />
        </div>
      </template>
    </el-select>

    <el-dropdown placement="bottom-end" @command="handleCommand" style="margin-left: 10px">
      <el-button type="success" icon="el-icon-operation" />
      <template #dropdown>
        <el-dropdown-menu>
          <template v-if="share.conn">
            <el-dropdown-item command="refreshConn">
              <me-icon :name="t('keyHeader.refreshConn')" icon="el-icon-refresh-right" />
            </el-dropdown-item>
            <el-dropdown-item command="closeConn">
              <me-icon :name="t('keyHeader.closeConn')" icon="el-icon-circle-close" />
            </el-dropdown-item>
            <el-dropdown-item command="commandLog">
              <me-icon :name="t('keyHeader.commandLog')" icon="el-icon-document" />
            </el-dropdown-item>
          </template>

          <el-dropdown-item command="window" :divided="!!share.conn">
            <me-icon :name="t('keyHeader.newWindow')" icon="me-icon-window" />
          </el-dropdown-item>
          <el-dropdown-item command="setting" divided>
            <me-icon :name="t('keyHeader.setting')" icon="el-icon-setting" />
          </el-dropdown-item>
          <!-- 社交入口暂隐藏；恢复时同步解开 AppOfficial 的 import / ref / 组件挂载 -->
          <!-- <el-dropdown-item command="social">
            <me-icon :name="t('keyHeader.social')" icon="me-icon-social" />
          </el-dropdown-item> -->
          <el-dropdown-item command="info">
            <me-icon :name="t('keyHeader.about')" icon="me-icon-info" />
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <AppSetting ref="settingRef" />
    <AppShortcut ref="shortcutRef" />
    <AppAbout ref="aboutRef" />
    <!-- <AppOfficial ref="officialRef" /> -->
    <CommandLog v-model="dialog.commandLog" />
  </div>
</template>

<style scoped lang="scss">
.key-header {
  display: flex;
}
</style>
