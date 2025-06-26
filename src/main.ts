import {createApp} from 'vue'
import App from './App.vue'
import SvgIcon from '~virtual/svg-component'
import './styles/index.scss'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIcons from '@element-plus/icons-vue'

const app = createApp(App)
app.component(SvgIcon.name, SvgIcon)
for (const [key, component] of Object.entries(ElementPlusIcons)) {
    app.component(`ElIcon${key}`, component)
}
app.mount('#app')
