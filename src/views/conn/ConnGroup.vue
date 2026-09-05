<script setup lang="ts">
// #region 导入
// 分组视图：文件夹行 + 连接行；SortableJS 支持文件夹排序、连接跨组/组内拖拽
import { Sortable, type SortableEvent } from 'sortablejs'
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { UiConn } from '@/types/me-interface'
import type { ConnGroupSection } from '@/utils/conn'
import {
  applyConnGroupOrder,
  getConnGroup,
  getConnIcon,
  moveConnInGroup,
  moveConnToGroup,
} from '@/utils/conn'
import { PREDEFINE_COLORS } from '@/utils/util'
// #endregion

// #region 核心状态

const props = defineProps<{
  sections: ConnGroupSection[]
  connGroups: string[]
  connList: UiConn[]
}>()

const emit = defineEmits<{
  select: [conn: UiConn]
  copy: [conn: UiConn]
  edit: [conn: UiConn]
  delete: [conn: UiConn]
  renameFolder: [name: string]
  deleteFolder: [name: string]
}>()

const { t } = useI18n()
const listRef = useTemplateRef<HTMLElement>('listRef')

const CONN_DRAG_GROUP = 'conn-groups'
// #endregion

// #region 折叠与拖拽

// 分组折叠状态持久化在 settings.connGroupExpanded，键为分组名（默认分组用 ''）
function expandedStore(): Record<string, boolean> {
  return meTauri.settings.connGroupExpanded as Record<string, boolean>
}

function initExpandedForSections(sections: ConnGroupSection[]): void {
  const store = expandedStore()
  for (const sec of sections) {
    const k = sec.key || ''
    if (!(k in store)) store[k] = true
  }
}

function sectionTitle(key: string): string {
  return key || t('conn.ungrouped')
}

function toggle(key: string): void {
  expandedStore()[key || ''] = !isExpanded(key)
}

function isExpanded(key: string): boolean {
  const k = key || ''
  const store = expandedStore()
  if (!(k in store)) return true
  return store[k] !== false
}

function connStyle(conn: UiConn): Record<string, string> | undefined {
  if (conn.color) return { color: conn.color }
  return undefined
}

function findConn(id: string | null): UiConn | undefined {
  if (!id) return undefined
  return props.connList.find(c => c.id === id)
}

function appendIndexInGroup(groupKey: string, conn: UiConn): number {
  let n = 0
  for (const c of props.connList) {
    if (c === conn) continue
    if (getConnGroup(c) === groupKey) n++
  }
  return n
}

function getListGroupKey(el: HTMLElement): string {
  return el.dataset.groupKey ?? ''
}

// —— Sortable 实例与拖拽高亮 ——

let sortables: Sortable[] = []
let highlightFolderKey: string | null = null

function destroySortables(): void {
  for (const s of sortables) s.destroy()
  sortables = []
}

function readSortableFolderOrder(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('.group-block--sortable')]
    .map(el => el.dataset.groupKey ?? '')
    .filter(Boolean)
}

function clearDropHighlight(): void {
  listRef.value?.querySelectorAll('.group-head--drop-target').forEach(el => {
    el.classList.remove('group-head--drop-target')
  })
  highlightFolderKey = null
}

function setDropHighlight(groupKey: string | null): void {
  if (groupKey === highlightFolderKey) return
  clearDropHighlight()
  if (groupKey === null) return
  highlightFolderKey = groupKey
  listRef.value
    ?.querySelector(`.group-block[data-group-key="${groupKey}"] .group-head`)
    ?.classList.add('group-head--drop-target')
}

function groupKeyFromSortableTarget(el: HTMLElement | null): string | null {
  const listEl = el?.classList.contains('conn-list') ? el : el?.closest('.conn-list')
  return listEl ? getListGroupKey(listEl as HTMLElement) : null
}

// 跨组放置：写回数据后移除 Sortable 移动的 DOM，避免与 Vue 重渲染重复
function applyCrossGroupDrop(
  conn: UiConn,
  item: HTMLElement,
  targetGroupKey: string,
  indexInGroup: number,
): void {
  moveConnToGroup(props.connList, props.connGroups, conn, targetGroupKey, indexInGroup)
  item.remove()
}

function handleConnListSortEnd(evt: SortableEvent, sourceGroupKey: string): void {
  clearDropHighlight()
  const { oldIndex, newIndex, from, to, item } = evt
  const conn = findConn(item.dataset.id ?? null)
  if (!conn) return

  const toKey = getListGroupKey(to as HTMLElement)
  if (from !== to) {
    applyCrossGroupDrop(conn, item, toKey, newIndex ?? appendIndexInGroup(toKey, conn))
    return
  }
  if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
    moveConnInGroup(props.connList, props.connGroups, sourceGroupKey, oldIndex, newIndex)
  }
}

function setupDrag(): void {
  destroySortables()
  const root = listRef.value
  if (!root) return

  sortables.push(
    Sortable.create(root, {
      draggable: '.group-block--sortable',
      handle: '.group-head',
      filter: '.folder-actions',
      preventOnFilter: true,
      animation: 150,
      onEnd: () => {
        applyConnGroupOrder(props.connList, props.connGroups, readSortableFolderOrder(root))
      },
    }),
  )

  root.querySelectorAll<HTMLElement>('.conn-list').forEach(listEl => {
    const groupKey = getListGroupKey(listEl)
    sortables.push(
      Sortable.create(listEl, {
        draggable: '.conn-row',
        handle: '.conn-host',
        filter: '.conn-actions',
        preventOnFilter: true,
        group: CONN_DRAG_GROUP,
        onMove: evt => {
          setDropHighlight(groupKeyFromSortableTarget(evt.to as HTMLElement))
          return true
        },
        onEnd: evt => handleConnListSortEnd(evt, groupKey),
      }),
    )
  })
}

watch(() => props.sections, initExpandedForSections, { immediate: true })
watch(
  () => props.sections,
  () => void nextTick(setupDrag),
  { deep: true },
)

onMounted(() => void nextTick(setupDrag))
onBeforeUnmount(() => destroySortables())
// #endregion
</script>

<template>
  <div ref="listRef" class="conn-group-list">
    <div
      v-for="sec in sections"
      :key="sec.key || '__default__'"
      class="group-block"
      :class="{ 'group-block--sortable': !!sec.key }"
      :data-group-key="sec.key">
      <div class="group-head" @click="toggle(sec.key)">
        <me-icon
          class="group-expand-icon"
          :icon="isExpanded(sec.key) ? 'el-icon-arrow-down-bold' : 'el-icon-arrow-right-bold'" />
        <me-icon
          :icon="isExpanded(sec.key) ? 'el-icon-folder-opened' : 'el-icon-folder'"
          :name="sectionTitle(sec.key)" />
        <span class="group-count">({{ sec.conns.length }})</span>
        <span v-if="sec.key" class="folder-actions row-actions" @click.stop>
          <span class="action-slot" />
          <span class="action-slot" />
          <me-icon
            :info="t('conn.renameFolder')"
            icon="el-icon-edit"
            class="icon-btn"
            @click="emit('renameFolder', sec.key)" />
          <me-icon
            :info="t('conn.deleteFolder')"
            icon="el-icon-delete"
            class="icon-btn"
            @click="emit('deleteFolder', sec.key)" />
        </span>
      </div>
      <!-- 折叠时不用 v-show，conn-list 保留在 DOM 内供 Sortable 跨组放入 -->
      <div
        class="conn-list"
        :class="{ 'conn-list--collapsed': !isExpanded(sec.key) }"
        :data-group-key="sec.key">
        <div
          v-for="conn in sec.conns"
          :key="conn.id"
          class="conn-row"
          :data-id="conn.id"
          :style="connStyle(conn)">
          <me-icon
            :icon="getConnIcon(conn)"
            :name="conn.name"
            class="conn-name"
            @click="emit('select', conn)" />
          <me-icon
            class="conn-host"
            :icon-left="false"
            icon="el-icon-rank"
            :name="conn.host + ':' + conn.port" />
          <span class="conn-actions row-actions" @click.stop>
            <el-color-picker
              size="small"
              v-model="conn.color"
              :predefine="PREDEFINE_COLORS"
              @click.stop />
            <me-icon
              :info="t('copy')"
              icon="el-icon-document-copy"
              class="icon-btn"
              @click="emit('copy', conn)" />
            <me-icon
              :info="t('edit')"
              icon="el-icon-edit"
              class="icon-btn"
              @click="emit('edit', conn)" />
            <me-icon
              :info="t('delete')"
              icon="el-icon-delete"
              class="icon-btn"
              @click="emit('delete', conn)" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.conn-group-list {
  font-size: 14px;

  .group-expand-icon {
    flex-shrink: 0;
    opacity: 0.65;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 6px;
    // 锁死行高：默认分组标题随语言在「默认分组」/ Default Group 间切换，
    // CJK 与西文字体度量不同，不固定会出现整行上下跳
    height: 36px;
    padding: 0 10px 0 0;
    line-height: 22px;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 4px;
    opacity: 0.8;

    &:hover {
      background: var(--el-fill-color-light);
    }

    &.group-head--drop-target {
      outline: 1px dashed var(--el-color-success);
      outline-offset: -1px;
    }
  }

  .group-block--sortable .group-head {
    cursor: grab;
  }

  .group-block--sortable.sortable-chosen .group-head {
    cursor: grabbing;
  }

  .row-actions {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 28px repeat(3, 1em);
    gap: 8px;
    align-items: center;
    justify-items: center;
  }

  .folder-actions {
    margin-left: auto;
    opacity: 0;
  }

  .conn-list {
    padding: 0 0 4px 28px;

    &--collapsed {
      padding-bottom: 2px;

      .conn-row {
        display: none;
      }
    }
  }

  .conn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 4px;

    &:hover {
      background: var(--el-fill-color-light);
    }

    &.sortable-chosen {
      background: var(--el-fill-color-light);

      .conn-host {
        cursor: grabbing;
      }
    }
  }

  .conn-name {
    flex: 1;
    min-width: 0;
    cursor: pointer;

    :deep(.icon-main) {
      overflow: hidden;
    }
  }

  .conn-host {
    flex-shrink: 0;
    min-width: 0;
    margin-left: auto;
    margin-right: 12px;
    max-width: 45%;
    color: var(--el-color-info);
    user-select: none;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }

    > span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.el-icon) {
      flex-shrink: 0;
      color: var(--el-text-color-placeholder);
    }
  }

  .conn-actions {
    opacity: 0.7;
  }

  .group-head:hover .folder-actions {
    opacity: 1;
  }

  :deep(.sortable-ghost) {
    background-color: var(--el-color-primary-light-8);
  }
}
</style>
