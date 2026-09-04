<script setup lang="ts">
// #region 导入
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
  watchEffect,
} from 'vue'
import { useI18n } from 'vue-i18n'

import MeSelectUpDownIcon from '@/components/MeSelectUpDownIcon.vue'
import { shareProvideKey, connUiProvideKey } from '@/types/me-interface'
import type {
  FieldScanResult,
  RedisFieldAsCommand_Deserialize,
  RedisFieldDel_Deserialize,
  RedisFieldGet_Deserialize,
  RedisFieldValue,
  RedisKey_Deserialize,
  ScanCursor,
} from '@/types/tauri-specta'
import {
  detectViewFormat,
  detectedViewLabel,
  type DetectedViewFormat,
} from '@/utils/detect-view-format'
import type { TableExportMatrix } from '@/utils/export'
import { useFavorites, addFavorite, removeFavorite, isFavorited } from '@/utils/favorite'
import {
  IPC_WIRE_FORMAT,
  VIEW_FORMAT_OPTIONS,
  customFormatName,
  customFormatValue,
  isCustomView,
  isReadonlyView,
  isStringOnlyView,
  isViewDecodeError,
  meFormatViewValue,
  meFormatViewValueAsync,
  meViewToWire,
  meViewToWireAsync,
  needsJsonNormalize,
  readonlyViewTip,
  viewFmtForField,
  type ViewBytesFormat,
} from '@/utils/format'
import { resolveKeyType } from '@/utils/key-type-cache'
import { toKeyTypeLabel } from '@/utils/redis-display'
import {
  buildScanPattern,
  buildLocalFilterPattern,
  compileRedisGlobFilter,
  computeScanProgress,
} from '@/utils/redis-glob'
import { defaultSettings } from '@/utils/settings-defaults'
import {
  bus,
  KEY_DELETE,
  KEY_REFRESH,
  meCommands,
  meConfirm,
  meCopy,
  meDeleteKey,
  meErr,
  meHumanSeconds,
  estimateStringMemory,
  meHumanSize,
  meFormatDisplayValue,
  meJsonNormal,
  meOk,
  meWarn,
  sleep,
} from '@/utils/util'
import CommandHelp from '@/views/ext/CommandHelp.vue'
import FieldAdd from '@/views/ext/FieldAdd.vue'
import TTLSet from '@/views/ext/TTLSet.vue'
import KeyRename from '@/views/key/KeyRename.vue'

import CustomCodec from './CustomCodec.vue'
import FieldSet from './FieldSet.vue'
import {
  KEY_TYPE_TO_GROUP,
  fieldValueRows,
  isAppErrorCode,
  isStringLikeType,
  listRowRedisIndex,
  mergeFieldScanPage,
  parseListIndexInput,
  shouldFieldScanAuto,
  streamIdToDate,
  supportsFieldRowRefresh,
  supportsFieldServerScan,
  supportsTableView,
  toViewState,
  type FieldScanViewState,
  type ValueTableRow,
} from './helpers'
import TableArLastItems from './TableArLastItems.vue'
import TableGroup from './TableGroup.vue'
import TableHashKeys from './TableHashKeys.vue'
import TableInfo from './TableInfo.vue'
import TableVSim from './TableVSim.vue'
import TableZsetRange from './TableZsetRange.vue'
import ValueShortcut from './ValueShortcut.vue'
// #endregion

// 键值详情页：fieldScan 拉取（IPC 恒 base64）→ 前端按数据编码展示 → set / field* 写回。
// 数据流：srcWire 不被展示覆盖；切编码只重算展示，不打 Redis。

// #region 共享上下文与权限
const { t } = useI18n()
const share = inject(shareProvideKey)!
const connUi = inject(connUiProvideKey)!
const canEdit = computed(() => !share.readonly)
// #endregion

// #region 核心状态与键类型
// 基础
const redisValue = ref<FieldScanViewState | null>(null)
const cursor = ref<ScanCursor | null>(null) // list/hash/set/zset/stream 分页游标
const loading = ref(false)
const isPretty = ref(true)

// 键类型派生
const stringType = computed(() => 'string' === redisValue.value?.type)
const jsonType = computed(() => 'json' === redisValue.value?.type)
const streamType = computed(() => 'stream' === redisValue.value?.type)
const hashType = computed(() => 'hash' === redisValue.value?.type)
const listType = computed(() => 'list' === redisValue.value?.type)
const arrayType = computed(() => 'array' === redisValue.value?.type)
const vectorsetType = computed(() => 'vectorset' === redisValue.value?.type)
const setType = computed(() => 'set' === redisValue.value?.type)
const zsetType = computed(() => 'zset' === redisValue.value?.type)

// Hash 字段 TTL（HTTL）
const scanHashFieldTtl = ref(false)
const showHashFieldTtlOption = computed(() => hashType.value && share.capabilities.httlSupported)

// 表格工具栏：关键词（Hash/Set/ZSet 兼扫描+本地过滤；List/Stream 仅本地过滤）
const fieldKeyword = ref('')
const fieldExact = ref(false)
const fieldMatch = computed(() => buildScanPattern(fieldKeyword.value, fieldExact.value))

// 扫描过程状态（暂停 / 批次数 / 每批条数）
const scanCancelled = ref(false)
const scanPaused = ref(false)
const scanLoadAll = ref(false)
const scanBatchCount = ref(0)
const FIELD_SCAN_FETCH_COUNT = computed(() => meTauri.settings.fieldScanCount as number)

// 扫描工具栏展示（进度环、精确勾选、占位符）
const SCAN_CONTROL_MIN_BATCHES = 10
const showScanControl = computed(() => {
  if (!supportsTableView(redisValue.value?.type)) return false
  return scanPaused.value || (loading.value && scanBatchCount.value >= SCAN_CONTROL_MIN_BATCHES)
})
const showFieldExactCheckbox = computed(() => supportsFieldServerScan(redisValue.value?.type))
// Array / VectorSet 无服务端 MATCH：输入框仅本地过滤；精确勾选走 ARGET / VISMEMBER
const fieldScanInputPlaceholder = computed(() =>
  listType.value || streamType.value || arrayType.value || vectorsetType.value
    ? t('redisValue.listStreamFilterPlaceholder')
    : t('redisValue.fieldScanPlaceholder'),
)
const fieldExactSearchTip = computed(() => {
  if (arrayType.value) return t('redisValue.fieldExactSearchArray')
  if (vectorsetType.value) return t('redisValue.fieldExactSearchVectorSet')
  return t('redisValue.fieldExactSearch')
})
const scanToggleTip = computed(() =>
  loading.value ? t('keyMain.pauseScan') : t('keyMain.resumeScan'),
)
const scanProgress = computed(() =>
  computeScanProgress(
    scanBatchCount.value,
    FIELD_SCAN_FETCH_COUNT.value,
    redisValue.value?.length ?? 0,
    Boolean(cursor.value?.finished),
  ),
)

// 加载结果同步到编辑器 / 「加载更多」按钮
const suppressCodeUpdate = ref(false)
const valueEditorRemountKey = ref(0) // fieldScan 后强制 me-code remount
const showMore = ref(false) // 手动控制，避免 cursor 变化导致按钮闪现

// VectorSet 浏览模式：随机采样（默认，全版本支持）/ 范围查询（需 ≥ 8.4，不支持时报错提示）
const vectorsetSample = ref(true)
const vectorsetBrowseOptions = computed(() => [
  { label: t('redisValue.vectorsetSample'), value: true },
  { label: t('redisValue.vectorsetRange'), value: false },
])

// STRING 大值截断预览
const VALUE_BYTE_LIMIT = computed(
  () =>
    ((window.meTauri.settings.valueByteLimitMB as number) ?? defaultSettings.valueByteLimitMB) *
    1024 *
    1024,
)
const VALUE_PREVIEW_BYTES = computed(
  () => (window.meTauri.settings.valuePreviewBytes as number) ?? defaultSettings.valuePreviewBytes,
)
const forceFullValue = ref(false) // 用户确认后 GET 全量
const valueTruncatedDismissed = ref(false)
const valueTruncated = computed(() => redisValue.value?.valueTruncated ?? false)
const showValueTruncatedAlert = computed(
  () => stringType.value && valueTruncated.value && !valueTruncatedDismissed.value,
)

// List / Stream / ZSet 扫描范围与方向
const meta = ref({ maxId: '', minId: '' }) // Stream minId / maxId
const listIndexMin = ref('')
const listIndexMax = ref('')
const listDescAsc = ref(true) // true=升序
const streamDescAsc = ref(true) // true=XRANGE
const zsetScoreMin = ref('')
const zsetScoreMax = ref('')

function toggleListSortOrder() {
  listDescAsc.value = !listDescAsc.value
  void restartFieldScan()
}
function toggleStreamSortOrder() {
  streamDescAsc.value = !streamDescAsc.value
  void restartFieldScan()
}
// #endregion

// #region 视图模式（JSON / 表格）
type FieldViewType = 'json' | 'table'
const viewTypeList: FieldViewType[] = ['json', 'table']
const viewType = ref<FieldViewType>('json')

// 默认视图（settings.fieldShow；可传入刚拿到的 type）
function applyDefaultViewType(type?: string) {
  const keyType = type ?? redisValue.value?.type
  if (!keyType || isStringLikeType(keyType) || !supportsTableView(keyType)) {
    viewType.value = 'json'
    return
  }
  if (meTauri.settings.fieldShow === 'table') {
    viewType.value = 'table'
    return
  }
  // auto：沿用上次手动选择的 fieldShowView
  viewType.value = meTauri.settings.fieldShowView === 'json' ? 'json' : 'table'
}

function commitFieldScanReplace(data: FieldScanResult, resetView: boolean) {
  redisValue.value = toViewState(data)
  if (resetView) applyDefaultViewType(data.type) // 换键时同步校正，避免先闪 JSON
}

function onViewTypeChange(val: string | number | boolean) {
  // auto 模式下记录 segmented 手动切换
  if (meTauri.settings.fieldShow !== 'auto') return
  if (val === 'json' || val === 'table') {
    meTauri.settings.fieldShowView = val
  }
}

watchEffect(() => {
  // string / json 仅 JSON 视图
  if (stringType.value || jsonType.value) {
    viewType.value = 'json'
  }
})
// #endregion

// #region 字节格式与展示快照
// 原则：切编码只重算展示，不打 Redis；displayWire 恒为 fieldScan 的 base64，不被展示覆盖

// 下拉与 Auto 探测（STRING 默认 Auto）
const bytesFormat = ref<ViewBytesFormat>('auto')
const pendingAutoDetect = ref(false) // KEY_REFRESH 置位，开跑时领到局部变量
const detectedView = ref<DetectedViewFormat>('utf8')
const effectiveViewFormat = computed<ViewBytesFormat>(() =>
  bytesFormat.value === 'auto' ? detectedView.value : bytesFormat.value,
)
const detectedViewText = computed(() =>
  bytesFormat.value === 'auto' && stringType.value ? detectedViewLabel(detectedView.value) : '',
)
const formatOptions = computed(() => {
  // Auto / string-only 项仅 STRING 可用；顺序由 VIEW_FORMAT_OPTIONS 固定
  const builtin = [
    { label: 'Auto', value: 'auto' as ViewBytesFormat, disabled: !stringType.value },
    ...VIEW_FORMAT_OPTIONS.map(item => ({
      ...item,
      disabled: isStringOnlyView(item.value) && !stringType.value,
    })),
  ]
  const custom = (window.meTauri.settings.customCodecs ?? []).map(f => ({
    label: f.name,
    value: customFormatValue(f.name),
    disabled: !stringType.value,
  }))
  return { builtin, custom }
})

function commitBytesFormat(next: ViewBytesFormat) {
  if (bytesFormat.value !== next) bytesFormat.value = next
}
function commitDetectedView(next: DetectedViewFormat) {
  if (detectedView.value !== next) detectedView.value = next
}

// 展示层快照（STRING 编辑器 / 表格单元格共用）
const displayWire = ref('') // 权威 base64
const displayBytesFormat = ref<ViewBytesFormat>('utf8') // Auto 时=探测结果
const resolvedWireView = ref('') // custom 异步 decode 文本
const customCodecFailed = ref(false)
const customCodecVisible = ref(false)

const viewDecodeFailed = computed(() => {
  if (!stringType.value) return false
  const fmt = displayBytesFormat.value
  if (fmt === 'utf8' || fmt === 'hex' || fmt === 'binary' || fmt === 'base64') return false
  const wire = displayWire.value
  if (!wire) return false
  if (isCustomView(fmt)) return customCodecFailed.value
  return isViewDecodeError(meFormatViewValue(wire, fmt))
})

// 保存按钮 / 编辑器只读
const showSave = computed(
  () =>
    canEdit.value &&
    (stringType.value || jsonType.value) &&
    !(valueTruncated.value && !forceFullValue.value),
)
const editorReadOnly = computed(
  () =>
    !canEdit.value ||
    isReadonlyView(effectiveViewFormat.value) ||
    viewDecodeFailed.value ||
    (valueTruncated.value && !forceFullValue.value),
)
const saveDisabled = computed(
  () => viewDecodeFailed.value || !valueDirty.value || isReadonlyView(effectiveViewFormat.value),
)
const saveTip = computed(() => {
  if (isReadonlyView(effectiveViewFormat.value)) return readonlyViewTip(effectiveViewFormat.value)
  if (viewDecodeFailed.value) return t('util.saveDecodeFailed')
  if (!valueDirty.value) return t('util.saveNoChange')
  return t('save')
})

// 同步快照 / 切换编码 / custom 解码
function setCustomCodecError(message: string) {
  resolvedWireView.value = message
  customCodecFailed.value = true
}

function syncDisplaySnapshot() {
  const rv = redisValue.value
  if (!rv || rv.value === null || rv.value === undefined) {
    displayWire.value = ''
    if (bytesFormat.value === 'auto' && stringType.value) {
      commitDetectedView('utf8')
      displayBytesFormat.value = 'utf8'
    } else if (stringType.value) {
      // STRING：下拉即展示格式（勿经 viewFmtForField，避免 JdkSerial 被降成 utf8）
      displayBytesFormat.value = bytesFormat.value
    } else {
      displayBytesFormat.value = viewFmtForField(bytesFormat.value)
    }
    return
  }
  if (streamType.value) {
    displayWire.value = JSON.stringify(rv.value)
    displayBytesFormat.value = bytesFormat.value
    return
  }

  const wire = String(rv.value)
  displayWire.value = wire

  if (bytesFormat.value === 'auto' && stringType.value) {
    const nextDetected = detectViewFormat(wire, { truncated: valueTruncated.value })
    commitDetectedView(nextDetected)
    displayBytesFormat.value = nextDetected
    return
  }

  // STRING 保持用户所选；非 STRING 键级仅基础视图
  displayBytesFormat.value = stringType.value
    ? bytesFormat.value
    : viewFmtForField(bytesFormat.value)
}

async function refreshResolvedWireView() {
  if (!stringType.value || !isCustomView(displayBytesFormat.value)) {
    resolvedWireView.value = ''
    customCodecFailed.value = false
    return
  }
  const wire = displayWire.value
  if (!wire) {
    resolvedWireView.value = ''
    customCodecFailed.value = false
    return
  }
  try {
    resolvedWireView.value = await meFormatViewValueAsync(wire, displayBytesFormat.value)
    customCodecFailed.value = false
  } catch (e) {
    setCustomCodecError(e instanceof Error ? e.message : String(e))
  }
}

// 切换编码：只重算展示，不请求 Redis
async function onBytesFormatChange() {
  if (!stringType.value && isStringOnlyView(bytesFormat.value)) {
    commitBytesFormat('utf8')
  }
  if (redisValue.value) redisValue.value.newValue = null // 丢弃未保存编辑，避免 dirty 错乱
  syncDisplaySnapshot()
  await refreshResolvedWireView()
  valueEditorRemountKey.value++
}

watch(
  () => window.meTauri.settings.customCodecs,
  list => {
    // 自定义编解码被删/改名：回退并重算展示
    if (!isCustomView(bytesFormat.value)) return
    const name = customFormatName(bytesFormat.value)
    if (!name || !list?.some(f => f.name === name)) {
      bytesFormat.value = stringType.value ? 'auto' : 'utf8'
      void onBytesFormatChange()
    }
  },
  { deep: true },
)

watch(stringType, isString => {
  if (!isString && isStringOnlyView(bytesFormat.value)) {
    commitBytesFormat('utf8')
  }
})

// 单元格 / JSON 视图解码（表格行 wire → 可读文本）
function stringWireDisplayText(wire: string): string {
  try {
    if (stringType.value && isCustomView(displayBytesFormat.value)) {
      return resolvedWireView.value
    }
    return meFormatViewValue(wire, displayBytesFormat.value)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

function formatTableCell(raw: unknown): string {
  return stringWireDisplayText(String(raw ?? ''))
}

function wireToUtf8JsonText(wire: unknown): string {
  if (wire == null) return ''
  return meFormatViewValue(String(wire), 'utf8')
}

function fieldScanValueForJsonView(type: string, value: unknown): unknown {
  if (value == null) return value
  switch (type) {
    case 'hash':
      return (value as ValueTableRow[]).map(row => {
        const out: Record<string, unknown> = {
          key: wireToUtf8JsonText(row.key),
          value: wireToUtf8JsonText(row.value),
        }
        if (row.ttl != null) out.ttl = row.ttl
        return out
      })
    case 'list':
    case 'array':
      return (value as ValueTableRow[]).map(row => ({
        index: row.index,
        value: wireToUtf8JsonText(row.value),
      }))
    case 'set':
      return (value as unknown[]).map(v => wireToUtf8JsonText(v))
    case 'zset':
      return (value as ValueTableRow[]).map(row => ({
        value: wireToUtf8JsonText(row.value),
        score: row.score,
      }))
    case 'vectorset':
      // { name, vector, attrs } 对象数组
      return (value as { name: string; vector: string; attrs: string }[]).map(v => {
        const tryParse = (s: string) => {
          if (!s) return s
          try {
            return JSON.parse(s)
          } catch {
            return s
          }
        }
        return {
          name: wireToUtf8JsonText(v.name),
          vector: tryParse(v.vector || ''),
          attrs: tryParse(v.attrs || ''),
        }
      })
    default:
      return value
  }
}
// #endregion

// #region 编辑器内容（showValue）
// me-code 展示文本
const showValue = computed(() => {
  const rv = redisValue.value
  const obj = rv?.value
  if (obj === null || obj === undefined || !rv) return ''

  if (stringType.value) {
    const str = stringWireDisplayText(displayWire.value)
    return isPretty.value ? meFormatDisplayValue(str, true) : str
  }

  // 集合类型：JSON 视图用 UTF-8，不直接 dump base64
  if (
    hashType.value ||
    listType.value ||
    setType.value ||
    zsetType.value ||
    arrayType.value ||
    vectorsetType.value
  ) {
    const display = fieldScanValueForJsonView(rv.type, obj)
    return JSON.stringify(display, null, isPretty.value ? 2 : undefined)
  }

  if (jsonType.value || streamType.value) {
    return JSON.stringify(obj, null, isPretty.value ? 2 : undefined)
  }

  return JSON.stringify(obj, null, isPretty.value ? 2 : undefined)
})

function onCodeUpdate(newValue: string) {
  if (suppressCodeUpdate.value || !redisValue.value) return
  redisValue.value.newValue = newValue // 保存时 setValue 读回
}

// 未保存修改（''=主动清空；null=未编辑）
const valueDirty = computed(() => {
  const rv = redisValue.value
  if (!rv || rv.newValue === null) return false
  return rv.newValue !== showValue.value
})
// #endregion

// #region 表格数据与筛选
// 原始行
const dataList = computed(() => {
  const rv = redisValue.value
  if (rv === null || rv === undefined || rv.value === null || rv.value === undefined) return []

  const data: ValueTableRow[] = []
  fieldValueRows(rv.value).forEach(value => {
    // set 为裸字符串；其余类型已是对象
    if (setType.value) {
      data.push({ value })
    } else if (vectorsetType.value) {
      // VectorSet：{ name, vector, attrs } 对象
      const el = value as { name: string; vector: string; attrs: string }
      data.push({ value: el.name, vector: el.vector, attrs: el.attrs })
    } else {
      data.push(value as ValueTableRow)
    }
  })
  return data
})

// List/Stream：关键词本地包含过滤
const filterDataList = computed(() => {
  const key = fieldKeyword.value.toLowerCase()
  return dataList.value.filter(row => {
    if (!key) return true
    if ((formatTableCell(row.key).toLowerCase() ?? '').indexOf(key) > -1) return true
    if ((row.id?.toLowerCase() ?? '').indexOf(key) > -1) return true
    const cell = streamType.value ? JSON.stringify(row.value) : formatTableCell(row.value)
    if (cell.toLowerCase().indexOf(key) > -1) return true
    if ((row.score?.toString() ?? '').indexOf(key) > -1) return true
    if (String(row.index ?? '').indexOf(key) > -1) return true
    return false
  })
})

// Hash/Set/ZSet：本地 Redis glob（未 Enter 时不依赖服务端 MATCH）
const filterFieldPattern = computed(() =>
  buildLocalFilterPattern(fieldKeyword.value, fieldExact.value, fieldMatch.value),
)
const filterFieldMatch = computed(() => compileRedisGlobFilter(filterFieldPattern.value))
const filterFieldList = computed(() => {
  const matchFn = filterFieldMatch.value
  if (!matchFn) return dataList.value
  // Vector Set：按元素名（row.value）本地过滤（向量浮点无检索意义；相似度走 VSIM）
  if (vectorsetType.value) {
    return dataList.value.filter(
      row => row.value != null && row.value !== '' && matchFn(formatTableCell(row.value)),
    )
  }
  return dataList.value.filter(row => {
    if (row.key != null && row.key !== '') {
      if (matchFn(formatTableCell(row.key))) return true
    }
    if (row.value != null && row.value !== '') {
      if (matchFn(formatTableCell(row.value))) return true
    }
    if (row.score != null && matchFn(String(row.score))) {
      return true
    }
    return false
  })
})

const tableDisplayList = computed(() => {
  if (hashType.value || setType.value || zsetType.value || vectorsetType.value) {
    return filterFieldList.value
  }
  return filterDataList.value
})

// 默认排序列（List 不设，保持 fieldScan 返回顺序）
const tableDefaultSort = computed(
  (): { prop: string; order: 'ascending' | 'descending' } | undefined => {
    switch (redisValue.value?.type) {
      case 'hash':
        return { prop: 'key', order: 'ascending' }
      case 'zset':
        return { prop: 'score', order: 'ascending' }
      case 'set':
      case 'vectorset':
        return { prop: 'value', order: 'ascending' }
      default:
        return undefined
    }
  },
)
// #endregion

// #region TTL
// 倒计时
let timer: ReturnType<typeof setInterval> | null = null

async function setTimer(seconds: number) {
  const rv = redisValue.value
  if (!rv) return
  rv.ttl = seconds
  if (timer !== null) clearInterval(timer)
  timer = null
  if (rv.ttl > 0) {
    timer = setInterval(() => {
      const cur = redisValue.value
      if (cur && cur.ttl > 0) cur.ttl--
    }, 1000)
  }
}

// 顶栏展示 / 弹窗
const ttlSetRef = useTemplateRef('ttlSetRef')
function updateTTL() {
  if (!canEdit.value) return
  const rv = redisValue.value
  if (!rv) return
  ttlSetRef.value?.open({ ttl: rv.ttl })
}
const ttlDisplayText = computed(() => {
  const rv = redisValue.value
  if (!rv) return ''
  return rv.ttl === -1 ? t('redisValue.ttlForever') : meHumanSeconds(rv.ttl)
})
const ttlIconHint = computed(() =>
  canEdit.value ? t('redisValue.ttlHint') : t('redisValue.ttlHintReadonly'),
)
// #endregion

// #region 键刷新（fieldScan）
// 工具栏入口：暂停 / 继续 / 重扫
function pauseFieldScan() {
  scanCancelled.value = true
  scanPaused.value = true
}
function onFieldScanAction() {
  if (loading.value) pauseFieldScan()
  else if (scanPaused.value) {
    scanPaused.value = false
    void refreshKey(false, true, scanLoadAll.value, false)
  }
}
function restartFieldScan() {
  return refreshKey(false, false, false, true) // 保留 keyword，可中断进行中的扫描
}
async function onFieldSearch() {
  await restartFieldScan()
}
function manualRefreshKey() {
  prepareManualKeyRefresh()
  return restartFieldScan()
}

// 参数与辅助
function resetParam() {
  fieldKeyword.value = ''
  fieldExact.value = false
  scanHashFieldTtl.value = false
  listIndexMin.value = ''
  listIndexMax.value = ''
  listDescAsc.value = true
  streamDescAsc.value = true
  zsetScoreMin.value = ''
  zsetScoreMax.value = ''
  vectorsetSample.value = true
}
function fieldScanIncludeMeta(): boolean {
  return cursor.value == null // 续扫跳过 TYPE/TTL/MEMORY 等
}
function buildFieldScanParam() {
  const type = redisValue.value?.type
  const serverScan = supportsFieldServerScan(type)
  const includeMeta = fieldScanIncludeMeta()
  return {
    key: share.redisKey!,
    count: meTauri.settings.fieldScanCount ?? 20,
    cursor: cursor.value,
    match: serverScan ? fieldMatch.value : '*',
    exact: serverScan ? fieldExact.value : false,
    meta: {
      ...meta.value,
      listMinIndex: parseListIndexInput(listIndexMin.value),
      listMaxIndex: parseListIndexInput(listIndexMax.value),
      listDesc: listType.value ? !listDescAsc.value : null,
      streamDesc: streamType.value ? !streamDescAsc.value : null,
      vectorsetSample: vectorsetType.value ? vectorsetSample.value : null,
      zsetMinScore: zsetType.value ? zsetScoreMin.value.trim() || null : null,
      zsetMaxScore: zsetType.value ? zsetScoreMax.value.trim() || null : null,
      valueByteLimit: VALUE_BYTE_LIMIT.value,
      valuePreviewBytes: VALUE_PREVIEW_BYTES.value,
      forceFullValue: forceFullValue.value,
    },
    bytesFormat: IPC_WIRE_FORMAT, // IPC 恒 base64
    includeMeta,
    keyType: includeMeta ? null : (type ?? null),
    includeFieldTtl: scanHashFieldTtl.value,
  }
}

function toggleHashFieldTtl() {
  scanHashFieldTtl.value = !scanHashFieldTtl.value
  void restartFieldScan()
}

// VectorSet 浏览模式切换：重置游标重扫（采样无分页，范围查询从头遍历）
function onVectorsetBrowseChange() {
  void restartFieldScan()
}

// STRING 截断预览
function dismissValueTruncated() {
  valueTruncatedDismissed.value = true
}
function prepareManualKeyRefresh() {
  valueTruncatedDismissed.value = false // 手动刷新重新展示大值提示
}
async function loadFullValue() {
  if (loading.value) return
  forceFullValue.value = true
  await refreshKey(false)
}

// 单次拉取 / 自动续扫 / 收尾
async function finalizeAfterFieldScan(reset: boolean, replaceData?: FieldScanResult) {
  if (replaceData) {
    commitFieldScanReplace(replaceData, reset)
  } else if (reset) {
    // 换键路径若中途已 commit，这里再校正一次；失败清空时仍落到 json
    applyDefaultViewType()
  }
  // 清空未保存编辑；fieldScan 结果即当前权威内容
  if (redisValue.value) {
    redisValue.value.newValue = null
  }
  suppressCodeUpdate.value = false

  // 键类型可能在 scan 后才确定，nextTick 等 computed 更新后再校正编码下拉
  await nextTick(() => {
    if (jsonType.value) {
      commitBytesFormat('utf8')
    } else if (!stringType.value && isStringOnlyView(bytesFormat.value)) {
      commitBytesFormat('utf8')
    }
  })
  // displayWire / displayBytesFormat 与 resolvedWireView 对齐，供 me-code 渲染
  syncDisplaySnapshot()
  await refreshResolvedWireView()
  // 强制 me-code remount：未保存时 modelValue 字符串可能不变，子组件 watch 不触发
  valueEditorRemountKey.value++
  loading.value = false
}

async function fieldScanCore(
  useCursor: boolean,
): Promise<{ count: number; replaceData?: FieldScanResult }> {
  const includeMeta = fieldScanIncludeMeta()
  const data = await meCommands.fieldScan(share.conn!.id, buildFieldScanParam())
  cursor.value = data.cursor
  scanBatchCount.value++

  if (useCursor) {
    const prev = redisValue.value
    if (prev && mergeFieldScanPage(prev, data, includeMeta)) {
      return { count: fieldValueRows(data.value).length }
    }
  }
  return { count: fieldValueRows(data.value).length, replaceData: data }
}

async function fieldScanAuto(fetchedCount = 0): Promise<void> {
  if (!cursor.value || cursor.value.finished) return
  if (scanCancelled.value) return
  if (fetchedCount >= FIELD_SCAN_FETCH_COUNT.value) return

  const { count } = await fieldScanCore(true)
  await fieldScanAuto(fetchedCount + count)
}

async function fieldScanAll(): Promise<void> {
  if (!cursor.value || cursor.value.finished) return
  if (scanCancelled.value) return

  await fieldScanCore(true)
  await fieldScanAll()
}

// 主入口：reset=换键清空 keyword；restart=保留 keyword 并中断扫描（值面板无 F5）
async function refreshKey(
  reset: boolean = true,
  useCursor: boolean = false,
  loadAll: boolean = false,
  restart: boolean = false,
) {
  if (!share.conn || !share.redisKey) return

  if (loading.value) {
    if (!restart) return
    scanCancelled.value = true
    scanPaused.value = false
    while (loading.value) {
      await sleep(20)
    }
  }

  // 等上一轮结束后再领取，避免被上一轮 finally 清掉后漏探测
  let detectThisLoad = !useCursor && pendingAutoDetect.value
  if (detectThisLoad) pendingAutoDetect.value = false

  fieldSetInit()
  suppressCodeUpdate.value = true
  scanLoadAll.value = loadAll

  if (reset) {
    resetParam()
    forceFullValue.value = false
    valueTruncatedDismissed.value = false
  }
  if (!useCursor) cursor.value = null

  loading.value = true
  scanCancelled.value = false
  if (!useCursor) scanPaused.value = false

  // 换键：已知非 STRING 则键级展示默认 utf8（不再为探测单独拉一包）
  if (detectThisLoad && share.conn && share.redisKey) {
    const knownType = await resolveKeyType(share.conn.id, share.conn.db, share.redisKey)
    if (knownType && knownType !== 'STRING') {
      commitBytesFormat('utf8')
      detectThisLoad = false
    }
  }

  try {
    if (!useCursor) scanBatchCount.value = 0

    const first = await fieldScanCore(useCursor)
    if (first.replaceData) {
      commitFieldScanReplace(first.replaceData, reset)
    }

    let scanType = redisValue.value?.type
    // 换键：STRING → Auto；其它 → utf8 展示（wire 已是 base64，无需重拉）
    if (detectThisLoad) {
      const nextFormat: ViewBytesFormat = scanType === 'string' ? 'auto' : 'utf8'
      commitBytesFormat(nextFormat)
      scanType = redisValue.value?.type
    } else if (
      !useCursor &&
      scanType &&
      scanType !== 'string' &&
      isStringOnlyView(bytesFormat.value)
    ) {
      commitBytesFormat('utf8')
    }

    if (loadAll) {
      await fieldScanAll()
    } else if (shouldFieldScanAuto(scanType, fieldExact.value)) {
      await fieldScanAuto(first.count)
    }

    showMore.value = !cursor.value?.finished
    const rvDone = redisValue.value
    if (rvDone) await setTimer(rvDone.ttl)
  } catch (e) {
    // 整键刷新且键已不存在：清掉过期快照；续扫失败保留已加载页；其它错误也保留旧值
    if (!useCursor && isAppErrorCode(e, 'key_not_found')) {
      clearValueAfterKeyGone()
    }
    throw e
  } finally {
    if (!stringType.value && isStringOnlyView(bytesFormat.value)) {
      commitBytesFormat('utf8')
    }
    await finalizeAfterFieldScan(reset)
    if (cursor.value?.finished) scanPaused.value = false
  }
}

function clearValueAfterKeyGone() {
  // 键已删除/过期，清空详情
  redisValue.value = null
  cursor.value = null
  showMore.value = false
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

// 自动刷新：仅当前组件状态，不持久化；配置入口为底栏刷新图标 hover 菜单
const autoRefresh = ref(false)
const autoRefreshInterval = ref(5) // 秒，1~10
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
watch(
  [autoRefresh, autoRefreshInterval],
  ([on]) => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
    if (on) {
      autoRefreshTimer = setInterval(() => {
        // 查询中跳过，避免请求堆叠
        if (loading.value) return
        void restartFieldScan()
      }, autoRefreshInterval.value * 1000)
    }
  },
  { immediate: true },
)
// #endregion

// #region 字段行操作
// 新增 / 编辑面板状态
const fieldAddRef = useTemplateRef('fieldAddRef')
const fieldSetRef = useTemplateRef('fieldSetRef')
const fieldSetIndex = ref(-1)
const fieldSetReadonly = ref(false)
const fieldEditIndex = ref(-1) // list/array：Redis 下标；hash：配合 fieldEditKey
const fieldEditKey = ref('')
const fieldSetRow = ref<ValueTableRow | null>(null) // 分页下不能用 index 反查行

function fieldAdd() {
  const rv = redisValue.value
  if (!rv || !canEdit.value) return
  fieldAddRef.value?.open({
    mode: 'field',
    type: rv.type,
    valFmt: IPC_WIRE_FORMAT,
    viewValFmt: viewFmtForField(bytesFormat.value),
    key: { ...share.redisKey! },
    vectorDim: rv.vectorDim,
  })
}

function fieldSetInit() {
  fieldSetIndex.value = -1
  fieldSetReadonly.value = false
  fieldEditIndex.value = -1
  fieldEditKey.value = ''
  fieldSetRow.value = null
  fieldSetRef.value?.close()
}

function prepareFieldRowContext(row: ValueTableRow) {
  // VectorSet 元素名在 row.value（与 Set 一致）
  fieldEditKey.value = vectorsetType.value ? String(row.value ?? '') : row.key || ''
  fieldEditIndex.value = -1
  if (listType.value || arrayType.value) {
    fieldEditIndex.value = listRowRedisIndex(row)
  }
}

function pageRowIndexFromEvent(event: MouseEvent): number {
  const tr = event.currentTarget as HTMLElement | null
  if (!tr) return -1
  for (const className of tr.classList) {
    if (className.startsWith('table-row-index-')) {
      return Number.parseInt(className.slice('table-row-index-'.length), 10)
    }
  }
  return -1
}

// 展示与参数
function formatFieldTtl(ttl: number | undefined): string {
  if (ttl === undefined || ttl === null) return '-'
  if (ttl === -1) return t('redisValue.ttlForever')
  return String(meHumanSeconds(ttl))
}
function fieldRowDisplayValue(row: ValueTableRow): string {
  if (streamType.value) return JSON.stringify(row.value)
  return formatTableCell(row.value)
}
function compareFieldRowValue(a: ValueTableRow, b: ValueTableRow): number {
  return fieldRowDisplayValue(a).localeCompare(fieldRowDisplayValue(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

// MeTable 导出：由行数据直接计算展示文本，与表格列定义一致（改列时同步改这里）
function exportValueTableRows(data: unknown[]): TableExportMatrix {
  const headers: string[] = ['#']
  const cells: ((row: ValueTableRow, index: number) => string)[] = [
    (_row, index) => String(index + 1),
  ]
  if (streamType.value) {
    headers.push(t('redisValue.id'))
    cells.push(row => {
      const id = String(row.id ?? '')
      const date = streamIdToDate(id)
      return date ? `${id} ${date}` : id
    })
  }
  if (hashType.value) {
    headers.push(t('redisValue.key'))
    cells.push(row => formatTableCell(row.key))
  }
  if (listType.value || arrayType.value) {
    headers.push(t('redisValue.index'))
    cells.push(row => String(row.index ?? ''))
  }
  headers.push(vectorsetType.value ? t('redisValue.element') : t('redisValue.value'))
  cells.push(row => fieldRowDisplayValue(row))
  if (vectorsetType.value) {
    headers.push(t('fieldSet.attrs'))
    cells.push(row => String(row.attrs ?? ''))
    headers.push(t('fieldSet.vector'))
    cells.push(row => String(row.vector ?? ''))
  }
  if (zsetType.value) {
    headers.push(t('redisValue.score'))
    cells.push(row => String(row.score ?? ''))
  }
  if (showHashFieldTtlOption.value && scanHashFieldTtl.value) {
    headers.push(t('redisValue.ttl'))
    cells.push(row => formatFieldTtl(row.ttl))
  }
  return {
    headers,
    rows: (data as ValueTableRow[]).map((row, index) => cells.map(fn => fn(row, index))),
  }
}
function buildFieldGetParam(row?: ValueTableRow): RedisFieldGet_Deserialize | null {
  const rv = redisValue.value
  const rk = share.redisKey
  if (!rv || !rk) return null
  return {
    key: rk,
    fieldIndex: fieldEditIndex.value,
    fieldKey: fieldEditKey.value,
    fieldValue: zsetType.value && row ? String(row.value ?? '') : '',
    valFmt: IPC_WIRE_FORMAT,
    includeFieldTtl: hashType.value ? scanHashFieldTtl.value : null,
  }
}

// 打开面板 / 行点击
async function openFieldPanel(row: ValueTableRow, index: number, readonly: boolean) {
  const rv = redisValue.value
  if (!rv) return
  fieldSetIndex.value = index
  fieldSetReadonly.value = readonly
  fieldSetRow.value = row
  prepareFieldRowContext(row)

  // VectorSet：扫描已含向量+属性，直接从 row 取，零 RTT
  let vectorValue = ''
  let vectorAttrs: string | undefined
  if (vectorsetType.value) {
    vectorValue = String(row.vector ?? '')
    vectorAttrs = row.attrs || undefined
  }

  const rowValWire = streamType.value
    ? meViewToWire(JSON.stringify(row.value ?? {}), 'utf8')
    : vectorsetType.value
      ? vectorValue
      : String(row.value ?? '')
  const params = {
    fieldKey: vectorsetType.value ? String(row.value ?? '') : row.key || '',
    fieldScore: row.score || 0,
    fieldTtl: row.ttl ?? -1,
    srcFieldValue: rowValWire,
    wireFieldKey: vectorsetType.value ? String(row.value ?? '') : row.key || '',
    keyWireFmt: IPC_WIRE_FORMAT,
    type: rv.type,
    key: share.redisKey!,
    fieldIndex: -1,
    streamId: row.id || '',
    readonly,
    vectorDim: rv.vectorDim,
    srcFieldAttrs: vectorAttrs,
  }
  if (listType.value || arrayType.value) {
    params.fieldIndex = fieldEditIndex.value
  }
  fieldSetRef.value?.open(params)
}

function rowClassName({ rowIndex }: { row: ValueTableRow; rowIndex: number }) {
  const classes = [`table-row-index-${rowIndex}`]
  if (fieldSetIndex.value === rowIndex) classes.push('field-set-row')
  return classes.join(' ')
}

function rowDblClick(row: ValueTableRow, _column: unknown, event: MouseEvent) {
  if ((event.target as HTMLElement)?.closest('.field-row-actions')) return
  const rowIndex = pageRowIndexFromEvent(event)
  if (rowIndex < 0) return
  openFieldPanel(row, rowIndex, !(canEdit.value && !streamType.value))
}

function rowClick(row: ValueTableRow, _column: unknown, event: MouseEvent) {
  if (fieldSetIndex.value === -1) return
  const rowIndex = pageRowIndexFromEvent(event)
  if (rowIndex < 0) return
  openFieldPanel(row, rowIndex, fieldSetReadonly.value)
}

function onFieldPanelOutsideClick(e: MouseEvent) {
  // 面板打开时：点行切换内容；点面板外空白/表头关闭
  if (fieldSetIndex.value === -1) return
  const el = e.target as HTMLElement | null
  if (!el) return
  if (el.closest('.field-set')) return
  if (el.closest('.el-table__body tbody tr')) return
  fieldSetInit()
}

// field_get 写回 / 单行刷新
function applyFieldGetResult(rv: FieldScanViewState, data: RedisFieldValue, row: ValueTableRow) {
  if (hashType.value) {
    const rows = fieldValueRows(rv.value) as ValueTableRow[]
    const idx = rows.findIndex(r => r.key === (row.key || fieldEditKey.value))
    if (idx >= 0) {
      rows[idx] = {
        key: data.fieldKey,
        value: data.fieldValue,
        ttl: scanHashFieldTtl.value ? data.fieldTtl : (rows[idx].ttl ?? row.ttl),
      }
    }
  } else if (listType.value || arrayType.value) {
    const rows = fieldValueRows(rv.value) as ValueTableRow[]
    const redisIndex = fieldEditIndex.value >= 0 ? fieldEditIndex.value : listRowRedisIndex(row)
    const idx = rows.findIndex(r => r.index === redisIndex)
    if (idx >= 0) {
      rows[idx] = { index: rows[idx].index, value: data.fieldValue }
    }
  } else if (zsetType.value) {
    const rows = fieldValueRows(rv.value) as ValueTableRow[]
    const idx = rows.findIndex(r => r.value === row.value)
    if (idx >= 0) {
      rows[idx] = { value: data.fieldValue, score: data.fieldScore ?? row.score }
    }
  } else if (vectorsetType.value) {
    // 原始行结构为 { name, vector, attrs }（dataList 才映射成 value），按 name 匹配并写回
    const rows = fieldValueRows(rv.value) as ValueTableRow[]
    const idx = rows.findIndex(r => r.name === (row.value || fieldEditKey.value))
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        name: data.fieldKey,
        vector: data.fieldValue,
        attrs: data.fieldAttrs ?? '',
      }
    }
  }
}

async function refreshFieldRow(row: ValueTableRow) {
  // 单行 field_get；不支持或失败回退 refreshKey
  const rv = redisValue.value
  const conn = share.conn
  if (!rv || !conn || !share.redisKey) return
  prepareFieldRowContext(row)

  if (supportsFieldRowRefresh(rv.type)) {
    const param = buildFieldGetParam(row)
    if (!param) return
    try {
      const data = await meCommands.fieldGet(conn.id, param, false)
      applyFieldGetResult(rv, data, row)
      meOk(t('redisValue.refreshFieldRowOk'))
      return
    } catch {
      // 回退整表刷新
    }
  }
  await refreshKey(false)
}

// 行菜单：复制 / 命令 / ZSet 排名
function buildFieldAsCommandParam(row: ValueTableRow): RedisFieldAsCommand_Deserialize | null {
  const rv = redisValue.value
  const rk = share.redisKey
  if (!rv || !rk) return null
  const param: RedisFieldAsCommand_Deserialize = {
    key: rk,
    fieldKey: vectorsetType.value ? String(row.value ?? '') : row.key || '',
    fieldValue: vectorsetType.value ? '' : String(row.value ?? ''),
    streamId: row.id || '',
    fieldIndex: -1,
    valFmt: IPC_WIRE_FORMAT,
  }
  if (listType.value || arrayType.value) {
    param.fieldIndex = listRowRedisIndex(row)
  }
  if (streamType.value) {
    param.fieldValue = ''
  }
  return param
}
async function copyFieldAsCommand(row: ValueTableRow) {
  const conn = share.conn
  const param = buildFieldAsCommandParam(row)
  if (!conn || !param) return
  const text = await meCommands.getFieldAsCommand(conn.id, param)
  if (!text.trim()) {
    meWarn(t('redisValue.copyCommandEmpty'))
    return
  }
  meCopy(text, t('redisValue.copyCommandOk'))
}

function onFieldRowMoreCommand(command: string, row: ValueTableRow) {
  if (command === 'deleteElement') {
    void meConfirm(t('redisValue.deleteConfirm'), () => fieldDel(row))
  } else if (command === 'refreshRow') {
    void refreshFieldRow(row)
  } else if (command === 'copyKey') {
    meCopy(formatTableCell(row.key ?? ''))
  } else if (command === 'copyValue') {
    meCopy(fieldRowDisplayValue(row))
  } else if (command === 'copyAttrs') {
    meCopy(String(row.attrs ?? ''))
  } else if (command === 'copyVector') {
    meCopy(String(row.vector ?? ''))
  } else if (command === 'copyIndex') {
    meCopy(String(row.index ?? ''))
  } else if (command === 'copyStreamId') {
    meCopy(String(row.id ?? ''))
  } else if (command === 'copyScore') {
    meCopy(String(row.score ?? ''))
  } else if (command === 'copyAsCommand') {
    void copyFieldAsCommand(row)
  } else if (command === 'showZsetRank') {
    showZsetRank(row)
  }
}

function onFieldSetRefreshed(data: RedisFieldValue) {
  const rv = redisValue.value
  const row = fieldSetRow.value
  if (!rv || !row) return
  applyFieldGetResult(rv, data, row)
}

// 字段保存成功 / 删除
async function onFieldSetSuccess() {
  // 优先 field_get 刷单行；不支持或失败回退整表
  const rv = redisValue.value
  if (!rv || !share.redisKey || !supportsFieldRowRefresh(rv.type)) {
    await refreshKey(false)
    fieldSetInit()
    return
  }

  const param = buildFieldGetParam()
  if (!param) {
    await refreshKey(false)
    fieldSetInit()
    return
  }
  try {
    const data = await meCommands.fieldGet(share.conn!.id, param, false)
    const row = fieldSetRow.value
    if (row) applyFieldGetResult(rv, data, row)
    fieldSetInit()
  } catch {
    await refreshKey(false)
    fieldSetInit()
  }
}

async function fieldDel(row: ValueTableRow) {
  const rv = redisValue.value
  if (!rv) return
  const param: RedisFieldDel_Deserialize = {
    fieldKey: vectorsetType.value ? String(row.value ?? '') : row.key || '',
    fieldValue: vectorsetType.value ? '' : String(row.value ?? ''),
    key: share.redisKey!,
    streamId: row.id || '',
    fieldIndex: -1,
    valFmt: IPC_WIRE_FORMAT,
  }
  if (listType.value || arrayType.value) {
    param.fieldIndex = listRowRedisIndex(row)
  }
  if (streamType.value) {
    param.fieldValue = ''
  }

  await meCommands.fieldDel(share.conn!.id, param)
  meOk(t('deleteOk'))
  await refreshKey()
}
// #endregion

// #region 顶栏键操作（收藏 / 删除 / 更多）
// 键名 / 定位 / 集群 slot
const showKey = computed(() => share.redisKey?.key ?? '')
function locateKeyInTree(): void {
  const rk = share.redisKey
  if (!rk) return
  connUi.scrollKeyToTree(rk)
}
async function showSlot() {
  const data = await meCommands.keySlot(share.conn!.id, share.redisKey!)
  meOk(String(data), true, t('redisValue.slotTitle'))
}
async function showLocation() {
  const data = await meCommands.keyNode(share.conn!.id, share.redisKey!)
  const msg = data.map(item => item.node + ' | ' + item.flags.toUpperCase()).join('<br>')
  meOk(msg, true, t('redisValue.locationTitle'), { dangerouslyUseHTMLString: true })
}

// 删除 / 重命名 / 复制
function deleteKey(_payload?: RedisKey_Deserialize) {
  redisValue.value = null
}
function delKey() {
  meDeleteKey(share.conn!.id, share.redisKey!)
}
const keyRenameRef = useTemplateRef<InstanceType<typeof KeyRename>>('keyRenameRef')
function renameKey() {
  if (!share.redisKey) return
  keyRenameRef.value?.open({ redisKey: share.redisKey })
}
function duplicateKey() {
  if (!share.redisKey) return
  connUi.openKeyCopy(share.redisKey)
}
const copyAsCommandLoading = ref(false)
async function copyAsCommand() {
  const conn = share.conn
  const rk = share.redisKey
  if (!conn || !rk || copyAsCommandLoading.value) return
  copyAsCommandLoading.value = true
  try {
    const text = await meCommands.getKeyAsCommand(conn.id, rk)
    if (!text.trim()) {
      meWarn(t('redisValue.copyCommandEmpty'))
      return
    }
    meCopy(text, t('redisValue.copyCommandOk'))
  } finally {
    copyAsCommandLoading.value = false
  }
}
async function onFooterRefreshKey() {
  await manualRefreshKey()
  meOk(t('redisValue.refreshKeyOk'))
}

// 收藏（与 KeyTree 右键一致）
const favorites = useFavorites()
const isCurrentKeyFavorited = computed(() => {
  const conn = share.conn
  const rk = share.redisKey
  if (!conn || !rk) return false
  return isFavorited(favorites.value, conn.id, conn.db, rk)
})
function toggleFavorite() {
  const conn = share.conn
  const rk = share.redisKey
  if (!conn || !rk) return
  if (isCurrentKeyFavorited.value) {
    favorites.value = removeFavorite(favorites.value, conn.id, conn.db, rk)
    meOk(t('keyTree.unfavoriteOk'))
  } else {
    favorites.value = addFavorite(favorites.value, conn.id, conn.db, rk)
    meOk(t('keyTree.favoriteOk'))
  }
}

// 更多菜单 / 快捷键 / 命令帮助
const tableInfoRef = useTemplateRef<InstanceType<typeof TableInfo>>('tableInfoRef')
const valueShortcutRef = useTemplateRef('valueShortcutRef')
const commandHelpRef = useTemplateRef<InstanceType<typeof CommandHelp>>('commandHelpRef')
function showZsetRank(row: ValueTableRow) {
  tableInfoRef.value?.open('zrank', { member: String(row.value ?? '') })
}
function openKeyShortDialog() {
  valueShortcutRef.value?.open()
}
function openCommandHelp() {
  const type = redisValue.value?.type
  const group = type ? KEY_TYPE_TO_GROUP[type] : ''
  commandHelpRef.value?.open({ group })
}
async function onKeyMoreCommand(command: string) {
  if (command === 'refreshKey') {
    await onFooterRefreshKey()
  } else if (command === 'copyKey') {
    meCopy(showKey.value)
  } else if (command === 'copyValue') {
    meCopy(showValue.value)
  } else if (command === 'copyAsCommand') {
    void copyAsCommand()
  } else if (command === 'renameKey') {
    renameKey()
  } else if (command === 'duplicateKey') {
    duplicateKey()
  } else if (command === 'objectInfo') {
    tableInfoRef.value?.open('object')
  } else if (command === 'showSlot') {
    void showSlot()
  } else if (command === 'showLocation') {
    void showLocation()
  } else if (command === 'commandHelp') {
    openCommandHelp()
  } else if (command === 'keyShort') {
    openKeyShortDialog()
  }
}
// #endregion

// #region 保存整键（STRING / JSON）
async function setValue() {
  const rv = redisValue.value
  if (!rv || rv.newValue === null) return
  if (isReadonlyView(effectiveViewFormat.value)) return
  let value = rv.newValue

  try {
    if (jsonType.value) {
      if (value === '') {
        meErr(t('fieldAdd.jsonValidator'))
        return
      }
      value = meJsonNormal(value)
    } else if (stringType.value && needsJsonNormalize(effectiveViewFormat.value)) {
      value = value === '' ? '' : meJsonNormal(value)
    }
    if (stringType.value && isCustomView(effectiveViewFormat.value)) {
      value = await meViewToWireAsync(value, effectiveViewFormat.value)
    } else if (stringType.value) {
      value = meViewToWire(value, effectiveViewFormat.value)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (stringType.value && isCustomView(effectiveViewFormat.value)) {
      setCustomCodecError(msg)
      rv.newValue = null
      valueEditorRemountKey.value++
      return
    }
    meErr(msg)
    return
  }

  await meCommands.set(share.conn!.id, {
    key: share.redisKey!,
    value,
    ttl: rv.ttl,
    keyType: rv.type,
    inputFormat: jsonType.value ? 'utf8' : IPC_WIRE_FORMAT, // JSON=utf8；STRING=base64 wire
  })
  meOk(t('saveOk'))
  await refreshKey()
}
// #endregion

// #region 类型扩展弹窗入口
// POP / 类型专属 INFO（下拉直接显示原命令名）
async function runFieldPop(mode: string) {
  const conn = share.conn
  const key = share.redisKey
  if (!conn || !key || !canEdit.value) return
  const data = await meCommands.fieldPop(conn.id, { key, mode, valFmt: IPC_WIRE_FORMAT })
  // IPC 为 base64；toast 按键级展示格式解码（ZSet 形如 `wire (score: n)`）
  const view = viewFmtForField(bytesFormat.value)
  const scoreSuffix = data.match(/^(.*) \(score: (.+)\)$/s)
  const tip = scoreSuffix
    ? `${meFormatViewValue(scoreSuffix[1]!, view)} (score: ${scoreSuffix[2]})`
    : meFormatViewValue(data, view)
  meOk(tip)
  await restartFieldScan()
}
function onPopCommand(command: string) {
  // Array / VectorSet 只读扩展走工具栏「更多」，下拉项用原命令名
  if (command === 'ARINFO') {
    tableInfoRef.value?.open('arinfo')
    return
  }
  if (command === 'VINFO') {
    tableInfoRef.value?.open('vinfo')
    return
  }
  const confirmMap: Record<string, string> = {
    LPOP: 'redisValue.listLpopConfirm',
    RPOP: 'redisValue.listRpopConfirm',
    SPOP: 'redisValue.setPopConfirm',
    ZPOPMIN: 'redisValue.zpopMinConfirm',
    ZPOPMAX: 'redisValue.zpopMaxConfirm',
  }
  meConfirm(t(confirmMap[command]), () => runFieldPop(command))
}

// Hash / Stream / ZSet / Array 弹窗
const tableGroupRef = useTemplateRef('tableGroupRef')
function showGroups() {
  tableGroupRef.value?.open()
}
const hashKeysRef = useTemplateRef('hashKeysRef')
function showAllHashKeys() {
  hashKeysRef.value?.open(IPC_WIRE_FORMAT, 'keys', displayBytesFormat.value)
}
function showAllHashValues() {
  hashKeysRef.value?.open(IPC_WIRE_FORMAT, 'values', displayBytesFormat.value)
}
const zsetRangeRef = useTemplateRef('zsetRangeRef')
function showZsetRange() {
  zsetRangeRef.value?.open(IPC_WIRE_FORMAT, displayBytesFormat.value)
}
const arLastItemsRef = useTemplateRef('arLastItemsRef')
function showArLastItems() {
  arLastItemsRef.value?.open(IPC_WIRE_FORMAT, displayBytesFormat.value)
}
const vSimRef = useTemplateRef<InstanceType<typeof TableVSim>>('vSimRef')
function showVSimWithElement(elementDisplay: string) {
  vSimRef.value?.open(displayBytesFormat.value, { elementDisplay })
}
// #endregion

// #region 底栏信息文案
// 内存 / 长度 / 已扫描条数（与底栏同一行展示）
const textMemory = computed(() => {
  const rv = redisValue.value
  if (!rv) return ''
  let sz = rv.size
  let estimated = false
  // 无 MEMORY USAGE 时 String 按键名+值长度粗估
  if (sz <= 0 && stringType.value) {
    const key = share.redisKey?.key ?? ''
    sz = estimateStringMemory(key, rv.length)
    estimated = true
  }
  if (sz <= 0) return ''
  const label = estimated ? t('redisValue.textMemoryEstimate') : t('redisValue.textMemory')
  return label + meHumanSize(sz)
})
const textLength = computed(() => {
  // String=字节长度；集合/Array=总数（Array 的 ARLEN 单独一项，用竖线分隔）
  const rv = redisValue.value
  if (!rv || jsonType.value) return ''
  if (stringType.value) {
    return t('redisValue.textLength') + rv.length
  }
  if (rv.length <= 0) return ''
  return t('redisValue.totalCount') + rv.length
})
/** Array：ARLEN，与「总数」分开展示，中间用 el-divider */
const textArLen = computed(() => {
  const rv = redisValue.value
  if (!rv || !arrayType.value || rv.logicalLength == null) return ''
  return t('redisValue.arLen') + rv.logicalLength
})
/** Vector Set：VDIM，与 VCARD 总数分开展示 */
const textVectorDim = computed(() => {
  const rv = redisValue.value
  if (!rv || !vectorsetType.value || rv.vectorDim == null) return ''
  return t('redisValue.vectorDim') + rv.vectorDim
})
const textEntries = computed(() => {
  const rv = redisValue.value
  if (!rv || jsonType.value || stringType.value) return ''
  const filtered = tableDisplayList.value.length
  const loaded = fieldValueRows(rv.value).length
  return t('redisValue.textEntries') + `${filtered} / ${loaded}`
})
// #endregion

// #region 生命周期
// KEY_REFRESH=选中键加载值；与 KeyMain F5 刷新键列表无关
const onKeyRefreshBus = () => {
  pendingAutoDetect.value = true // 换键待探测展示格式；wire 恒 base64
  void refreshKey(true, false, false, true) // restart：连点不同键不丢后一次
}

onMounted(() => {
  bus.on(KEY_REFRESH, onKeyRefreshBus)
  bus.on(KEY_DELETE, deleteKey)
})

onUnmounted(() => {
  bus.off(KEY_REFRESH, onKeyRefreshBus)
  bus.off(KEY_DELETE, deleteKey)
  if (timer) clearInterval(timer)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})
// #endregion
</script>

<template>
  <!-- 扫描进度由搜索框内的进度环展示，避免 loading 遮罩拦截暂停/继续操作 -->
  <div class="redis-value">
    <template v-if="share.redisKey && redisValue">
      <!-- 顶栏 -->
      <div class="value-header">
        <div class="value-header-main">
          <el-input type="text" v-model="showKey" readonly class="value-header-input">
            <template #prepend>
              <me-icon
                icon="me-icon-location"
                class="suffix-ttl icon-btn"
                icon-left
                :name="toKeyTypeLabel(redisValue.type)"
                :info="t('redisValue.locateKeyHint')"
                placement="top"
                @click.stop="locateKeyInTree" />
            </template>
            <template #suffix>
              <span class="ttl-suffix-separator">|</span>
              <me-icon
                icon="el-icon-timer"
                class="suffix-ttl icon-btn"
                icon-left
                :name="ttlDisplayText"
                :info="ttlIconHint"
                placement="top"
                @click.stop="updateTTL" />
            </template>
          </el-input>
        </div>

        <div class="value-header-actions">
          <me-icon
            :icon="isCurrentKeyFavorited ? 'el-icon-star-filled' : 'el-icon-star'"
            :class="['icon-btn', { 'is-favorited': isCurrentKeyFavorited }]"
            :name="isCurrentKeyFavorited ? t('keyTree.unfavoriteKey') : t('keyTree.favoriteKey')"
            hint
            placement="top"
            @click="toggleFavorite" />
          <me-icon
            v-if="canEdit"
            icon="el-icon-delete"
            class="icon-btn"
            :name="t('redisValue.deleteKey')"
            hint
            placement="top"
            @click="delKey" />
          <el-dropdown placement="bottom-end" @command="onKeyMoreCommand">
            <me-icon icon="el-icon-more-filled" class="icon-btn" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="refreshKey">
                  <me-icon icon="el-icon-refresh-right" :name="t('redisValue.refreshKey')" />
                </el-dropdown-item>
                <el-dropdown-item command="copyKey">
                  <me-icon icon="el-icon-document-copy" :name="t('keyTree.copyKey')" />
                </el-dropdown-item>
                <el-dropdown-item command="copyValue">
                  <me-icon icon="el-icon-document-copy" :name="t('redisValue.copyValue')" />
                </el-dropdown-item>
                <el-dropdown-item command="copyAsCommand" :disabled="copyAsCommandLoading">
                  <me-icon icon="me-icon-copy-command" :name="t('redisValue.copyAsCommand')" />
                </el-dropdown-item>
                <el-dropdown-item v-if="canEdit" command="renameKey">
                  <me-icon icon="el-icon-edit" :name="t('redisValue.renameKey')" />
                </el-dropdown-item>
                <el-dropdown-item v-if="canEdit" command="duplicateKey">
                  <me-icon icon="el-icon-copy-document" :name="t('redisValue.duplicateKey')" />
                </el-dropdown-item>
                <el-dropdown-item v-if="share.conn?.cluster" command="showSlot" divided>
                  <me-icon icon="me-icon-slot" :name="t('redisValue.slotTitle')" />
                </el-dropdown-item>
                <el-dropdown-item v-if="share.conn?.cluster" command="showLocation">
                  <me-icon icon="el-icon-location" :name="t('redisValue.locationTitle')" />
                </el-dropdown-item>
                <el-dropdown-item command="objectInfo" divided>
                  <me-icon icon="el-icon-info-filled" :name="t('redisValue.objectInfo')" />
                </el-dropdown-item>
                <el-dropdown-item command="commandHelp">
                  <me-icon icon="el-icon-help" :name="t('redisValue.commandHelp')" />
                </el-dropdown-item>
                <el-dropdown-item command="keyShort">
                  <me-icon icon="me-icon-keyshort" :name="t('redisValue.keyShortHint')" />
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 主区 -->
      <div class="value-main">
        <el-alert
          v-if="showValueTruncatedAlert"
          type="warning"
          :title="t('redisValue.valueTruncatedTitle')"
          show-icon
          :closable="false"
          class="value-truncated-alert">
          <p class="value-truncated-desc">
            {{
              t('redisValue.valueTruncatedDesc', {
                size: meHumanSize(redisValue?.length ?? 0),
                limit: meHumanSize(VALUE_BYTE_LIMIT),
                preview: VALUE_PREVIEW_BYTES,
              })
            }}
          </p>
          <div class="value-truncated-actions">
            <el-button size="small" @click="dismissValueTruncated">
              {{ t('redisValue.valueTruncatedDismiss') }}
            </el-button>
            <el-button size="small" type="warning" plain :disabled="loading" @click="loadFullValue">
              {{ t('redisValue.valueTruncatedLoadAll') }}
            </el-button>
          </div>
        </el-alert>
        <!-- json显示 -->
        <me-code
          v-if="viewType === 'json'"
          :key="valueEditorRemountKey"
          :modelValue="showValue"
          @update:modelValue="onCodeUpdate"
          :read-only="editorReadOnly"
          :error="viewDecodeFailed" />

        <!-- 表格显示 -->
        <div class="me-flex value-table-pane" v-else @click="onFieldPanelOutsideClick">
          <div class="me-flex table-toolbar">
            <el-input
              v-model="fieldKeyword"
              :placeholder="fieldScanInputPlaceholder"
              :readonly="loading"
              clearable
              class="field-scan-input"
              @keyup.enter="onFieldSearch">
              <template #suffix>
                <div class="keyword-suffix">
                  <el-tooltip
                    v-if="showScanControl"
                    :content="scanToggleTip"
                    placement="bottom"
                    :show-after="1000">
                    <div class="scan-control" @click.stop="onFieldScanAction">
                      <el-progress
                        type="circle"
                        :percentage="scanProgress"
                        :width="22"
                        :stroke-width="2"
                        :show-text="false"
                        color="var(--el-color-danger)"
                        class="scan-ring" />
                      <me-icon
                        :icon="loading ? 'el-icon-video-pause' : 'el-icon-video-play'"
                        class="scan-icon" />
                    </div>
                  </el-tooltip>
                  <el-tooltip
                    v-if="showFieldExactCheckbox"
                    :content="fieldExactSearchTip"
                    placement="bottom"
                    raw-content
                    :show-after="1000">
                    <el-checkbox size="small" v-model="fieldExact" class="suffix-exact-checkbox" />
                  </el-tooltip>
                </div>
              </template>
            </el-input>

            <div v-if="streamType" class="stream-range-inputs">
              <el-input
                @keyup.enter="restartFieldScan()"
                v-model.trim="meta.minId"
                placeholder="MinId"
                clearable />
              <span class="stream-range-sep">-</span>
              <el-input
                @keyup.enter="restartFieldScan()"
                v-model.trim="meta.maxId"
                placeholder="MaxId"
                clearable />
            </div>

            <div v-if="listType || arrayType" class="list-range-inputs">
              <el-input
                @keyup.enter="restartFieldScan()"
                v-model.trim="listIndexMin"
                :placeholder="t('redisValue.listIndexMin')"
                clearable />
              <span class="list-range-sep">-</span>
              <el-input
                @keyup.enter="restartFieldScan()"
                v-model.trim="listIndexMax"
                :placeholder="t('redisValue.listIndexMax')"
                clearable />
            </div>

            <div v-if="zsetType" class="list-range-inputs">
              <el-input
                @keyup.enter="restartFieldScan()"
                v-model.trim="zsetScoreMin"
                :placeholder="t('redisValue.zsetScoreMin')"
                clearable />
              <span class="list-range-sep">-</span>
              <el-input
                @keyup.enter="restartFieldScan()"
                v-model.trim="zsetScoreMax"
                :placeholder="t('redisValue.zsetScoreMax')"
                clearable />
            </div>

            <!-- 右侧更多+插入行 -->
            <div class="table-toolbar-actions">
              <!-- VectorSet 浏览模式：随机采样 / 范围查询 -->
              <el-segmented
                v-if="vectorsetType"
                v-model="vectorsetSample"
                style="margin-left: 10px"
                :options="vectorsetBrowseOptions"
                @change="onVectorsetBrowseChange" />
              <me-button
                v-if="showHashFieldTtlOption"
                icon="el-icon-clock"
                :type="scanHashFieldTtl ? 'primary' : 'default'"
                style="margin-left: 10px"
                @click="toggleHashFieldTtl">
                HTTL
              </me-button>
              <el-button
                v-if="streamType"
                :icon="streamDescAsc ? 'el-icon-sort-up' : 'el-icon-sort-down'"
                @click="toggleStreamSortOrder"
                style="margin-left: 10px">
                {{ streamDescAsc ? t('redisValue.listSortAsc') : t('redisValue.listSortDesc') }}
              </el-button>
              <el-button
                icon="el-icon-grid"
                @click="showGroups"
                style="margin-left: 10px"
                v-if="streamType">
                Groups
              </el-button>
              <el-button
                v-if="hashType"
                icon="el-icon-key"
                @click="showAllHashKeys"
                style="margin-left: 10px">
                {{ t('redisValue.allHashKeys') }}
              </el-button>
              <el-button
                v-if="hashType"
                icon="el-icon-document"
                @click="showAllHashValues"
                style="margin-left: 10px">
                {{ t('redisValue.allHashValues') }}
              </el-button>
              <el-button
                v-if="listType"
                :icon="listDescAsc ? 'el-icon-sort-up' : 'el-icon-sort-down'"
                @click="toggleListSortOrder"
                style="margin-left: 10px">
                {{ listDescAsc ? t('redisValue.listSortAsc') : t('redisValue.listSortDesc') }}
              </el-button>
              <me-button
                v-if="zsetType"
                icon="me-icon-rank"
                @click="showZsetRange"
                style="margin-left: 10px">
                {{ t('redisValue.zsetRange') }}
              </me-button>
              <me-button
                v-if="arrayType"
                icon="me-icon-rank"
                @click="showArLastItems"
                style="margin-left: 10px">
                {{ t('redisValue.arLastItems') }}
              </me-button>
              <el-dropdown
                v-if="((listType || setType || zsetType) && canEdit) || arrayType || vectorsetType"
                placement="bottom-end"
                @command="onPopCommand"
                style="margin-left: 10px">
                <el-button icon="el-icon-arrow-down">
                  {{ t('redisValue.fieldCommands') }}
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="listType" command="LPOP">LPOP</el-dropdown-item>
                    <el-dropdown-item v-if="listType" command="RPOP">RPOP</el-dropdown-item>
                    <el-dropdown-item v-if="setType" command="SPOP">SPOP</el-dropdown-item>
                    <el-dropdown-item v-if="zsetType" command="ZPOPMIN">ZPOPMIN</el-dropdown-item>
                    <el-dropdown-item v-if="zsetType" command="ZPOPMAX">ZPOPMAX</el-dropdown-item>
                    <el-dropdown-item v-if="arrayType" command="ARINFO">ARINFO</el-dropdown-item>
                    <el-dropdown-item v-if="vectorsetType" command="VINFO">VINFO</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button
                v-if="canEdit"
                icon="el-icon-plus"
                style="margin-left: 10px"
                @click="fieldAdd">
                {{ t('redisValue.insertRow') }}
              </el-button>
            </div>
          </div>
          <div class="table-view">
            <me-table
              :key="redisValue?.type"
              layout="sizes, prev, pager, next, jumper"
              :data="tableDisplayList"
              :default-sort="tableDefaultSort"
              border
              stripe
              ref="table"
              height="100%"
              export-name="value"
              :export-rows="exportValueTableRows"
              :row-class-name="rowClassName"
              @row-click="rowClick"
              @row-dblclick="rowDblClick">
              <!-- 索引 -->
              <el-table-column label="#" type="index" width="50" align="center">
                <template #default="scope">
                  <div class="index-cell">
                    <template v-if="fieldSetIndex !== scope.$index">{{
                      scope.$index + 1
                    }}</template>
                    <me-icon
                      v-else
                      :icon="fieldSetReadonly ? 'el-icon-view' : 'el-icon-edit'"
                      :style="{ color: share.color }"></me-icon>
                  </div>
                </template>
              </el-table-column>

              <!-- Stream ID -->
              <el-table-column
                :label="t('redisValue.id')"
                prop="id"
                width="350"
                sortable
                v-if="streamType">
                <template #default="{ row }">
                  <div class="me-flex" style="width: 100%">
                    <span>{{ row.id }}</span>
                    <span v-if="streamIdToDate(row.id)" style="color: var(--el-color-info)">
                      {{ streamIdToDate(row.id) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- Hash：哈希键 -->
              <el-table-column :label="t('redisValue.key')" prop="key" sortable v-if="hashType">
                <template #default="scope">
                  {{ formatTableCell(scope.row.key) }}
                </template>
              </el-table-column>

              <!-- List / Array 索引 -->
              <el-table-column
                :label="t('redisValue.index')"
                prop="index"
                width="100"
                sortable
                v-if="listType || arrayType" />

              <!-- 字段值 / Vector Set 元素名 -->
              <el-table-column
                :label="vectorsetType ? t('redisValue.element') : t('redisValue.value')"
                prop="value"
                min-width="180"
                sortable
                :sort-method="compareFieldRowValue">
                <template #default="scope">
                  {{ fieldRowDisplayValue(scope.row) }}
                </template>
              </el-table-column>

              <!-- VectorSet：属性 -->
              <el-table-column
                :label="t('fieldSet.attrs')"
                prop="attrs"
                min-width="180"
                v-if="vectorsetType">
                <template #default="scope">
                  {{ scope.row.attrs || '' }}
                </template>
              </el-table-column>

              <!-- VectorSet：向量 -->
              <el-table-column
                :label="t('fieldSet.vector')"
                prop="vector"
                min-width="180"
                v-if="vectorsetType">
                <template #default="scope">
                  {{ scope.row.vector || '' }}
                </template>
              </el-table-column>

              <!-- 分数 -->
              <el-table-column
                :label="t('redisValue.score')"
                prop="score"
                width="140"
                sortable
                v-if="zsetType" />

              <!-- TTL -->
              <el-table-column
                :label="t('redisValue.ttl')"
                width="140"
                prop="ttl"
                v-if="showHashFieldTtlOption && scanHashFieldTtl">
                <template #default="scope">
                  {{ formatFieldTtl(scope.row.ttl) }}
                </template>
              </el-table-column>

              <!-- 操作 -->
              <el-table-column :label="t('action')" width="80" fixed="right" align="center">
                <template #default="scope">
                  <div class="field-row-actions me-flex" style="justify-content: center; gap: 8px">
                    <me-icon
                      v-if="canEdit && !streamType"
                      :info="t('edit')"
                      icon="el-icon-edit"
                      class="icon-btn"
                      @click.stop="openFieldPanel(scope.row, scope.$index, false)" />
                    <me-icon
                      v-else
                      :info="t('view')"
                      icon="el-icon-view"
                      class="icon-btn"
                      @click.stop="openFieldPanel(scope.row, scope.$index, true)" />
                    <!-- VectorSet：以此元素 VSIM 查询 -->
                    <me-icon
                      v-if="vectorsetType"
                      :info="t('redisValue.vSimTitle')"
                      icon="me-icon-rank"
                      class="icon-btn"
                      @click.stop="showVSimWithElement(fieldRowDisplayValue(scope.row))" />
                    <!-- 删除（非 VectorSet 保持现有） -->
                    <el-popconfirm
                      v-if="canEdit && !vectorsetType"
                      :hide-after="0"
                      :title="t('redisValue.deleteConfirm')"
                      @confirm.stop="fieldDel(scope.row)">
                      <template #reference>
                        <me-icon :info="t('delete')" icon="el-icon-delete" class="icon-btn" />
                      </template>
                    </el-popconfirm>
                    <el-dropdown
                      trigger="click"
                      placement="bottom-end"
                      @command="(cmd: string) => onFieldRowMoreCommand(cmd, scope.row)">
                      <me-icon icon="el-icon-more-filled" class="icon-btn" />
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item
                            v-if="supportsFieldRowRefresh(redisValue.type)"
                            command="refreshRow">
                            <me-icon
                              icon="el-icon-refresh-right"
                              :name="t('redisValue.refreshFieldRow')" />
                          </el-dropdown-item>
                          <el-dropdown-item v-if="hashType" command="copyKey">
                            <me-icon icon="el-icon-document-copy" :name="t('redisValue.copyKey')" />
                          </el-dropdown-item>
                          <el-dropdown-item v-if="listType || arrayType" command="copyIndex">
                            <me-icon
                              icon="el-icon-document-copy"
                              :name="t('redisValue.copyIndex')" />
                          </el-dropdown-item>
                          <el-dropdown-item v-if="streamType" command="copyStreamId">
                            <me-icon
                              icon="el-icon-document-copy"
                              :name="t('redisValue.copyStreamId')" />
                          </el-dropdown-item>
                          <el-dropdown-item command="copyValue">
                            <me-icon
                              icon="el-icon-document-copy"
                              :name="
                                vectorsetType
                                  ? t('redisValue.copyElement')
                                  : t('redisValue.copyValue')
                              " />
                          </el-dropdown-item>
                          <!-- VectorSet：复制属性、复制向量 -->
                          <el-dropdown-item v-if="vectorsetType" command="copyAttrs">
                            <me-icon
                              icon="el-icon-document-copy"
                              :name="t('redisValue.copyAttrs')" />
                          </el-dropdown-item>
                          <el-dropdown-item v-if="vectorsetType" command="copyVector">
                            <me-icon
                              icon="el-icon-document-copy"
                              :name="t('redisValue.copyVector')" />
                          </el-dropdown-item>
                          <el-dropdown-item v-if="zsetType" command="copyScore">
                            <me-icon
                              icon="el-icon-document-copy"
                              :name="t('redisValue.copyScore')" />
                          </el-dropdown-item>
                          <el-dropdown-item command="copyAsCommand">
                            <me-icon
                              icon="me-icon-copy-command"
                              :name="t('redisValue.copyAsCommand')" />
                          </el-dropdown-item>
                          <el-dropdown-item v-if="zsetType" command="showZsetRank">
                            <me-icon icon="me-icon-rank" :name="t('redisValue.showZsetRank')" />
                          </el-dropdown-item>
                          <!-- VectorSet：删除放最下面，避免误操作 -->
                          <el-dropdown-item v-if="vectorsetType && canEdit" command="deleteElement">
                            <me-icon icon="el-icon-delete" :name="t('delete')" />
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </me-table>
            <!-- 字段编辑 -->
            <FieldSet
              ref="fieldSetRef"
              :pretty="isPretty"
              :hash-field-ttl-enabled="scanHashFieldTtl"
              @success="onFieldSetSuccess"
              @refreshed="onFieldSetRefreshed"
              @closed="fieldSetInit"
              class="field-set" />
          </div>
        </div>
      </div>

      <!-- 底栏 -->
      <div class="value-footer me-flex" @click="onFieldPanelOutsideClick">
        <div class="me-flex" style="align-items: center">
          <!-- 美化/复制 -->
          <me-icon
            placement="top-start"
            :info="t('redisValue.prettyHint')"
            class="icon-btn"
            :style="{ opacity: isPretty ? 1 : 0.2 }"
            icon="el-icon-magic-stick"
            @click="isPretty = !isPretty" />

          <me-icon
            style="font-size: 18px; margin-left: 5px"
            :info="t('redisValue.copyValue')"
            class="icon-btn"
            icon="el-icon-document-copy"
            @click="meCopy(showValue)"
            placement="top-start" />

          <!-- 刷新键：点击手动刷新；hover 展开自动刷新配置（与 RedisChart 一致） -->
          <el-dropdown placement="top-start" :hide-on-click="false" :teleported="false">
            <me-icon
              class="icon-btn"
              :class="{ rotating: loading || autoRefresh }"
              style="font-size: 18px; margin-left: 5px"
              :icon="loading ? 'el-icon-loading' : 'el-icon-refresh-right'"
              @click="onFooterRefreshKey" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-form
                  label-position="left"
                  :label-width="t('redisValue.autoRefreshLabelWidth')"
                  class="auto-refresh-form">
                  <el-form-item :label="t('redisValue.autoRefresh')">
                    <el-switch v-model="autoRefresh" />
                  </el-form-item>
                  <el-form-item :label="t('redisValue.autoRefreshInterval')">
                    <el-input-number
                      v-model="autoRefreshInterval"
                      :min="1"
                      :max="10"
                      size="small"
                      style="width: 80px" />
                  </el-form-item>
                </el-form>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-divider direction="vertical" v-if="textMemory" />

          <!-- 内存占用 -->
          <el-text> {{ textMemory }} </el-text>

          <el-divider direction="vertical" v-if="textLength" />

          <!-- 字节长度 / 总数（同一位置，按类型切换标签） -->
          <el-text> {{ textLength }} </el-text>

          <el-divider direction="vertical" v-if="textEntries" />

          <!-- 已扫描：筛选 / 已加载（与总数关联，紧挨展示） -->
          <el-text> {{ textEntries }} </el-text>

          <!-- Array ARLEN / VectorSet VDIM 放最后，避免插在总数与已扫描之间 -->
          <el-divider direction="vertical" v-if="textArLen" />
          <el-text v-if="textArLen"> {{ textArLen }} </el-text>
          <el-divider direction="vertical" v-if="textVectorDim" />
          <el-text v-if="textVectorDim"> {{ textVectorDim }} </el-text>
        </div>

        <div class="me-flex" style="position: relative">
          <!-- 底栏贴底：下拉固定向上，避免翻到窗口外 -->
          <el-select
            v-model="bytesFormat"
            class="bytes-format-select me-select-plain"
            :suffix-icon="MeSelectUpDownIcon"
            :disabled="jsonType || streamType"
            placement="top-end"
            :fallback-placements="['top', 'top-start']"
            @change="onBytesFormatChange">
            <template #header>
              <div
                class="me-flex"
                style="align-items: center; justify-content: space-evenly; width: 100%">
                <el-text style="font-weight: bold">{{ t('redisValue.viewCodec') }}</el-text>
                <me-icon
                  v-if="canEdit"
                  icon="el-icon-edit"
                  :name="t('customCodec.title')"
                  hint
                  class="icon-btn"
                  style="margin-left: 5px"
                  @click.stop="customCodecVisible = true" />
              </div>
            </template>
            <el-option
              v-for="item in formatOptions.builtin"
              :key="item.value"
              :label="item.label"
              :value="item.value"
              :disabled="item.disabled" />
            <el-option-group v-if="formatOptions.custom.length" :label="t('customCodec.group')">
              <el-option
                v-for="item in formatOptions.custom"
                :key="item.value"
                :label="item.label"
                :value="item.value"
                :disabled="item.disabled" />
            </el-option-group>
          </el-select>
          <!-- Auto 识别结果：下拉右侧，与字段弹窗一致 -->
          <el-text
            v-if="detectedViewText"
            class="bytes-format-auto-label"
            style="margin-left: 2px; white-space: nowrap"
            :title="t('redisValue.autoDetected')">
            {{ detectedViewText }}
          </el-text>
          <!-- 加载更多、加载全部 -->
          <div class="me-flex" style="width: 45px; margin-left: 10px" v-if="showMore">
            <me-icon
              :name="t('redisValue.loadMore')"
              icon="me-icon-load-more"
              hint
              placement="top"
              class="icon-btn"
              @click="refreshKey(false, true, false)" />
            <me-icon
              :name="t('redisValue.loadAll')"
              icon="me-icon-load-all"
              hint
              placement="top"
              class="icon-btn"
              @click="refreshKey(false, true, true)" />
          </div>

          <!-- 连接只读：隐藏；禁用时 tooltip 说明原因 -->
          <el-tooltip v-if="showSave" :content="saveTip" placement="top" :show-after="300">
            <span style="margin-left: 10px; display: inline-flex">
              <me-button
                :disabled="saveDisabled"
                type="primary"
                icon="me-icon-save"
                @click="setValue" />
            </span>
          </el-tooltip>
          <!-- string / json 类型不显示 -->
          <el-segmented
            style="margin-left: 10px"
            v-model="viewType"
            :options="viewTypeList"
            @change="onViewTypeChange"
            v-if="!(stringType || jsonType)">
            <template #default="scope">
              <me-icon
                :name="t('redisValue.jsonView')"
                icon="me-icon-json"
                hint
                placement="top"
                v-if="scope.item === 'json'" />
              <me-icon
                :name="t('redisValue.tableView')"
                icon="me-icon-table"
                hint
                placement="top"
                v-else />
            </template>
          </el-segmented>
        </div>
      </div>
    </template>

    <!-- 未选键 / 键已不存在（fieldScan key_not_found 清空后） -->
    <el-empty
      v-else
      :description="share.redisKey ? t('redisValue.keyGone') : t('redisValue.noKeySelected')" />

    <!-- 共享弹窗（KeyMain / Terminal 也用）：TTL / 字段新增 / 重命名 / 命令帮助 -->
    <TTLSet ref="ttlSetRef" @success="setTimer" />
    <FieldAdd ref="fieldAddRef" @success="refreshKey" />
    <KeyRename ref="keyRenameRef" />
    <CommandHelp ref="commandHelpRef" />

    <!-- 本域弹窗：OBJECT / ARINFO / VINFO / ZRANK / 自定义编解码 -->
    <TableInfo ref="tableInfoRef" />
    <CustomCodec v-model="customCodecVisible" />

    <!-- 本域类型扩展：Stream 组 / Hash 全量 / ZSet TopN / Array 尾部 -->
    <TableGroup ref="tableGroupRef" />
    <TableHashKeys ref="hashKeysRef" />
    <TableZsetRange ref="zsetRangeRef" />
    <TableArLastItems ref="arLastItemsRef" />
    <TableVSim ref="vSimRef" />

    <!-- 本域帮助：值编辑器快捷键 -->
    <ValueShortcut ref="valueShortcutRef" />
  </div>
</template>

<style scoped lang="scss">
.redis-value {
  // 根布局：顶栏 + 主区 + 底栏
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  // 顶栏：键名 / TTL / 收藏删除更多
  .value-header {
    margin-right: 5px;
    display: flex;
    align-items: center;
    gap: 10px;

    :deep(.el-input-group__prepend) {
      padding: 0 12px;
    }

    .value-header-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .value-header-input {
      flex: 1;
      min-width: 0;
    }

    .value-header-hash {
      width: 200px;
      flex-shrink: 0;
    }

    .suffix-ttl {
      cursor: pointer;
      font-size: 13px;
      color: var(--el-text-color-secondary);

      &:hover {
        color: var(--el-color-primary);
      }
    }

    .ttl-suffix-separator {
      margin-right: 6px;
      color: var(--el-border-color);
      user-select: none;
    }

    .value-header-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;

      :deep(.icon-btn) {
        font-size: 18px;
      }

      .is-favorited {
        color: #f7ba2a;
      }
    }
  }

  // 主区：纵向 flex。预览提示占自然高度，编辑器/表格吃剩余空间，避免 height:100% 把整块顶出视口跟着滚
  .value-main {
    margin: 10px 0 5px 0;
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    :deep(.me-code-wrap) {
      flex: 1;
      min-height: 0;
      height: auto;
    }

    .value-table-pane {
      flex: 1;
      min-height: 0;
      flex-direction: column;
    }

    // STRING 大值截断提示
    .value-truncated-alert {
      flex-shrink: 0;
      margin-bottom: 8px;

      .value-truncated-desc {
        margin: 0 0 8px;
        line-height: 1.5;
      }

      .value-truncated-actions {
        display: flex;
        gap: 8px;
      }
    }

    // 表格工具栏：扫描 / 范围 / 精确 / 更多
    .table-toolbar {
      width: 100%;
      align-items: center;

      .stream-range-inputs,
      .list-range-inputs {
        display: flex;
        gap: 5px;
        margin-left: 10px;
        flex-shrink: 0;
        align-items: center;

        :deep(.el-input) {
          width: 120px;
        }
      }

      .list-range-sep,
      .stream-range-sep {
        color: var(--el-text-color-secondary);
        flex-shrink: 0;
      }

      .table-toolbar-actions {
        margin-left: auto;
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      .field-scan-input {
        width: 250px;
        flex-shrink: 0;

        .keyword-suffix {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: 6px;

          :deep(.suffix-exact-checkbox) {
            height: auto;

            .el-checkbox__inner {
              border-color: var(--el-text-color-secondary);
              background-color: transparent;
            }

            &:hover .el-checkbox__inner {
              border-color: var(--el-color-primary);
            }

            &.is-checked .el-checkbox__inner {
              background-color: var(--el-color-primary);
              border-color: var(--el-color-primary);
            }
          }
        }

        .scan-control {
          position: relative;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;

          .scan-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            line-height: 1;
          }

          .scan-icon {
            position: relative;
            z-index: 1;
            font-size: 16px;

            :deep(.icon),
            :deep(svg) {
              width: 16px;
              height: 16px;
            }
          }
        }
      }
    }

    // 表格：单元格省略 / 行操作 / 字段编辑浮层
    .table-view {
      margin-top: 10px;
      flex-grow: 1;
      height: 0;
      width: 100%;
      position: relative;

      :deep(.el-table) {
        // 单行省略：不依赖 show-overflow-tooltip（避免悬停气泡）
        .cell {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          word-break: keep-all;
        }

        .field-set-row {
          --el-table-tr-bg-color: var(--el-color-warning-light-9);
        }

        // 序号列：编辑态图标与行号均居中
        .index-cell {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        // 已在 :deep(.el-table) 内，勿再套 :deep（否则会残留给 lightningcss）
        .field-row-actions {
          .icon-btn {
            font-size: 16px;
          }
        }
      }

      .field-set {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 20;
        width: 60%;
        height: 100%;
      }
    }
  }

  // 底栏：格式下拉 / 刷新旋转 / 保存
  .value-footer {
    height: 30px;
    font-size: 20px;

    @keyframes rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .rotating {
      animation: rotate 1s linear infinite;
    }

    // 刷新图标 hover 菜单：自动刷新配置
    .auto-refresh-form {
      padding: 6px 10px;

      :deep(.el-form-item) {
        margin-bottom: 6px;

        &:last-child {
          margin-bottom: 0;
        }
      }
    }

    .bytes-format-auto-label {
      color: var(--el-color-primary);
      font-weight: 600;
    }

    .bytes-format-select {
      :deep(.el-select__wrapper) {
        min-height: 0;
        height: 30px;
        padding: 4px;
      }
    }

    :deep(.el-select-dropdown__item) {
      padding: 0 20px 0 20px;
    }
  }
}
</style>
