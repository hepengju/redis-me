import * as ElementPlusIcons from '@element-plus/icons-vue'
import ElementPlus, { ElTag } from 'element-plus'
import en from 'element-plus/es/locale/lang/en'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'dayjs/locale/en'
import 'dayjs/locale/zh-cn'
import zhCN from 'element-plus/es/locale/lang/zh-cn'
import type { App } from 'vue'

export default function setupElementPlus(app: App): void {
  // EP 的 tag 默认带进出场动画，挂载/内容切换会淡入淡出一帧（连接进入的类型 tag、信息页 tag 等闪烁）；
  // 注册前统一把默认值改为无动画，调用处不必逐个加 disable-transitions；
  // EP 内部直接引用 ElTag 的地方（多选 tag 等）同样遵循该默认值
  const tagProps = ElTag.props as unknown as Record<string, unknown>
  tagProps.disableTransitions = { type: Boolean, default: true }

  window.ElementPlusLanguageMap = { zhCN, en }
  app.use(ElementPlus)
  for (const [key, component] of Object.entries(ElementPlusIcons)) {
    app.component(`ElIcon${key}`, component)
  }
}
