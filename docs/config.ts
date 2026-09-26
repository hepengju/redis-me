import { defineAdditionalConfig } from 'vitepress'

export default defineAdditionalConfig({
  lang: 'en-US',
  description: 'RedisME Official Website',
  themeConfig: {
    nav: nav(),
    sidebar: {
      '/guide/': { base: '/guide/', items: sidebarGuide() },
      '/handbook/': { base: '/handbook/', items: sidebarHandbook() },
      '/changelog/': { base: '/changelog/', items: sidebarChangelog() },
    },
    footer: {
      message: `Links: 
             <a href="https://redisee.com" target="_blank">Redisee</a> | 
             <a href="https://redis.tinycraft.cc" target="_blank">Tiny RDM</a> | 
             <a href="https://goanother.com/cn" target="_blank">Another RDM</a> | 
             <a href="https://github.com/redis/RedisInsight" target="_blank">Redis Insight</a>
             <br/><br/>
             Released under the GPL-3.0 License`,
      copyright: 'Copyright © 2025-present All Rights Reserved. 沪ICP备2026000918号',
    },
  },
})

function nav() {
  return [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/guide/intro/about', activeMatch: '/guide/' },
    { text: 'Handbook', link: '/handbook/intro', activeMatch: '/handbook/' },
    { text: 'Changelog', link: '/changelog/latest', activeMatch: '/changelog/' },
  ]
}

function sidebarGuide() {
  return [
    {
      text: 'Introduction',
      items: [
        { text: 'About', link: '/intro/about' },
        { text: 'Installation', link: '/intro/install' },
        { text: 'Screenshots', link: '/intro/screenshots' },
      ],
    },
    {
      text: 'Usage and Configuration',
      items: [
        { text: 'Features', link: '/usage/special' },
        // {text: 'Setting', link: '/usage/setting'},
        { text: 'Connection', link: '/usage/connection' },
        { text: 'Info', link: '/usage/info' },
        // {text: 'Client', link: '/usage/client'},
        // {text: 'Config', link: '/usage/config'},
        { text: 'Value', link: '/usage/value' },
        { text: 'Custom Codec', link: '/usage/codec' },
        { text: 'Terminal', link: '/usage/terminal' },
        { text: 'Memory', link: '/usage/memory' },
        { text: 'SlowLog', link: '/usage/slowlog' },
        { text: 'Monitor', link: '/usage/monitor' },
        { text: 'Pub/Sub', link: '/usage/pubsub' },
        { text: 'Chart', link: '/usage/chart' },
      ],
    },
    {
      text: 'Other',
      items: [
        { text: 'Redis Docker Setup', link: '/other/redis-install' },
        { text: 'TLS Certificate', link: '/other/tls-cert' },
        { text: 'RDM Compare', link: '/other/compare' },
        { text: 'Privacy Policy', link: '/other/privacy' },
      ],
    },
  ]
}

function sidebarHandbook() {
  return [{ text: 'Overview', items: [{ text: 'Introduction', link: '/intro' }] }]
}

function sidebarChangelog() {
  return [
    {
      text: 'Changelog',
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
