import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import UnpluginSvgComponent from 'unplugin-svg-component/vite'
import AutoImport from 'unplugin-auto-import/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    resolve: {
        alias: {
            // 配置绝对路径别名@
            '@': path.resolve(__dirname, 'src')
        },
    },

    plugins: [
        vue(),

        AutoImport({
            imports: ['vue'], // 自动导入 Vue 相关函数，如：ref, reactive, toRef 等
        }),

        // SVG图标: 解决IconsResolver无法动态引入图标的问题
        // https://github.com/Jevon617/unplugin-svg-component
        UnpluginSvgComponent({
            iconDir: ['src/assets/'],
            preserveColor: '',
            treeShaking: false,
            prefix: 'me-icon'
        }),
    ],
}))
