<script setup lang="ts">
// #region 导入
import { debounce } from 'lodash'
import { Sortable, type SortableEvent } from 'sortablejs'
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

import {
  appProvideKey,
  connUiProvideKey,
  shareProvideKey,
  type ConnShortcutAction,
  type UiConn,
} from '@/types/me-interface'
import { meDownloadUpdate } from '@/utils/app-update'
import {
  buildConnGroupSections,
  normalizeGroupName,
  removeConnGroup,
  renameConnGroup,
} from '@/utils/conn'
import { buildExportFileName, saveTextExport } from '@/utils/export'
import { encodeRedisMeConnectionsToMec } from '@/utils/rdm'
import { meConfirm, meErr, meOk, mePrompt, meWarn } from '@/utils/util'
import ConnEmpty from '@/views/conn/ConnEmpty.vue'
import ConnGroup from '@/views/conn/ConnGroup.vue'
import ConnTable from '@/views/conn/ConnTable.vue'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const connUi = inject(connUiProvideKey)!

// 分组名有序列表（持久化）；空数组时自动初始化
const connGroups = computed(() => {
  const list = meTauri.settings.connGroups
  if (!Array.isArray(list)) {
    meTauri.settings.connGroups = []
    return meTauri.settings.connGroups
  }
  return list
})

// 平铺 ConnTable / 分组 ConnGroup，由 settings.connShow 切换
const connShowGroup = computed({
  get: () => meTauri.settings.connShow === 'group',
  set: (v: boolean) => {
    meTauri.settings.connShow = v ? 'group' : 'flat'
  },
})

const keyword = ref('')
const filterDataList = computed(() => {
  const key = keyword.value.toLowerCase()
  return share.connList.filter(
    row =>
      !key ||
      row.name?.toLowerCase().indexOf(key) > -1 ||
      row.host?.toLowerCase().indexOf(key) > -1,
  )
})

// 分组视图数据源：按 connGroups 顺序拆 section，并应用 keyword 筛选
const groupSections = computed(() =>
  buildConnGroupSections(share.connList, connGroups.value, keyword.value),
)

const flatTableRef = useTemplateRef<InstanceType<typeof ConnTable>>('flatTableRef')

const connListEmpty = computed(() => share.connList.length === 0)

const hasNamedConnGroups = computed(() => connGroups.value.some(g => !!normalizeGroupName(g)))

/** 无连接时：分组模式且已有空 folder 则仍显示分组树，避免「新建分组」看起来没生效 */
const showConnEmpty = computed(() => {
  if (share.loading) return true
  if (connListEmpty.value && connShowGroup.value && hasNamedConnGroups.value) return false
  return connListEmpty.value
})

function onEmptyAction(action: string): void {
  connUi.runConnAction(action as ConnShortcutAction)
}

function deleteConn(conn: UiConn): void {
  meConfirm(t('conn.deleteConn', { name: conn.name }), () => {
    const index = share.connList.indexOf(conn)
    if (index > -1) share.connList.splice(index, 1)
  })
}

const selectConn = debounce(async (conn: UiConn) => {
  share.conn = conn
}, 200)

let sortables: Sortable[] = []

function destroySortables(): void {
  for (const s of sortables) s.destroy()
  sortables = []
}

function setupFlatDrag(): void {
  const tbody = flatTableRef.value?.getTbody()
  if (!tbody) return
  sortables.push(
    Sortable.create(tbody, {
      handle: '.drag-handle, .conn-host',
      onEnd: ({ oldIndex, newIndex }: SortableEvent) => {
        if (oldIndex === undefined || newIndex === undefined) return
        const list = filterDataList.value
        const dragRow = list[oldIndex]
        const target = list[newIndex]
        if (!dragRow || !target) return
        const from = share.connList.indexOf(dragRow)
        const to = share.connList.indexOf(target)
        if (from < 0 || to < 0) return
        const [item] = share.connList.splice(from, 1)
        if (item) share.connList.splice(to, 0, item)
      },
    }),
  )
}

function refreshFlatSortable(): void {
  if (connShowGroup.value) return
  destroySortables()
  void nextTick(() => setupFlatDrag())
}

onMounted(refreshFlatSortable)
onBeforeUnmount(destroySortables)
watch([connShowGroup, filterDataList], () => refreshFlatSortable())
// #endregion

// #region 面板操作
const isDev = import.meta.env.DEV

function handleCommand(command: string): void {
  if (command === 'export') void exportConn()
  else if (command === 'import') connUi.openConnImport()
  else if (command === 'connShowFlat') connShowGroup.value = false
  else if (command === 'connShowGroup') connShowGroup.value = true
  else if (command === 'clear' && isDev) clearAllConnections()
}

function promptFolderName(title: string, inputValue: string, onOk: (name: string) => void): void {
  mePrompt(
    title,
    { inputValue, inputValidator: v => !!normalizeGroupName(v) || t('conn.folderNameRequired') },
    ({ value }) => {
      const name = normalizeGroupName(value)
      if (name) onOk(name)
    },
  )
}

// —— 分组文件夹 CRUD（仅分组模式下显示） ——

function addFolder(): void {
  promptFolderName(t('conn.newFolder'), '', name => {
    if (connGroups.value.some(g => normalizeGroupName(g) === name)) {
      meWarn(t('conn.folderExists'))
      return
    }
    connGroups.value.push(name)
    meOk(t('addOk'))
  })
}

function renameFolder(name: string): void {
  promptFolderName(t('conn.renameFolder'), name, newName => {
    if (newName === name) return
    if (connGroups.value.some(g => normalizeGroupName(g) === newName)) {
      meWarn(t('conn.folderExists'))
      return
    }
    if (
      renameConnGroup(
        share.connList,
        connGroups.value,
        name,
        newName,
        meTauri.settings.connGroupExpanded as Record<string, boolean>,
      )
    ) {
      meOk(t('conn.renameFolderOk'))
    }
  })
}

function deleteFolder(name: string): void {
  meConfirm(t('conn.deleteFolderConfirm', { name }), () => {
    removeConnGroup(
      share.connList,
      connGroups.value,
      name,
      meTauri.settings.connGroupExpanded as Record<string, boolean>,
    )
    meOk(t('conn.deleteFolderOk'))
  })
}

function clearAllConnections(): void {
  meConfirm(t('conn.clearConnectionsConfirm'), () => {
    share.connList.splice(0, share.connList.length)
    share.conn = null
    // 清空连接时一并重置分组名列表与折叠状态
    connGroups.value.splice(0, connGroups.value.length)
    const expanded = meTauri.settings.connGroupExpanded as Record<string, boolean>
    for (const k of Object.keys(expanded)) delete expanded[k]
    meOk(t('conn.clearConnectionsOk'))
  })
}

async function exportConn(): Promise<void> {
  await saveTextExport(
    encodeRedisMeConnectionsToMec(share.connList),
    buildExportFileName('connections', 'mec'),
    ['mec'],
    { ok: t('conn.exportOk'), err: t('conn.exportErr') },
  )
}

const app = inject(appProvideKey)!
function clickNew(): void {
  const u = app.update
  if (!u) return
  void meDownloadUpdate(false, toRaw(u), app)
}
// #endregion
</script>

<template>
  <div class="redis-conn">
    <!-- 空态保留完整顶栏；进入连接 loading 时隐藏，避免和全屏转圈叠在一起 -->
    <div v-if="!share.loading" class="me-flex header">
      <div class="me-flex">
        <el-button icon="el-icon-plus" type="primary" @click="connUi.openConnSave('add')">{{
          t('conn.add')
        }}</el-button>
        <el-button v-if="connShowGroup" icon="el-icon-folder-add" @click="addFolder">
          {{ t('conn.newFolder') }}
        </el-button>
      </div>
      <div class="me-flex">
        <me-icon icon="me-icon-new" class="icon-new" @click="clickNew" v-if="app.update?.version" />
        <el-dropdown placement="bottom-start" @command="handleCommand" style="margin-right: 10px">
          <el-button>...</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="connShowGroup" command="connShowFlat">
                <me-icon :name="t('conn.showFlat')" icon="me-icon-list" />
              </el-dropdown-item>
              <el-dropdown-item v-if="!connShowGroup" command="connShowGroup">
                <me-icon :name="t('conn.showGroup')" icon="el-icon-folder" />
              </el-dropdown-item>
              <el-dropdown-item command="export" divided>
                <me-icon :name="t('conn.export')" icon="me-icon-export" />
              </el-dropdown-item>
              <el-dropdown-item command="import">
                <me-icon :name="t('conn.import')" icon="me-icon-import" />
              </el-dropdown-item>
              <el-dropdown-item v-if="isDev" command="clear" divided>
                <me-icon :name="t('conn.clearConnections')" icon="el-icon-delete" />
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-input
          v-model="keyword"
          :placeholder="t('conn.keyword')"
          style="width: 300px"
          clearable />
      </div>
    </div>

    <ConnEmpty v-if="showConnEmpty" class="conn-empty-wrap" @action="onEmptyAction" />

    <template v-else>
      <ConnTable
        v-if="!connShowGroup"
        ref="flatTableRef"
        class="conn-table-wrap"
        :data="filterDataList"
        @select="selectConn"
        @copy="(c: UiConn) => connUi.openConnSave('add', c)"
        @edit="(c: UiConn) => connUi.openConnSave('edit', c)"
        @delete="deleteConn" />

      <ConnGroup
        v-else
        class="group-list"
        :sections="groupSections"
        :conn-groups="connGroups"
        :conn-list="share.connList"
        @select="selectConn"
        @copy="(c: UiConn) => connUi.openConnSave('add', c)"
        @edit="(c: UiConn) => connUi.openConnSave('edit', c)"
        @delete="deleteConn"
        @rename-folder="renameFolder"
        @delete-folder="deleteFolder" />
    </template>

    <el-progress
      class="downloading"
      type="dashboard"
      :percentage="app.downloadPercentage"
      v-if="app.downloading">
      <template #default="{ percentage }">
        <div class="percentage-value">{{ percentage }}%</div>
        <div class="percentage-label">{{ t('conn.downloading') }}</div>
      </template>
    </el-progress>
  </div>
</template>

<style scoped lang="scss">
.redis-conn {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 5px;

  .header {
    margin-bottom: 10px;

    .icon-new {
      margin: 0 10px;
      font-size: 30px;
      color: var(--el-color-danger);
      cursor: pointer;
    }
  }

  .conn-empty-wrap,
  .conn-table-wrap,
  .group-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  :deep(.el-checkbox) {
    margin-right: 10px;
  }

  :deep(.drag-handle),
  :deep(.conn-host) {
    user-select: none;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  :deep(.sortable-chosen .drag-handle),
  :deep(.sortable-chosen .conn-host) {
    cursor: grabbing;
  }

  :deep(.sortable-ghost) {
    background-color: var(--el-color-primary-light-8);
  }

  .downloading {
    position: absolute;
    right: 20px;
    bottom: 0;
    z-index: 100;

    .percentage-value {
      font-size: 28px;
      color: var(--el-color-primary);
    }

    .percentage-label {
      margin-top: 10px;
      font-size: 14px;
    }
  }
}
</style>
