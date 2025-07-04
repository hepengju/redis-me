<script>
export default {
  data() {
    return {
      themeList: [
        {value: 'system', label: '跟随系统'},
        {value: 'light', label: '浅色主题'},
        {value: 'dark', label: '深色主题'},
      ],
      languageList: [
        {value: 'en', label: 'English'},
        {value: 'zh-cn', label: '简体中文'},
        {value: 'zh-tw', label: '繁体中文'},
      ],

      visible: false,
      theme: 'system',
      language: 'zh-cn',
      zoomFactor: 1.0,

      scanCount: 1000,
      hscanCount: 100,
    }
  },
  methods: {
    open() {
      this.visible = true
    },
    changeTheme(theme) {
      // TODO
    },
    changeLanguage(language) {
      // TODO
    },
    changeZoomFactor() {

    }
  }

}
</script>
<template>
  <el-dialog title="基础设置" v-model="visible" width="650" @closed="$emit('closed')">
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
        <el-form-item label="缩放">
          <el-input-number v-model="zoomFactor" @change="changeZoomFactor"
                           :min="0.5" :max="2" :step="0.1" :precision="1" style="width: 120px"/>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card header="通用" header-class="me-card" style="margin-top: 10px">
      <el-form>
        <el-form-item label="加载数量">
          <el-input-number v-model="scanCount" :min="500" :max="2000" :step="100"/>
          <template #label>
            <me-icon name="加载数量" icon="el-icon-question-filled"
                     info="每次扫描加载的key数量，设置过大可能会影响性能" placement="top-start"/>
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
        <el-button @click="dialog.setting = false">取消</el-button>
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