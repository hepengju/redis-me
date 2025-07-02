<script setup lang="ts">
import store from '@/utils/store.ts'
import {useDark, usePreferredDark, useStorage} from '@vueuse/core'

// 主题
const themeList = [
  {value: 'system', label: '跟随系统'},
  {value: 'light', label: '浅色主题'},
  {value: 'dark', label: '深色主题'},
]

const languageList = [
  {value: 'en', label: 'English'},
  {value: 'cn', label: '简体中文'},
  {value: 'tw', label: '繁体中文'},
]

/**
 * 切换主题
 */
const isPreferredDark = usePreferredDark()
const isDark = useDark()
// const factor = useZoomFactor()
const zoomFactor = useStorage('zoomFactor', 1)

// 主题初始化值
if (isPreferredDark.value) {
  store.setting.theme = 'system'
} else {
  store.setting.theme = isDark.value ? 'dark' : 'light'
}

store.setting.zoomFactor = zoomFactor.value
document.body.style.zoom = zoomFactor.value

// 切换主题
function changeTheme(theme: string) {
  if (theme === 'system') {
    isDark.value = isPreferredDark.value
  } else {
    isDark.value = theme === 'dark'
  }
}

// 切换语言
function changeLanguage() {
  // TODO i18n 多语言支持
}

// 切换缩放因子
function changeZoomFactor(value: number) {
  // chrome ok, firefox效果不是很好
  document.body.style.zoom = value + '';
  zoomFactor.value = value
}

</script>

<template>
  <el-dialog title="基础设置" v-model="store.dialog.setting" width="650">
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
          <el-input-number v-model="store.setting.zoomFactor" @change="changeZoomFactor"
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
      <el-link underline="always" class="me-link" href="https://gitee.com/hepengju/redis-app" target="_blank">项目主页</el-link>
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