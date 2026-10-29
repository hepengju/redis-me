<script setup lang="ts">
// #region 导入
// 跳转到官网: Redis中英文/Valkey中英文；可选 command 拼具体命令文档路径
import { isZh, meOpenUrl } from '@/utils/util'
// #endregion

// #region 核心状态
// 与 `<me-website to="…">`、DOC_PATHS 键一致（供外部 props）
const DOC_PATHS = {
  info: { redis: '/docs/latest/commands/info/', valkey: '/commands/info/' },
  config: {
    redis: '/docs/latest/operate/oss_and_stack/management/config/',
    valkey: '/topics/valkey.conf/',
  },
  client: { redis: '/docs/latest/commands/client-list/', valkey: '/commands/client-list/' },
  command: { redis: '/docs/latest/commands/', valkey: '/commands/' },
  slowlog: { redis: '/docs/latest/commands/slowlog-get/', valkey: '/commands/slowlog-get/' },
  monitor: { redis: '/docs/latest/commands/monitor/', valkey: '/commands/monitor/' },
  pubsub: { redis: '/docs/latest/commands/psubscribe/', valkey: '/commands/psubscribe/' },
  // 键空间通知：开发指南页（非单命令）
  notify: {
    redis: '/docs/latest/develop/use/keyspace-notifications/',
    valkey: '/topics/notifications/',
  },
  acl: {
    redis: '/docs/latest/operate/oss_and_stack/management/security/acl/',
    valkey: '/topics/acl/',
  },
  // 中英文文档路径不同；Valkey 没有对应页面，下拉里不显示
  search: {
    redis: '/docs/latest/develop/ai/search-and-query/query/',
    redisZh: '/docs/latest/develop/interact/search-and-query/',
  },
  // Valkey 没有这条命令文档，下拉里不显示
  ftCreate: { redis: '/docs/latest/commands/ft.create/' },
  ftAlter: { redis: '/docs/latest/commands/ft.alter/' },
} as const

type DocTopic = keyof typeof DOC_PATHS

const props = withDefaults(
  defineProps<{
    to: DocTopic
    // 命令名（如 ACL CAT），拼到 to 对应路径后：acl-cat/
    command?: string
    // 有值时用 el-link 展示文案，否则用外链图标
    label?: string
    placement?: string
    marginLeft?: string
  }>(),
  // 默认贴合表格底栏图标簇；跟在文案后时再显式传 margin-left
  { placement: 'top', marginLeft: '0' },
)

// 下拉项 command，与模板中 el-dropdown-item 一致
const WEB_ORIGIN = {
  redis: 'https://redis.io',
  valkey: 'https://valkey.io',
  redisZh: 'https://redis.ac.cn',
  valkeyZh: 'https://valkey.cn',
} as const

type SiteCmd = keyof typeof WEB_ORIGIN
// #endregion

// #region 面板操作
// 官网路径统一：空格转连字符、小写，如 OBJECT ENCODING → object-encoding
function commandSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function sitePath(site: SiteCmd): string | undefined {
  const entry = DOC_PATHS[props.to] as Partial<Record<SiteCmd, string>>
  if (site === 'redisZh') return entry.redisZh ?? entry.redis
  if (site === 'valkeyZh') return entry.valkeyZh ?? entry.valkey
  return entry[site]
}

function handleCommand(cmd: string): void {
  const site = cmd as SiteCmd
  const path = sitePath(site)
  if (!path) return
  const base = WEB_ORIGIN[site]
  const suffix = props.command ? `${commandSlug(props.command)}/` : ''
  meOpenUrl(base + path + suffix)
}
// #endregion
</script>

<template>
  <el-dropdown @command="handleCommand" trigger="hover" :placement :style="{ marginLeft }">
    <el-link v-if="label" type="primary" :underline="false">{{ label }}</el-link>
    <me-icon v-else class="icon-btn" icon="me-icon-link" style="font-size: 14px" />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="redis">
          <me-icon icon="me-icon-redis" name="Redis" />
        </el-dropdown-item>
        <el-dropdown-item v-if="isZh" command="redisZh">
          <me-icon icon="me-icon-redis" name="Redis 中文" />
        </el-dropdown-item>
        <el-dropdown-item v-if="sitePath('valkey')" command="valkey">
          <me-icon icon="me-icon-valkey" name="Valkey" />
        </el-dropdown-item>
        <el-dropdown-item v-if="isZh && sitePath('valkeyZh')" command="valkeyZh">
          <me-icon icon="me-icon-valkey" name="Valkey 中文" />
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
