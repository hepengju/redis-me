<script setup>
import {ref} from 'vue'
import {getVersion} from '@tauri-apps/api/app'

const appVersion = ref('')
getVersion().then(res => appVersion.value = res).catch(_ => {})
</script>

<template>
  <div class="app-info">
    <me-icon icon="me-icon-redis-me" class="app-icon"/>
    <div class="app-name">RedisME</div>
    <div class="app-version">v{{appVersion}}</div>
    <div class="app-site">
      <el-link href="https://gitee.com/hepengju/redis-me" target="_blank">源码地址</el-link>
      <div class="sep"></div>
      <el-link href="https://gitee.com/hepengju/redis-me" target="_blank">官方网站</el-link>
    </div>
    <div class="app-copyright">
      Copyright © 2025 hepengju.com All Rights Reserved.
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-info {
  margin: 0 auto;
  height: 220px;
  text-align: center;

  .app-icon {
    justify-content: center;
    font-size: 70px;
    margin-top: 10px
  }

  .app-name {
    font-size: 20px;
    font-weight: bold;
    margin-top: 30px;
  }

  .app-version {
    margin-top: 20px;
    font-size: 16px;
  }

  .app-site {
    margin: 10px;
    display: flex;
    justify-content: center;

    .sep {
      margin: 0 10px;
      border: 0.5px solid var(--el-color-info);
    }
  }

  .app-copyright {
    font-size: 12px;
    color: var(--el-color-info);
  }
}
</style>