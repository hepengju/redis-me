<script setup lang="ts">
// #region 导入
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import logoGlowUrl from '@/assets/images/logo-glow.png'
import { isDark, meOpenUrl } from '@/utils/util'
import RedisInstall from '@/views/ext/RedisInstall.vue'
// #endregion

// #region 核心状态
const { t } = useI18n()
const showRedisInstall = ref(false)
// #endregion

// #region 面板操作
function handleLogoClick(): void {
  meOpenUrl('https://www.hepengju.com')
}

function handleGithubClick(): void {
  meOpenUrl('https://github.com/hepengju/redis-me')
}

function handleBugClick(): void {
  meOpenUrl('https://github.com/hepengju/redis-me/issues')
}

function handleRedisInstallClick(): void {
  showRedisInstall.value = true
}
// #endregion
</script>

<template>
  <div class="key-empty">
    <div class="logo-wrap" @click="handleLogoClick">
      <!-- 预烘焙光晕（含 blur），避开 Mac WKWebView 对 filter:blur 偶发露方框。暗色不用这张图 -->
      <img
        v-if="!isDark"
        class="logo-glow"
        :src="logoGlowUrl"
        alt=""
        aria-hidden="true"
        draggable="false" />
      <SvgIcon class="logo-icon" name="me-icon-logo-color" />
    </div>
    <div class="tagline">{{ t('keyEmpty.tagline') }}</div>

    <div class="footer-links">
      <me-icon icon="me-icon-github" name="Github" @click="handleGithubClick" />
      <me-icon icon="me-icon-bug" name="Issues" @click="handleBugClick" />
      <me-icon icon="me-icon-redis" name="Install" @click="handleRedisInstallClick" />
    </div>

    <RedisInstall v-if="showRedisInstall" @update:model-value="showRedisInstall = false" />
  </div>
</template>

<style scoped lang="scss">
.key-empty {
  flex: 1;
  /* 预烘焙光晕为真实大图，会超出 logo 盒；CSS filter 不占布局溢出，需裁切以免横向滚动条 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;

  .logo-wrap {
    cursor: pointer;
    margin-top: 20vh;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100px;
    height: 100px;
  }

  .logo-glow {
    position: absolute;
    z-index: 0;
    /* Chrome 按原 CSS 截出的 500×500 画布（含 blur 外扩）；opacity 已烘焙进图 */
    width: 500px;
    height: 500px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    -webkit-user-drag: none;
    user-select: none;
  }

  .logo-icon {
    position: relative;
    z-index: 1;
    font-size: 100px;
    opacity: 0.5;
    filter: drop-shadow(-2px 4px 8px rgba(0, 0, 0, 0.2));

    &:hover {
      opacity: 0.8;
    }
  }

  .tagline {
    margin-top: 40px;
    max-width: min(360px, 90%);
    min-height: 3em;
    line-height: 1.5;
    text-align: center;
    font-size: 16px;
    font-weight: bold;
    opacity: 0.5;
    background: -webkit-linear-gradient(120deg, #c7ba4e 30%, #bd34fe);
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .footer-links {
    margin-top: 20vh;
    display: flex;
    justify-content: center;
    gap: 20px;

    font-size: 16px;
    font-weight: bold;
    color: var(--el-color-info);
    opacity: 0.6;

    :deep(.icon-main) {
      cursor: pointer;

      &:hover {
        color: var(--el-color-success);
        opacity: 0.8;
      }
    }
  }
}
</style>
