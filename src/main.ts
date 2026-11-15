// php-serialize（PhpSerial 只读解析）decode 路径依赖 Node Buffer；Tauri webview 无此全局，需先挂 polyfill
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import { createApp } from 'vue'

import setupElementPlus from '@/plugins/element-plus'
import setupI18n from '@/plugins/i18n'
import setupSvgIcon from '@/plugins/icon'
import setupMe from '@/plugins/me'
import setupTauri from '@/plugins/tauri'
import setupTerminal from '@/plugins/terminal'

import App from './App.vue'

const app = createApp(App)

setupElementPlus(app)
setupSvgIcon(app)
setupMe(app)
setupTauri(app)
setupI18n(app)
setupTerminal(app)

app.mount('#app')
