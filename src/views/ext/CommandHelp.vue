<script setup lang="ts">
// #region 导入
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn, MeFilterValue } from '@/components/me-table-column'
import MeWebsite from '@/components/MeWebsite.vue'
import { commandHelp, type CommandHelpRow } from '@/locales/cmd'
import { sortVersionsDesc } from '@/utils/redis-version'
import { isZh } from '@/utils/util'
// #endregion

// #region 核心状态

const { t } = useI18n()

const visible = defineModel<boolean>('visible', { default: false })

const props = withDefaults(
  defineProps<{
    /** 初始过滤关键词 */
    initialKeyword?: string
    /** 初始分组过滤 */
    initialGroup?: string
  }>(),
  { initialKeyword: '', initialGroup: '' },
)

const keyword = ref(props.initialKeyword)
const group = ref(props.initialGroup)
const tableKey = ref(0)
// 列头筛选已选值（MeTable 先过滤全量数据再排序/渲染）
const sinceFilter = ref<MeFilterValue[]>([])
const readonlyFilter = ref<MeFilterValue[]>([])

const groupList = computed(() => new Set(commandHelp.value.map(row => row.group)))
// 版本筛选项按语义版本降序（与运行配置参考列表共用 redis-version）
const sinceFilters = computed(() =>
  sortVersionsDesc([...new Set(commandHelp.value.map(row => row.since))]).map(value => ({
    text: value,
    value,
  })),
)
const readonlyFilters = computed(() => [
  { text: t('redisTerminal.readonlyYes'), value: true },
  { text: t('redisTerminal.readonlyNo'), value: false },
])

// 行谓词交给 MeTable：分组/关键词/版本/只读均在此判定（读同一批页面 ref，行为与旧 filterDataList 一致），
// 关键词比的是 title（文档标题，非展示列 key）故不适合 searchable；页面传全量 commandHelp、MeTable 自算总数
const helpFilter = (row: unknown): boolean => {
  const r = row as CommandHelpRow
  if (group.value && r.group !== group.value) return false
  const key = keyword.value.toLowerCase().trim()
  if (key && !(r.title.toLowerCase().includes(key) || r.summary.toLowerCase().includes(key)))
    return false
  if (sinceFilter.value.length && !sinceFilter.value.includes(r.since)) return false
  if (readonlyFilter.value.length && !readonlyFilter.value.includes(!!r.readonly)) return false
  return true
}

// 只读列表头：英文 Read-only 较宽，中文只读可窄一些
const readonlyColWidth = computed(() => (isZh.value ? 88 : 120))

// MeTable 列描述：单一来源，表格与导出共用（只读列文本由 formatter 计算，与界面展示一致）
const helpColumns = computed<MeColumn<CommandHelpRow>[]>(() => [
  { key: 'group', prop: 'group', title: t('redisTerminal.group'), width: 120 },
  {
    key: 'key',
    prop: 'key',
    title: t('redisTerminal.command'),
    width: 150,
    // 链接蓝加在单元格节点：截断省略号与 el-link 文字同色
    className: 'col-cmd-link',
  },
  { key: 'usage', prop: 'usage', title: t('redisTerminal.usage'), minWidth: 200 },
  { key: 'summary', prop: 'summary', title: t('redisTerminal.summary'), minWidth: 200 },
  // 列头是筛选面板：整格可点排序会劫持筛选点击，显式关闭（MeTable 默认对有 prop 的列开排序）
  { key: 'since', prop: 'since', title: t('redisTerminal.since'), width: 100, sortable: false },
  {
    key: 'readonly',
    prop: 'readonly',
    title: t('redisTerminal.readonly'),
    width: readonlyColWidth.value,
    align: 'center',
    sortable: false,
    formatter: row =>
      row.readonly ? t('redisTerminal.readonlyYes') : t('redisTerminal.readonlyNo'),
  },
])
// #endregion

// #region 面板操作

// 外部调用打开弹窗
function open(options?: { keyword?: string; group?: string }) {
  keyword.value = options?.keyword ?? props.initialKeyword
  group.value = options?.group ?? props.initialGroup
  sinceFilter.value = []
  readonlyFilter.value = []
  tableKey.value++
  visible.value = true
}

// 外部调用关闭弹窗
function close() {
  visible.value = false
}

defineExpose({ open, close })
// #endregion
</script>

<template>
  <me-dialog
    v-model="visible"
    icon="el-icon-document"
    :title="t('redisTerminal.commandTitle')"
    width="80vw">
    <div style="height: 100%; display: flex; flex-direction: column">
      <div class="me-flex">
        <div class="me-flex">
          <el-select
            v-model="group"
            style="width: 200px"
            :placeholder="t('redisTerminal.group')"
            clearable
            filterable>
            <el-option v-for="item in groupList" :key="item" :value="item">{{ item }}</el-option>
          </el-select>
          <me-website to="command" />
        </div>
        <el-input
          v-model="keyword"
          :placeholder="t('redisTerminal.keywordHint')"
          style="width: 300px"
          clearable />
      </div>

      <div class="cmd-table" style="margin-top: 10px; flex-grow: 1; height: 0">
        <me-table
          :key="tableKey"
          :data="commandHelp"
          :filter="helpFilter"
          :columns="helpColumns"
          export-name="command"
          :default-sort="{ prop: 'key', order: 'ascending' }">
          <!-- 命令名为文档链接（路径统一为小写+空格转连字符） -->
          <template #cell-key="{ row }">
            <me-website to="command" :command="row.key" :label="row.key" margin-left="0" />
          </template>
          <!-- 列头筛选：标题 + 下拉面板（v2 无内置筛选 UI） -->
          <template #header-since>
            <me-column-filter
              v-model="sinceFilter"
              :title="t('redisTerminal.since')"
              :options="sinceFilters" />
          </template>
          <template #header-readonly>
            <me-column-filter
              v-model="readonlyFilter"
              :title="t('redisTerminal.readonly')"
              :options="readonlyFilters"
              center />
          </template>
        </me-table>
      </div>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.cmd-table {
  // 命令列链接蓝：加在单元格节点，省略号与 el-link 文字同色
  :deep(.col-cmd-link) {
    color: var(--el-color-primary);
  }
}
</style>
