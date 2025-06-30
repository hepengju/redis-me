<script setup lang="ts">
import store from '@/utils/store.ts'
import { useDark, usePreferredDark } from '@vueuse/core'
// 主题
const themeList = [
  {value: 'system', label: '跟随系统'},
  {value: 'light', label: '浅色主题'},
  {value: 'dark', label: '深色主题'},
]

const languageList = [
  {value: 'cn', label: '简体中文'},
  {value: 'tw', label: '繁体中文'},
  {value: 'en', label: 'English'},
]

/**
 * 切换主题
 */
const isPreferredDark = usePreferredDark()
const isDark = useDark()
function changeTheme(theme: string) {
  if (theme === 'system') {
    isDark.value = isPreferredDark.value
  } else if (theme === 'light') {
    isDark.value = false
  } else if (theme === 'dark') {
    isDark.value = true
  }
}

/**
 * 切换语言
 */
function changeLanguage() {
  // TODO i18n 多语言支持
}

</script>

<template>
  <el-dialog title="基础设置" v-model="store.dialog.setting" align-center width="666">
    <el-card header="外观" header-class="me-card">
      <el-form inline label-position="left">
        <el-form-item label="主题">
          <el-select v-model="store.setting.theme" style="width: 120px" @change="changeTheme">
            <el-option v-for="item in themeList" :label="item.label" :value="item.value" :key="item.value"/>
          </el-select>
        </el-form-item>
        <el-form-item label="语言">
          <el-select v-model="store.setting.language" style="width: 120px" @change="changeLanguage">
            <el-option v-for="item in languageList" :label="item.label" :value="item.value" :key="item.value"/>
          </el-select>
        </el-form-item>
        <el-form-item label="缩放">
          <el-input-number v-model="store.setting.zoomFactor"
                           :min="0.5" :max="2" :step="0.1" :precision="1" style="width: 120px"/>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card header="通用" header-class="me-card" style="margin-top: 10px">
      <el-form>
        <el-form-item label="加载数量">
          <el-input-number v-model="store.setting.scanCount" :min="500" :max="2000" :step="100"/>
          <template #label>
            <me-icon name="加载数量" icon="el-icon-question-filled"
                     tooltipContent="每次扫描加载的key数量，设置过大可能会影响性能" placement="top-start"/>
          </template>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card header="当前版本" header-class="me-card" style="margin-top: 10px">
      <el-link underline="always" class="me-link">快捷键</el-link>
      <el-link underline="always" class="me-link">清除缓存</el-link>
      <el-link underline="always" class="me-link">检查更新</el-link>
      <el-link underline="always" class="me-link">手动下载</el-link>
      <el-link underline="always" class="me-link">项目主页</el-link>
    </el-card>
    <!-- 目前看下来似乎不需要底部按钮
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="store.dialog.setting = false">取消</el-button>
        <el-button type="primary" @click="confirm">确定</el-button>
      </div>
    </template>
    -->
  </el-dialog>
</template>

<style scoped lang="scss">
:deep(.me-card) {
  font-weight: bold;
}

.me-link {
  margin-left: 10px;
}
</style>