import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import UnpluginSvgComponent from 'unplugin-svg-component/vite'
import path from 'path'

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
