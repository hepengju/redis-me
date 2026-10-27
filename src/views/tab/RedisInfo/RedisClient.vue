<script setup lang="ts">
// #region 导入
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import { clientTip as tips } from '@/locales/client'
import { shareProvideKey } from '@/types/me-interface'
import type { RedisClientInfo, RedisCommand } from '@/types/tauri-specta'
import { meConfirm, meCopy, meHumanSeconds, meCommands, meOk } from '@/utils/util'
import NodeList from '@/views/ext/NodeList.vue'
// `client_list` 实际载荷字段齐全；`Required` 与 specta 在 `#[serde(default)]` 下生成的可选字段对齐
type RedisClientListRow = Required<RedisClientInfo>
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const props = defineProps({ initNode: { type: String, default: '' } })
const node = ref(props.initNode)
const clientType = ref('')
const keyword = ref('')
const loading = ref(false)
const dataList = ref<RedisClientListRow[]>([])
// #endregion

// #region 计算属性
const canEdit = computed(() => !share.readonly)
const tipMap = computed(() => tips.value as Record<string, string | undefined>)
// #endregion

// #region 面板操作
watch(
  () => props.initNode,
  v => {
    node.value = v
  },
)

async function refresh() {
  loading.value = true
  try {
    dataList.value = (await meCommands.clientList(
      share.conn!.id,
      node.value,
      clientType.value,
    )) as RedisClientListRow[]
  } finally {
    loading.value = false
  }
}
refresh()

// 复制 CLIENT LIST 原始行（后端 raw 字段）
function copyClient(row: RedisClientListRow) {
  meCopy(row.raw)
}

async function killClient(row: RedisClientListRow) {
  meConfirm(t('redisClient.killClientConfirm', { client: row.addr }), async () => {
    const param: RedisCommand = {
      command: `client kill ${row.addr}`,
      node: node.value,
      autoBroadcast: null,
      outputMode: null,
    }
    await meCommands.executeCommand(share.conn!.id, param)
    meOk(t('redisClient.killClientOk'))
    await refresh()
  })
}

// 客户端属性
const totalProps = [
  'user',
  'db',
  'id',
  'addr',
  'laddr',
  'fd',
  'name',
  'age',
  'idle',
  'flags',
  'sub',
  'psub',
  'ssub',
  'multi',
  'watch',
  'qbuf',
  'qbufFree',
  'argvMem',
  'multiMem',
  'obl',
  'oll',
  'omem',
  'totMem',
  'events',
  'cmd',
  'redir',
  'resp',
  'rbp',
  'rbs',
  'libName',
  'libVer',
  'ioThread',
  'totNetIn',
  'totNetOut',
  'totCmds',
]
const mainProps = ['id', 'addr', 'name', 'age', 'idle', 'cmd']
const otherProps = totalProps.filter(p => !mainProps.includes(p))
function propWidth(item: string) {
  if (item === 'laddr') return 180
  if (item.length == 2) return 70
  if (item.length == 3) return 80
  if (item.length == 4) return 96
  if (item.length == 5) return 100
  return 130
}

// 字段列公共部分：prop=key、表头提示取字段说明（无说明回落字段名）；sortable 交由 MeTable 默认策略开启
function fieldCol(
  key: string,
  title: string,
  extra: Partial<MeColumn<RedisClientListRow>> = {},
): MeColumn<RedisClientListRow> {
  return { key, prop: key, title, headerTip: tipMap.value[key] || key, ...extra }
}

// MeTable 列描述：单一来源，表格与导出共用（持续/空闲文本由 formatter 计算，与界面展示一致；
// 操作列无取值源不参与导出）
const clientColumns = computed<MeColumn<RedisClientListRow>[]>(() => [
  fieldCol('id', 'ID', { width: 100, align: 'right' }),
  fieldCol('addr', t('redisClient.addr'), { width: 180, searchable: true }),
  fieldCol('name', t('redisClient.name'), { width: 160, searchable: true }),
  fieldCol('age', t('redisClient.age'), {
    width: 140,
    align: 'right',
    formatter: row => String(meHumanSeconds(row.age)),
  }),
  fieldCol('idle', t('redisClient.idle'), {
    width: 120,
    align: 'right',
    formatter: row => String(meHumanSeconds(row.idle)),
  }),
  fieldCol('cmd', t('redisClient.cmd'), { minWidth: 200 }),
  ...otherProps.map(prop => fieldCol(prop, prop, { width: propWidth(prop), align: 'right' })),
  // 操作列常驻：只读下仍保留「复制原始行」，仅「关闭客户端」随 canEdit 隐藏
  {
    key: 'action',
    title: t('action'),
    width: 80,
    align: 'center' as const,
    fixed: 'right' as const,
  },
])
// #endregion
</script>

<template>
  <div class="redis-client">
    <div class="me-flex header">
      <div class="me-flex">
        <node-list v-model="node" style="margin-right: 10px" @change="refresh" />
        <el-select
          v-model="clientType"
          style="width: 120px"
          @change="refresh"
          :placeholder="t('redisClient.clientType')"
          clearable>
          <el-option value="NORMAL" />
          <el-option value="MASTER" />
          <el-option value="SLAVE" />
          <el-option value="REPLICA" />
          <el-option value="PUBSUB" />
        </el-select>
        <me-website to="client" />
      </div>
      <div>
        <el-input
          v-model="keyword"
          :placeholder="t('redisClient.keyword')"
          style="width: 280px; margin-right: 10px"
          clearable />
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading" />
      </div>
    </div>
    <div class="table">
      <me-table
        v-loading="loading"
        :data="dataList"
        :keyword="keyword"
        :columns="clientColumns"
        :default-sort="{ prop: 'id', order: 'ascending' }"
        export-name="client">
        <template #cell-action="{ row }">
          <div class="action-icons">
            <me-icon
              :info="t('redisClient.copyClientHint')"
              icon="el-icon-document-copy"
              class="icon-btn"
              @click="copyClient(row)" />
            <me-icon
              v-if="canEdit"
              :info="t('redisClient.killClientHint')"
              icon="el-icon-CircleCloseFilled"
              class="icon-btn"
              @click="killClient(row)" />
          </div>
        </template>
      </me-table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-client {
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
  }
}

// 操作列多图标水平均布（与 RedisACL 同域约定一致）
.action-icons {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  flex-wrap: nowrap;
}
</style>
