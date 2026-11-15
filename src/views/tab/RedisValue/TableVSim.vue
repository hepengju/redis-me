<script setup lang="ts">
// #region 导入
// Vector Set VSIM 弹框：ELE / VALUES 相似度查询。
// WITHSCORES 固定；可选 WITHATTRIBS / FILTER / EPSILON / EF。
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table/column'
import { shareProvideKey } from '@/types/me-interface'
import type { RedisVSimItem } from '@/types/tauri-specta'
import { meCommands, meCopy, meErr } from '@/utils/app/util'
import {
  IPC_WIRE_FORMAT,
  meFormatViewValue,
  meViewToWire,
  type ViewBytesFormat,
} from '@/utils/codec/format'
import { parseVectorInput } from '@/utils/redis/vector'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const visible = ref(false)
const loading = ref(false)
// ele | values
const mode = ref<'ele' | 'values'>('ele')
const elementText = ref('')
const vectorText = ref('')
const count = ref(10)
const withAttribs = ref(true)
const filterText = ref('')
const epsilonText = ref('')
const efText = ref('')
const itemList = ref<RedisVSimItem[]>([])
const keyword = ref('')
// #endregion

// #region 计算属性
const dialogTitle = computed(() => t('redisValue.vSimTitle'))
// 高相似度阈值（对齐 RedisInsight）；高亮色优先用连接颜色，整行高亮（与命令日志同方案）
const HIGH_SIMILARITY = 0.85
const highlightColor = computed(() => share.conn?.color || share.color || 'var(--el-color-primary)')
function isHighSimilarity(row: RedisVSimItem) {
  return (row.score ?? 0) >= HIGH_SIMILARITY
}
// 行类由 MeTable rowClass 提供，高亮色经包裹层 --me-vsim-high 变量下发（与命令日志同方案）
function vsimRowClass(row: unknown): string {
  return isHighSimilarity(row as RedisVSimItem) ? 'vsim-high-similarity' : ''
}
const filteredList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return itemList.value
  return itemList.value.filter(
    item =>
      item.key.toLowerCase().includes(kw) ||
      String(item.score).includes(kw) ||
      (item.attrs || '').toLowerCase().includes(kw),
  )
})
// #endregion

let currentViewFmt: ViewBytesFormat = 'utf8'

// #region 面板操作
async function open(viewFmt: ViewBytesFormat = 'utf8', seed?: { elementDisplay?: string }) {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  currentViewFmt = viewFmt
  visible.value = true
  loading.value = false
  mode.value = 'ele'
  elementText.value = seed?.elementDisplay || ''
  vectorText.value = ''
  count.value = 10
  withAttribs.value = true
  filterText.value = ''
  epsilonText.value = ''
  efText.value = ''
  keyword.value = ''
  itemList.value = []

  if (elementText.value) {
    await query()
  }
}

function parseOptionalFloat(text: string): number | null | undefined {
  const s = text.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return undefined
  return n
}

function parseOptionalU64(text: string): number | null | undefined {
  const s = text.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined
  return n
}

// 校验当前表单输入，返回查询参数；校验失败返回 null（query 与复制命令共用，保证两者一致）
function parsedForm(): {
  fieldKey: string
  vector: number[]
  epsilon: number | null
  ef: number | null
} | null {
  let fieldKey = ''
  let vector: number[] = []
  if (mode.value === 'ele') {
    const name = elementText.value.trim()
    if (!name) {
      meErr(t('redisValue.vSimElementRequired'))
      return null
    }
    fieldKey = meViewToWire(name, currentViewFmt)
  } else {
    const parsed = parseVectorInput(vectorText.value)
    // 空向量 parse 仍 ok；VSIM VALUES 必须非空
    if (!parsed.ok || parsed.nums.length === 0) {
      meErr(t('fieldAdd.vectorInvalid'))
      return null
    }
    vector = parsed.nums
  }
  const epsilon = parseOptionalFloat(epsilonText.value)
  if (epsilon === undefined) {
    meErr(t('redisValue.vSimEpsilonInvalid'))
    return null
  }
  const ef = parseOptionalU64(efText.value)
  if (ef === undefined) {
    meErr(t('redisValue.vSimEfInvalid'))
    return null
  }
  return { fieldKey, vector, epsilon, ef }
}

async function query() {
  const conn = share.conn
  const redisKey = share.redisKey
  if (!conn || !redisKey) return

  const form = parsedForm()
  if (!form) return

  loading.value = true
  try {
    const raw = await meCommands.vSim(conn.id, {
      key: redisKey,
      mode: mode.value,
      fieldKey: form.fieldKey,
      vector: form.vector,
      count: count.value,
      withAttribs: withAttribs.value,
      filter: filterText.value.trim(),
      epsilon: form.epsilon,
      ef: form.ef,
      valFmt: IPC_WIRE_FORMAT,
    })
    itemList.value = raw.map(item => ({
      ...item,
      key: meFormatViewValue(item.key, currentViewFmt),
      attrs: item.attrs || '',
    }))
  } finally {
    loading.value = false
  }
}

// 以结果行为种子重新查询（ELE 模式预填元素名）
function seedSearch(row: RedisVSimItem) {
  mode.value = 'ele'
  elementText.value = row.key
  void query()
}

// 列描述：展示与导出文本单一来源；attrs 列与操作列只在需要时出现
const vsimColumns = computed<MeColumn[]>(() => [
  { key: 'index', title: '#', width: 55, align: 'center', index: true },
  { key: 'key', prop: 'key', title: t('redisValue.element'), minWidth: 120 },
  { key: 'score', prop: 'score', title: t('redisValue.score'), minWidth: 120 },
  ...(withAttribs.value
    ? [{ key: 'attrs', prop: 'attrs', title: t('fieldSet.attrs'), minWidth: 120 }]
    : []),
  { key: 'action', title: t('action'), width: 70, align: 'center' },
])

// redis-cli 风格引号：双引号包裹 + 转义 \ " 换行等
function quoteCliArg(s: string): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

// 按当前表单拼 VSIM 命令文本（参数顺序与后端 v_sim0 一致）；校验失败返回 null
function buildVsimCommand(): string | null {
  const redisKey = share.redisKey
  if (!redisKey) return null
  const form = parsedForm()
  if (!form) return null

  const parts = ['VSIM', quoteCliArg(redisKey.key)]
  if (mode.value === 'ele') {
    parts.push('ELE', quoteCliArg(elementText.value.trim()))
  } else {
    parts.push('VALUES', String(form.vector.length), ...form.vector.map(String))
  }
  parts.push('WITHSCORES')
  if (withAttribs.value) parts.push('WITHATTRIBS')
  parts.push('COUNT', String(count.value))
  if (form.epsilon !== null) parts.push('EPSILON', String(form.epsilon))
  if (form.ef !== null) parts.push('EF', String(form.ef))
  const filter = filterText.value.trim()
  if (filter) parts.push('FILTER', quoteCliArg(filter))
  return parts.join(' ')
}

function copyVsimCommand() {
  const cmd = buildVsimCommand()
  if (cmd) meCopy(cmd, t('redisValue.copyCommandOk'))
}

defineExpose({ open })
// #endregion
</script>

<template>
  <me-dialog :title="dialogTitle" icon="me-icon-rank" v-model="visible" width="820">
    <div v-loading="loading" class="table-vsim">
      <!-- 两行同列：EF 与 COUNT 对齐；ELE/VALUES 主输入同宽 -->
      <div class="vsim-form">
        <el-radio-group v-model="mode" size="default">
          <el-radio-button value="ele">ELE</el-radio-button>
          <el-radio-button value="values">VALUES</el-radio-button>
        </el-radio-group>
        <el-input
          v-if="mode === 'ele'"
          v-model="elementText"
          class="c-query"
          :placeholder="t('redisValue.element')"
          clearable />
        <el-input
          v-else
          v-model="vectorText"
          class="c-query"
          :placeholder="t('fieldAdd.vectorValueHint')"
          clearable />
        <el-input-number v-model="count" class="c-count" :min="1" :max="10000" />
        <el-checkbox v-model="withAttribs">WITHATTRIBS</el-checkbox>
        <me-icon
          class="icon-btn"
          icon="el-icon-document"
          :info="t('redisValue.vSimCopyCommand')"
          placement="top"
          @click="copyVsimCommand" />
        <el-button icon="el-icon-search" type="primary" @click="query">
          {{ t('redisValue.vSimQuery') }}
        </el-button>

        <div class="c-filter-group">
          <el-input
            v-model="filterText"
            class="c-filter"
            :placeholder="t('redisValue.vSimFilterHint')"
            clearable />
          <el-input
            v-model="epsilonText"
            class="c-epsilon"
            :placeholder="t('redisValue.vSimEpsilon')"
            clearable />
        </div>
        <el-input v-model="efText" class="c-ef" :placeholder="t('redisValue.vSimEf')" clearable />
        <el-input
          v-model="keyword"
          class="c-kw"
          :placeholder="t('redisValue.vSimFilter')"
          clearable />
      </div>
      <div class="vsim-main">
        <me-table
          :data="filteredList"
          :columns="vsimColumns"
          :total="itemList.length"
          :empty-text="loading ? ' ' : t('redisValue.vSimEmpty')"
          export-name="vsim"
          :row-class="vsimRowClass"
          :style="{ '--me-vsim-high': highlightColor }"
          :default-sort="{ prop: 'score', order: 'descending' }">
          <!-- 行操作：以此为种子查询 -->
          <template #cell-action="{ row }">
            <me-icon
              :info="t('redisValue.vSimSeed')"
              icon="me-icon-rank"
              class="icon-btn"
              @click.stop="seedSearch(row)" />
          </template>
        </me-table>
      </div>
    </div>
  </me-dialog>
</template>

<style scoped lang="scss">
.table-vsim {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  // 列：模式 | 主输入 | COUNT/EF | WITHATTRIBS | 复制命令 | 查询
  .vsim-form {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 110px auto auto auto;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;

    .c-query {
      width: 100%;
      min-width: 0;
    }

    .c-count,
    .c-ef {
      width: 110px;
    }

    // FILTER + EPSILON 占前两列，使 EF 对上 COUNT
    .c-filter-group {
      grid-column: 1 / 3;
      display: flex;
      gap: 8px;
      min-width: 0;

      .c-filter {
        flex: 1;
        min-width: 0;
      }

      .c-epsilon {
        width: 120px;
        flex-shrink: 0;
      }
    }

    .c-ef {
      grid-column: 3;
    }

    .c-kw {
      grid-column: 4 / -1;
      width: 100%;
      min-width: 0;
    }
  }

  .vsim-main {
    flex: 1;
    min-height: 0;
  }
}

// 高相似度整行高亮：变量由 me-table 包裹层 inline style 提供，类由 rowClass 加在行节点（运行时添加须 :deep）
:deep(.vsim-high-similarity) {
  color: var(--me-vsim-high);
}
</style>
