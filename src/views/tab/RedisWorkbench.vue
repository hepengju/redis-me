<script setup lang="ts">
// 工作台：全文或选区是一条命令。有表时默认表；CLIENT LIST 和 FT.SEARCH / FT.AGGREGATE / FT.INFO 可切表。
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'

import MeCode, { type MeCodeCaret } from '@/components/me-code/MeCode.vue'
import type { MeColumn } from '@/components/me-table/column'
import NodeList from '@/components/MeNodeList.vue'
import MeOverflowText from '@/components/MeOverflowText.vue'
import { isReadonlyCommand } from '@/locales/cmd'
import { connUiProvideKey, shareProvideKey } from '@/types/me-interface'
import type { WorkbenchTable } from '@/types/tauri-specta'
import {
  bus,
  DB_SWITCH,
  formatSpectaErrorForUser,
  KEY_REFRESH,
  meCommandsQuiet,
  meCopy,
} from '@/utils/app/util'
import { redisWorkbenchCompletion } from '@/utils/redis/redis-complete'
import { classifyTerminalCommand } from '@/utils/redis/terminal-guard'
import {
  capResultLines,
  collapseWorkbenchSpace,
  workbenchTitle,
} from '@/utils/redis/workbench-script'
import {
  applyWorkbenchRun,
  type WorkbenchResult,
  type WorkbenchTab,
} from '@/utils/redis/workbench-tabs'

const MAX_LINES = 1000
const HISTORY_LIMIT = 20

const { t } = useI18n()
const share = inject(shareProvideKey)!
const connUi = inject(connUiProvideKey)!
const canEdit = computed(() => !share.readonly)

type WorkbenchRow = Record<string, string>

interface Session {
  script: string
  tabs: WorkbenchTab[]
  activeId: string
  /** 最近执行的命令，新的在前。关掉结果标签不会清掉。 */
  history: string[]
  /** 集群：没选节点且开启时走 redis-rs 路由；指定节点则钉在该节点。单机忽略。 */
  autoBroadcast: boolean
  node: string
}

/** 按连接记着。切走页签组件还在；换连接互不覆盖。关应用即丢。 */
const sessions = new Map<string, Session>()

function blankSession(): Session {
  return { script: '', tabs: [], activeId: '', history: [], autoBroadcast: true, node: '' }
}

const session = ref<Session>(blankSession())
const running = ref(false)
const selFrom = ref(0)
const selTo = ref(0)
const editorRef = useTemplateRef<InstanceType<typeof MeCode>>('editorRef')
/** 命令和键名提示。保持同一份扩展，避免输入时弹层被拆掉。 */
const editorExtensions = redisWorkbenchCompletion()
const tagsRef = useTemplateRef<HTMLDivElement>('tagsRef')
let tabSeq = 0

watch(
  () => share.conn?.id,
  (id, prev) => {
    if (prev) sessions.set(prev, session.value)
    const next = (id && sessions.get(id)) || blankSession()
    session.value = next
    selFrom.value = 0
    selTo.value = 0
    if (id) sessions.set(id, next)
  },
  { immediate: true },
)

const activeTab = computed(() => session.value.tabs.find(tab => tab.id === session.value.activeId))
const history = computed(() => session.value.history ?? [])
const hasSelection = computed(() => selFrom.value !== selTo.value)
const runLabel = computed(() =>
  t(hasSelection.value ? 'redisWorkbench.runSelection' : 'redisWorkbench.run'),
)
/** 空白选区或空白全文都不能执行，按钮直接禁用。 */
const canRun = computed(() => {
  const doc = session.value.script
  if (hasSelection.value) {
    const from = Math.min(selFrom.value, selTo.value)
    const to = Math.max(selFrom.value, selTo.value)
    return doc.slice(from, to).trim().length > 0
  }
  return doc.trim().length > 0
})

function onCaret(caret: MeCodeCaret) {
  selFrom.value = caret.from
  selTo.value = caret.to
}

function focusEditor() {
  void nextTick(() => editorRef.value?.focus())
}

/** 标签装不下时用滚轮前后挪，不出现滚动条。 */
function onTagsWheel(event: WheelEvent) {
  const el = tagsRef.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  event.preventDefault()
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  el.scrollLeft += delta
}

function revealActiveTag() {
  const el = tagsRef.value
  const current = el?.querySelector<HTMLElement>('.is-current')
  if (!el || !current) return
  const view = el.getBoundingClientRect()
  const box = current.getBoundingClientRect()
  if (box.left < view.left) el.scrollLeft -= view.left - box.left
  else if (box.right > view.right) el.scrollLeft += box.right - view.right
}

onMounted(() => {
  focusEditor()
  tagsRef.value?.addEventListener('wheel', onTagsWheel, { passive: false })
})
onBeforeUnmount(() => tagsRef.value?.removeEventListener('wheel', onTagsWheel))
watch(
  () => session.value.activeId,
  () => void nextTick(revealActiveTag),
)
watch(
  () => share.tabName,
  name => {
    if (name === 'workbench') focusEditor()
  },
)

/** 有选区就跑选区，否则跑全文。换行留给 Redis 当参数分隔，不在这里拆成多条。 */
function commandToRun(): string {
  const caret = editorRef.value?.caret()
  const doc = caret?.doc ?? session.value.script
  if (caret && !caret.empty) {
    return doc.slice(Math.min(caret.from, caret.to), Math.max(caret.from, caret.to)).trim()
  }
  return doc.trim()
}

function pack(
  command: string,
  text: string,
  error: boolean,
  started: number,
  table: WorkbenchTable | null = null,
): WorkbenchResult {
  const capped = capResultLines(text, MAX_LINES)
  return {
    command,
    title: workbenchTitle(command),
    text: capped.text,
    len: text.length,
    error,
    ms: Math.round(performance.now() - started),
    truncated: capped.truncated,
    table,
  }
}

const blockedText = {
  subscribe: 'redisTerminal.unsupportedSubscribe',
  monitor: 'redisTerminal.unsupportedMonitor',
  blocking: 'redisTerminal.unsupportedBlocking',
} as const

async function runOne(command: string): Promise<WorkbenchResult> {
  const started = performance.now()
  const kind = classifyTerminalCommand(command)
  if (kind === 'subscribe' || kind === 'monitor' || kind === 'blocking') {
    return pack(command, t(blockedText[kind]), true, started)
  }
  if (kind === 'select-invalid') return pack(command, 'ERR invalid DB index', true, started)
  if (kind && typeof kind === 'object') {
    if (!share.conn) return pack(command, 'no connection', true, started)
    try {
      await meCommandsQuiet.selectDb(share.conn.id, kind.select)
      share.conn.db = kind.select
      bus.emit(DB_SWITCH, kind.select)
      return pack(command, 'OK', false, started)
    } catch (error: unknown) {
      return pack(command, formatSpectaErrorForUser(String(error)), true, started)
    }
  }
  if (!canEdit.value && !isReadonlyCommand(command)) {
    return pack(command, t('redisTerminal.readonlyWriteHint'), true, started)
  }
  if (!share.conn) return pack(command, 'no connection', true, started)
  try {
    const data = await meCommandsQuiet.workbenchExec(share.conn.id, {
      command,
      // 单机没有节点栏。集群跟终端一样：勾选广播且不选节点走命令路由，选了节点就只打那一个。
      node: share.conn.cluster ? session.value.node : '',
      autoBroadcast: share.conn.cluster ? session.value.autoBroadcast : true,
      outputMode: 'raw',
    })
    return pack(command, data.text, false, started, data.table)
  } catch (error: unknown) {
    return pack(command, formatSpectaErrorForUser(String(error)), true, started)
  }
}

/** 同一条（空白收成一样）再执行就提到最前。 */
function rememberHistory(command: string) {
  const key = collapseWorkbenchSpace(command)
  if (!key) return
  const prev = session.value.history ?? []
  session.value.history = [
    command,
    ...prev.filter(item => collapseWorkbenchSpace(item) !== key),
  ].slice(0, HISTORY_LIMIT)
}

/** 一次一条。同一段再执行就盖住原标签。 */
async function execute(command: string) {
  if (running.value || !command) return
  rememberHistory(command)
  running.value = true
  let result: WorkbenchResult
  try {
    result = await runOne(command)
  } finally {
    running.value = false
  }
  const applied = applyWorkbenchRun(session.value.tabs, result, () => `wb${(tabSeq += 1)}`)
  session.value.tabs = applied.tabs
  session.value.activeId = applied.activeId
}

function run() {
  if (!canRun.value) return
  const command = commandToRun()
  if (!command) return
  void execute(command)
}

function runHistory(command: string | number) {
  if (typeof command === 'string' && command) void execute(command)
}

function selectTab(id: string) {
  if (session.value.tabs.some(tab => tab.id === id)) session.value.activeId = id
}

function closeTab(id: string) {
  const tabs = session.value.tabs.filter(tab => tab.id !== id)
  session.value.tabs = tabs
  if (session.value.activeId === id) session.value.activeId = tabs.at(-1)?.id ?? ''
}

function clearResults() {
  session.value.tabs = []
  session.value.activeId = ''
}

function refreshTab(tab: WorkbenchTab) {
  void execute(tab.command)
}

function copyResult() {
  const tab = activeTab.value
  if (tab) meCopy(tab.text)
}

function setView(view: string | number | boolean | undefined) {
  const tab = activeTab.value
  if (!tab || (view !== 'text' && view !== 'table')) return
  if (view === 'table' && !tab.table) return
  tab.view = view
}

function columnTitle(name: string, command: string): string {
  const head = command.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? ''
  if (head === 'FT.INFO' && name === 'field') return t('redisWorkbench.field')
  if (head === 'FT.INFO' && name === 'value') return t('redisWorkbench.value')
  if (head === 'FT.SEARCH' && name === 'key') return t('redisWorkbench.key')
  if (head === 'FT.SEARCH' && name === 'score') return t('redisWorkbench.score')
  return name
}

const tableColumns = computed<MeColumn<WorkbenchRow>[]>(() => {
  const tab = activeTab.value
  const table = tab?.table
  if (!tab || !table) return []
  return table.columns.map((name, index) => ({
    key: `c${index}`,
    prop: `c${index}`,
    title: columnTitle(name, tab.command),
    minWidth: 140,
    className: table.keyColumn === index ? 'col-link' : undefined,
  }))
})

const tableRows = computed<WorkbenchRow[]>(() => {
  const rows = activeTab.value?.table?.rows ?? []
  return rows.map(row => {
    const item: WorkbenchRow = {}
    row.forEach((cell, index) => {
      item[`c${index}`] = cell
    })
    return item
  })
})

const viewOptions = ['text', 'table']

const showTruncated = computed(() => {
  const tab = activeTab.value
  if (!tab) return false
  return tab.view === 'table' ? !!tab.table?.truncated : tab.truncated
})

function cellText(row: unknown): string {
  if (!row || typeof row !== 'object' || !('c0' in row)) return ''
  const value = (row as WorkbenchRow).c0
  return typeof value === 'string' ? value : ''
}

/** 点 FT.SEARCH 的键，打开键值页。 */
function openDoc(key: string) {
  if (!key) return
  const redisKey = { key, bytes: '' }
  share.redisKey = redisKey
  share.tabName = 'value'
  bus.emit(KEY_REFRESH)
  connUi.scrollKeyToTree(redisKey)
}
</script>

<template>
  <div class="wb">
    <div class="wb-editor">
      <me-code
        ref="editorRef"
        v-model="session.script"
        mode="text"
        run-on-mod-enter
        :extra-extensions="editorExtensions"
        :placeholder="t('redisWorkbench.placeholder')"
        @caret="onCaret"
        @run="run()" />
      <!-- 与终端一样：浮在输入区右上角。只在集群出现。 -->
      <div v-if="share.conn?.cluster" class="wb-node me-flex">
        <el-tooltip
          raw-content
          :content="t('redisTerminal.broadcastHint')"
          placement="top"
          popper-style="max-width: 420px">
          <el-checkbox
            v-model="session.autoBroadcast"
            :label="t('redisTerminal.autoBroadcast')"
            style="margin-left: 10px" />
        </el-tooltip>
        <node-list v-model="session.node" clearable style="margin-left: 10px" />
      </div>
    </div>
    <div class="wb-bar">
      <div class="wb-mid">
        <div ref="tagsRef" class="wb-tags">
          <span v-if="!session.tabs.length" class="wb-pending">{{
            t('redisWorkbench.pending')
          }}</span>
          <el-tag
            v-for="tab in session.tabs"
            :key="tab.id"
            :class="{ 'is-current': tab.id === session.activeId }"
            :type="tab.error ? 'danger' : 'success'"
            :effect="tab.id === session.activeId ? 'light' : 'plain'"
            closable
            @click="selectTab(tab.id)"
            @close="closeTab(tab.id)">
            <me-overflow-text :content="tab.command" pre />
          </el-tag>
        </div>
        <me-icon
          class="icon-btn wb-icon"
          :class="{ 'is-disabled': !session.tabs.length }"
          icon="el-icon-delete"
          :info="t('redisWorkbench.clear')"
          @click="clearResults" />
        <el-dropdown
          trigger="click"
          placement="bottom-end"
          :disabled="!history.length"
          @command="runHistory">
          <me-icon
            class="icon-btn wb-icon"
            :class="{ 'is-disabled': !history.length }"
            icon="el-icon-clock"
            :info="t('redisWorkbench.history')" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="command in history" :key="command" :command="command">
                <span class="wb-history-item" :title="command">{{ workbenchTitle(command) }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <me-icon
          class="icon-btn wb-icon"
          :class="{ 'is-disabled': running || !canRun }"
          icon="el-icon-video-play"
          :info="runLabel"
          @click="run()" />
      </div>
    </div>
    <div class="wb-body">
      <div v-if="!activeTab" class="wb-empty">
        <el-empty :description="t('redisWorkbench.noResult')" />
      </div>
      <div v-else class="wb-pane">
        <div class="wb-fill">
          <!-- 回显已是 CLI 文本，没有原始字节可做编码识别。按内容特征推断 json/yaml/xml 等 -->
          <me-code
            v-if="activeTab.view !== 'table'"
            :key="activeTab.id"
            class="wb-result"
            :model-value="activeTab.text"
            mode="auto"
            read-only
            :error="activeTab.error" />
          <me-table
            v-else
            class="wb-table"
            :data="tableRows"
            :columns="tableColumns"
            export-name="workbench">
            <template #cell-c0="{ row }">
              <el-link
                v-if="activeTab.table?.keyColumn === 0"
                type="primary"
                underline="never"
                @click="openDoc(cellText(row))">
                {{ cellText(row) }}
              </el-link>
              <template v-else>{{ cellText(row) }}</template>
            </template>
          </me-table>
        </div>
        <div class="wb-foot">
          <div class="wb-foot-side">
            <me-icon
              class="icon-btn wb-icon"
              icon="el-icon-document-copy"
              :info="t('copy')"
              placement="top"
              @click="copyResult" />
            <me-icon
              class="icon-btn wb-icon"
              icon="el-icon-refresh-right"
              :info="t('redisWorkbench.refresh')"
              placement="top"
              @click="refreshTab(activeTab)" />
            <el-divider direction="vertical" />
            <span class="wb-note">
              {{ t('redisWorkbench.ms', { n: activeTab.ms }) }}
              <template v-if="showTruncated">{{
                t('redisWorkbench.truncated', { n: MAX_LINES })
              }}</template>
            </span>
            <template v-if="!activeTab.error">
              <el-divider direction="vertical" />
              <span class="wb-note">{{ t('redisWorkbench.len', { n: activeTab.len }) }}</span>
            </template>
          </div>
          <el-segmented
            v-if="activeTab.table"
            class="wb-view"
            :model-value="activeTab.view"
            :options="viewOptions"
            @change="setView">
            <template #default="scope">
              <me-icon
                v-if="scope.item === 'text'"
                :name="t('redisWorkbench.text')"
                icon="el-icon-document"
                hint
                placement="top" />
              <me-icon
                v-else
                :name="t('redisWorkbench.table')"
                icon="me-icon-table"
                hint
                placement="top" />
            </template>
          </el-segmented>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wb {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wb-editor {
  position: relative;
  flex: none;
  height: 33%;
  min-height: 0;
  overflow: hidden;
}

/* 与终端 .node 相同：浮在输入区右上角，盖在编辑器上 */
.wb-node {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
}

.wb-bar {
  flex: none;
  padding: 8px 0;
}

/* 标签高 24px。没结果时也留住，避免点执行后这一行变高 */
.wb-mid {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
}

/* 贴在结果区底部，高度与键值底栏一致。文本/表是否出现都不改这行高度 */
.wb-foot {
  height: 30px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  /* 与键值区 .value-main 底边距一致 */
  margin-top: 8px;
}

.wb-foot-side {
  display: flex;
  align-items: center;
  min-width: 0;

  /* 图标间距与键值底栏一致；竖线左右距用 el-divider 自带的 8px */
  > .wb-icon + .wb-icon {
    margin-left: 5px;
  }
}

.wb-history-item {
  display: block;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-icon {
  font-size: 18px;

  &.is-disabled {
    opacity: 0.4;
    pointer-events: none;
  }
}

.wb-view {
  height: 26px;
  min-height: 26px;
  font-size: 18px;

  :deep(.el-segmented__item) {
    padding: 0 6px;
  }
}

.wb-pending {
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
}

.wb-tags {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;

  :deep(.el-tag) {
    flex: none;
    /* 原先标题最多 48 字，宽度大约取一半 */
    max-width: 16em;
    overflow: hidden;
    cursor: pointer;
  }

  /* light 的底色已经标出当前项，边框补回和 plain 一样的深度 */
  :deep(.el-tag.is-current.el-tag--success) {
    --el-tag-border-color: var(--el-color-success-light-5);
  }

  /* 出错标签用点线红框，和下方回显区 is-decode-error 一致 */
  :deep(.el-tag.el-tag--danger) {
    border-style: dotted;
    --el-tag-border-color: var(--el-color-danger);
  }

  :deep(.el-tag__content) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  /* 宽度受标签限制，MeOverflowText 才能测出是否被省略 */
  :deep(.me-overflow-text) {
    display: block;
    max-width: 100%;
  }
}

.wb-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.wb-editor,
.wb-result {
  :deep(.cm-editor) {
    height: 100%;
    overflow: hidden;
  }
}

/* 铺满后空白处也能点到光标。去掉上下内边距，否则 min-height:100% 会多出一条滚动条 */
.wb-editor :deep(.cm-content) {
  min-height: 100%;
  padding-top: 0;
  padding-bottom: 0;
}

.wb-editor :deep(.cm-placeholder) {
  white-space: pre-wrap;
  max-width: 100%;
  line-height: 1.6;
}

.wb-result :deep(.cm-content) {
  min-height: 0;
}

.wb-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wb-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wb-note {
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}

.wb-fill {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wb-fill > .wb-table {
  position: absolute;
  inset: 0;
}

.wb-fill :deep(.col-link) {
  color: var(--el-color-primary);
}

.wb-fill > .wb-result {
  position: absolute;
  inset: 0;
  opacity: 1;
  cursor: text;

  :deep(*) {
    cursor: text !important;
  }
}
</style>
