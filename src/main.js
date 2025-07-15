import {createApp} from 'vue'
import App from './App.vue'

import setupElementPlus from '@/plugins/element-plus.js'
import setupSvgIcon from '@/plugins/icon.js'
import setupMe from '@/plugins/me.js'
import setupBus from '@/plugins/bus.js'
import setupPinia from '@/plugins/pinia.js'
import setupDirective from '@/plugins/directive.js'

const app = createApp(App)
setupElementPlus(app)
setupSvgIcon(app)
setupBus(app)
setupPinia(app)
setupMe(app)
setupDirective(app)
app.mount('#app')
