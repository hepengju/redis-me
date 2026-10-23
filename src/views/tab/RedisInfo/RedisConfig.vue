<script setup lang="ts">
// #region 导入
import { sortBy } from 'lodash'
import { computed, inject, nextTick, reactive, ref, useTemplateRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import MeWebsite from '@/components/MeWebsite.vue'
import { configTip as tips, redisConfDict, valkeyConfDict } from '@/locales/config'
import { shareProvideKey } from '@/types/me-interface'
import { pickVersionAtOrBelow, sortVersionsDesc } from '@/utils/redis-version'
import { meCopy, meCommands, meOk } from '@/utils/util'
import NodeList from '@/views/ext/NodeList.vue'
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
// 默认值字典从 Redis6.2 / Valkey7.2 起；更旧服务回退到最旧字典做对比
const dictVersion = ref(pickVersionAtOrBelow(serverType.value + props.initVersion, dictVersionList))
const dictRaw = computed(
  () => confDict.value[dictVersion.value] as Record<string, string | undefined>,
)
const tipMap = computed(() => tips.value as Record<string, string | undefined>)
const showTypeOptions = [
  { label: t('redisConfig.all'), value: 'All' },
  { label: t('redisConfig.diff'), value: 'Diff' },
]
const showType = ref('All')
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
    node.value = v
  },
)

async function apiConfigGet() {
  const data = await meCommands.configGet(share.conn!.id, '*', node.value)
  dataList.value = sortBy(
    Object.entries(data).map(([param, value]) => ({ param, value })),
    ['param'],
  )
}

async function refresh() {
  loading.value = true
  try {
    await apiConfigGet()
  } finally {
    loading.value = false
  }
}
refresh()

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
// #endregion
</script>

<template>
  <div class="redis-config">
    <div class="me-flex header">
      <div>
        <div class="me-flex">
          <node-list v-model="node" style="margin-right: 10px" @change="refresh" />
          <el-dropdown @command="handleCommand">
            <el-button plain icon="el-icon-notebook">{{ t('redisConfig.reference') }}</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :command="item" v-for="item in configVersionList">{{
                  item
                }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <me-website to="config" />
        </div>
      </div>
      <div class="me-flex">
        <el-segmented v-model="showType" :options="showTypeOptions"></el-segmented>
        <el-select v-model="dictVersion" style="width: 120px; margin: 0 10px">
          <el-option v-for="item in dictVersionList" :key="item" :label="item" :value="item" />
        </el-select>
        <el-input
          v-model="keyword"
          :placeholder="t('redisConfig.keyword')"
          style="width: 250px; margin-right: 10px"
          clearable />
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading" />
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
      </me-table>
    </div>

    <me-dialog
      icon="me-icon-redis"
      :title="`${configVersion} ${t('redisConfig.defaultConfig')}`"
      v-model="dialog.raw"
      width="60vw">
      <me-code :modelValue="configRaw" mode="properties" read-only />
    </me-dialog>

    <el-dialog :title="t('redisConfig.configSet')" v-model="editShow" align-center>
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
        <el-button @click="editShow = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="editLoading" @click="configSet">{{
          t('save')
        }}</el-button>
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
    :deep(.el-input-group__prepend) {
      padding: 0 14px;
    }
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
  }
}
</style>
