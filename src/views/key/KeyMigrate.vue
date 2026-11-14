<script setup lang="ts">
// 跨连接键传输对话框：总菜单 / 连接扩展入口共用
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useVirtualList } from '@vueuse/core'
import type { FormItemRule } from 'element-plus'
import { cloneDeep } from 'lodash'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import type {
  RedisKey_Deserialize,
  RedisMigrateParam_Deserialize,
  ScanCursor,
} from '@/types/tauri-specta'
import { connsInGroupOrder, getConnIcon } from '@/utils/conn'
import {
  formatSpectaErrorForUser,
  meCommands,
  meConfirm,
  meCopy,
  meOk,
  meWarn,
  sleep,
} from '@/utils/util'

type KeyMigrateOpenData = {
  /** 扩展入口锁定源连接 */
  sourceLocked?: boolean
  sourceConnId?: string
  sourceDb?: number
  keyList?: RedisKey_Deserialize[]
  match?: string
}

/** 后端 EVENT_MIGRATE 载荷（specta 未导出事件类型） */
type MigrateProgressPayload = {
  id: string
  okCount: number
  errCount: number
  ignoreCount: number
  totalCount: number
  finished: boolean
  currentKey?: string
  /** 本条进度是一次失败时才有 */
  errorKey?: string
  errorMessage?: string
}

type MigrateFailure = { key: string; message: string }

type KeyMigrateForm = {
  sourceConnId: string
  targetConnId: string
  sourceDb: number
  targetDb: number
  match: string
  keyList: RedisKey_Deserialize[]
  mode: 'restore' | 'command'
  handleConflict: 'skip' | 'replace'
  onError: 'continue' | 'stop'
  migrateDirect: boolean
}

function emptyProgress() {
  return { okCount: 0, errCount: 0, ignoreCount: 0, totalCount: 0, currentKey: '', percentage: 0 }
}

const { t } = useI18n()
const emit = defineEmits<{ closed: [] }>()
defineExpose({ open })

const share = inject(shareProvideKey)!

const visible = ref(false)
const loading = ref(false)
const migrating = ref(false)
/** 本轮已结束（成功或失败摘要已出），保留进度供查看，等用户关窗 */
const migrateDone = ref(false)
/** 用户点了取消，结束 toast / 进度条状态用「已取消」而非「完成」 */
const cancelledByUser = ref(false)
const sourceLocked = ref(false)
const checkedKeys = ref(false)
const taskId = ref('')
const formBusy = computed(() => migrating.value || loading.value || migrateDone.value)

const progress = ref(emptyProgress())
/** 失败键与原因，只供「复制失败明细」，不在对话框里展开 */
const failures = ref<MigrateFailure[]>([])

const initForm: KeyMigrateForm = {
  sourceConnId: '',
  targetConnId: '',
  sourceDb: 0,
  targetDb: 0,
  match: '*',
  keyList: [],
  mode: 'restore',
  handleConflict: 'skip',
  onError: 'continue',
  migrateDirect: true,
}
const form = ref<KeyMigrateForm>(cloneDeep(initForm))

const connOptions = computed(() =>
  connsInGroupOrder(
    share.connList,
    Array.isArray(meTauri.settings.connGroups) ? meTauri.settings.connGroups : [],
  ),
)

function findConn(id: string) {
  return connOptions.value.find(c => c.id === id)
}

const sourceConn = computed(() => findConn(form.value.sourceConnId))
const targetConn = computed(() => findConn(form.value.targetConnId))

const modeOptions = computed(() => [
  { label: t('keyMigrate.modeRestore'), value: 'restore' as const },
  { label: t('keyMigrate.modeCommand'), value: 'command' as const },
])
const conflictOptions = computed(() => [
  { label: t('keyMigrate.skip'), value: 'skip' as const },
  { label: t('keyMigrate.replace'), value: 'replace' as const },
])
const onErrorOptions = computed(() => [
  { label: t('keyMigrate.onErrorContinue'), value: 'continue' as const },
  { label: t('keyMigrate.onErrorStop'), value: 'stop' as const },
])

const sameSourceTarget = computed(
  () =>
    !!form.value.sourceConnId &&
    form.value.sourceConnId === form.value.targetConnId &&
    form.value.sourceDb === form.value.targetDb,
)

/** 源/目标未选齐，或同连接同库时，禁止开始迁移 */
const startDisabled = computed(
  () =>
    !form.value.sourceConnId ||
    !form.value.targetConnId ||
    sameSourceTarget.value ||
    scanning.value,
)

const rules = computed((): Record<string, FormItemRule[]> => {
  const r: Record<string, FormItemRule[]> = {
    sourceConnId: [{ required: true, message: t('keyMigrate.sourceRequired') }],
    targetConnId: [{ required: true, message: t('keyMigrate.targetRequired') }],
  }
  if (!checkedKeys.value) {
    r.match = [{ required: true, message: t('keyBatch.matchRequired') }]
  }
  return r
})

function open(data: KeyMigrateOpenData = {}) {
  resetScanState()
  unlistenProgress()
  migrating.value = false
  migrateDone.value = false
  cancelledByUser.value = false
  progress.value = emptyProgress()
  failures.value = []
  Object.assign(form.value, cloneDeep(initForm))
  sourceLocked.value = !!data.sourceLocked
  const keyList = data.keyList ?? []
  checkedKeys.value = keyList.length > 0
  showScan.value = !checkedKeys.value
  if (checkedKeys.value) scanFinished.value = true

  form.value.keyList = cloneDeep(keyList)
  form.value.match = data.match || (checkedKeys.value ? '' : '*')
  form.value.migrateDirect = !checkedKeys.value

  if (data.sourceConnId) {
    form.value.sourceConnId = data.sourceConnId
    form.value.sourceDb = data.sourceDb ?? 0
  } else if (share.conn) {
    form.value.sourceConnId = share.conn.id
    form.value.sourceDb = share.conn.db
  }
  form.value.targetDb = form.value.sourceDb
  visible.value = true
}

const formRef = useTemplateRef('formRef')
let unlisten: UnlistenFn | null = null

function unlistenProgress() {
  if (unlisten) {
    void unlisten()
    unlisten = null
  }
}

async function startMigrate() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (sameSourceTarget.value) {
    meWarn(t('keyMigrate.sameSourceTarget'))
    return
  }
  if (!checkedKeys.value && !form.value.migrateDirect && !scanFinished.value) {
    meWarn(t('keyMigrate.needScanOrDirect'))
    return
  }
  if (!checkedKeys.value && !form.value.migrateDirect && form.value.keyList.length === 0) {
    meWarn(t('keyMigrate.emptyKeys'))
    return
  }
  const run = () => void doStartMigrate()
  if (!checkedKeys.value && (form.value.match === '*' || form.value.match === '')) {
    meConfirm(t('keyMigrate.wholeDbConfirm'), run)
  } else {
    run()
  }
}

async function doStartMigrate() {
  loading.value = true
  try {
    const probe = await meCommands.migrateProbe({
      sourceConnId: form.value.sourceConnId,
      targetConnId: form.value.targetConnId,
      sourceDb: form.value.sourceDb,
      targetDb: form.value.targetDb,
      mode: form.value.mode,
    })
    if (!probe.ok) {
      meWarn(
        form.value.mode === 'restore'
          ? t('keyMigrate.probeRestoreFail', { message: probe.message })
          : t('keyMigrate.probeCommandFail', { message: probe.message }),
      )
      return
    }

    taskId.value = `migrate-${Date.now()}`
    progress.value = emptyProgress()
    failures.value = []
    migrating.value = true
    cancelledByUser.value = false

    unlistenProgress()
    unlisten = await listen<MigrateProgressPayload>('migrate', event => {
      const p = event.payload
      if (p.id !== taskId.value) return
      const done = p.okCount + p.errCount + p.ignoreCount
      const percentage =
        p.totalCount > 0 ? Math.round((done / p.totalCount) * 100) : p.finished ? 100 : 0
      progress.value = {
        okCount: p.okCount,
        errCount: p.errCount,
        ignoreCount: p.ignoreCount,
        totalCount: p.totalCount,
        currentKey: p.currentKey || '',
        percentage,
      }
      if (p.errorMessage) {
        failures.value.push({ key: p.errorKey || '', message: migrateFailText(p.errorMessage) })
      }

      if (p.finished) {
        migrating.value = false
        migrateDone.value = true
        unlistenProgress()
        // 数量已在对话框进度区，这里只轻提示；不关窗，便于核对成功/失败/跳过
        meOk(t(cancelledByUser.value ? 'keyMigrate.cancelled' : 'keyMigrate.done'))
      }
    })

    const param: RedisMigrateParam_Deserialize = {
      taskId: taskId.value,
      sourceConnId: form.value.sourceConnId,
      targetConnId: form.value.targetConnId,
      sourceDb: form.value.sourceDb,
      targetDb: form.value.targetDb,
      match: checkedKeys.value ? '' : form.value.match || '*',
      keyList: checkedKeys.value || !form.value.migrateDirect ? form.value.keyList : [],
      mode: form.value.mode,
      handleConflict: form.value.handleConflict,
      onError: form.value.onError,
    }
    await meCommands.migrateKeys(param)
  } catch {
    migrating.value = false
    unlistenProgress()
  } finally {
    loading.value = false
  }
}

/** Redis 客户端错误常带这段前缀，界面只留服务端原文 */
function migrateFailText(raw: string) {
  const text = formatSpectaErrorForUser(raw).trim()
  const marker = 'signalled by the server: '
  const i = text.indexOf(marker)
  return i >= 0 ? text.slice(i + marker.length) : text
}

function copyFailures() {
  const text = failures.value
    .map(item => (item.key ? `${item.key}\t${item.message}` : item.message))
    .join('\n')
  meCopy(text)
}

async function cancelMigrate() {
  cancelledByUser.value = true
  await meCommands.migrateStop()
}

function onDialogClosed() {
  if (migrating.value) void cancelMigrate()
  resetScanState()
  unlistenProgress()
  migrating.value = false
  migrateDone.value = false
  cancelledByUser.value = false
  emit('closed')
}

// #region 扫描预览（仅当前源已打开时可扫；否则请用直接迁移）
const scanning = ref(false)
const scanPaused = ref(false)
const scanCancelled = ref(false)
const scanFinished = ref(false)
const showScan = ref(true)
const scanCursor = ref<ScanCursor | null>(null)

watch(
  () => form.value.match,
  () => {
    if (!checkedKeys.value) void abortScanAndResetList()
  },
)

function resetScanState() {
  scanCancelled.value = true
  scanPaused.value = false
  scanFinished.value = false
  scanCursor.value = null
}

async function abortScanAndResetList() {
  scanCancelled.value = true
  scanPaused.value = false
  while (scanning.value) await sleep(20)
  showScan.value = true
  if (!checkedKeys.value) form.value.keyList = []
  scanCursor.value = null
  scanFinished.value = false
}

/** 预览扫描走顶栏已打开会话，须与源连接+源 DB 一致，否则会扫错库 */
const canPreviewScan = computed(
  () =>
    !!share.conn &&
    share.conn.id === form.value.sourceConnId &&
    share.conn.db === form.value.sourceDb,
)

async function startOrResumeScan() {
  if (!canPreviewScan.value || scanning.value) {
    if (!canPreviewScan.value) meWarn(t('keyMigrate.scanNeedOpenSource'))
    return
  }
  if (showScan.value) {
    form.value.keyList = []
    scanCursor.value = null
    scanFinished.value = false
    showScan.value = false
  }
  scanning.value = true
  scanCancelled.value = false
  scanPaused.value = false
  try {
    const count = (meTauri.settings.keyScanCount as number) || 1000
    while (!scanCancelled.value && !scanPaused.value) {
      const data = await meCommands.scan(share.conn!.id, {
        match: form.value.match,
        type: '',
        cursor: scanCursor.value,
        exact: false,
        count,
      })
      if (scanCancelled.value) break
      form.value.keyList = form.value.keyList.concat(data.keyList)
      scanCursor.value = data.cursor
      if (data.cursor.finished) {
        scanFinished.value = true
        break
      }
    }
  } catch {
    scanPaused.value = true
  } finally {
    scanning.value = false
  }
}

function pauseScan() {
  scanPaused.value = true
}
function cancelScan() {
  void abortScanAndResetList()
}

const items = computed(() => form.value.keyList)
const { list, containerProps, wrapperProps } = useVirtualList(items, { itemHeight: 14 })

const scanStatusText = computed(() => {
  if (scanFinished.value) return t('keyBatch.scanDone')
  if (scanning.value) return t('keyBatch.scanScanning')
  if (scanPaused.value) return t('keyBatch.scanPaused')
  return ''
})
// #endregion
</script>

<template>
  <el-dialog
    :title="t('keyMigrate.title')"
    v-model="visible"
    :width="600"
    align-center
    :show-close="!migrating"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="onDialogClosed"
    destroy-on-close>
    <el-form ref="formRef" :model="form" :rules label-position="top" :disabled="formBusy">
      <el-row :gutter="12">
        <el-col :span="16">
          <el-form-item :label="t('keyMigrate.source')" prop="sourceConnId">
            <el-select
              v-model="form.sourceConnId"
              filterable
              :disabled="sourceLocked || formBusy"
              style="width: 100%">
              <el-option v-for="c in connOptions" :key="c.id" :label="c.name" :value="c.id">
                <div :style="{ color: c.color }">
                  <me-icon :icon="getConnIcon(c)" :name="c.name" />
                </div>
              </el-option>
              <template #label>
                <div v-if="sourceConn" :style="{ color: sourceConn.color }">
                  <me-icon :icon="getConnIcon(sourceConn)" :name="sourceConn.name" />
                </div>
              </template>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item :label="t('keyMigrate.sourceDb')">
            <el-input-number
              v-model="form.sourceDb"
              :min="0"
              :max="255"
              :disabled="sourceLocked || formBusy" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :span="16">
          <el-form-item :label="t('keyMigrate.target')" prop="targetConnId">
            <el-select v-model="form.targetConnId" filterable style="width: 100%">
              <el-option v-for="c in connOptions" :key="c.id" :label="c.name" :value="c.id">
                <div :style="{ color: c.color }">
                  <me-icon :icon="getConnIcon(c)" :name="c.name" />
                </div>
              </el-option>
              <template #label>
                <div v-if="targetConn" :style="{ color: targetConn.color }">
                  <me-icon :icon="getConnIcon(targetConn)" :name="targetConn.name" />
                </div>
              </template>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item :label="t('keyMigrate.targetDb')">
            <el-input-number v-model="form.targetDb" :min="0" :max="255" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-text v-if="sameSourceTarget" type="danger" class="tip-block">{{
        t('keyMigrate.sameSourceTarget')
      }}</el-text>

      <el-row :gutter="12">
        <el-col :span="10">
          <el-form-item :label="t('keyMigrate.mode')">
            <el-segmented v-model="form.mode" :options="modeOptions" />
          </el-form-item>
        </el-col>
        <el-col :span="7">
          <el-form-item :label="t('keyMigrate.handleConflict')">
            <el-segmented v-model="form.handleConflict" :options="conflictOptions" />
          </el-form-item>
        </el-col>
        <el-col :span="7">
          <el-form-item :label="t('keyMigrate.onError')">
            <el-segmented v-model="form.onError" :options="onErrorOptions" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-text type="info" class="tip-block">{{ t('keyMigrate.modeTip') }}</el-text>

      <el-form-item :label="t('keyBatch.match')" prop="match" v-if="!checkedKeys">
        <el-input v-model="form.match" :disabled="scanning" />
        <el-checkbox v-model="form.migrateDirect" v-if="form.keyList.length === 0 && !scanning">{{
          t('keyMigrate.migrateDirect')
        }}</el-checkbox>
      </el-form-item>

      <el-form-item
        v-if="checkedKeys || !showScan"
        :label="t('keyBatch.impactKeys', { count: form.keyList.length }, form.keyList.length)">
        <div v-bind="containerProps" :style="{ height: '120px', width: '100%' }">
          <div v-bind="wrapperProps">
            <div v-for="item in list" :key="item.index" class="key single-line-ellipsis">
              {{ item.data.key }}
            </div>
          </div>
        </div>
        <el-text v-if="!checkedKeys" type="info" class="scan-progress-tip">
          {{ t('keyBatch.scanProgress', { count: form.keyList.length }) }}
          <template v-if="scanStatusText"> · {{ scanStatusText }}</template>
        </el-text>
      </el-form-item>
    </el-form>

    <div v-if="migrating || migrateDone" class="migrate-progress">
      <el-progress
        :percentage="progress.percentage"
        :status="
          migrateDone
            ? cancelledByUser || progress.errCount > 0
              ? 'warning'
              : 'success'
            : undefined
        " />
      <el-text type="info" class="progress-meta">
        {{
          t('keyMigrate.progressTip', {
            ok: progress.okCount,
            err: progress.errCount,
            skip: progress.ignoreCount,
            total: progress.totalCount,
          })
        }}
      </el-text>
      <el-text v-if="progress.currentKey && migrating" truncated class="progress-key">{{
        progress.currentKey
      }}</el-text>
    </div>

    <template #footer>
      <div class="me-dialog-footer">
        <el-button v-if="failures.length" link type="danger" @click="copyFailures">{{
          t('keyMigrate.copyFails')
        }}</el-button>
        <div class="footer-btns">
          <el-button v-if="migrating" type="warning" @click="cancelMigrate">{{
            t('keyMigrate.cancelMigrate')
          }}</el-button>
          <el-button v-else-if="migrateDone" type="primary" @click="visible = false">{{
            t('ok')
          }}</el-button>
          <el-button v-else @click="visible = false">{{ t('cancel') }}</el-button>

          <template v-if="!migrating && !migrateDone && !checkedKeys && !form.migrateDirect">
            <el-button
              type="primary"
              :loading="scanning"
              @click="startOrResumeScan"
              v-if="showScan"
              >{{ t('keyBatch.showImpactKeys') }}</el-button
            >
            <template v-else-if="scanning">
              <el-button @click="cancelScan">{{ t('keyBatch.cancelScan') }}</el-button>
              <el-button type="warning" @click="pauseScan">{{ t('keyMain.pauseScan') }}</el-button>
            </template>
            <template v-else-if="scanPaused && !scanFinished">
              <el-button @click="cancelScan">{{ t('keyBatch.cancelScan') }}</el-button>
              <el-button type="primary" @click="startOrResumeScan">{{
                t('keyMain.resumeScan')
              }}</el-button>
            </template>
            <el-button
              v-else
              type="primary"
              :loading="loading"
              :disabled="startDisabled || !scanFinished || form.keyList.length === 0"
              @click="startMigrate"
              >{{
                t('keyMigrate.start', { count: form.keyList.length }, form.keyList.length)
              }}</el-button
            >
          </template>
          <el-button
            v-else-if="!migrating && !migrateDone"
            type="primary"
            :loading="loading"
            :disabled="startDisabled"
            @click="startMigrate"
            >{{
              checkedKeys
                ? t('keyMigrate.start', { count: form.keyList.length }, form.keyList.length)
                : t('keyMigrate.startDirect')
            }}</el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.key {
  font-size: 14px;
  line-height: 14px;
  padding: 3px 4px;
  color: var(--el-color-info);
}
.tip-block {
  display: block;
  margin: -4px 0 12px;
  font-size: 12px;
  line-height: 1.5;
}
/* 与 KeyBatch 导出页一致：列表下方留空，避免贴紧键名 */
.scan-progress-tip {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
}
/* 贴紧表单末项，进度条与下方统计拉开一点 */
.migrate-progress {
  margin-top: -15px;
}
.progress-meta,
.progress-key {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.5;
}
.progress-key {
  margin-top: 4px;
}
</style>
