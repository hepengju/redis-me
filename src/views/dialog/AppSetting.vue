<script setup lang="ts">
import store from '@/utils/store.ts'

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

function confirm() {
  // 保存各种信息
  store.dialog.setting = false
}
</script>

<template>
  <el-dialog title="基础设置" v-model="store.dialog.setting" align-center>
    <el-card header="外观" header-class="me-card">
      <el-form inline label-position="left">
        <el-form-item label="主题">
          <el-select v-model="store.setting.theme" style="width: 120px">
            <el-option v-for="item in themeList" :label="item.label" :value="item.value" :key="item.value"/>
          </el-select>
        </el-form-item>
        <el-form-item label="语言">
          <el-select v-model="store.setting.language" style="width: 120px">
            <el-option v-for="item in languageList" :label="item.label" :value="item.value" :key="item.value"/>
          </el-select>
        </el-form-item>
        <el-form-item label="缩放">
          <el-input-number v-model="store.setting.zoomFactor" :min=0.5 :max=2 :step=0.1 :precision=1 style="width: 120px"/>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card header="通用" header-class="me-card" style="margin-top: 10px">
      <el-form>
        <el-form-item label="加载数量">
          <el-input-number v-model="store.setting.scanCount" :min=500 :max=2000 :step="100"/>
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
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="store.dialog.setting = false">取消</el-button>
        <el-button type="primary" @click="confirm">确定</el-button>
      </div>
    </template>
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