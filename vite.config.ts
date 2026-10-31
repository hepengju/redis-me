// 配置不引入 @types/node；node:url 由运行时提供
// @ts-expect-error TS2591
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
// import AutoImport from 'unplugin-auto-import/vite'
import UnpluginSvgComponent from 'unplugin-svg-component/vite'
import { defineConfig } from 'vite-plus'

declare const process: { env: { TAURI_DEV_HOST?: string }; platform: string }

const host = process.env.TAURI_DEV_HOST

// 见 scripts/win-drive-letter.mjs。只加在 Vitest worker 上，不影响 tauri dev。
const winDriveHook = new URL('./scripts/win-drive-letter.mjs', import.meta.url).href
const testConfig =
  process.platform === 'win32' ? { test: { execArgv: ['--import', winDriveHook] } } : {}

// https://vitejs.dev/config/
export default defineConfig({
  staged: { '*': 'vp check --fix' },
  lint: {
    // 仅忽略 specta 生成文件；`src/types/me-interface.ts` 等参与检查
    ignorePatterns: ['src/types/tauri-specta.ts'],
    options: { typeAware: true, typeCheck: true },
  },

  // 这个选项目前验证只能在ts文件中才会生效，否则报错（应该是vp的bug）
  // 配置选项: https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html
  fmt: {
    // 仅忽略 specta 生成文件；其余 bindings / types 参与格式化
    ignorePatterns: ['src/types/tauri-specta.ts'],
    arrowParens: 'avoid', // 单参数箭头函数去掉括号
    bracketSameLine: true, // 把html的>放在同一行
    objectWrap: 'collapse', // 可以显示在一行的对象字面量不要换行
    semi: false, // 去掉分号
    singleQuote: true, // 使用单引号
    jsxSingleQuote: true, // jsx使用单引号
    sortImports: true,
  },

  resolve: {
    alias: {
      // 配置绝对路径别名@
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  plugins: [
    vue(),

    // AutoImport({
    //   imports: ['vue'], // 自动导入 Vue 相关函数，如：ref, reactive, toRef 等
    // }),

    // SVG图标: 解决IconsResolver无法动态引入图标的问题
    // https://github.com/Jevon617/unplugin-svg-component
    UnpluginSvgComponent({
      iconDir: ['src/assets/icons'],
      preserveColor: '',
      treeShaking: false,
      prefix: 'me-icon',
    }),
  ],

  build: {
    // 单位是 kB。桌面端本地加载，主包约 2700kB；默认 500 是网页分包阈值
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      checks: {
        // Vue 插件耗时占构建大部分，release 日志每次都会打 PLUGIN_TIMINGS
        bundlerTimings: false,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 22222,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 2221 } : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/dist/**', '**/src-tauri/**'],
    },
  },

  ...testConfig,
})
