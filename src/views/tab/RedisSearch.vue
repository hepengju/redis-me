<script setup lang="ts">
// 搜索页两层：索引表，点「查询」进入该索引的 FT.SEARCH。字段定义和 FT.INFO 原文各一个弹框。
import { useStorage } from '@vueuse/core'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import { connUiProvideKey, shareProvideKey } from '@/types/me-interface'
import type {
  SearchHit,
  SearchIndexField,
  SearchIndexInfo,
  SearchSynGroup,
} from '@/types/tauri-specta'
import { FT_QUERY_HISTORY_KEY, rememberFtQuery } from '@/utils/query-history'
import { indexAlterDraft, indexDdl } from '@/utils/search-ddl'
import { defaultSettings } from '@/utils/settings-defaults'
import {
  KEY_REFRESH,
  SEARCH_CREATE,
  bus,
  takeSearchCreateDraft,
  meCommands,
  meConfirm,
  meFormatDisplayValue,
  meOk,
  meWarn,
} from '@/utils/util'

const { t } = useI18n()
const share = inject(shareProvideKey)!
const connUi = inject(connUiProvideKey)!
const canEdit = computed(() => !share.readonly)

const loadingList = ref(false)
const loadingQuery = ref(false)
const pageMode = ref<'list' | 'query'>('list')
const keyword = ref('')
const indexes = ref<SearchIndexInfo[]>([])
const selected = ref<SearchIndexInfo | null>(null)
const queryText = ref('')
const withScores = ref(false)
// 和键区 Search 模式共用。点输入框展开，空条件和 * 不记。
const queryHistory = useStorage<string[]>(FT_QUERY_HISTORY_KEY, [])
const showQueryHistory = ref(false)
let queryHistoryHideTimer: ReturnType<typeof setTimeout> | null = null
const hits = ref<SearchHit[]>([])

const detailVisible = ref(false)
const infoVisible = ref(false)
const ddlVisible = ref(false)
const tagVisible = ref(false)
const tagField = ref('')
const tagValues = ref<string[]>([])
const tagKeyword = ref('')
const loadingTags = ref(false)
// 切换字段或关掉弹框后，丢掉还在飞的上一次 FT.TAGVALS。
let tagSeq = 0
const synVisible = ref(false)
const synGroups = ref<SearchSynGroup[]>([])
const synKeyword = ref('')
const loadingSyn = ref(false)
// 关掉弹框后，丢掉还在飞的上一次 FT.SYNDUMP。
let synSeq = 0
const synAddVisible = ref(false)
const synEditing = ref(false)
const synAddGroup = ref('')
const synAddTerms = ref('')
// 编辑前这一组里的词。FT.SYNUPDATE 只会追加，用来判断哪些是新词。
const synEditOriginal = ref<string[]>([])
const savingSyn = ref(false)
const sampleVisible = ref(false)
const sampleKind = ref('')
const loadingSample = ref(false)
const createVisible = ref(false)
const createDraft = ref('')
const creating = ref(false)
const alterVisible = ref(false)
const alterDraft = ref('')
const altering = ref(false)

/** 新建索引的起步命令。用户改完再执行，这里不发到服务器。 */
const CREATE_DRAFT = [
  'FT.CREATE idx:name',
  '    ON HASH',
  '    PREFIX 1 user:',
  '    SCHEMA',
  '      name  TEXT',
  '      type  TAG',
  '      score NUMERIC',
].join('\n')

// 只按名称、前缀模糊匹配，大小写不敏感。
const filteredIndexes = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return indexes.value
  return indexes.value.filter(row => [row.name, row.prefixes].join('\n').toLowerCase().includes(q))
})

// FT.INFO 原文。走终端的展示格式，避免 JSON.parse 碰到裸 NaN。
const infoText = computed(() => meFormatDisplayValue(selected.value?.raw ?? '', true))
// 由原文还原 FT.CREATE，不另存一份。
const ddlText = computed(() => indexDdl(selected.value?.raw ?? '', selected.value?.name ?? ''))
// 弹框草稿：可改、可复制，不写回索引。每次打开从原文重填。
const infoDraft = ref('')
const ddlDraft = ref('')

// 本页命中的字段名，按第一次出现的顺序。列是动态的，不跟 schema 对齐。
const resultColumns = computed(() => {
  const names: string[] = []
  for (const hit of hits.value) {
    for (const field of hit.fields) {
      if (!names.includes(field.field)) names.push(field.field)
    }
  }
  return names
})

// 这一列在当前命中里的值，没有则为空。
function fieldValue(hit: SearchHit, name: string): string {
  return hit.fields.find(field => field.field === name)?.value ?? ''
}

// 只用 el-tag 自带的几种颜色。
function fieldTypeTag(fieldType: string): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
  const known = {
    TEXT: 'primary',
    NUMERIC: 'warning',
    TAG: 'success',
    GEO: 'info',
    GEOSHAPE: 'info',
    VECTOR: 'danger',
  } as const
  return known[fieldType.toUpperCase() as keyof typeof known] ?? 'info'
}

// FT.TAGVALS 的字段名就是属性名。没有别名时才退回 identifier，下拉和命令用同一个名字。
function tagFieldName(field: SearchIndexField): string {
  return field.attribute || field.identifier
}

const tagFields = computed(() =>
  (selected.value?.fields ?? []).filter(field => field.fieldType.toUpperCase() === 'TAG'),
)

const filteredTagRows = computed(() => {
  const q = tagKeyword.value.trim().toLowerCase()
  const values = q
    ? tagValues.value.filter(value => value.toLowerCase().includes(q))
    : tagValues.value
  return values.map(value => ({ value }))
})

// 列描述：序号列 + 值列（展示与导出单一来源）
const tagColumns = computed<MeColumn[]>(() => [
  { key: 'index', title: '#', width: 60, align: 'center', index: true },
  { key: 'value', prop: 'value', title: t('redisSearch.tagValsValue'), minWidth: 200 },
])

// 一组一行。词在界面上用逗号拼开，导出同一份文本。
const filteredSynRows = computed(() => {
  const q = synKeyword.value.trim().toLowerCase()
  const rows = synGroups.value.map(item => ({ group: item.group, terms: item.terms.join(', ') }))
  if (!q) return rows
  return rows.filter(
    row => row.group.toLowerCase().includes(q) || row.terms.toLowerCase().includes(q),
  )
})

// 列描述：操作列仅可写时出现（纯插槽列不进导出矩阵）
const synColumns = computed<MeColumn[]>(() => [
  { key: 'index', title: '#', width: 60, align: 'center', index: true },
  { key: 'group', prop: 'group', title: t('redisSearch.synGroup'), width: 160 },
  { key: 'terms', prop: 'terms', title: t('redisSearch.synTerms'), minWidth: 200 },
  ...(canEdit.value
    ? [{ key: 'action', title: t('action'), width: 80, align: 'center' as const }]
    : []),
])

// 结果里的字段名可能是 attribute，也可能是 identifier，两种都交给后端认向量。
function vectorFieldNames(index: SearchIndexInfo): string[] {
  const names: string[] = []
  for (const field of index.fields) {
    if (field.fieldType.toUpperCase() !== 'VECTOR') continue
    for (const name of [field.attribute, field.identifier]) {
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names
}

// 索引表列描述：带 headerTip 的列由 #header-${key} 插槽渲染为「标题 + ⓘ 图标」
const indexColumns = computed<MeColumn<SearchIndexInfo>[]>(() => [
  { key: 'name', prop: 'name', title: t('redisSearch.name'), minWidth: 160, fixed: 'left' },
  {
    key: 'prefixes',
    prop: 'prefixes',
    title: t('redisSearch.prefixes'),
    minWidth: 160,
    headerTip: t('redisSearch.prefixTip'),
  },
  {
    key: 'numDocs',
    prop: 'numDocs',
    title: t('redisSearch.numDocs'),
    width: 90,
    align: 'right',
    headerTip: t('redisSearch.docsTip'),
  },
  {
    key: 'records',
    title: t('redisSearch.records'),
    width: 100,
    align: 'right',
    headerTip: t('redisSearch.recordsTip'),
    formatter: row => row.numRecords || '—',
  },
  {
    key: 'terms',
    title: t('redisSearch.terms'),
    width: 90,
    align: 'right',
    headerTip: t('redisSearch.termsTip'),
    formatter: row => row.numTerms || '—',
  },
  // 点数字打开字段定义，不单独占一列操作
  {
    key: 'fields',
    title: t('redisSearch.fields'),
    width: 90,
    align: 'center',
    headerTip: t('redisSearch.fieldsTip'),
    // 链接蓝加在单元格节点：截断省略号与 el-link 文字同色
    className: 'col-link',
    formatter: row => String(row.fields.length),
  },
  {
    key: 'action',
    title: t('action'),
    width: Number(t('redisSearch.actionWidth')),
    align: 'center',
    fixed: 'right',
  },
])

// 需渲染 ⓘ 图标的列头（一份 markup 生成多列）
const indexHeaderTips = computed(() =>
  indexColumns.value
    .filter(col => col.headerTip)
    .map(col => ({ key: col.key, title: col.title ?? '', tip: col.headerTip ?? '' })),
)

// 命中结果列：字段列跟本次命中走（不跟 schema 对齐），key 加 f- 前缀避开 key/score 列名冲突
const hitColumns = computed<MeColumn<SearchHit>[]>(() => [
  {
    key: 'key',
    prop: 'key',
    title: t('redisSearch.docKey'),
    width: 180,
    fixed: 'left',
    className: 'col-link',
  },
  ...(withScores.value
    ? [{ key: 'score', prop: 'score', title: t('redisSearch.score'), width: 200 }]
    : []),
  ...resultColumns.value.map(name => ({
    key: `f-${name}`,
    title: name,
    minWidth: Math.max(140, name.length * 8 + 28),
    formatter: (row: SearchHit) => fieldValue(row, name),
  })),
])

const filteredQueryHistory = computed(() => {
  const q = queryText.value.trim().toLowerCase()
  if (!q) return queryHistory.value
  return queryHistory.value.filter(item => item.toLowerCase().includes(q))
})

function hideQueryHistory(): void {
  showQueryHistory.value = false
  if (queryHistoryHideTimer) {
    clearTimeout(queryHistoryHideTimer)
    queryHistoryHideTimer = null
  }
}

function handleQueryClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('el-input__inner')) {
    showQueryHistory.value = true
  }
}

function handleQueryBlur(): void {
  queryHistoryHideTimer = setTimeout(() => {
    showQueryHistory.value = false
  }, 150)
}

function handleQueryHistoryMouseDown(): void {
  if (queryHistoryHideTimer) {
    clearTimeout(queryHistoryHideTimer)
    queryHistoryHideTimer = null
  }
}

function removeQueryHistory(item: string): void {
  queryHistory.value = queryHistory.value.filter(h => h !== item)
}

function clearQueryHistory(): void {
  queryHistory.value = []
}

function selectQueryHistory(item: string): void {
  queryText.value = item
  submitQuery()
}

// 回车和查询按钮才记历史。勾选分数、刷新索引不记。
function submitQuery(): void {
  hideQueryHistory()
  queryHistory.value = rememberFtQuery(queryHistory.value, queryText.value)
  void runSearch()
}

// 空查询按 *。条数用设置里的字段扫描，只取这一页，不再向服务器要后面的。
async function runSearch(): Promise<void> {
  if (!selected.value) return
  const n = Number(meTauri.settings.fieldScanCount)
  const count = Number.isFinite(n) && n >= 1 ? Math.floor(n) : defaultSettings.fieldScanCount
  loadingQuery.value = true
  try {
    const res = await meCommands.searchQuery(share.conn!.id, {
      index: selected.value.name,
      query: queryText.value.trim() || '*',
      offset: 0,
      count,
      withScores: withScores.value,
      noContent: false,
      vectorFields: vectorFieldNames(selected.value),
    })
    hits.value = res.hits
  } finally {
    loadingQuery.value = false
  }
}

// prefer 用来在导入样例后仍停在该索引。索引没了就退回列表。
async function loadIndexes(prefer?: string): Promise<void> {
  loadingList.value = true
  try {
    const keep = prefer ?? selected.value?.name
    indexes.value = await meCommands.searchIndexList(share.conn!.id)
    const next = indexes.value.find(item => item.name === keep) ?? null
    selected.value = next
    if (pageMode.value === 'query' && next) {
      await runSearch()
    } else if (!next) {
      leaveIndex()
    }
  } finally {
    loadingList.value = false
  }
}

// 字段、原文、DDL、修改、Tag 集合、同义词组共用 selected，同时只开一个弹框。
function openIndex(row: SearchIndexInfo, which: 'fields' | 'info' | 'ddl'): void {
  selected.value = row
  // 先写入选中索引，computed 才是这份原文；草稿只活在本次弹框里。
  if (which === 'info') infoDraft.value = infoText.value
  if (which === 'ddl') ddlDraft.value = ddlText.value
  detailVisible.value = which === 'fields'
  infoVisible.value = which === 'info'
  ddlVisible.value = which === 'ddl'
  alterVisible.value = false
  tagVisible.value = false
  synVisible.value = false
}

// 更多菜单：浏览、信息、DDL、Tag 集合、同义词组谁都能看，修改和删除只在可写时出现。
function onMore(row: SearchIndexInfo, cmd: string): void {
  if (cmd === 'browse') connUi.browseSearchIndex(row.name)
  else if (cmd === 'info') openIndex(row, 'info')
  else if (cmd === 'ddl') openIndex(row, 'ddl')
  else if (cmd === 'alter') openAlter(row)
  else if (cmd === 'tags') openTagVals(row)
  else if (cmd === 'syn') openSynDump(row)
  else if (cmd === 'drop') dropIndex(row)
}

// 打开时选中字段并立刻拉 FT.TAGVALS。fieldName 为空时用第一个 TAG 字段。
// 从字段详情点进来时不关那个弹框，关掉 Tag 集合后还能再点别的 TAG。
function openTagVals(row: SearchIndexInfo, fieldName?: string): void {
  selected.value = row
  if (!fieldName) detailVisible.value = false
  infoVisible.value = false
  ddlVisible.value = false
  alterVisible.value = false
  synVisible.value = false
  tagKeyword.value = ''
  tagValues.value = []
  const match = fieldName
    ? row.fields.find(
        field => field.fieldType.toUpperCase() === 'TAG' && tagFieldName(field) === fieldName,
      )
    : row.fields.find(field => field.fieldType.toUpperCase() === 'TAG')
  tagField.value = match ? tagFieldName(match) : ''
  tagVisible.value = true
  const req = ++tagSeq
  if (tagField.value) void loadTagVals(req)
}

function openTagField(field: SearchIndexField): void {
  if (field.fieldType.toUpperCase() !== 'TAG' || !selected.value) return
  openTagVals(selected.value, tagFieldName(field))
}

// 换字段时清掉上一个字段的筛选和结果。
function onTagFieldChange(): void {
  tagKeyword.value = ''
  tagValues.value = []
  void loadTagVals()
}

async function loadTagVals(req = ++tagSeq): Promise<void> {
  const index = selected.value?.name
  const field = tagField.value
  if (!index || !field) {
    tagValues.value = []
    loadingTags.value = false
    return
  }
  loadingTags.value = true
  try {
    const values = await meCommands.searchTagVals(share.conn!.id, index, field)
    if (req !== tagSeq) return
    tagValues.value = values
  } finally {
    if (req === tagSeq) loadingTags.value = false
  }
}

// 打开就拉 FT.SYNDUMP。同义词组跟索引走，不挑字段。
function openSynDump(row: SearchIndexInfo): void {
  selected.value = row
  detailVisible.value = false
  infoVisible.value = false
  ddlVisible.value = false
  alterVisible.value = false
  tagVisible.value = false
  synAddVisible.value = false
  synKeyword.value = ''
  synGroups.value = []
  synVisible.value = true
  const req = ++synSeq
  void loadSynDump(req)
}

// 词按空白或逗号切开，空的和重复的丢掉。组号本身不自动算成一个词。
function splitSynTerms(raw: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const part of raw.split(/[\s,，]+/)) {
    const term = part.trim()
    if (!term || seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }
  return terms
}

function openSynAdd(): void {
  synEditing.value = false
  synEditOriginal.value = []
  synAddGroup.value = ''
  synAddTerms.value = ''
  synAddVisible.value = true
}

function openSynEdit(row: { group: string }): void {
  const found = synGroups.value.find(item => item.group === row.group)
  synEditing.value = true
  synEditOriginal.value = [...(found?.terms ?? [])]
  synAddGroup.value = row.group
  synAddTerms.value = synEditOriginal.value.join(' ')
  synAddVisible.value = true
}

// FT.SYNUPDATE：组不存在就新建，已有的组只追加新词。
async function saveSynGroup(): Promise<void> {
  const index = selected.value?.name
  const group = synAddGroup.value.trim()
  const terms = splitSynTerms(synAddTerms.value)
  if (!index || !group || !terms.length) return
  const had = new Set(synEditOriginal.value)
  const added = synEditing.value ? terms.filter(term => !had.has(term)) : terms
  const removed = synEditing.value && synEditOriginal.value.some(term => !terms.includes(term))
  // 没有新词就不用打命令。划掉的旧词去不掉，只提示这一次。
  if (!added.length) {
    synAddVisible.value = false
    if (removed) meWarn(t('redisSearch.synTermsKept'))
    return
  }
  savingSyn.value = true
  try {
    await meCommands.searchSynUpdate(share.conn!.id, index, group, added)
    synAddVisible.value = false
    // 追加成功时，旧词留着的说明已经包含结果，不再叠一条「保存成功」。
    if (removed) meWarn(t('redisSearch.synTermsKept'))
    else meOk(synEditing.value ? t('editOk') : t('redisSearch.synAddOk'))
    await loadSynDump()
  } finally {
    savingSyn.value = false
  }
}

async function loadSynDump(req = ++synSeq): Promise<void> {
  const index = selected.value?.name
  if (!index) {
    synGroups.value = []
    loadingSyn.value = false
    return
  }
  loadingSyn.value = true
  try {
    const groups = await meCommands.searchSynDump(share.conn!.id, index)
    if (req !== synSeq) return
    synGroups.value = groups
  } finally {
    if (req === synSeq) loadingSyn.value = false
  }
}

// 进入查询页时清空条件和分数，马上搜一次。
function openQuery(row: SearchIndexInfo): void {
  selected.value = row
  queryText.value = ''
  withScores.value = false
  hits.value = []
  tagVisible.value = false
  synVisible.value = false
  pageMode.value = 'query'
  void runSearch()
}

// 点结果里的键：打开键值页，不走键树的 chooseKey。
function openDoc(key: string): void {
  const redisKey = { key, bytes: '' }
  share.redisKey = redisKey
  share.tabName = 'value'
  bus.emit(KEY_REFRESH)
  connUi.scrollKeyToTree(redisKey)
}

// 不传草稿就用起步命令。键详情进来时带上预填的 FT.CREATE。
function openCreate(draft?: string): void {
  createDraft.value = typeof draft === 'string' ? draft : CREATE_DRAFT
  alterVisible.value = false
  createVisible.value = true
}

function onSearchCreate(draft: string): void {
  takeSearchCreateDraft()
  pageMode.value = 'list'
  openCreate(draft)
}

// 索引名来自当前行。字段是占位，用户改完再执行。
function openAlter(row: SearchIndexInfo): void {
  selected.value = row
  alterDraft.value = indexAlterDraft(row.name)
  detailVisible.value = false
  infoVisible.value = false
  ddlVisible.value = false
  tagVisible.value = false
  synVisible.value = false
  createVisible.value = false
  alterVisible.value = true
}

// 只发一条 FT.ALTER。集群也只打到一个主节点。失败时弹框留着，方便改完再执行。
async function runAlter(): Promise<void> {
  const text = alterDraft.value.trim()
  if (!text) return
  const name = selected.value?.name
  altering.value = true
  try {
    await meCommands.searchIndexAlter(share.conn!.id, text)
    alterVisible.value = false
    meOk(t('redisSearch.alterOk'))
    await loadIndexes(name)
  } finally {
    altering.value = false
  }
}

// 只发一条 FT.CREATE。集群也只打到一个主节点。失败时弹框留着，方便改完再执行。
async function runCreate(): Promise<void> {
  const text = createDraft.value.trim()
  if (!text) return
  creating.value = true
  try {
    await meCommands.searchIndexCreate(share.conn!.id, text)
    createVisible.value = false
    meOk(t('redisSearch.createOk'))
    await loadIndexes()
  } finally {
    creating.value = false
  }
}

// 每次打开都重选样例。
function openSample(): void {
  sampleKind.value = ''
  sampleVisible.value = true
}

// 同名索引已在时只提示，不覆盖。成功后刷新列表并停在该索引。
async function loadSample(): Promise<void> {
  if (!sampleKind.value) return
  loadingSample.value = true
  try {
    const res = await meCommands.searchSampleLoad(share.conn!.id, sampleKind.value)
    sampleVisible.value = false
    meOk(
      t(res.created ? 'redisSearch.sampleCreated' : 'redisSearch.sampleExists', {
        name: res.index,
      }),
    )
    await loadIndexes(res.index)
  } finally {
    loadingSample.value = false
  }
}

// 退出查询页，并关掉字段、原文、DDL、修改、Tag 集合、同义词组弹框。
function leaveIndex(): void {
  selected.value = null
  pageMode.value = 'list'
  hits.value = []
  detailVisible.value = false
  infoVisible.value = false
  ddlVisible.value = false
  alterVisible.value = false
  tagVisible.value = false
  tagSeq += 1
  loadingTags.value = false
  synVisible.value = false
  synAddVisible.value = false
  synSeq += 1
  loadingSyn.value = false
}

// 不带 DD，文档键保留。deleteDocs 固定 false，界面不提供同时删键。
function dropIndex(row: SearchIndexInfo): void {
  const name = row.name
  meConfirm(t('redisSearch.dropConfirm', { name }), async () => {
    await meCommands.searchIndexDrop(share.conn!.id, name, false)
    meOk(t('redisSearch.dropOk'))
    if (selected.value?.name === name) leaveIndex()
    await loadIndexes()
  })
}

onMounted(() => {
  bus.on(SEARCH_CREATE, onSearchCreate)
  void loadIndexes()
  // 搜索页是懒加载，事件可能在挂载前就发出了。
  const draft = takeSearchCreateDraft()
  if (draft) onSearchCreate(draft)
})

onUnmounted(() => {
  bus.off(SEARCH_CREATE, onSearchCreate)
})
</script>

<template>
  <div class="redis-search">
    <!-- 索引列表 -->
    <template v-if="pageMode === 'list'">
      <div class="me-flex header">
        <div class="me-flex header-left">
          <!-- 只读不提供新建和样例 -->
          <el-button v-if="canEdit" type="primary" icon="el-icon-plus" @click="openCreate()">
            {{ t('redisSearch.create') }}
          </el-button>
          <el-button v-if="canEdit" icon="el-icon-document-add" @click="openSample">
            {{ t('redisSearch.sample') }}
          </el-button>
        </div>
        <div>
          <el-input
            v-model="keyword"
            :placeholder="t('redisSearch.filter')"
            style="width: 300px; margin-right: 10px"
            clearable />
          <el-button
            type="primary"
            icon="el-icon-search"
            :loading="loadingList"
            @click="loadIndexes()" />
        </div>
      </div>

      <div class="table">
        <me-table
          v-loading="loadingList"
          :data="filteredIndexes"
          :columns="indexColumns"
          :total="indexes.length"
          export-name="search-indexes">
          <!-- 列头 ⓘ 提示：一份 markup 生成多列 -->
          <template v-for="h in indexHeaderTips" :key="h.key" #[`header-${h.key}`]>
            <me-icon
              icon="el-icon-info-filled"
              :icon-left="false"
              placement="top"
              :name="h.title"
              :info="h.tip" />
          </template>
          <!-- 点数字打开字段定义，不单独占一列操作 -->
          <template #cell-fields="{ row }">
            <el-link type="primary" underline="never" @click="openIndex(row, 'fields')">
              {{ row.fields.length }}
            </el-link>
          </template>
          <!-- 查询做成按钮；浏览、信息、DDL、修改、Tag 集合、同义词组在更多里，修改和删除只在可写时出现 -->
          <template #cell-action="{ row }">
            <div class="action-icons">
              <el-button type="primary" plain size="small" @click="openQuery(row)">
                {{ t('redisSearch.query') }}
              </el-button>
              <el-dropdown
                trigger="click"
                placement="bottom-end"
                @command="(cmd: string) => onMore(row, cmd)">
                <me-icon icon="el-icon-more-filled" class="icon-btn" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="browse">
                      <me-icon icon="me-icon-list" :name="t('redisSearch.browse')" />
                    </el-dropdown-item>
                    <el-dropdown-item command="info">
                      <me-icon icon="el-icon-info-filled" :name="t('redisSearch.info')" />
                    </el-dropdown-item>
                    <el-dropdown-item command="ddl">
                      <me-icon icon="me-icon-copy-command" :name="t('redisSearch.ddl')" />
                    </el-dropdown-item>
                    <el-dropdown-item v-if="canEdit" command="alter">
                      <me-icon icon="el-icon-edit" :name="t('redisSearch.alter')" />
                    </el-dropdown-item>
                    <el-dropdown-item command="tags">
                      <me-icon icon="el-icon-collection-tag" :name="t('redisSearch.tagVals')" />
                    </el-dropdown-item>
                    <el-dropdown-item command="syn">
                      <me-icon icon="el-icon-connection" :name="t('redisSearch.synDump')" />
                    </el-dropdown-item>
                    <el-dropdown-item v-if="canEdit" command="drop">
                      <me-icon icon="el-icon-delete" :name="t('redisSearch.drop')" />
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
          <!-- 官网：紧挨合计行「更多」左侧 -->
          <template #footer>
            <me-website to="search" />
          </template>
        </me-table>
      </div>
    </template>

    <!-- 单个索引的 FT.SEARCH。返回后仍留在列表，不拆页面 -->
    <template v-else-if="selected">
      <div class="me-flex header">
        <div>
          <el-button icon="el-icon-back" @click="pageMode = 'list'">{{
            t('redisSearch.back')
          }}</el-button>
          <el-text tag="b" style="margin-left: 10px">{{ selected.name }}</el-text>
        </div>
        <div class="me-flex">
          <!-- 勾选变化立刻重查，空输入按 * -->
          <el-checkbox v-model="withScores" @change="runSearch">
            {{ t('redisSearch.withScores') }}
          </el-checkbox>
          <div class="query-box">
            <el-input
              v-model="queryText"
              :placeholder="t('redisSearch.queryPlaceholder')"
              clearable
              @click="handleQueryClick"
              @blur="handleQueryBlur"
              @keyup.enter="submitQuery">
              <template #suffix>
                <el-tooltip
                  :content="t('redisSearch.queryHint')"
                  placement="bottom"
                  raw-content
                  popper-style="max-width: 420px">
                  <el-icon class="query-help"><el-icon-question-filled /></el-icon>
                </el-tooltip>
              </template>
            </el-input>
            <div
              v-if="showQueryHistory && filteredQueryHistory.length > 0"
              class="query-history"
              @mousedown.prevent="handleQueryHistoryMouseDown">
              <div
                v-for="item in filteredQueryHistory"
                :key="item"
                class="history-item"
                @click="selectQueryHistory(item)">
                <span class="history-text">{{ item }}</span>
                <span class="history-delete" @click.stop="removeQueryHistory(item)">×</span>
              </div>
              <div class="history-clear" @click="clearQueryHistory">
                {{ t('redisSearch.clearHistory') }}
              </div>
            </div>
          </div>
          <el-button
            type="primary"
            icon="el-icon-search"
            :loading="loadingQuery"
            @click="submitQuery" />
        </div>
      </div>

      <div class="table" v-loading="loadingQuery">
        <me-table :data="hits" :columns="hitColumns" export-name="search-hits">
          <!-- 点键打开键值页，不走键树的 chooseKey -->
          <template #cell-key="{ row }">
            <el-link type="primary" underline="never" @click="openDoc(row.key)">
              {{ row.key }}
            </el-link>
          </template>
        </me-table>
      </div>
    </template>

    <!-- 字段详情：标识、属性名、类型、权重。TAG 可点开 Tag 集合。 -->
    <me-dialog
      v-model="detailVisible"
      :title="t('redisSearch.fieldDetail')"
      icon="el-icon-info-filled"
      width="720px">
      <template #title-extra>
        <el-text v-if="selected" type="info" style="margin-left: 8px">{{ selected.name }}</el-text>
      </template>
      <el-table :data="selected?.fields ?? []" border stripe height="100%" show-overflow-tooltip>
        <el-table-column prop="identifier" :label="t('redisSearch.identifier')" min-width="140" />
        <el-table-column prop="attribute" :label="t('redisSearch.attribute')" min-width="120" />
        <el-table-column :label="t('redisSearch.fieldType')" width="120">
          <template #default="{ row }">
            <el-tag
              v-if="row.fieldType"
              size="small"
              :effect="row.fieldType.toUpperCase() === 'TAG' ? 'dark' : 'plain'"
              :class="{ 'tag-type-link': row.fieldType.toUpperCase() === 'TAG' }"
              :type="fieldTypeTag(row.fieldType)"
              @click="openTagField(row)">
              {{ row.fieldType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" :label="t('redisSearch.weight')" width="90" />
      </el-table>
    </me-dialog>

    <!-- FT.TAGVALS。左下拉、右输入框 + 搜索，表用 me-table，条数由表格底栏显示。 -->
    <me-dialog
      v-model="tagVisible"
      :title="t('redisSearch.tagVals')"
      icon="el-icon-collection-tag"
      width="720px">
      <template #title-extra>
        <el-text v-if="selected" type="info" style="margin-left: 8px">{{ selected.name }}</el-text>
      </template>
      <div v-loading="loadingTags" class="dialog-table">
        <div v-if="tagFields.length" class="me-flex">
          <el-select v-model="tagField" style="width: 220px" @change="onTagFieldChange">
            <el-option
              v-for="field in tagFields"
              :key="`${field.identifier}\0${field.attribute}`"
              :label="tagFieldName(field)"
              :value="tagFieldName(field)" />
          </el-select>
          <div>
            <el-input
              v-model="tagKeyword"
              :placeholder="t('redisSearch.tagValsFilter')"
              clearable
              style="width: 220px; margin-right: 10px" />
            <el-button icon="el-icon-search" type="primary" @click="loadTagVals()" />
          </div>
        </div>
        <div class="dialog-table-main">
          <me-table
            :data="filteredTagRows"
            :columns="tagColumns"
            :total="tagValues.length"
            export-name="tag-vals"
            :default-sort="{ prop: 'value', order: 'ascending' }" />
        </div>
      </div>
    </me-dialog>

    <!-- FT.SYNDUMP。一组一行，词用逗号拼开。条数由表格底栏显示。 -->
    <me-dialog
      v-model="synVisible"
      :title="t('redisSearch.synDump')"
      icon="el-icon-connection"
      width="720px">
      <template #title-extra>
        <el-text v-if="selected" type="info" style="margin-left: 8px">{{ selected.name }}</el-text>
      </template>
      <div v-loading="loadingSyn" class="dialog-table">
        <div class="me-flex">
          <el-button v-if="canEdit" icon="el-icon-plus" @click="openSynAdd" type="primary">
            {{ t('redisSearch.synAdd') }}
          </el-button>
          <div style="margin-left: auto">
            <el-input
              v-model="synKeyword"
              :placeholder="t('redisSearch.synFilter')"
              clearable
              style="width: 220px; margin-right: 10px" />
            <el-button icon="el-icon-search" type="primary" @click="loadSynDump()" />
          </div>
        </div>
        <div class="dialog-table-main">
          <me-table
            :data="filteredSynRows"
            :columns="synColumns"
            :total="synGroups.length"
            export-name="synonyms"
            :default-sort="{ prop: 'group', order: 'ascending' }">
            <template #cell-action="{ row }">
              <div class="action-icons">
                <me-icon
                  icon="el-icon-edit"
                  class="icon-btn"
                  hint
                  :name="t('edit')"
                  @click="openSynEdit(row)" />
              </div>
            </template>
          </me-table>
        </div>
      </div>
    </me-dialog>

    <!-- FT.SYNUPDATE。叠在同义词组上面。填了一半时不用 Esc 和点外部关掉 -->
    <el-dialog
      v-model="synAddVisible"
      :title="synEditing ? t('redisSearch.synEditTitle') : t('redisSearch.synAddTitle')"
      width="480px"
      align-center
      draggable
      destroy-on-close
      append-to-body
      :close-on-press-escape="false"
      :close-on-click-modal="false">
      <el-form label-position="right" label-width="auto" @submit.prevent>
        <el-form-item :label="t('redisSearch.synGroup')">
          <el-input
            v-model="synAddGroup"
            :placeholder="t('redisSearch.synGroupPh')"
            :disabled="synEditing" />
        </el-form-item>
        <el-form-item :label="t('redisSearch.synTerms')">
          <el-input v-model="synAddTerms" :placeholder="t('redisSearch.synTermsPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="synAddVisible = false">{{ t('cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!synAddGroup.trim() || !splitSynTerms(synAddTerms).length"
          :loading="savingSyn"
          @click="saveSynGroup">
          {{ t('ok') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 新建、修改、DDL、信息。编辑区撑满弹框正文 -->
    <!-- 草稿可能写了一半，不用 Esc 和点外部关掉 -->
    <me-dialog
      v-model="createVisible"
      :title="t('redisSearch.create')"
      icon="el-icon-plus"
      width="720px"
      :close-on-press-escape="false"
      :close-on-click-modal="false">
      <div class="create-body">
        <div style="margin-bottom: 12px">
          <el-text type="info">{{ t('redisSearch.createHint') }}</el-text>
          <me-website to="ftCreate" margin-left="10px" />
        </div>
        <me-code
          v-model="createDraft"
          mode="redis"
          copyable
          style="flex: 1; min-height: 0; height: auto" />
      </div>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!createDraft.trim()"
          :loading="creating"
          @click="runCreate">
          {{ t('redisSearch.createRun') }}
        </el-button>
      </template>
    </me-dialog>

    <!-- 草稿可能写了一半，不用 Esc 和点外部关掉 -->
    <me-dialog
      v-model="alterVisible"
      :title="t('redisSearch.alter')"
      icon="el-icon-edit"
      width="720px"
      :close-on-press-escape="false"
      :close-on-click-modal="false">
      <template #title-extra>
        <el-text v-if="selected" type="info" style="margin-left: 8px">{{ selected.name }}</el-text>
      </template>
      <div class="create-body">
        <div style="margin-bottom: 12px">
          <el-text type="info">{{ t('redisSearch.alterHint') }}</el-text>
          <me-website to="ftAlter" margin-left="10px" />
        </div>
        <me-code
          v-model="alterDraft"
          mode="redis"
          copyable
          style="flex: 1; min-height: 0; height: auto" />
      </div>
      <template #footer>
        <el-button @click="alterVisible = false">{{ t('cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!alterDraft.trim()"
          :loading="altering"
          @click="runAlter">
          {{ t('redisSearch.createRun') }}
        </el-button>
      </template>
    </me-dialog>

    <!-- 由 FT.INFO 还原的 FT.CREATE，不是服务器保存的原文 -->
    <me-dialog
      v-model="ddlVisible"
      :title="t('redisSearch.ddl')"
      icon="me-icon-copy-command"
      width="720px">
      <template #title-extra>
        <el-text v-if="selected" type="info" style="margin-left: 8px">{{ selected.name }}</el-text>
      </template>
      <me-code v-model="ddlDraft" mode="redis" copyable style="height: 100%" />
    </me-dialog>

    <!-- FT.INFO 原文 -->
    <me-dialog
      v-model="infoVisible"
      :title="t('redisSearch.info')"
      icon="el-icon-info-filled"
      width="720px">
      <template #title-extra>
        <el-text v-if="selected" type="info" style="margin-left: 8px">{{ selected.name }}</el-text>
      </template>
      <me-code v-model="infoDraft" style="height: 100%" />
    </me-dialog>

    <!-- 样例：已有同名索引时不覆盖 -->
    <me-dialog
      v-model="sampleVisible"
      :title="t('redisSearch.sampleTitle')"
      icon="el-icon-document-add"
      width="520px"
      body-height="auto">
      <div style="margin-bottom: 12px">
        <el-text type="info">{{ t('redisSearch.sampleHint') }}</el-text>
      </div>
      <el-radio-group v-model="sampleKind" class="sample-list">
        <el-radio value="bikes" border>
          <div>{{ t('redisSearch.sampleBikes') }}</div>
          <div class="sample-desc">{{ t('redisSearch.sampleBikesHint') }}</div>
        </el-radio>
        <el-radio value="movies" border>
          <div>{{ t('redisSearch.sampleMovies') }}</div>
          <div class="sample-desc">{{ t('redisSearch.sampleMoviesHint') }}</div>
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="sampleVisible = false">{{ t('cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!sampleKind"
          :loading="loadingSample"
          @click="loadSample">
          {{ t('ok') }}
        </el-button>
      </template>
    </me-dialog>
  </div>
</template>

<style scoped lang="scss">
.redis-search {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .header,
  .header-left {
    align-items: center;
  }

  // 链接列蓝：加在单元格节点，截断省略号与 el-link 文字同色
  :deep(.col-link) {
    color: var(--el-color-primary);
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;
  }
}

.create-body {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sample-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;

  :deep(.el-radio) {
    width: 100%;
    height: auto;
    margin-right: 0;
    padding: 10px 12px;
    white-space: normal;
  }

  :deep(.el-radio__label) {
    line-height: 1.4;
  }
}

.sample-desc {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

/* 一个操作居中；两个及以上撑开到两端 */
.action-icons {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;

  &:has(> :nth-child(2)) {
    justify-content: space-between;
  }
}

.query-box {
  position: relative;
  z-index: 20;
  width: 300px;
  margin: 0 10px;
}

.query-history {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: color-mix(in srgb, var(--el-bg-color) 70%, transparent);
  border: 1px solid var(--el-border-color);
  border-top: none;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  max-height: 300px;
  overflow-y: auto;

  .history-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    color: var(--el-text-color-regular);

    &:hover {
      background-color: var(--el-color-info-light-8);
    }
  }

  .history-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-delete {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--el-text-color-secondary);
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;

    &:hover {
      color: var(--el-color-danger);
      background-color: var(--el-color-danger-light-9);
    }
  }

  .history-clear {
    padding: 8px 12px;
    text-align: center;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    border-top: 1px solid var(--el-border-color-lighter);
    cursor: pointer;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}

/* 和键区全文检索的问号一样：帮助光标，悬停变主题色。左边距与键搜索框后缀一致，和清除按钮隔开 */
.query-help {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  cursor: help;

  &:hover {
    color: var(--el-color-primary);
  }
}

/* TAG 类型可点开 Tag 集合 */
.tag-type-link {
  cursor: pointer;
}

/* 表撑满 MeDialog 正文（正文本身是 60vh） */
.dialog-table {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .dialog-table-main {
    margin-top: 10px;
    flex: 1;
    min-height: 0;
  }
}
</style>
