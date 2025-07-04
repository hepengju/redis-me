import {createApp} from 'vue'
import App from './App.vue'
import './styles/index.scss'

import setupElementPlus from '@/plugins/element-plus.js'
import setupSvgIcon from '@/plugins/icon.js'
import setupMeComponent from '@/plugins/me.js'
import setupBus from '@/plugins/mitt.js'
import setupPinia from '@/plugins/pinia.js'

const app = createApp(App)
setupElementPlus(app)
setupSvgIcon(app)
setupMeComponent(app)
setupBus(app)
setupPinia(app)
app.mount('#app')
