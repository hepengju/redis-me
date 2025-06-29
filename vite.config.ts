import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'

// SVG图标
import UnpluginSvgComponent from 'unplugin-svg-component/vite'

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'

// 配置绝对路径别名@
import path from 'path'

// ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    // 打包为utools插件需配置
    base: './',

    resolve: {
        alias: {
            // 配置绝对路径别名@
            '@': path.resolve(__dirname, 'src'),
            'art-template': 'art-template/lib/template-web.js',
        },
    },

    plugins: [
        vue(),

        AutoImport({
            imports: ['vue'], // 自动导入 Vue 相关函数，如：ref, reactive, toRef 等
            resolvers: [ElementPlusResolver()],
        }),

        Components({
            resolvers: [ElementPlusResolver()],
        }),
        // 解决IconsResolver无法动态引入图标的问题
        // https://github.com/Jevon617/unplugin-svg-component
        UnpluginSvgComponent({
            iconDir: ['src/assets/'],
            preserveColor: '',
            treeShaking: false,
            prefix: 'me-icon'
        }),
    ],


    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: 'ws',
                host,
                port: 1421,
            }
            : undefined,
        watch: {
            // 3. tell vite to ignore watching `src-tauri`
            ignored: ['**/src-tauri/**'],
        },
    },
}))
