<script setup lang="ts">
// #region 导入
// 快捷键列表展示
import { type as getOsType } from '@tauri-apps/plugin-os'

import {
  displayShortcutKey,
  shortcutItemKeys,
  shortcutKbdClass,
  type ShortcutItem,
} from '@/utils/shortcut'
// #endregion

// #region 核心状态
const props = withDefaults(
  defineProps<{
    items: ShortcutItem[]
    /** 行可点击（如 ConnEmpty 触发 action） */
    clickable?: boolean
    width?: string
    /** 多列并排时紧凑布局，缩小标签与按键间距 */
    compact?: boolean
  }>(),
  { clickable: false, width: 'min(400px, 100%)', compact: false },
)
// #endregion

// #region 面板操作
const emit = defineEmits<{ action: [id: string] }>()

const isMacOS = getOsType() === 'macos'

function onRowClick(item: ShortcutItem): void {
  if (props.clickable && item.id) emit('action', item.id)
}

function rowKeys(item: ShortcutItem) {
  return shortcutItemKeys(item, isMacOS)
}
// #endregion
</script>

<template>
  <ul
    class="shortcut-list"
    :class="{ compact: props.compact }"
    :style="props.compact ? undefined : { width: props.width }">
    <li
      v-for="item in items"
      :key="item.id ?? item.label"
      :class="{ 'gap-before': item.gapBefore }">
      <button v-if="clickable" type="button" class="shortcut-row" @click="onRowClick(item)">
        <span class="shortcut-label">{{ item.label }}</span>
        <span class="shortcut-keys" aria-hidden="true">
          <template v-for="(key, i) in rowKeys(item)" :key="i">
            <kbd :class="shortcutKbdClass(key, i, rowKeys(item).length)">{{
              displayShortcutKey(key, isMacOS)
            }}</kbd>
            <span v-if="i < rowKeys(item).length - 1" class="shortcut-plus">+</span>
          </template>
        </span>
      </button>
      <div v-else class="shortcut-row">
        <span class="shortcut-label">{{ item.label }}</span>
        <span class="shortcut-keys" aria-hidden="true">
          <template v-for="(key, i) in rowKeys(item)" :key="i">
            <kbd :class="shortcutKbdClass(key, i, rowKeys(item).length)">{{
              displayShortcutKey(key, isMacOS)
            }}</kbd>
            <span v-if="i < rowKeys(item).length - 1" class="shortcut-plus">+</span>
          </template>
        </span>
      </div>
    </li>
  </ul>
</template>

<style lang="scss">
/* MeShortcut 弹框：无标题时隐藏空 header；间距由 .el-dialog 统一 padding 控制，与底部一致 */
.el-dialog__header.me-shortcut-dialog__header {
  display: none;
}
</style>

<style scoped lang="scss">
.shortcut-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;

  li.gap-before {
    margin-top: 10px;
  }

  &.compact {
    width: max-content;
    max-width: 100%;

    li.gap-before {
      margin-top: 8px;
    }

    .shortcut-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      width: 100%;
      padding: 4px 0;
      font-size: 13px;
    }

    .shortcut-label {
      flex: unset;
      min-width: 0;
    }

    .shortcut-keys {
      flex: unset;
      justify-self: end;
    }
  }
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--el-text-color-primary);
  text-align: left;
}

button.shortcut-row {
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--el-fill-color-light) 55%, transparent);
    color: var(--el-text-color-primary);
  }
}

.shortcut-label {
  flex: 1;
  min-width: 0;
}

.shortcut-keys {
  flex: 0 0 168px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-size: 14px;
}

.shortcut-plus {
  flex-shrink: 0;
  width: 10px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

kbd {
  flex-shrink: 0;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color);
  border-radius: 5px;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  text-align: center;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--el-border-color) 80%, transparent);
}

kbd.kbd-mod {
  padding: 3px 7px;
  min-width: 28px;
}

kbd.kbd-optional {
  opacity: 0.6;
}

kbd.kbd-last {
  width: 28px;
  padding: 3px 0;
}
</style>
