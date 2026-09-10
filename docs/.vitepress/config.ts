import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitepress'

import { createLangRedirectScript } from './theme/lang-redirect'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

/** 子路径部署时改为 `/仓库名/`（建议以 / 结尾），与 Vite `base` 一致 */
const siteBase: string = '/'

const viteBase = siteBase === '/' ? '/' : siteBase.endsWith('/') ? siteBase : `${siteBase}/`

function siteAsset(path: string) {
  const p = path.replace(/^\//, '')
  if (viteBase === '/') return `/${p}`
  const b = viteBase.replace(/\/$/, '')
  return `${b}/${p}`
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: viteBase,
  title: 'RedisME',
  description: 'RedisME Official Website',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: siteAsset('images/logo.svg') }],
    ['link', { rel: 'icon', type: 'image/png', href: siteAsset('images/logo.png') }],
    // 根路径：中文浏览器或已选中文 → /zh/（见 theme/lang-redirect.ts）
    ['script', { type: 'text/javascript' }, createLangRedirectScript(viteBase)],
  ],
  themeConfig: {
    logo: siteAsset('images/logo.svg'),
    socialLinks: [
      { icon: 'github', link: 'https://github.com/hepengju/redis-me' },
      { icon: 'gitee', link: 'https://gitee.com/hepengju/redis-me' },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
              },
            },
          },
        },
      },
    },
  },

  // 多语言设置, 其中英文为默认语言（重写路径）
  locales: {
    root: { label: 'English', lang: 'en-US' },
    zh: { label: '简体中文', lang: 'zh-Hans' }, // zh-Hans 简体中文
  },
  rewrites: { 'en/:rest*': ':rest*' },

  // 显示最后更新时间
  lastUpdated: false,
  // srcExclude: ['latest.json', '/zz/**'],

  // Windows（Hyper-V/WSL 等）常保留 5172–5271，Vite 默认 5173 会 EACCES
  // fs.allow：文档页会 import 仓库 src/utils/redis-install-gen.ts
  vite: {
    server: { port: 33333, host: '127.0.0.1', fs: { allow: [repoRoot] } },
    preview: { port: 3333, host: '127.0.0.1' },
  },
})
