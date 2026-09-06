<script setup lang="ts">
/** TTL 输入：前缀选时长/时刻；时长为数字+单位，时刻为日期时间。v-model 为秒（-1=永久）。已有正数 TTL 打开时回显为过期时刻。 */
import { useNow } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  formatUtcOffset,
  meTtlAlignAt,
  meTtlFromAt,
  meTtlSeconds,
  meTtlSplit,
  meTtlToAt,
  type TtlMode,
  type TtlUnit,
} from '@/utils/ttl'
import { meHumanSeconds } from '@/utils/util'

const DATETIME_FMT = 'YYYY-MM-DD HH:mm:ss'
const FOREVER_AT_FALLBACK_SEC = 3600

withDefaults(
  defineProps<{
    disabled?: boolean
    /** 行内：自适应宽度，给 Hash 字段那一行用 */
    compact?: boolean
  }>(),
  { disabled: false, compact: false },
)

const seconds = defineModel<number>({ default: -1 })
const { t } = useI18n()
const rootRef = useTemplateRef<HTMLElement>('rootRef')
/** tooltip 按秒刷新：时长→过期时刻前移，时刻→剩余倒计时 */
const now = useNow({ interval: 1000 })

defineExpose({ toSeconds, setDuration, syncFromSeconds, syncFromAt })

const mode = ref<TtlMode>('duration')
const amount = ref(-1)
const unit = ref<TtlUnit>('second')
const atDate = ref<Date>(meTtlToAt(FOREVER_AT_FALLBACK_SEC))
/** 从「永久」切到时刻；切回时长时恢复 -1，用户改过日期则不再恢复 */
const durationWasForever = ref(false)
let applyingFromSelf = false
let syncingFromModel = false
let skipAtWatch = false

const modeSelect = computed<TtlMode>({ get: () => mode.value, set: v => setMode(v) })

const modeOptions = computed(() => [
  { value: 'duration' as const, label: t('meTtl.duration') },
  { value: 'at' as const, label: t('meTtl.at') },
])

const modeSelectStyle = computed(() => ({ width: t('meTtl.modeWidth') + 'px' }))
const unitSelectStyle = computed(() => ({ width: t('meTtl.unitWidth') + 'px' }))

function applySplit(sec: number) {
  const split = meTtlSplit(sec)
  amount.value = split.amount
  unit.value = split.unit
}

function emitSeconds(sec: number) {
  applyingFromSelf = true
  seconds.value = sec
  void nextTick(() => {
    applyingFromSelf = false
  })
}

function currentDurationSeconds(): number {
  const n = Number(amount.value)
  if (n === -1) return -1
  if (!Number.isFinite(n)) return n
  return meTtlSeconds(n, unit.value)
}

function toSeconds(): number {
  if (mode.value === 'at') return meTtlFromAt(atDate.value)
  return currentDurationSeconds()
}

/** 快捷「10秒/1分…」：按时长回显，不要走已有 TTL 的时刻回显 */
function setDuration(sec: number) {
  syncingFromModel = true
  mode.value = 'duration'
  durationWasForever.value = sec === -1
  applySplit(sec)
  emitSeconds(sec)
  void nextTick(() => {
    syncingFromModel = false
  })
}

/** 外部写入：已有正数 TTL 回显为过期时刻，-1 回显为时长永久 */
function syncFromSeconds(sec: number) {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : -1
  if (n > 0) {
    syncFromAt(meTtlToAt(n))
    return
  }
  syncingFromModel = true
  durationWasForever.value = n === -1
  applySplit(n)
  mode.value = 'duration'
  void nextTick(() => {
    syncingFromModel = false
  })
}

/** 用已钉死的过期时刻回显，不再用 now+剩余秒重算 */
function syncFromAt(at: Date) {
  const aligned = meTtlAlignAt(at)
  const n = meTtlFromAt(aligned)
  syncingFromModel = true
  durationWasForever.value = false
  applySplit(n > 0 ? n : 1)
  skipAtWatch = true
  atDate.value = aligned
  mode.value = 'at'
  void nextTick(() => {
    skipAtWatch = false
    syncingFromModel = false
  })
}

function enterAtMode() {
  const current = currentDurationSeconds()
  durationWasForever.value = current === -1
  const sec = durationWasForever.value ? FOREVER_AT_FALLBACK_SEC : Math.max(current, 1)
  skipAtWatch = true
  atDate.value = meTtlToAt(sec)
  emitSeconds(sec)
  void nextTick(() => {
    skipAtWatch = false
  })
}

function leaveAtMode() {
  if (durationWasForever.value) {
    amount.value = -1
    unit.value = 'second'
    emitSeconds(-1)
    return
  }
  const sec = meTtlFromAt(atDate.value)
  applySplit(sec)
  emitSeconds(sec)
}

function setMode(next: TtlMode) {
  if (next === mode.value) return
  if (next === 'at') enterAtMode()
  else leaveAtMode()
  mode.value = next
}

watch(
  seconds,
  sec => {
    if (applyingFromSelf) return
    syncFromSeconds(sec)
  },
  { immediate: true },
)

watch([amount, unit], () => {
  if (mode.value !== 'duration' || syncingFromModel) return
  emitSeconds(currentDurationSeconds())
})

watch(atDate, d => {
  if (skipAtWatch || mode.value !== 'at' || !d) return
  const aligned = meTtlAlignAt(d)
  if (aligned.getTime() !== d.getTime()) {
    skipAtWatch = true
    atDate.value = aligned
    void nextTick(() => {
      skipAtWatch = false
    })
  }
  durationWasForever.value = false
  emitSeconds(meTtlFromAt(aligned))
})

const atIsPast = computed(
  () => mode.value === 'at' && meTtlFromAt(atDate.value, now.value.getTime()) <= 0,
)

/** 悬停对照：时长显示过期时刻（随当前时间前移），时刻显示剩余（倒计时）；永久不提示 */
const previewText = computed(() => {
  const nowMs = now.value.getTime()
  if (mode.value === 'at') {
    const remain = meTtlFromAt(atDate.value, nowMs)
    if (remain <= 0) return t('meTtl.past')
    return t('meTtl.previewRemain', { text: meHumanSeconds(remain) })
  }
  const sec = currentDurationSeconds()
  if (!(sec > 0)) return ''
  const ms = meTtlToAt(sec, nowMs).getTime()
  return t('meTtl.previewAt', { time: formatLocalDateTime(ms), offset: formatUtcOffset(ms) })
})

function formatLocalDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function disabledPastDate(d: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}
</script>

<template>
  <div ref="rootRef" class="me-ttl" :class="{ 'is-compact': compact }">
    <!-- 不包输入框，避免 tooltip 额外节点把 group 里的 select 高度挤乱 -->
    <el-tooltip
      :virtual-ref="rootRef"
      virtual-triggering
      :disabled="!previewText"
      :show-after="600"
      placement="top">
      <template #content>{{ previewText }}</template>
    </el-tooltip>

    <el-input v-if="mode === 'duration'" v-model.number="amount" :disabled>
      <template #prepend>
        <el-select v-model="modeSelect" :disabled :style="modeSelectStyle">
          <el-option
            v-for="opt in modeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value" />
        </el-select>
      </template>
      <template #append>
        <el-select v-model="unit" :disabled :style="unitSelectStyle">
          <el-option :label="t('timeUnit.second', amount)" value="second" />
          <el-option :label="t('timeUnit.minute', amount)" value="minute" />
          <el-option :label="t('timeUnit.hour', amount)" value="hour" />
          <el-option :label="t('timeUnit.day', amount)" value="day" />
        </el-select>
      </template>
    </el-input>

    <div v-else class="me-ttl-at el-input-group el-input-group--prepend">
      <div class="el-input-group__prepend">
        <el-select v-model="modeSelect" :disabled :style="modeSelectStyle">
          <el-option
            v-for="opt in modeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value" />
        </el-select>
      </div>
      <el-date-picker
        v-model="atDate"
        type="datetime"
        :format="DATETIME_FMT"
        :disabled-date="disabledPastDate"
        :disabled
        :clearable="false"
        :placeholder="t('meTtl.pickAt')"
        :class="{ 'is-error': atIsPast }" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.me-ttl {
  width: 100%;
}

.me-ttl.is-compact {
  width: auto;
  flex: 1;
  min-width: 290px;
  margin-right: 10px;
}

.me-ttl-at {
  display: flex;
  width: 100%;

  :deep(.el-date-editor) {
    flex: 1;
    width: auto;

    .el-input__wrapper {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }
}

// prepend/append 里的 select：取消默认 padding，触发器撑满高度、文字垂直居中
:deep(.el-input-group__prepend),
:deep(.el-input-group__append) {
  padding: 0;

  .el-select {
    margin: 0;
    height: var(--el-component-size);
  }

  .el-select__wrapper {
    min-height: var(--el-component-size);
    height: var(--el-component-size);
    box-shadow: none;
    background-color: transparent;
    padding: 0 11px;
  }
}

:deep(.el-date-editor.is-error .el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
</style>
