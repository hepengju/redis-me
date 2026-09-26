import { defineAdditionalConfig } from 'vitepress'

export default defineAdditionalConfig({
  lang: 'zh-Hans',
  description: 'RedisME 官方站点',
  themeConfig: {
    nav: nav(),
    sidebar: {
      '/zh/guide/': { base: '/zh/guide/', items: sidebarGuide() },
      '/zh/handbook/': { base: '/zh/handbook/', items: sidebarHandbook() },
      '/zh/changelog/': { base: '/zh/changelog/', items: sidebarChangelog() },
    },
    footer: {
      message: `友情链接
             <a href="https://redisee.com" target="_blank">Redisee</a> | 
             <a href="https://redis.tinycraft.cc" target="_blank">Tiny RDM</a> | 
             <a href="https://goanother.com/cn" target="_blank">Another RDM</a> | 
             <a href="https://github.com/redis/RedisInsight" target="_blank">Redis Insight</a>
             <br/><br/>
             基于GPL-3.0开源许可协议`,
      copyright: 'Copyright © 2025-present All Rights Reserved. 沪ICP备2026000918号',
    },

    //#region 以下直接从官网复制: https://github.com/vuejs/vitepress/blob/main/docs/zh/config.ts
    docFooter: { prev: '上一页', next: '下一页' },
    outline: { label: '页面导航' },
    lastUpdated: { text: '最后更新于' },
    notFound: {
      title: '页面未找到',
      quote: '但如果你不改变方向，并且继续寻找，你可能最终会到达你所前往的地方。',
      linkLabel: '前往首页',
      linkText: '带我回首页',
    },
    langMenuLabel: '多语言',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    skipToContentLabel: '跳转到内容',
    //#endregion
  },
})

function nav() {
  return [
    { text: '主页', link: '/zh/' },
    { text: '使用指南', link: '/zh/guide/intro/about', activeMatch: '/zh/guide/' },
    { text: '实战手册', link: '/zh/handbook/intro', activeMatch: '/zh/handbook/' },
    { text: '更新日志', link: '/zh/changelog/latest', activeMatch: '/zh/changelog/' },
  ]
}

function sidebarGuide() {
  return [
    {
      text: '简介',
      items: [
        { text: '关于', link: '/intro/about' },
        { text: '安装帮助', link: '/intro/install' },
        { text: '软件截图', link: '/intro/screenshots' },
      ],
    },
    {
      text: '使用手册',
      items: [
        { text: '特色功能', link: '/usage/special' },
        // {text: '应用设置', link: '/usage/setting'},
        { text: '连接', link: '/usage/connection' },
        { text: '信息', link: '/usage/info' },
        // {text: '客户端', link: '/usage/client'},
        // {text: '配置', link: '/usage/config'},
        { text: '键值', link: '/usage/value' },
        { text: '自定义编解码', link: '/usage/codec' },
        { text: '终端', link: '/usage/terminal' },
        { text: '内存分析', link: '/usage/memory' },
        { text: '慢日志', link: '/usage/slowlog' },
        { text: '命令监控', link: '/usage/monitor' },
        { text: '发布订阅', link: '/usage/pubsub' },
        { text: '图表', link: '/usage/chart' },
      ],
    },
    {
      text: '其他',
      items: [
        { text: 'Redis Docker 安装', link: '/other/redis-install' },
        { text: 'TLS 证书', link: '/other/tls-cert' },
        { text: '客户端对比', link: '/other/compare' },
        { text: '隐私政策', link: '/other/privacy' },
      ],
    },
  ]
}

function sidebarHandbook() {
  return [
    { text: '概览', items: [{ text: '简介', link: '/intro' }] },
    { text: '实战文章', items: [{ text: '慢日志专项治理', link: '/slowlog-governance' }] },
  ]
}

function sidebarChangelog() {
  return [
    {
      text: '更新日志',
      items: [
        { text: 'latest', link: 'latest' },
        { text: '4.x', link: '4.x' },
        { text: '3.x', link: '3.x' },
        { text: '2.x', link: '2.x' },
        { text: '1.x', link: '1.x' },
        { text: '0.x', link: '0.x' },
      ],
    },
  ]
}
