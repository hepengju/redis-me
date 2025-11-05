<script setup>
import {useDark, usePreferredDark, useStorage} from '@vueuse/core'
import {ref} from 'vue'
import {getVersion} from '@tauri-apps/api/app'

// 主题
const theme = ref('system')
const themeList = [
  {value: 'system', label: '跟随系统'},
  {value: 'light', label: '浅色主题'},
  {value: 'dark', label: '深色主题'}
]

// 主题初始化值
const isPreferredDark = usePreferredDark()
const isDark = useDark()
if (isPreferredDark.value) { // 如果为true，表示浏览器设置为dark模式，采用系统设置即可
  theme.value = 'system'
} else { // 否则只有手动设置过dark才会是dark
  theme.value = isDark.value ? 'dark' : 'light'
}

// 切换主题
function changeTheme(theme) {
  if (theme === 'system') {
    isDark.value = isPreferredDark.value
  } else {
    isDark.value = theme === 'dark'
  }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// 语言
const language = ref('zh-CN')
const languageList = [
  {value: 'en', label: 'English'},
  {value: 'zh-CN', label: '简体中文'},
  {value: 'zh-TW', label: '繁体中文'}
]

// 切换语言
function changeLanguage() {
  // TODO i18n 多语言支持
}

// 应用程序版本
const appVersion = ref('')
getVersion().then(res => appVersion.value = res).catch(_ => {})
</script>

<template>
  <el-card header="外观" header-class="me-card">
    <el-form inline label-position="left">
      <el-form-item label="主题">
        <el-select v-model="theme" style="width: 120px" @change="changeTheme">
          <el-option v-for="item in themeList" :label="item.label" :value="item.value" :key="item.value"/>
        </el-select>
      </el-form-item>
      <el-form-item label="语言">
        <el-select v-model="language" style="width: 120px" @change="changeLanguage">
          <el-option v-for="item in languageList" :label="item.label" :value="item.value" :key="item.value"/>
        </el-select>
      </el-form-item>
    </el-form>
  </el-card>
  <el-card :header="'版本: v' + appVersion" header-class="me-card" style="margin-top: 10px">
    <el-link underline="always" class="me-link">快捷键</el-link>
    <el-link underline="always" class="me-link">清除缓存</el-link>
    <el-link underline="always" class="me-link">检查更新</el-link>
    <el-link underline="always" class="me-link">手动下载</el-link>
    <el-link underline="always" class="me-link" href="https://gitee.com/hepengju/redis-app" target="_blank">项目主页
    </el-link>
  </el-card>
</template>

<style scoped lang="scss">
:deep(.me-card) {
  font-weight: bold;
}

.me-link {
  margin-left: 10px;
}
</style>