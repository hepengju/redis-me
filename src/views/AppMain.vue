<script setup lang="ts">
// #region 导入
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  reactive,
  ref,
  shallowReactive,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

import {
  appProvideKey,
  connUiProvideKey,
  shareProvideKey,
  type AppMainInject,
  type ConnListWindowsSyncPayload,
  type ConnShortcutAction,
  type UiConn,
} from '@/types/me-interface'
import type { ConnConfig, RedisKey_Deserialize } from '@/types/tauri-specta'
import { checkAppUpdate } from '@/utils/app-update'
import { openNewWindow, toggleAppFullscreen } from '@/utils/app-window'
import {
  collapseImportedConnGroups,
  collectKnownConnGroupNames,
  isConnMinimalMode,
  mergeConnGroupsFromList,
} from '@/utils/conn'
import { clearKeyMemoryCacheForConn, onMemoryUsageUnsupported } from '@/utils/key-memory-cache'
import { clearKeyTtlCacheForConn } from '@/utils/key-ttl-cache'
import { clearKeyTypeCacheForConn } from '@/utils/key-type-cache'
import { mergeImportedConnList } from '@/utils/rdm'
import {
  isAppFullscreenHotkeyBlocked,
  matchAppFullscreenHotkey,
  matchConnShortcutAction,
} from '@/utils/shortcut'
import {
  bus,
  CONN_LIST_WINDOWS_SYNC,
  CONN_REFRESH,
  meCommands,
  meJsonParse,
  meOk,
} from '@/utils/util'
import ConnImport from '@/views/conn/ConnImport.vue'
import ConnSave from '@/views/conn/ConnSave.vue'
import KeyEmpty from '@/views/key/KeyEmpty.vue'
import KeyHeader from '@/views/KeyHeader.vue'
import KeyMain from '@/views/KeyMain.vue'
import TabConn from '@/views/TabConn.vue'

import TabMain from './TabMain.vue'
// #endregion

// #region 核心状态

const { t } = useI18n()

// 共享数据（由 App.vue provide，AppMain 与顶部栏 AppTitle 共用同一份）
const share = inject(shareProvideKey)!
// 列表批量 MEMORY USAGE 若发现命令不可用，关掉本连接能力，内存页和目录分析一起停
onMemoryUsageUnsupported(connId => {
  if (share.conn?.id !== connId) return
  share.capabilities.memoryUsageSupported = false
  if (share.tabName === 'memory') share.tabName = 'value'
})
// #endregion

// #region 连接切换

// 当环境发生变化时，销毁整个key和tag组件（避免状态保留）
onMounted(() => {
  bus.on(CONN_REFRESH, toggleKeyTag)
  window.addEventListener('keydown', onGlobalConnHotkey, true)
})
onUnmounted(() => {
  bus.off(CONN_REFRESH, toggleKeyTag)
  window.removeEventListener('keydown', onGlobalConnHotkey, true)
})

// 切换连接时销毁key/tag组件
const connPrepared = ref(false)
function toggleKeyTag(): void {
  connPrepared.value = false
  void nextTick(() => {
    connPrepared.value = true
  })
}

// 切换连接时loading
watch(
  () => JSON.stringify(share.conn),
  async (newConnStr, oldConnStr) => {
    const newConn = meJsonParse(newConnStr) as UiConn | null
    const oldConn = meJsonParse(oldConnStr) as UiConn | null

    const index = share.connList.findIndex((c: UiConn) => c.id === newConn?.id)
    if (index !== -1 && newConn) {
      share.connList[index] = newConn
    }

    if (newConn?.id === oldConn?.id) return

    share.loading = true
    connPrepared.value = false

    try {
      if (oldConn) {
        clearKeyTypeCacheForConn(oldConn.id)
        clearKeyMemoryCacheForConn(oldConn.id)
        clearKeyTtlCacheForConn(oldConn.id)
        await meCommands.disconnect(oldConn.id)
      }

      if (newConn) {
        share.color = newConn.color ?? 'var(--el-color-primary)'
        share.readonly = !!newConn.readonly
        const capabilities = await meCommands.connect(newConn.id)
        Object.assign(share.capabilities, capabilities)
        share.tabName =
          isConnMinimalMode(newConn) || !share.capabilities.infoSupported ? 'value' : 'info'
        connPrepared.value = true
      }
    } catch {
      if (!oldConn) share.conn = null
    } finally {
      share.loading = false
    }
  },
  { deep: true },
)
// #endregion

// #region 连接列表同步
const tauriWindow = getCurrentWindow()
const connListToString = computed(() => JSON.stringify(share.connList))
watch(
  connListToString,
  async newConnList => {
    const connList = meJsonParse(newConnList) as UiConn[]
    meTauri.connList = connList as MeTauriGlobal['connList']

    await meCommands.connList(connList as ConnConfig[])
    const payload: ConnListWindowsSyncPayload = { connList, label: tauriWindow.label }
    await tauriWindow.emit(CONN_LIST_WINDOWS_SYNC, payload)
  },
  { immediate: true },
)

onMounted(
  () =>
    void tauriWindow.listen(CONN_LIST_WINDOWS_SYNC, e => {
      share.connList = (e.payload as ConnListWindowsSyncPayload).connList
    }),
)
// #endregion

// #region 自动更新

// shallowReactive：`Update` 含私有字段，deep reactive 会解成普通对象导致与 `AppMainInject` 不兼容
const app = shallowReactive<AppMainInject>({
  update: null,
  downloading: false,
  downloadPercentage: 0,
})
provide(appProvideKey, app)
async function checkAutoUpdate(): Promise<void> {
  if (meTauri.isAppStore) return
  if (!meTauri.settings.autoUpdate) return
  app.update = await checkAppUpdate().catch((): null => null)
}
onMounted(checkAutoUpdate)
// #endregion

// #region 面板操作
// 连接相关弹窗：ConnSave/Import 挂 AppMain；设置弹窗在 KeyHeader（始终挂载）
const connSaveRef = useTemplateRef<InstanceType<typeof ConnSave>>('connSave')
const connImportRef = useTemplateRef<InstanceType<typeof ConnImport>>('connImport')
const dialog = reactive({ conn: false, import: false })

const connUi = reactive({
  openConnSave(mode: 'add' | 'edit', conn?: UiConn): void {
    if (mode === 'add' && !conn && dialog.conn) {
      dialog.conn = false
      return
    }
    dialog.conn = true
    void nextTick(() => connSaveRef.value?.open(mode, conn))
  },
  openConnImport(): void {
    if (dialog.import) {
      dialog.import = false
      return
    }
    dialog.import = true
    void nextTick(() => connImportRef.value?.open())
  },
  /** KeyHeader onMounted 时注入，供菜单与全局快捷键共用 */
  openSetting(): void {},
  openShortcuts(): void {},
  /** KeyMain onMounted 时注入，供键值页等打开创建副本弹窗 */
  openKeyCopy(_redisKey: RedisKey_Deserialize): void {},
  /** KeyMain onMounted 时注入，供键值页定位当前键 */
  scrollKeyToTree(_redisKey: RedisKey_Deserialize): void {},
  /** KeyMain onMounted 时注入，搜索页切到键区索引查询 */
  browseSearchIndex(_name: string): void {},
  runConnAction(action: ConnShortcutAction): void {
    if (action === 'add') connUi.openConnSave('add')
    else if (action === 'import') connUi.openConnImport()
    else if (action === 'setting') connUi.openSetting()
    else if (action === 'shortcuts') connUi.openShortcuts()
    else if (action === 'newWindow') void openNewWindow()
    else if (action === 'fullscreen') void toggleAppFullscreen()
  },
})

function onGlobalConnHotkey(e: KeyboardEvent): void {
  const action = matchConnShortcutAction(e)
  if (action) {
    e.preventDefault()
    connUi.runConnAction(action)
    return
  }

  if (!matchAppFullscreenHotkey(e)) return
  if (isAppFullscreenHotkeyBlocked(e, { tabName: share.tabName })) return

  e.preventDefault()
  void toggleAppFullscreen()
}

function onConnImported(impConnList: UiConn[]): void {
  if (!Array.isArray(meTauri.settings.connGroups)) meTauri.settings.connGroups = []
  const knownGroups = collectKnownConnGroupNames(meTauri.settings.connGroups, share.connList)
  share.connList = mergeImportedConnList(share.connList, impConnList)
  mergeConnGroupsFromList(share.connList, meTauri.settings.connGroups)
  collapseImportedConnGroups(
    impConnList,
    knownGroups,
    meTauri.settings.connGroupExpanded as Record<string, boolean>,
  )
  meOk(t('conn.importOk'))
}

provide(connUiProvideKey, connUi)
// #endregion

// #region 键值分栏
// 键区/值区宽度：初始 30%/70%，拖动中 el-splitter 以 px 回写
// 复位必须两侧同时设：拖过后双方都有显式 size，el-splitter 会把百分比归一化到总和 1，只改一侧会被旧 px 缩放
const KEY_PANEL_DEFAULT_SIZE = '30%'
const VALUE_PANEL_DEFAULT_SIZE = '70%'
const keyPanelSize = ref<string | number>(KEY_PANEL_DEFAULT_SIZE)
const valuePanelSize = ref<string | number>(VALUE_PANEL_DEFAULT_SIZE)

/** 双击分隔条恢复默认分栏（el-splitter 无内建复位） */
function resetSplitSize(): void {
  keyPanelSize.value = KEY_PANEL_DEFAULT_SIZE
  valuePanelSize.value = VALUE_PANEL_DEFAULT_SIZE
}

// 不用 dblclick：拖动蒙层让 click/dblclick 的 target 抬到 .el-splitter（mouseup 落在蒙层上取公共祖先），
// 而 mousedown 目标恒为 dragger（拖动本身也靠它），故数 400ms 内的两次 mousedown 当作双击
let lastBarDownAt = 0
function onSplitterBarMouseDown(e: MouseEvent): void {
  // 新的按下先摘掉上一次挂起的复位（连按后又继续拖的场景）
  window.removeEventListener('mouseup', resetSplitSize)
  const onBar = !!(e.target as HTMLElement | null)?.closest('.el-splitter-bar')
  const now = Date.now()
  const doubleDown = onBar && now - lastBarDownAt < 400
  lastBarDownAt = onBar ? now : 0
  if (!doubleDown) return
  // 拖柄的 mousedown 已开启拖动会话并缓存旧尺寸，期间任一 mousemove 都会用缓存回写覆盖复位，
  // 故推迟到本次 mouseup 之后写回（el-splitter 的 mouseup 监听先注册先执行，moveEnd 已收尾）
  window.addEventListener('mouseup', resetSplitSize, { once: true })
}
// #endregion
</script>

<template>
  <div class="redis-main" v-loading="share.loading" @mousedown="onSplitterBarMouseDown">
    <el-splitter>
      <!-- 左侧键 -->
      <el-splitter-panel v-model:size="keyPanelSize" style="margin-right: 3px">
        <div class="redis-key">
          <KeyHeader />
          <KeyMain v-if="share.conn && connPrepared" />
          <KeyEmpty v-else />
        </div>
      </el-splitter-panel>

      <!-- 右侧值 -->
      <el-splitter-panel v-model:size="valuePanelSize">
        <TabConn v-if="!share.conn || !connPrepared" />
        <template v-else>
          <TabMain />

          <!-- 导入导出 -->
          <el-progress
            class="export-importing"
            type="dashboard"
            status="success"
            :percentage="share.exportImportingPercentage"
            v-if="share.exportImporting">
            <template #default="{ percentage }">
              <div class="percentage-value">{{ percentage }}%</div>
              <div class="percentage-label">{{ share.exportImportingTip }}</div>
            </template>
          </el-progress>
        </template>
      </el-splitter-panel>
    </el-splitter>

    <!-- 支持全局快捷键 -->
    <ConnSave ref="connSave" v-if="dialog.conn" @closed="dialog.conn = false" />
    <ConnImport
      ref="connImport"
      v-if="dialog.import"
      @import="onConnImported"
      @closed="dialog.import = false" />
  </div>
</template>

<style scoped lang="scss">
.redis-main {
  height: calc(100% - 30px);
  padding: 0 8px 8px 8px;
  flex: 1;

  .redis-key {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* 中间分隔面板的样式调整 */
  :deep(.el-splitter-bar) {
    width: 5px !important;

    // EP 拖柄命中区默认 16px 宽（内联 width），向两侧面板溢出，鼠标贴面板边缘划过即点亮竖线；
    // 压到 4px（与字段面板左缘拖柄同宽），只有真正瞄着缝隙去才亮线、可拖
    .el-splitter-bar__dragger-horizontal {
      width: 4px !important;
    }

    // 竖线常驻隐藏（整条线显脏），仅悬停/拖动时显示，配色与字段面板左缘拖柄一致
    .el-splitter-bar__dragger-horizontal::before {
      background-color: transparent;
    }

    .el-splitter-bar__dragger-horizontal:hover::before {
      background-color: var(--el-color-primary-light-5);
    }

    // 拖动中：组件加 dragger-active；蒙层会夺走 :hover，故与 hover 同优先级且置后
    .el-splitter-bar__dragger-horizontal.el-splitter-bar__dragger-active::before {
      background-color: var(--el-color-primary-light-3);
    }
  }

  // 版本升级过程中显示下载进度
  .export-importing {
    position: absolute;
    right: 20px;
    bottom: 0;
    z-index: 100;

    .percentage-value {
      font-size: 28px;
      color: var(--el-color-success);
    }

    .percentage-label {
      margin-top: 10px;
      font-size: 14px;
    }
  }
}
</style>
