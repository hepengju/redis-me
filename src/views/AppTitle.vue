<script setup>
import { Window } from '@tauri-apps/api/window';
import {useDark, useToggle} from "@vueuse/core";
const appWindow = new Window('main');

const isDark = useDark()
const toggleDark = useToggle(isDark)
</script>

<template>
  <div data-tauri-drag-region class="title-bar me-flex">
    <div class="me-flex" style="align-items: end">
      <me-icon icon="me-icon-redis-me" class="icon-btn" style="margin-left: 5px; font-size: 16px;" @click="toggleDark()"/>
      <div style="margin-left: 5px;font-size: 12px">RedisME</div>
    </div>
    <div style="font-size: 12px;">
      <me-icon icon="me-icon-window-minimize" class="title-button normal-btn" @click="appWindow.minimize()"/>
      <me-icon icon="me-icon-window-maximize" class="title-button normal-btn" @click="appWindow.toggleMaximize()" v-show="appWindow.isMaximized()"/>
      <me-icon icon="me-icon-window-restore"  class="title-button normal-btn" @click="appWindow.toggleMaximize()" v-show="!appWindow.isMaximized()"/>
      <me-icon icon="me-icon-window-close"    class="title-button danger-btn" @click="appWindow.close()"/>
    </div>
  </div>
</template>

<style scoped lang="scss">
.title-bar {
  height: 20px;
  user-select: none;

  .title-button {
    width: 40px;
    height: 30px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    user-select: none;
    -webkit-user-select: none;
  }

  .normal-btn:hover {
    background: var(--el-color-info-light-7);
  }
  .danger-btn:hover {
    background: var(--el-color-danger);
  }
}
</style>