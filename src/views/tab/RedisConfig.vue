<script setup lang="ts">
// #region 导入
import { sortBy } from 'lodash'
import { computed, inject, nextTick, reactive, ref, useTemplateRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import NodeList from '@/components/MeNodeList.vue'
import { configTip as tips, redisConfDict, valkeyConfDict } from '@/locales/config'
import { shareProvideKey, type EnrichedRedisNode } from '@/types/me-interface'
import { meCopy, meCommands, meOk } from '@/utils/app/util'
import { pickVersionAtOrBelow, sortVersionsDesc } from '@/utils/redis/redis-version'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const props = defineProps({
  initNode: { type: String, default: '' },
  initVersion: { type: String, default: '' },
})
const node = ref(props.initNode)
const keyword = ref('')
const loading = ref(false)
interface ConfigTableRow {
  param: string
  value: string
}
const dataList = ref<ConfigTableRow[]>([])
const configVersion = ref('') // 版本
const configRaw = ref('')
const dialog = reactive({ raw: false })
const formRef = useTemplateRef('formRef')
const editLoading = ref(false)
const editShow = ref(false)
const form = reactive({ param: '', value: '', autoBroadcast: true })
const rewriteShow = ref(false)
const rewriteLoading = ref(false)
/** 集群写入范围：当前节点 / 全部节点。单机忽略 */
const rewriteScope = ref<'node' | 'all'>('node')
/** 节点配置差异：null 表示该节点 CONFIG GET 没有这项（与空字符串区分） */
interface NodeDiffRow {
  param: string
  values: Record<string, string | null>
}
const diffShow = ref(false)
const diffLoading = ref(false)
const diffReady = ref(false)
const diffNodes = ref<EnrichedRedisNode[]>([])
const diffRows = ref<NodeDiffRow[]>([])
// #endregion

// #region 计算属性
const serverType = computed(() => (share.capabilities.isValkey ? 'Valkey' : 'Redis'))
const canEdit = computed(() => !share.readonly)
const command = computed(
  () =>
    `CONFIG SET ${form.param} ${form.value?.includes(' ') ? '"' + form.value + '"' : form.value}`,
)
const rules = computed(() => ({
  value: [{ required: true, message: t('redisConfig.valueRequired') }],
}))
// Json格式的默认配置
const confDict = computed(() => (share.capabilities.isValkey ? valkeyConfDict : redisConfDict))
const dictVersionList = sortVersionsDesc(Object.keys(confDict.value))
// 默认值字典从 Redis6.2 / Valkey7.2 起；更旧服务回退到最旧字典做对比。
// 顶栏页签直接挂载时不传 initVersion，回落到当前连接版本
const dictVersion = ref(
  pickVersionAtOrBelow(
    serverType.value + (props.initVersion || share.capabilities.version),
    dictVersionList,
  ),
)
const dictRaw = computed(
  () => confDict.value[dictVersion.value] as Record<string, string | undefined>,
)
const tipMap = computed(() => tips.value as Record<string, string | undefined>)
const showTypeOptions = [
  { label: t('redisConfig.all'), value: 'All' },
  { label: t('redisConfig.diff'), value: 'Diff' },
]
const showType = ref('All')
const diffColumns = computed<MeColumn<NodeDiffRow>[]>(() => [
  { key: 'param', prop: 'param', title: t('redisConfig.param'), minWidth: 200, fixed: 'left' },
  ...diffNodes.value.map((item, index) => ({
    key: `node-${index}`,
    title: item.shortLabel,
    headerTip: item.node,
    minWidth: 140,
    sortable: false,
    formatter: (row: NodeDiffRow) => {
      const value = row.values[item.node]
      return value == null ? t('redisConfig.nodeDiffAbsent') : value
    },
  })),
])
// 「全部/差异」业务预筛交给 MeTable filter 谓词（页面传全量 dataList，MeTable 内部过滤）；关键词 param/value/tip 由 searchable + keyword 处理
const diffFilter = (row: unknown): boolean => {
  if (showType.value === 'All') return true
  const r = row as ConfigTableRow
  return r.value !== dictRaw.value[r.param]
}

// MeTable 列描述：单一来源，表格与导出共用（默认配置/说明取值由 formatter 计算，与界面展示一致）
const configColumns = computed<MeColumn<ConfigTableRow>[]>(() => [
  { key: 'param', prop: 'param', title: t('redisConfig.param'), minWidth: 180, searchable: true },
  { key: 'value', prop: 'value', title: t('redisConfig.value'), minWidth: 100, searchable: true },
  {
    key: 'default',
    title: `${dictVersion.value} ${t('redisConfig.defaultConfig')}`,
    minWidth: 120,
    formatter: row => dictRaw.value[row.param] ?? '',
  },
  {
    key: 'tip',
    title: t('redisConfig.tip'),
    minWidth: 200,
    // 灰色加在单元格节点（而非内部 span）：截断省略号与文字同色继承
    className: 'col-tip-info',
    formatter: row => tipMap.value[row.param] ?? '',
    searchable: true,
  },
  ...(canEdit.value
    ? [
        {
          key: 'action',
          title: t('action'),
          width: 80,
          align: 'center' as const,
          fixed: 'right' as const,
        },
      ]
    : []),
])
// #endregion

// #region 配置文件加载
// 构建期枚举 assets/conf/*.conf：增删文件后下拉列表自动同步，无需再维护版本常量
const confModules = import.meta.glob('../../../assets/conf/*.conf', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

function confVersionFromPath(path: string) {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.replace(/\.conf$/, '')
}

const confLoaderByVersion = Object.fromEntries(
  Object.entries(confModules).map(([path, load]) => [confVersionFromPath(path), load]),
) as Record<string, () => Promise<string>>

const configCache: Record<string, string | null> = {}
async function loadConfigFile(version: string) {
  if (configCache[version]) return configCache[version]
  const load = confLoaderByVersion[version]
  if (!load) return null

  try {
    const content = await load()
    configCache[version] = content
    return content
  } catch (e: unknown) {
    console.error(`加载配置文件失败: ${version}`, e)
    return null
  }
}

const dirConfigList = sortVersionsDesc(Object.keys(confLoaderByVersion))
const configVersionList = computed(() => dirConfigList.filter(d => d.startsWith(serverType.value)))

// 读取配置文件的值
watchEffect(async () => {
  try {
    if (!configVersion.value) {
      configRaw.value = t('redisConfig.noConfig')
      return
    }
    const content = await loadConfigFile(configVersion.value)
    configRaw.value = content || t('redisConfig.noConfig')
  } catch (_e: unknown) {
    configRaw.value = t('redisConfig.noConfig')
  }
})

function handleCommand(command: string) {
  configVersion.value = command
  nextTick(() => (dialog.raw = true))
}
// #endregion

// #region 面板操作
watch(
  () => props.initNode,
  v => {
    if (!v || v === node.value) return
    node.value = v
    void refresh()
  },
)

async function apiConfigGet() {
  const data = await meCommands.configGet(share.conn!.id, '*', node.value)
  dataList.value = sortBy(
    Object.entries(data).map(([param, value]) => ({ param, value })),
    ['param'],
  )
}

/** 各节点同一项取值不完全相同（含某节点没有这项）才进入差异表 */
function buildNodeDiffRows(
  nodes: EnrichedRedisNode[],
  maps: Record<string, string>[],
): NodeDiffRow[] {
  const params = new Set<string>()
  for (const map of maps) {
    for (const param of Object.keys(map)) params.add(param)
  }
  const rows: NodeDiffRow[] = []
  for (const param of params) {
    const values: Record<string, string | null> = {}
    const uniq = new Set<string | null>()
    nodes.forEach((item, index) => {
      const map = maps[index]
      const value = map != null && Object.hasOwn(map, param) ? map[param] : null
      values[item.node] = value
      uniq.add(value)
    })
    if (uniq.size > 1) rows.push({ param, values })
  }
  return sortBy(rows, 'param')
}

async function openNodeDiff() {
  const nodes = share.nodeList
  if (!share.conn?.cluster || !nodes.length) return
  diffNodes.value = nodes.map(item => ({ ...item }))
  diffRows.value = []
  diffReady.value = false
  diffShow.value = true
  diffLoading.value = true
  try {
    const maps = await Promise.all(
      diffNodes.value.map(item => meCommands.configGet(share.conn!.id, '*', item.node)),
    )
    diffRows.value = buildNodeDiffRows(diffNodes.value, maps)
    diffReady.value = true
  } finally {
    diffLoading.value = false
  }
}

async function refresh() {
  loading.value = true
  try {
    // 集群页签的节点由 node-list 的 init-node 补上后再拉，避免空节点打到随机实例
    if (share.conn?.cluster && !node.value) return
    await apiConfigGet()
  } finally {
    loading.value = false
  }
}
refresh()

// 手动点击刷新按钮：加载很快，完成后给出提示，让用户确认已刷新
async function refreshByButton() {
  await refresh()
  meOk(t('redisConfig.refreshOk'))
}

// 差异行标记：配置值与默认值不一致时加类，颜色由包裹层 --me-config-diff 变量提供
function diffRowClass(row: unknown): string {
  const r = row as ConfigTableRow
  return r.value === dictRaw.value[r.param] ? '' : 'cfg-diff'
}

async function editConfig(row: ConfigTableRow) {
  form.param = row.param
  form.value = row.value
  await nextTick(() => {
    editShow.value = true
  })
}

async function configSet() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    editLoading.value = true
    try {
      await meCommands.configSet(
        share.conn!.id,
        form.param,
        form.value,
        form.autoBroadcast ? '*' : node.value,
      )
      meOk(t('saveOk'))
      await refresh()
      editShow.value = false
    } finally {
      editLoading.value = false
    }
  })
}

function openRewrite() {
  rewriteScope.value = 'node'
  rewriteShow.value = true
}

async function configRewrite() {
  rewriteLoading.value = true
  try {
    const target = share.conn?.cluster && rewriteScope.value === 'all' ? '*' : node.value
    await meCommands.configRewrite(share.conn!.id, target || null)
    meOk(t('redisConfig.rewriteOk'))
    rewriteShow.value = false
  } finally {
    rewriteLoading.value = false
  }
}
// #endregion
</script>

<template>
  <div class="redis-config">
    <!-- 全部/差异始终贴左，节点紧随其后（单机不渲染）；版本与筛选靠右，避免两端对齐把左边挤开 -->
    <div class="me-flex header">
      <div class="header-left">
        <el-segmented v-model="showType" :options="showTypeOptions" />
        <node-list v-model="node" init-node @change="refresh" />
      </div>
      <div class="header-right">
        <el-select v-model="dictVersion" style="width: 120px; flex-shrink: 0">
          <el-option v-for="item in dictVersionList" :key="item" :label="item" :value="item" />
        </el-select>
        <el-input
          v-model="keyword"
          :placeholder="t('redisConfig.keyword')"
          style="width: 250px; min-width: 0"
          clearable />
      </div>
    </div>

    <div class="table" :style="{ '--me-config-diff': share.color }">
      <me-table
        v-loading="loading"
        :data="dataList"
        :filter="diffFilter"
        :keyword="keyword"
        :columns="configColumns"
        :row-class="diffRowClass"
        export-name="config">
        <template #cell-action="{ row }">
          <me-icon
            :info="t('redisConfig.configSet')"
            icon="el-icon-edit"
            class="icon-btn"
            style="justify-content: center"
            @click="editConfig(row)" />
        </template>
        <!-- 刷新在最左；节点差异、写入、参考配置随后；官网紧挨「更多」 -->
        <template #footer>
          <me-icon
            class="icon-btn config-footer-icon"
            icon="el-icon-refresh"
            :name="t('refresh')"
            hint
            placement="top"
            @click="refreshByButton" />
          <me-icon
            v-if="share.conn?.cluster"
            class="icon-btn config-footer-icon"
            icon="me-icon-diff"
            :name="t('redisConfig.nodeDiff')"
            hint
            placement="top"
            @click="openNodeDiff" />
          <me-icon
            v-if="canEdit"
            class="icon-btn config-footer-icon"
            icon="me-icon-write"
            :name="t('redisConfig.rewrite')"
            hint
            placement="top"
            @click="openRewrite" />
          <el-dropdown trigger="hover" placement="top-end" @command="handleCommand">
            <me-icon class="icon-btn config-footer-icon" icon="el-icon-reading" />
            <template #dropdown>
              <!-- 标题条对齐数据编码下拉的 header：加粗正文色 + 底部分隔，无图标 -->
              <div class="config-ref-header">
                <el-text style="font-weight: bold">{{ t('redisConfig.referenceConfig') }}</el-text>
              </div>
              <el-dropdown-menu>
                <el-dropdown-item v-for="item in configVersionList" :key="item" :command="item">
                  {{ item }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <me-website to="config" />
        </template>
      </me-table>
    </div>

    <me-dialog
      icon="me-icon-redis"
      :title="`${configVersion} ${t('redisConfig.defaultConfig')}`"
      v-model="dialog.raw"
      width="60vw">
      <!-- 单向绑定：弹窗里改字不写回，关掉即丢 -->
      <me-code :modelValue="configRaw" mode="properties" />
    </me-dialog>

    <el-dialog v-model="editShow" align-center width="480px" draggable>
      <template #header>
        <div class="edit-dialog-header">
          <span class="el-dialog__title">{{ t('redisConfig.configSet') }}</span>
          <el-text type="info" size="small">{{ t('redisConfig.runtimeOnly') }}</el-text>
        </div>
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('redisConfig.param')">
          <el-input v-model="form.param" disabled />
        </el-form-item>
        <el-form-item :label="t('redisConfig.value')" prop="value">
          <div class="me-flex" style="width: 100%">
            <el-input
              v-model="form.value"
              :placeholder="t('redisConfig.value')"
              clearable
              style="flex: 1" />
            <el-tooltip
              v-if="share.conn?.cluster"
              :content="t('redisConfig.autoBroadcastTip')"
              placement="top-end"
              :show-after="1000">
              <el-checkbox
                v-model="form.autoBroadcast"
                :label="t('redisConfig.autoBroadcast')"
                style="margin-left: 20px" />
            </el-tooltip>
          </div>
        </el-form-item>
        <el-form-item :label="t('redisConfig.command')">
          <el-text style="cursor: pointer" :style="{ color: share.color }" @click="meCopy(command)">
            {{ command }}
          </el-text>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="me-dialog-footer">
          <!-- 集群下提示：勾选自动广播则更新所有节点，否则仅更新所选节点 -->
          <me-icon
            v-if="share.conn?.cluster"
            class="footer-tip"
            icon="el-icon-info-filled"
            :name="t(form.autoBroadcast ? 'clusterUpdateAllTip' : 'nodeScopedUpdateTip')" />
          <div class="footer-btns">
            <el-button @click="editShow = false">{{ t('cancel') }}</el-button>
            <el-button type="primary" :loading="editLoading" @click="configSet">{{
              t('save')
            }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <me-dialog
      v-model="diffShow"
      icon="me-icon-diff"
      :title="t('redisConfig.nodeDiff')"
      width="80vw">
      <div class="node-diff" v-loading="diffLoading">
        <me-table
          :data="diffRows"
          :columns="diffColumns"
          export-name="node-diff"
          :empty-text="diffReady ? t('redisConfig.nodeDiffEmpty') : ' '" />
      </div>
    </me-dialog>

    <el-dialog
      :title="t('redisConfig.rewrite')"
      v-model="rewriteShow"
      align-center
      width="440px"
      draggable>
      <el-text class="rewrite-tip">
        {{ t('redisConfig.rewriteTipBefore') }}
        <el-tag size="small" effect="plain" disable-transitions class="rewrite-cmd">
          CONFIG REWRITE
        </el-tag>
        {{ t('redisConfig.rewriteTipAfter') }}
      </el-text>
      <el-radio-group v-if="share.conn?.cluster" v-model="rewriteScope" class="rewrite-scope">
        <el-radio value="node">{{ t('redisConfig.rewriteNode') }}</el-radio>
        <el-radio value="all">{{ t('redisConfig.rewriteAll') }}</el-radio>
      </el-radio-group>
      <template #footer>
        <div class="me-dialog-footer">
          <div class="footer-btns">
            <el-button @click="rewriteShow = false">{{ t('cancel') }}</el-button>
            <el-button type="primary" :loading="rewriteLoading" @click="configRewrite">{{
              t('ok')
            }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.redis-config {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
    min-width: 0;
    align-items: center;

    :deep(.el-input-group__prepend) {
      padding: 0 14px;
    }
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .header-left {
    flex-shrink: 0;
  }

  .header-right {
    margin-left: 10px;
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;

    // 差异行文字色：变量由包裹层 inline style 提供，类由 MeTable rowClass 加在行节点（运行时添加须 :deep）
    :deep(.cfg-diff) {
      color: var(--me-config-diff);
    }

    // 说明列灰色：加在单元格节点，省略号与文字同色
    :deep(.col-tip-info) {
      color: var(--el-color-info);
    }

    // 底栏图标与「更多」、官网对齐
    .config-footer-icon {
      font-size: 16px;
    }
  }
}

// 下拉挂到 body，标题不能套在 .redis-config 里面，否则选择器对不上
// 尺寸对齐 el-select 的 .el-select-dropdown__header
// 修改弹框挂到 body，标题行同样不能套在 .redis-config 里面
.rewrite-scope {
  display: flex;
  margin-top: 12px;
}

.rewrite-tip {
  line-height: 1.7;
}

.rewrite-cmd {
  margin-left: 4px;
  vertical-align: middle;
}

.edit-dialog-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
  padding-right: 28px;
}

.node-diff {
  height: 100%;
}

.config-ref-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border-bottom: 1px solid var(--el-border-color-light);
}
</style>
