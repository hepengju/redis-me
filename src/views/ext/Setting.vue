<script setup>
import {useDark, usePreferredDark, useStorage} from '@vueuse/core'
import {ref} from 'vue'
import {getVersion} from '@tauri-apps/api/app'
import {meOk} from '@/utils/util.js'

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
  meOk('TODO 多语言支持')
}

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
        <el-select v-model="language" style="width: 120px" @change="changeLanguage" disabled>
          <el-option v-for="item in languageList" :label="item.label" :value="item.value" :key="item.value"/>
        </el-select>
      </el-form-item>
    </el-form>
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