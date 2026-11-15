<script setup lang="ts">
// #region 导入
// Linux 无边框窗口没有系统边缘缩放，用透明手柄 + startResizeDragging 补上。
// Windows / macOS 本就可用系统边缘，此处不渲染，避免干扰。
import { getCurrentWindow } from '@tauri-apps/api/window'
import { type as getOsType } from '@tauri-apps/plugin-os'
import { onMounted, onUnmounted, ref } from 'vue'
// #endregion

// #region 核心状态
type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West'

const enabled = getOsType() === 'linux'
const appWindow = getCurrentWindow()
const showHandles = ref(false)

const dirs: { dir: ResizeDirection; cls: string }[] = [
  { dir: 'North', cls: 'n' },
  { dir: 'South', cls: 's' },
  { dir: 'East', cls: 'e' },
  { dir: 'West', cls: 'w' },
  { dir: 'NorthEast', cls: 'ne' },
  { dir: 'NorthWest', cls: 'nw' },
  { dir: 'SouthEast', cls: 'se' },
  { dir: 'SouthWest', cls: 'sw' },
]
// #endregion

// #region 面板操作
async function refreshVisibility() {
  if (!enabled) return
  showHandles.value = !(await appWindow.isMaximized()) && !(await appWindow.isFullscreen())
}

function onResizeStart(dir: ResizeDirection) {
  void appWindow.startResizeDragging(dir)
}

let unlisten: (() => void) | undefined

onMounted(async () => {
  if (!enabled) return
  await refreshVisibility()
  unlisten = await appWindow.onResized(refreshVisibility)
})

onUnmounted(() => {
  unlisten?.()
})
// #endregion
</script>

<template>
  <template v-if="enabled && showHandles">
    <div
      v-for="item in dirs"
      :key="item.dir"
      class="win-resize"
      :class="`win-resize--${item.cls}`"
      @mousedown.prevent="onResizeStart(item.dir)" />
  </template>
</template>

<style scoped lang="scss">
.win-resize {
  position: fixed;
  z-index: 10000;
  user-select: none;

  &--n {
    top: 0;
    left: 10px;
    right: 10px;
    height: 6px;
    cursor: n-resize;
  }

  &--s {
    bottom: 0;
    left: 10px;
    right: 10px;
    height: 6px;
    cursor: s-resize;
  }

  &--e {
    right: 0;
    top: 10px;
    bottom: 10px;
    width: 6px;
    cursor: e-resize;
  }

  &--w {
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 6px;
    cursor: w-resize;
  }

  &--nw {
    top: 0;
    left: 0;
    width: 10px;
    height: 10px;
    cursor: nw-resize;
  }

  &--ne {
    top: 0;
    right: 0;
    width: 10px;
    height: 10px;
    cursor: ne-resize;
  }

  &--sw {
    bottom: 0;
    left: 0;
    width: 10px;
    height: 10px;
    cursor: sw-resize;
  }

  &--se {
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    cursor: se-resize;
  }
}
</style>
