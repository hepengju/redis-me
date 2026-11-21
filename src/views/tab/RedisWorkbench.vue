<script setup lang="ts">
// 工作台：上编辑 33%、中结果标签、下文本。阶段 1 只有文本，表在阶段 2。输出固定 Raw。
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MeCode, { type MeCodeCaret } from '@/components/me-code/MeCode.vue'
import { isReadonlyCommand } from '@/locales/cmd'
import { shareProvideKey } from '@/types/me-interface'
import { bus, DB_SWITCH, formatSpectaErrorForUser, meCommandsQuiet, meWarn } from '@/utils/app/util'
import { classifyTerminalCommand } from '@/utils/redis/terminal-guard'
import {
  capResultLines,
  commandAt,
  splitWorkbenchScript,
  workbenchTitle,
} from '@/utils/redis/workbench-script'
import {
  applyWorkbenchRun,
  type WorkbenchResult,
  type WorkbenchTab,
} from '@/utils/redis/workbench-tabs'

const MAX_LINES = 1000

const { t } = useI18n()
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)

interface Session {
  script: string
  tabs: WorkbenchTab[]
  activeId: string
}

/** 按连接记着。切走页签组件还在；换连接互不覆盖。关应用即丢。 */
const sessions = new Map<string, Session>()

function blankSession(): Session {
  return { script: '', tabs: [], activeId: '' }
}

const session = ref<Session>(blankSession())
const running = ref(false)
const hasSelection = ref(false)
const editorRef = useTemplateRef<InstanceType<typeof MeCode>>('editorRef')
let tabSeq = 0

watch(
  () => share.conn?.id,
  (id, prev) => {
    if (prev) sessions.set(prev, session.value)
    const next = (id && sessions.get(id)) || blankSession()
    session.value = next
    hasSelection.value = false
    if (id) sessions.set(id, next)
  },
  { immediate: true },
)

const activeTab = computed(() => session.value.tabs.find(tab => tab.id === session.value.activeId))
const runLabel = computed(() =>
  t(hasSelection.value ? 'redisWorkbench.runSelection' : 'redisWorkbench.runCurrent'),
)

function onCaret(caret: MeCodeCaret) {
  hasSelection.value = !caret.empty
}

type RunMode = 'main' | 'selection' | 'current' | 'all'

const runMenu: { mode: Exclude<RunMode, 'main'>; label: string }[] = [
  { mode: 'selection', label: 'redisWorkbench.runSelection' },
  { mode: 'current', label: 'redisWorkbench.runCurrent' },
  { mode: 'all', label: 'redisWorkbench.runAll' },
]

function commandsFor(mode: RunMode): string[] {
  const caret = editorRef.value?.caret()
  const doc = caret?.doc ?? session.value.script
  if (mode === 'all') return splitWorkbenchScript(doc).map(command => command.text)
  const selected =
    caret && !caret.empty
      ? doc.slice(Math.min(caret.from, caret.to), Math.max(caret.from, caret.to))
      : ''
  if (mode === 'selection' || (mode === 'main' && selected)) {
    return splitWorkbenchScript(selected).map(command => command.text)
  }
  const hit = commandAt(splitWorkbenchScript(doc), caret?.head ?? doc.length)
  return hit ? [hit.text] : []
}

function pack(command: string, text: string, error: boolean, started: number): WorkbenchResult {
  const capped = capResultLines(text, MAX_LINES)
  return {
    command,
    title: workbenchTitle(command),
    text: capped.text,
    error,
    ms: Math.round(performance.now() - started),
    truncated: capped.truncated,
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
    const data = await meCommandsQuiet.executeCommand(share.conn.id, {
      command,
      node: '',
      autoBroadcast: false,
      outputMode: 'raw',
    })
    return pack(command, data, false, started)
  } catch (error: unknown) {
    return pack(command, formatSpectaErrorForUser(String(error)), true, started)
  }
}

/** 顺序执行。失败停下。重复命令覆盖原标签，新命令追加。 */
async function execute(commands: string[]) {
  if (running.value || commands.length === 0) return
  running.value = true
  const results: WorkbenchResult[] = []
  try {
    for (const command of commands) {
      const result = await runOne(command)
      results.push(result)
      if (result.error) break
    }
  } finally {
    running.value = false
  }
  const applied = applyWorkbenchRun(session.value.tabs, results, () => `wb${(tabSeq += 1)}`)
  session.value.tabs = applied.tabs
  session.value.activeId = applied.activeId
}

function run(mode: RunMode) {
  const commands = commandsFor(mode)
  if (commands.length === 0) {
    meWarn(t('redisWorkbench.empty'))
    return
  }
  void execute(commands)
}

function selectTab(id: string) {
  if (session.value.tabs.some(tab => tab.id === id)) session.value.activeId = id
}

function closeTab(id: string) {
  const tabs = session.value.tabs.filter(tab => tab.id !== id)
  session.value.tabs = tabs
  if (session.value.activeId === id) session.value.activeId = tabs.at(-1)?.id ?? ''
}

function refreshTab(tab: WorkbenchTab) {
  void execute([tab.command])
}

function onMenuCommand(command: string | number) {
  if (command === 'selection' || command === 'current' || command === 'all') void run(command)
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
        :placeholder="t('redisWorkbench.placeholder')"
        @caret="onCaret"
        @run="run('main')" />
    </div>
    <div class="wb-mid">
      <span>{{ t('redisWorkbench.results') }}</span>
      <div class="wb-tags">
        <el-tag
          v-for="tab in session.tabs"
          :key="tab.id"
          :type="tab.error ? 'warning' : 'success'"
          :effect="tab.id === session.activeId ? 'dark' : 'plain'"
          closable
          @click="selectTab(tab.id)"
          @close="closeTab(tab.id)">
          {{ tab.title }}
        </el-tag>
      </div>
      <el-dropdown
        split-button
        type="primary"
        :disabled="running"
        @click="run('main')"
        @command="onMenuCommand">
        <me-icon icon="el-icon-video-play" :info="runLabel" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in runMenu" :key="item.mode" :command="item.mode">{{
              t(item.label)
            }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="wb-body">
      <div v-if="!activeTab" class="wb-empty">{{ t('redisWorkbench.noResult') }}</div>
      <div v-else class="wb-pane">
        <me-code
          :key="activeTab.id"
          class="wb-result"
          :model-value="activeTab.text"
          mode="text"
          read-only
          copyable
          :error="activeTab.error" />
        <me-icon
          class="wb-refresh"
          icon="el-icon-refresh"
          :info="t('redisWorkbench.refresh')"
          @click="refreshTab(activeTab)" />
        <span class="wb-ms">
          {{ t('redisWorkbench.ms', { n: activeTab.ms }) }}
          <template v-if="activeTab.truncated">{{
            t('redisWorkbench.truncated', { n: MAX_LINES })
          }}</template>
        </span>
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
  flex: none;
  height: 33%;
  min-height: 0;
  overflow: hidden;
}

.wb-mid {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding: 8px 0;
}

.wb-tags {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;

  :deep(.el-tag) {
    cursor: pointer;
  }
}

.wb-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wb-editor,
.wb-result {
  :deep(.cm-editor) {
    height: 100%;
    overflow: hidden;
  }

  /* 内容 min-height:100% 再加内边距，短文本也会撑出右侧滚动条 */
  :deep(.cm-content) {
    min-height: 0;
  }
}

.wb-empty {
  color: var(--el-text-color-placeholder);
}

.wb-pane {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.wb-refresh {
  position: absolute;
  z-index: 4;
  right: 36px;
  bottom: 8px;
  cursor: pointer;
  color: var(--el-text-color-secondary);

  &:hover {
    color: var(--el-color-primary);
  }
}

.wb-ms {
  position: absolute;
  z-index: 4;
  left: 8px;
  bottom: 6px;
  display: flex;
  gap: 8px;
  padding: 0 4px;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  pointer-events: none;
}

.wb-pane > .wb-result {
  position: absolute;
  inset: 0;
  opacity: 1;
  cursor: text;

  :deep(*) {
    cursor: text !important;
  }

  :deep(.me-code-copy) {
    cursor: pointer !important;
  }
}
</style>
