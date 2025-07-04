import {createApp} from 'vue'
import App from './App.vue'

import setupElementPlus from '@/plugins/element-plus.js'
import setupSvgIcon from '@/plugins/icon.js'
import setupMe from '@/plugins/me.js'
import setupBus from '@/plugins/mitt.js'
import setupPinia from '@/plugins/pinia.js'

const app = createApp(App)
setupElementPlus(app)
setupSvgIcon(app)
setupBus(app)
setupPinia(app)
setupMe(app)
app.mount('#app')
