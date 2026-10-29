<script setup lang="ts">
// #region 导入
import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  useTemplateRef,
  watchEffect,
} from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import { infoTip as tips } from '@/locales/info'
import { shareProvideKey } from '@/types/me-interface'
import type { RedisInfo } from '@/types/tauri-specta'
import { enrichNodeList } from '@/utils/redis-display'
import { bus, INFO_REFRESH, meCommands, meHumanSize } from '@/utils/util'

import RedisACL from './RedisACL.vue'
import RedisClient from './RedisClient.vue'
import RedisConfig from './RedisConfig.vue'
// #endregion

// Info 页：INFO 原文 → 字典/标签表；弹窗挂 Client / ACL / Config（本域组件）。

// #region 共享上下文
const { t } = useI18n()
const tipMap = computed(() => tips.value as Record<string, string | undefined>)
const share = inject(shareProvideKey)!
// #endregion

// #region 核心状态
// INFO 详情行：tag 分类名、键名、值
type InfoRow = { key: string; value: string; tag: string }
// INFO 原文与解析结果
const node = ref('') // 指定节点
const raw = ref('') // 原始信息
const dic = ref<Record<string, string>>({}) // 字典形式
const tagList = ref<string[]>([]) // 标签名列表
const tagTable = ref<InfoRow[]>([])
const keyCount = ref(0) // 键数量
const infoNode = ref('')

// 详情表筛选
const keyword = ref('')
const tagSelected = ref('')

// 弹窗开关
const dialog = reactive({ raw: false, client: false, config: false, acl: false, topology: false })
const loading = ref(false)
const isCluster = computed(() => !!share.conn?.cluster)
/** Valkey 用 server_mode，Redis 用 redis_mode */
const modeKey = computed(() => (share.capabilities.isValkey ? 'server_mode' : 'redis_mode'))

// config get save（RDB 勾选状态）
const config = ref<Record<string, string>>({})
const configError = ref('')
// #endregion

// #region 概览派生（描述列表）
// indeterminate 时 checked 须为 false
const rdbChecked = computed(() => !configError.value && !!config.value['save'])
const rdbIndeterminate = computed(() => !!configError.value)
const aofChecked = computed(() => dic.value['aof_enabled'] === '1')
const rdbTooltip = computed(
  () => configError.value || config.value['save'] || t('redisInfo.rdbDisabled'),
)
const cacheRatio = computed(() => {
  const hits = parseInt(dic.value['keyspace_hits'] ?? '', 10)
  const misses = parseInt(dic.value['keyspace_misses'] ?? '', 10)
  const total = hits + misses
  if (!Number.isFinite(hits) || !Number.isFinite(misses) || total <= 0) return 'error'
  return ((hits / total) * 100).toFixed(2) + '%'
})

// 连接配置中的 ACL 用户名，空串显示 default
const displayUsername = computed(() => share.conn?.username?.trim() || 'default')

/** INFO 数值字段：空或非数字 → '--'，否则按 format 输出 */
function infoField(key: string, format: (n: number) => string): string {
  const v = dic.value[key]
  if (v == null || v === '') return '--'
  const n = parseFloat(v)
  return Number.isNaN(n) ? '--' : format(n)
}
const opsPerSec = computed(() => infoField('instantaneous_ops_per_sec', n => `${n}/s`))
const networkInKbps = computed(() => infoField('instantaneous_input_kbps', n => n.toFixed(2)))
const networkOutKbps = computed(() => infoField('instantaneous_output_kbps', n => n.toFixed(2)))
const networkUnavailable = computed(
  () => networkInKbps.value === '--' || networkOutKbps.value === '--',
)

// maxmemory 为 0 时显示未限制，否则 human · policy
const maxmemorySummary = computed(() => {
  const bytes = parseInt(dic.value['maxmemory'] ?? '0', 10)
  if (!bytes) return t('redisInfo.maxmemoryUnlimited')
  const human = dic.value['maxmemory_human'] || `${bytes}B`
  const policy = dic.value['maxmemory_policy'] || '--'
  return `${human} · ${policy}`
})

/** used_memory / total_system_memory；缺字段或系统内存为 0 时不展示 */
const usedMemOfSystemPerc = computed(() => {
  const used = parseInt(dic.value['used_memory'] ?? '', 10)
  const total = parseInt(dic.value['total_system_memory'] ?? '', 10)
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return ''
  return ((used / total) * 100).toFixed(2) + '%'
})
// #endregion

// #region INFO 解析与表格筛选
// raw 变化后重算 dic / tagTable / dbSizeMap
watchEffect(() => {
  dic.value = {}
  tagList.value = []
  tagTable.value = []
  keyCount.value = 0
  share.dbSizeMap = {}

  const lines = raw.value.split('\n')
  let tagKey = ''

  lines.forEach(line => {
    if (line.startsWith('#')) {
      tagKey = line.substring(1).trim()
      tagList.value.push(tagKey)
    } else {
      const index = line.indexOf(':')
      const key = line.substring(0, index).trim()
      const value = line.substring(index + 1).trim()

      if (key !== '') {
        tagTable.value.push({ key, value, tag: tagKey })
        dic.value[key] = value
      }

      // db0:keys=14410,expires=3997,avg_ttl=736124073
      if (/^db\d{1,2}$/.test(key)) {
        try {
          const size = parseInt(value.split(',')[0].split('=')[1])
          share.dbSizeMap[key] = size
          keyCount.value += size
        } catch (_e: unknown) {}
      }
    }
  })
})

// 分类下拉预筛交给 MeTable filter 谓词（页面传全量 tagTable，MeTable 内部过滤）；关键词 key/value/tip 由 searchable + keyword 处理
const tagFilter = (row: unknown): boolean =>
  !tagSelected.value || (row as InfoRow).tag === tagSelected.value

// MeTable 列描述：单一来源，表格与导出共用（说明列文本由 formatter 计算，与界面展示一致）；关键词搜索 key/value/tip 由 MeTable 内部处理（tip 走 formatter 展示文本）
const infoColumns = computed<MeColumn<InfoRow>[]>(() => [
  { key: 'tag', prop: 'tag', title: t('redisInfo.tag'), width: 100 },
  { key: 'key', prop: 'key', title: t('redisInfo.key'), minWidth: 150, searchable: true },
  { key: 'value', prop: 'value', title: t('redisInfo.value'), minWidth: 150, searchable: true },
  {
    key: 'tip',
    title: t('redisInfo.tip'),
    minWidth: 200,
    // 灰色加在单元格节点（而非内部 span）：截断省略号与文字同色继承
    className: 'col-tip-info',
    formatter: row => tipMap.value[row.key] ?? '',
    searchable: true,
  },
])

const tableRef = useTemplateRef('table')
function tagChange() {
  tableRef.value?.scrollTo(0, 0)
}
// #endregion

// #region 刷新与初始化
function onInfoRefreshBus(payload?: boolean | undefined) {
  // 增删键等可 bus 触发，保证 DB 下拉数量正确
  void refresh(payload === true)
}
onMounted(() => bus.on(INFO_REFRESH, onInfoRefreshBus))
onUnmounted(() => bus.off(INFO_REFRESH, onInfoRefreshBus))

async function refresh(withConfigGet: boolean = false) {
  loading.value = true
  try {
    const data = await meCommands.info(share.conn!.id, node.value)
    raw.value = data.info || ''
    const conn = share.conn
    infoNode.value = data.node || (conn ? `${conn.host}:${conn.port}` : '')

    if (withConfigGet) {
      const snap = await fetchSaveConfig(node.value)
      config.value = snap.config
      configError.value = snap.configError
    }
    // 集群下单节点刷新（如增删键）写回缓存，概览表跟当前节点对齐
    if (isCluster.value && infoNode.value) rememberSnapshot(infoNode.value, withConfigGet)
  } finally {
    loading.value = false
  }
}

// 集群先拉 nodeList 并选定 master。集群一次取全部节点，单机只取当前节点
async function initPage() {
  const nodeList = await meCommands.nodeList(share.conn!.id)
  share.nodeList = enrichNodeList(nodeList || [])
  if (isCluster.value) {
    const firstMaster = share.nodeList.find(n => n.isMaster)
    if (firstMaster?.node) node.value = firstMaster.node
    await refreshCluster()
  } else {
    await refresh(true)
  }
}

void initPage()
// #endregion

// #region 弹窗 / 跳转 Tab
function openTab(name: string) {
  share.tabName = name
}

const nodeGroups = computed(() => {
  const masters = share.nodeList.filter(n => n.isMaster)
  return masters.map(m => ({
    master: m,
    slaves: share.nodeList.filter(n => n.isSlave && n.slaveOfNode === m.node),
  }))
})
// #endregion

// #region 集群节点概览
// 集群刷新走 infoList，整份 INFO 按节点缓存。点行只切换缓存，不再发请求。
// 键合计只加主节点（副本是同一批键）。
type OverviewRow = {
  node: string
  shortLabel: string
  isMaster: boolean
  /** 默认顺序下标：M1/M2/M3 然后 S1/S2/S3；节点列排序按此还原 */
  order: number
  keyTotal: number
  connectedClients: number
  netIn: number
  netOut: number
  ops: number
  usedMemory: number
}

const overviewRows = ref<OverviewRow[]>([])
// 节点地址 -> 已拉取的 INFO 与 RDB 配置，供点行切换复用
type NodeSnapshot = { info: string; config: Record<string, string>; configError: string }
const nodeInfoMap = ref<Record<string, NodeSnapshot>>({})
// 集群下描述列表下方用页签切换节点概览 / 参数详情，避免两块纵向叠在一起把详情挤出视口
const lowerTab = ref(isCluster.value ? 'overview' : 'detail')

function formatKbps(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '--'
}

function formatOps(n: number): string {
  if (!Number.isFinite(n)) return '--'
  return String(Math.round(n * 100) / 100)
}

/** silent CONFIG GET save：失败只记错误，不打断整页刷新 */
async function fetchSaveConfig(
  nodeAddr: string,
): Promise<Pick<NodeSnapshot, 'config' | 'configError'>> {
  try {
    const data = await meCommands.configGet(share.conn!.id, 'save', nodeAddr, false)
    return { config: data ?? {}, configError: '' }
  } catch (e: unknown) {
    return { config: {}, configError: String(e) }
  }
}

/** INFO 字段 → 概览行属性 */
const METRIC_KEYS: Record<string, 'connectedClients' | 'ops' | 'netIn' | 'netOut' | 'usedMemory'> =
  {
    connected_clients: 'connectedClients',
    instantaneous_ops_per_sec: 'ops',
    instantaneous_input_kbps: 'netIn',
    instantaneous_output_kbps: 'netOut',
    used_memory: 'usedMemory',
  }

/** 从 INFO 原文抽出概览表用的几项，与当前节点描述列表同一份文本 */
function metricsFromInfo(info: string) {
  const m = { keyTotal: 0, connectedClients: 0, netIn: 0, netOut: 0, ops: 0, usedMemory: 0 }
  for (const line of info.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf(':')
    if (index < 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    const field = METRIC_KEYS[key]
    if (field) m[field] = Number(value) || 0
    else if (/^db\d{1,2}$/.test(key)) {
      const size = parseInt(value.split(',')[0]?.split('=')[1] ?? '', 10)
      if (!Number.isNaN(size)) m.keyTotal += size
    }
  }
  return m
}

/** 先全部主节点 M1/M2/M3，再全部副本 S1/S2/S3；对不上短标签的垫底 */
function compareOverview(a: OverviewRow, b: OverviewRow): number {
  const rank = (row: OverviewRow): [number, number, string] => {
    const m = /^([MS])(\d+)$/.exec(row.shortLabel)
    if (!m) return [2, 999, row.node]
    return [m[1] === 'M' ? 0 : 1, Number(m[2]), row.node]
  }
  const ra = rank(a)
  const rb = rank(b)
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2])
}

function buildOverviewRows(list: RedisInfo[]): OverviewRow[] {
  const byNode = new Map(share.nodeList.map(n => [n.node, n]))
  const rows: OverviewRow[] = list.map(item => {
    const meta = byNode.get(item.node)
    const metrics = metricsFromInfo(item.info || '')
    return {
      node: item.node,
      shortLabel: meta?.shortLabel ?? '',
      isMaster: meta?.isMaster ?? false,
      order: 0,
      ...metrics,
    }
  })
  rows.sort(compareOverview)
  rows.forEach((row, i) => {
    row.order = i
  })
  return rows
}

const overviewColumns = computed<MeColumn<OverviewRow>[]>(() => [
  {
    key: 'node',
    prop: 'order',
    title: t('redisInfo.node'),
    minWidth: 220,
    formatter: row => (row.shortLabel ? `${row.shortLabel} ${row.node}` : row.node),
    sortMethod: (a, b) => a.order - b.order,
  },
  { key: 'keyTotal', prop: 'keyTotal', title: t('redisInfo.keyTotal'), width: 90, align: 'right' },
  {
    key: 'connectedClients',
    prop: 'connectedClients',
    title: t('redisInfo.connectedClients'),
    width: 80,
    align: 'right',
  },
  {
    key: 'netIn',
    prop: 'netIn',
    title: t('redisInfo.networkUp'),
    width: 100,
    align: 'right',
    formatter: row => formatKbps(row.netIn),
  },
  {
    key: 'netOut',
    prop: 'netOut',
    title: t('redisInfo.networkDown'),
    width: 100,
    align: 'right',
    formatter: row => formatKbps(row.netOut),
  },
  {
    key: 'ops',
    prop: 'ops',
    title: t('redisInfo.command'),
    width: 90,
    align: 'right',
    formatter: row => `${formatOps(row.ops)}/s`,
  },
  {
    key: 'memory',
    prop: 'usedMemory',
    title: t('redisInfo.memory'),
    width: 110,
    align: 'right',
    formatter: row => meHumanSize(row.usedMemory),
  },
])

/** 底栏合计段：模板用 | 隔开 */
const overviewSummaryParts = computed(() => {
  const rows = overviewRows.value
  if (!rows.length) return [] as string[]
  const sum = { keys: 0, clients: 0, ops: 0, netIn: 0, netOut: 0, memory: 0 }
  for (const row of rows) {
    if (row.isMaster) sum.keys += row.keyTotal
    sum.clients += row.connectedClients
    sum.ops += row.ops
    sum.netIn += row.netIn
    sum.netOut += row.netOut
    sum.memory += row.usedMemory
  }
  return [
    `${t('redisInfo.summaryMasterKeys')} ${sum.keys}`,
    `${t('redisInfo.summaryClients')} ${sum.clients}`,
    `${t('redisInfo.command')} ${formatOps(sum.ops)}/s`,
    `${t('redisInfo.network')} ↑ ${formatKbps(sum.netIn)} ↓ ${formatKbps(sum.netOut)} kb/s`,
    `${t('redisInfo.memory')} ${meHumanSize(sum.memory)}`,
  ]
})

async function refreshCluster() {
  const id = share.conn?.id
  if (!isCluster.value || !id) return
  loading.value = true
  try {
    const list = (await meCommands.infoList(id, 'all')) || []
    const entries = await Promise.all(
      list.map(async item => {
        const snap = await fetchSaveConfig(item.node)
        return [item.node, { info: item.info || '', ...snap }] as const
      }),
    )
    const map = Object.fromEntries(entries) as Record<string, NodeSnapshot>
    nodeInfoMap.value = map
    overviewRows.value = buildOverviewRows(list)
    const current =
      (node.value && map[node.value] ? node.value : '') ||
      overviewRows.value.find(row => row.isMaster)?.node ||
      list[0]?.node ||
      ''
    if (current) {
      node.value = current
      applySnapshot(current)
    }
  } finally {
    loading.value = false
  }
}

function applySnapshot(addr: string) {
  const snap = nodeInfoMap.value[addr]
  if (!snap) return
  raw.value = snap.info
  infoNode.value = addr
  configError.value = snap.configError
  config.value = snap.configError ? {} : { ...snap.config }
}

/** 把当前页上的节点写回缓存，并刷新概览表里对应行 */
function rememberSnapshot(addr: string, withConfig: boolean) {
  const prev = nodeInfoMap.value[addr]
  nodeInfoMap.value = {
    ...nodeInfoMap.value,
    [addr]: {
      info: raw.value,
      config: withConfig ? { ...config.value } : (prev?.config ?? {}),
      configError: withConfig ? configError.value : (prev?.configError ?? ''),
    },
  }
  const metrics = metricsFromInfo(raw.value)
  overviewRows.value = overviewRows.value.map(row =>
    row.node === addr ? { ...row, ...metrics } : row,
  )
}

function onRefreshClick() {
  if (isCluster.value) void refreshCluster()
  else void refresh(true)
}

// 当前节点变化时换一个函数引用，表格才会重算行类
const overviewRowClass = computed(() => {
  const current = node.value || infoNode.value
  return (row: unknown) => ((row as OverviewRow).node === current ? 'node-overview-current' : '')
})

function onOverviewRowClick(row: OverviewRow) {
  node.value = row.node
  applySnapshot(row.node)
}
// #endregion
</script>

<template>
  <div class="redis-info" v-loading="loading">
    <!-- 概览：节点 / 版本 / 描述项 -->
    <el-descriptions border>
      <template #title>
        <div class="me-flex" style="align-items: center">
          <div class="me-flex">
            <el-text size="large" style="margin-left: 5px">{{ infoNode }}</el-text>
            <el-tag style="margin-left: 10px" effect="plain">
              {{ share.capabilities.isValkey ? 'Valkey' : 'Redis' }}
              {{ share.capabilities.version }}
            </el-tag>
            <el-tag type="success" style="margin-left: 10px" effect="plain" v-if="dic[modeKey]">{{
              dic[modeKey]
            }}</el-tag>
            <el-tag class="role-tag" type="success" effect="plain" v-if="dic['role']">{{
              dic['role']
            }}</el-tag>
          </div>
          <me-icon
            class="refresh-btn"
            :name="t('refresh')"
            icon="el-icon-refresh"
            placement="left"
            hint
            @click="onRefreshClick" />
        </div>
      </template>

      <el-descriptions-item>
        <template #label
          ><me-icon :name="t('redisInfo.uptimeInDays')" icon="el-icon-timer"
        /></template>
        {{ dic['uptime_in_days'] }} {{ t('redisInfo.days', parseInt(dic['uptime_in_days'])) }}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon :name="t('redisInfo.keyTotal')" icon="el-icon-key" /></template>
        {{ keyCount }}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label
          ><me-icon :name="t('redisInfo.connectedClients')" icon="me-icon-conn"
        /></template>
        <div class="me-flex">
          <el-link @click="dialog.client = true" underline="never" type="primary">{{
            dic['connected_clients']
          }}</el-link>
          <el-text type="info" style="margin-left: 10px">
            [ {{ t('redisInfo.maxClients') }}: {{ dic['maxclients'] }} ]
          </el-text>
        </div>
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label><me-icon :name="t('redisInfo.user')" icon="el-icon-user" /></template>
        <el-link
          v-if="share.capabilities.aclSupported"
          underline="never"
          type="primary"
          @click="dialog.acl = true"
          >{{ displayUsername }}</el-link
        >
        <span v-else>{{ displayUsername }}</span>
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label>
          <span class="network-label">
            <me-icon :name="t('redisInfo.network')" icon="el-icon-connection" />
            <span class="network-unit">kb/s</span>
          </span>
        </template>
        <span v-if="networkUnavailable">--</span>
        <span v-else class="network-throughput">
          <span>↑ {{ networkInKbps }}</span>
          <span class="network-throughput-gap">↓ {{ networkOutKbps }}</span>
        </span>
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label
          ><me-icon :name="t('redisInfo.command')" icon="el-icon-odometer"
        /></template>
        {{ opsPerSec }}
      </el-descriptions-item>

      <el-descriptions-item>
        <template #label
          ><me-icon :name="t('redisInfo.persistence')" icon="me-icon-save"
        /></template>
        <!-- rdb 需 config get save 确认；间距压成默认一半 -->
        <span class="persist-checks">
          <el-checkbox v-model="rdbChecked" :indeterminate="rdbIndeterminate" disabled>
            <el-tooltip :content="rdbTooltip" placement="top-start">RDB</el-tooltip>
          </el-checkbox>
          <el-checkbox v-model="aofChecked" disabled>AOF</el-checkbox>
        </span>
      </el-descriptions-item>

      <el-descriptions-item :span="2">
        <template #label><me-icon :name="t('redisInfo.memory')" icon="me-icon-memory" /></template>
        <div class="me-flex">
          <el-link underline="never" @click="openTab('memory')" type="primary">
            {{ dic['used_memory_human'] }}
            <span v-if="usedMemOfSystemPerc">&nbsp;({{ usedMemOfSystemPerc }})</span>
          </el-link>
          <el-text type="info" style="margin-left: 10px">
            [
            <span>{{ t('redisInfo.peak') }}: {{ dic['used_memory_peak_human'] }}</span>
            <span style="margin-left: 20px"
              >{{ t('redisInfo.maxmemoryLimit') }}: {{ maxmemorySummary }}</span
            >
            ]
          </el-text>
        </div>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label
          ><me-icon :name="t('redisInfo.executable')" icon="el-icon-video-play"
        /></template>
        <div class="me-flex">
          <el-text truncated style="max-width: 300px; color: unset">{{
            dic['executable']
          }}</el-text>
          <el-text type="info" style="margin-left: 10px; max-width: 300px" truncated>
            [
            <!-- el-link 默认 vertical-align: middle，与前后基线对齐的文本会错开，这里改回基线对齐 -->
            <el-link
              underline="never"
              @click="dialog.config = true"
              type="primary"
              style="vertical-align: baseline"
              >{{ t('redisInfo.config') }}</el-link
            >: {{ dic['config_file'] || '--' }} ]
          </el-text>
        </div>
      </el-descriptions-item>

      <el-descriptions-item :span="3">
        <template #label><me-icon :name="t('redisInfo.system')" icon="el-icon-monitor" /></template>
        <div class="me-flex">
          {{ dic['os'] }}
          <el-text type="info" style="margin-left: 10px">
            [
            <span>PID: {{ dic['process_id'] }}</span>
            <span style="margin-left: 20px"
              >{{ t('redisInfo.memory') }}: {{ dic['total_system_memory_human'] }}</span
            >
            <span style="margin-left: 20px" v-if="cacheRatio !== 'error'"
              >{{ t('redisInfo.cacheRatio') }}: {{ cacheRatio }}</span
            >
            ]
          </el-text>
        </div>
      </el-descriptions-item>
    </el-descriptions>

    <!-- 集群：节点概览与参数详情共用剩余高度；单机只显示参数详情 -->
    <div class="info-lower">
      <el-tabs v-model="lowerTab" class="info-tabs" :class="{ 'is-single': !isCluster }">
        <el-tab-pane v-if="isCluster" name="overview" :label="t('redisInfo.nodeOverview')">
          <div class="pane-table node-overview-table">
            <me-table
              class="info-footer-tight"
              :data="overviewRows"
              :columns="overviewColumns"
              export-name="cluster-nodes"
              :row-class="overviewRowClass"
              @row-click="onOverviewRowClick">
              <template v-if="overviewSummaryParts.length" #footer-center>
                <span class="node-overview-summary">
                  <template v-for="(part, i) in overviewSummaryParts" :key="part">
                    <span v-if="i" class="sum-sep">|</span>
                    <span>{{ part }}</span>
                  </template>
                </span>
              </template>
              <!-- 拓扑、图表：紧挨更多菜单 -->
              <template #footer>
                <me-icon
                  class="icon-btn info-footer-icon"
                  icon="me-icon-cluster"
                  :name="t('redisInfo.clusterTopology')"
                  hint
                  placement="top"
                  @click="dialog.topology = true" />
                <me-icon
                  class="icon-btn info-footer-icon"
                  icon="el-icon-data-line"
                  :name="t('tab.chart')"
                  hint
                  placement="top"
                  @click="openTab('chart')" />
              </template>
              <template #cell-node="{ row }">
                <div class="node-overview-node">
                  <el-tag
                    v-if="row.shortLabel"
                    :type="row.isMaster ? 'primary' : 'info'"
                    effect="dark"
                    size="small">
                    {{ row.shortLabel }}
                  </el-tag>
                  <span class="node-overview-addr">{{ row.node }}</span>
                </div>
              </template>
            </me-table>
          </div>
        </el-tab-pane>

        <el-tab-pane name="detail" :label="t('redisInfo.infoDetail')">
          <div class="pane">
            <div class="me-flex pane-header">
              <el-select
                v-model="tagSelected"
                :placeholder="t('redisInfo.tag')"
                clearable
                style="width: 150px"
                @change="tagChange">
                <el-option v-for="tag in tagList" :key="tag" :label="tag" :value="tag" />
              </el-select>
              <el-input
                v-model="keyword"
                clearable
                style="width: 226px"
                :placeholder="t('redisInfo.keyword')" />
            </div>
            <div class="pane-table">
              <me-table
                ref="table"
                class="info-footer-tight"
                :data="tagTable"
                :filter="tagFilter"
                :keyword="keyword"
                :columns="infoColumns"
                export-name="info">
                <!-- 官网在左、原文在右，紧挨更多菜单 -->
                <template #footer>
                  <me-website to="info" margin-left="0" placement="top" />
                  <me-icon
                    class="icon-btn info-footer-icon"
                    icon="el-icon-tickets"
                    :name="t('redisInfo.rawInfo')"
                    hint
                    placement="top"
                    @click="dialog.raw = true" />
                </template>
              </me-table>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>

  <!-- 本域弹窗：原文 / Client / ACL / Config -->
  <me-dialog v-model="dialog.raw" icon="el-icon-tickets" title="Info" width="60vw">
    <me-code :modelValue="raw" mode="properties" read-only />
  </me-dialog>

  <me-dialog
    v-model="dialog.client"
    icon="me-icon-conn"
    :title="t('redisInfo.client')"
    width="80vw"
    :close-on-press-escape="false"
    :close-on-click-modal="false">
    <RedisClient :init-node="node || infoNode" />
  </me-dialog>

  <me-dialog
    v-model="dialog.acl"
    icon="el-icon-user"
    :title="t('redisACL.title')"
    width="88vw"
    :close-on-press-escape="false"
    :close-on-click-modal="false">
    <RedisACL />
  </me-dialog>

  <me-dialog
    v-model="dialog.config"
    icon="el-icon-wallet"
    :title="t('redisInfo.runConfig')"
    width="80vw"
    :close-on-press-escape="false"
    :close-on-click-modal="false">
    <RedisConfig :init-node="node || infoNode" :init-version="share.capabilities.version" />
  </me-dialog>

  <!-- 集群拓扑：节点概览底栏图标打开 -->
  <el-dialog v-model="dialog.topology" width="600px" draggable>
    <template #header>
      <me-icon icon="me-icon-cluster" :name="t('redisInfo.clusterTopology')" />
    </template>
    <div class="cluster-topology-wrap">
      <el-card
        v-for="(group, groupIdx) in nodeGroups"
        :key="group.master.node"
        shadow="hover"
        :style="{ marginTop: groupIdx ? '10px' : '0' }">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0">
            <el-tag type="primary" effect="dark" size="small">{{ group.master.shortLabel }}</el-tag>
            <el-text effect="dark" type="primary" style="font-size: 13px; font-weight: 600">
              {{ group.master.node }}
            </el-text>
          </div>
          <el-text type="info" style="font-size: 12px">
            {{ group.master.id }}
          </el-text>
        </div>
        <div
          v-if="group.slaves.length"
          style="
            margin-top: 10px;
            padding-left: 14px;
            border-left: 2px solid var(--el-border-color-lighter);
          ">
          <div
            v-for="(s, idx) in group.slaves"
            :key="s.node"
            style="display: flex; align-items: center; justify-content: space-between; gap: 10px"
            :style="{ marginTop: idx ? '8px' : '0' }">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0">
              <el-tag type="info" effect="dark" size="small">{{ s.shortLabel }}</el-tag>
              <el-text effect="dark" type="info" style="font-size: 13px; font-weight: 500">
                {{ s.node }}
              </el-text>
            </div>
            <el-text type="info" style="font-size: 12px">
              {{ s.id }}
            </el-text>
          </div>
        </div>
        <el-text
          v-if="group.master.slots"
          effect="dark"
          type="info"
          size="small"
          style="display: block; margin-top: 10px; text-align: right">
          Slots: {{ group.master.slots }}
        </el-text>
      </el-card>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.redis-info {
  // 根布局：概览 + 详情表
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  // 描述标题
  :deep(.el-descriptions__title) {
    width: 100%;
  }

  // 三列标签+内容的宽度比例固定，切换节点时不再按数字长短重排
  :deep(.el-descriptions__table) {
    table-layout: fixed;
    width: 100%;
  }

  // RDB / AOF：Element Plus 默认间距 30px，收成一半
  .persist-checks :deep(.el-checkbox) {
    margin-right: 15px;
  }

  // 英文标签（Network / Commands / Executable）比中文略长，13% 会挤
  :deep(.el-descriptions__body tr:first-child > .el-descriptions__label) {
    width: 14%;
  }

  :deep(.el-descriptions__body tr:first-child > .el-descriptions__content) {
    width: calc((100% - 42%) / 3);
  }

  // 说明列灰色：加在单元格节点，省略号与文字同色
  :deep(.col-tip-info) {
    color: var(--el-color-info);
  }

  // 底栏图标间距：默认 20px 收到 8px（选择器要比 MeTable 自己的更具体）
  .info-footer-tight.me-table:deep(.me-table-footer .me-table-footer-actions),
  .info-footer-tight.me-table:deep(.me-table-footer .me-table-footer-right) {
    gap: 8px;
  }

  // 底栏图标字号与「更多」对齐；悬停色走全局 .icon-btn
  .info-footer-icon {
    font-size: 16px;
  }

  .role-tag {
    margin-left: 10px;
  }

  .network-throughput-gap {
    margin-left: 16px;
  }

  .network-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    vertical-align: middle;
  }

  .network-unit {
    font-size: 10px;
    color: var(--el-text-color-secondary);
  }

  // 描述列表下方：页签占满剩余高度。单机隐藏页签头，只留参数详情
  .info-lower {
    margin-top: 4px;
    flex: 1;
    min-height: 0;

    // 单机无页签：与筛选行下间距对齐，上下都是 8px
    &:has(.is-single) {
      margin-top: 8px;
    }
  }

  .info-tabs {
    height: 100%;
    display: flex;
    flex-direction: column;

    // 去掉页签和表格之间的默认间距，节点表贴着页签
    :deep(.el-tabs__header) {
      flex-shrink: 0;
      margin: 0;
    }

    :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0;
    }

    :deep(.el-tab-pane) {
      height: 100%;
    }

    // 单机无页签头，只隐藏；不再包一层边框
    &.is-single {
      :deep(.el-tabs__header) {
        display: none;
      }

      .pane-header {
        padding-top: 0;
      }
    }
  }

  .pane {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .pane-header {
    align-items: center;
    flex-shrink: 0;
    // 左侧贴齐表格外边，右侧筛选仍留一点空隙；上下各 8px（单机上间距改由 info-lower 承担）
    padding: 8px 10px 8px 0;
    font-weight: bold;
  }

  .pane-table {
    flex: 1;
    min-height: 0;
  }
}

.refresh-btn {
  font-size: 20px;
  color: var(--el-color-success);
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
  }
}

.node-overview-table {
  height: calc(100% - 8px);
  margin-top: 8px;

  :deep(.el-table-v2__row) {
    cursor: pointer;
  }

  // 当前节点行：变量方案与键值页编辑行一致（hover 仍盖过高亮）
  :deep(.el-table-v2__row.node-overview-current) {
    --me-row-bg: var(--el-color-primary-light-9);
  }
}

.node-overview-node {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.node-overview-addr {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.node-overview-summary {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  // 标签与数字同一文本节点，避免分 span 后中文/数字基线错位

  .sum-sep {
    margin: 0 10px;
  }
}

.cluster-topology-wrap {
  height: 100%;
  overflow: auto;
  padding: 4px 2px 12px;
}
</style>
