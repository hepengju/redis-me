<script setup lang="ts">
// #region 导入
import { invoke } from '@tauri-apps/api/core'
import { inject, ref, watch } from 'vue'

import { shareProvideKey } from '@/types/me-interface'
import type {
  ConnConfig,
  FieldScanParam_Deserialize,
  RedisBatchKey_Deserialize,
  RedisBatchTtl_Deserialize,
  RedisCommand,
  RedisExportCsv_Deserialize,
  RedisFieldAdd_Deserialize,
  RedisFieldAsCommand_Deserialize,
  RedisFieldDel_Deserialize,
  RedisFieldGet_Deserialize,
  RedisFieldSet_Deserialize,
  RedisHashKeys_Deserialize,
  RedisPop_Deserialize,
  RedisImportCsv,
  RedisKey_Deserialize,
  RedisMemoryParam,
  RedisSetParam_Deserialize,
  ScanCursor,
  ScanParam,
} from '@/types/tauri-specta'
import { commands } from '@/types/tauri-specta'
import { meJsonParse } from '@/utils/util'
// #endregion

// #region 默认参数构建
type CommandKey = keyof typeof commands

const share = inject(shareProvideKey)!

// 默认 JSON 里的连接 id：当前标签页连接，未连接时用占位
function connIdForDefaults(): string {
  return share.conn?.id ?? 'test'
}

const commandKeys = (Object.keys(commands) as CommandKey[])
  .slice()
  .sort((a, b) => a.localeCompare(b))

const emptySsl = { key: '', cert: '', ca: '' } as const
const emptySentinel = { masterName: '', masterUsername: '', masterPassword: '' } as const
const emptySsh = {
  host: '',
  port: 22,
  loginType: '',
  username: '',
  password: '',
  pkfile: '',
  passphrase: '',
} as const

function buildMinimalConn(): ConnConfig {
  return {
    id: connIdForDefaults(),
    name: 'local',
    host: '127.0.0.1',
    port: 6379,
    username: '',
    password: '',
    db: 0,
    cluster: false,
    ssl: false,
    sslOption: { ...emptySsl },
    sentinel: false,
    sentinelOption: { ...emptySentinel },
    ssh: false,
    sshOption: { ...emptySsh },
  }
}

const emptyScanCursor: ScanCursor = {
  readyNodes: [],
  nowNode: '',
  nowCursor: 0,
  streamCursor: '',
  finished: false,
}

const minimalScanParam: ScanParam = {
  match: '*',
  type: null,
  cursor: emptyScanCursor,
  exact: false,
  count: 1000,
}

const dummyKey: RedisKey_Deserialize = { key: 'k', bytes: '' }

const minimalFieldScan: FieldScanParam_Deserialize = {
  key: dummyKey,
  count: 100,
  cursor: null,
  match: '*',
  exact: false,
  meta: null,
  bytesFormat: null,
  includeMeta: null,
  keyType: null,
  includeFieldTtl: null,
}

const minimalSetParam: RedisSetParam_Deserialize = {
  key: dummyKey,
  value: '',
  ttl: -1,
  keyType: null,
  inputFormat: null,
}

const minimalFieldAdd: RedisFieldAdd_Deserialize = {
  key: { key: '', bytes: '' },
  mode: 'key',
  type: 'string',
  ttl: -1,
  value: '',
  keyFmt: null,
  valFmt: null,
  listPushMethod: 'lpush',
  arrayWriteMethod: 'arset',
  vector: [],
  attrs: '',
  fieldValueList: [],
  streamId: '',
}

const minimalFieldSet: RedisFieldSet_Deserialize = {
  key: dummyKey,
  srcFieldValue: '',
  fieldIndex: 0,
  fieldKey: '',
  fieldValue: '',
  fieldScore: 0,
  fieldTtl: -1,
  includeFieldTtl: false,
  valFmt: null,
  vector: [],
  attrs: '',
}

const minimalFieldGet: RedisFieldGet_Deserialize = {
  key: dummyKey,
  fieldIndex: 0,
  fieldKey: '',
  fieldValue: '',
  includeFieldTtl: false,
  valFmt: null,
}

const minimalHashKeys: RedisHashKeys_Deserialize = { key: dummyKey, valFmt: null }

const minimalFieldPop: RedisPop_Deserialize = { key: dummyKey, mode: 'LPOP', valFmt: null }

const minimalFieldDel: RedisFieldDel_Deserialize = {
  key: dummyKey,
  fieldIndex: 0,
  fieldKey: '',
  fieldValue: '',
  streamId: '',
  valFmt: null,
}

const minimalFieldAsCommand: RedisFieldAsCommand_Deserialize = {
  key: dummyKey,
  fieldIndex: 0,
  fieldKey: '',
  fieldValue: '',
  streamId: '',
  valFmt: null,
}

const minimalRedisCmd: RedisCommand = {
  command: 'PING',
  node: null,
  autoBroadcast: null,
  outputMode: null,
}

const minimalMemoryParam: RedisMemoryParam = {
  match: null,
  sizeLimit: 100,
  scanCount: 100,
  cursor: null,
  needKeyType: null,
}

const minimalBatchKey: RedisBatchKey_Deserialize = { match: '*', keyList: [] }

const minimalBatchTtl: RedisBatchTtl_Deserialize = { keyList: [], ttl: 60 }

const minimalExportCsv: RedisExportCsv_Deserialize = {
  match: '*',
  keyList: [],
  file: '',
  withTtl: false,
  exportFormat: 'csv',
}

const minimalImportCsv: RedisImportCsv = {
  file: '',
  ttl: -1,
  handleTtl: 'parse',
  handleConflict: 'replace',
}

function defaultPayload(cmd: CommandKey): Record<string, unknown> {
  switch (cmd) {
    case 'greet':
      return { name: 'RedisME' }
    case 'appDir':
    case 'isAppStore':
      return {}
    case 'testConn':
    case 'masters':
      return { conf: buildMinimalConn() }
    case 'connList':
      return { connList: [] }
    case 'connect':
    case 'disconnect':
    case 'dbList':
    case 'infoList':
    case 'chartList':
    case 'nodeList':
    case 'subscribeStop':
    case 'monitorStop':
    case 'flushDb':
    case 'flushAll':
      return { id: connIdForDefaults() }
    case 'selectDb':
      return { id: connIdForDefaults(), db: 0 }
    case 'info':
    case 'chart':
      return { id: connIdForDefaults(), node: null }
    case 'scan':
      return { id: connIdForDefaults(), param: { ...minimalScanParam } }
    case 'fieldScan':
      return { id: connIdForDefaults(), param: { ...minimalFieldScan } }
    case 'ttl':
      return { id: connIdForDefaults(), key: { ...dummyKey }, ttl: 60 }
    case 'set':
      return { id: connIdForDefaults(), param: { ...minimalSetParam } }
    case 'del':
      return { id: connIdForDefaults(), key: { ...dummyKey } }
    case 'rename':
      return { id: connIdForDefaults(), key: { ...dummyKey }, newKey: { key: 'k2', bytes: '' } }
    case 'fieldAdd':
      return { id: connIdForDefaults(), param: { ...minimalFieldAdd } }
    case 'fieldSet':
      return { id: connIdForDefaults(), param: { ...minimalFieldSet } }
    case 'fieldGet':
      return { id: connIdForDefaults(), param: { ...minimalFieldGet } }
    case 'hashKeys':
      return { id: connIdForDefaults(), param: { ...minimalHashKeys } }
    case 'hashValues':
      return { id: connIdForDefaults(), param: { ...minimalHashKeys } }
    case 'fieldPop':
      return { id: connIdForDefaults(), param: { ...minimalFieldPop } }
    case 'fieldDel':
      return { id: connIdForDefaults(), param: { ...minimalFieldDel } }
    case 'getFieldAsCommand':
      return { id: connIdForDefaults(), param: { ...minimalFieldAsCommand } }
    case 'memoryUsage':
      return { id: connIdForDefaults(), param: { ...minimalMemoryParam } }
    case 'batchDel':
      return { id: connIdForDefaults(), param: { ...minimalBatchKey } }
    case 'batchTtl':
      return { id: connIdForDefaults(), param: { ...minimalBatchTtl } }
    case 'exportCsv':
      return { id: connIdForDefaults(), param: { ...minimalExportCsv } }
    case 'importCsv':
      return { id: connIdForDefaults(), param: { ...minimalImportCsv } }
    case 'keyType':
    case 'keySlot':
    case 'keyNode':
    case 'arInfo':
    case 'vInfo':
    case 'objectInfo':
    case 'xinfoGroups':
      return { id: connIdForDefaults(), key: { ...dummyKey } }
    case 'vGetattr':
    case 'vSetattr':
      return {
        id: connIdForDefaults(),
        param: { key: { ...dummyKey }, fieldKey: '', attrs: '', valFmt: null },
      }
    case 'vSim':
      return {
        id: connIdForDefaults(),
        param: {
          key: { ...dummyKey },
          mode: 'ele',
          fieldKey: '',
          vector: [],
          count: 10,
          withAttribs: true,
          filter: '',
          epsilon: null,
          ef: null,
          valFmt: null,
        },
      }
    case 'xinfoConsumers':
      return { id: connIdForDefaults(), key: { ...dummyKey }, group: 'g' }
    case 'slowLog':
      return { id: connIdForDefaults(), count: 32, node: null }
    case 'configGet':
      return { id: connIdForDefaults(), pattern: '*', node: null }
    case 'configSet':
      return { id: connIdForDefaults(), key: 'timeout', value: '0', node: null }
    case 'clientList':
      return { id: connIdForDefaults(), node: null, clientType: null }
    case 'publish':
      return { id: connIdForDefaults(), channel: 'ch', message: 'ping', msgFmt: null }
    case 'subscribe':
      return { id: connIdForDefaults(), channel: null }
    case 'monitor':
      return { id: connIdForDefaults(), node: 'master' }
    case 'importCmd':
      return { id: connIdForDefaults(), file: '' }
    case 'mockData':
      return { id: connIdForDefaults(), count: 1 }
    case 'executeCommand':
      return { id: connIdForDefaults(), param: { ...minimalRedisCmd } }
    default:
      return {}
  }
}

function formatDefault(cmd: CommandKey): string {
  return JSON.stringify(defaultPayload(cmd), null, 2)
}
// #endregion

// #region 命令调用
const selectedCommand = ref<CommandKey>('greet')
const paramText = ref(formatDefault('greet'))
const resultText = ref('')
const hint = ref('')
const loading = ref(false)

watch(selectedCommand, cmd => {
  paramText.value = formatDefault(cmd)
})

function invokeCommand(): void {
  let payload: Record<string, unknown> = {}
  if (paramText.value.trim()) {
    try {
      payload = meJsonParse(paramText.value) as Record<string, unknown>
    } catch (e: unknown) {
      hint.value = '参数解析失败（需为合法 JSON）'
      resultText.value = String(e)
      return
    }
  }

  const cmd = selectedCommand.value
  const invokeName = cmd
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()

  loading.value = true
  invoke(invokeName, payload)
    .then(data => {
      loading.value = false
      hint.value = '调用成功'
      resultText.value = data !== undefined && data !== null ? JSON.stringify(data, null, 2) : ''
    })
    .catch(error => {
      loading.value = false
      hint.value = '调用失败'
      resultText.value = typeof error === 'string' ? error : JSON.stringify(error, null, 2)
    })
}
// #endregion
</script>

<template>
  <div class="redis-tauri">
    <div class="header">
      <el-form label-width="40px">
        <el-form-item label="命令">
          <el-select v-model="selectedCommand" filterable>
            <el-option v-for="key in commandKeys" :key="key" :label="key" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="参数">
          <me-code v-model="paramText" class="param-editor" />
        </el-form-item>
        <el-form-item label="提示">
          <div class="me-flex row-actions">
            <el-text :type="hint.includes('失败') || hint.includes('解析') ? 'danger' : 'success'">
              {{ hint }}
            </el-text>
            <el-button type="primary" @click="invokeCommand">验证</el-button>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <div class="body" v-loading="loading">
      <me-code :model-value="resultText" read-only />
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-tauri {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header {
  flex-shrink: 0;
  padding: 8px 12px 0;
}

.param-editor {
  height: 180px;
  width: 100%;
}

.row-actions {
  width: 100%;
  justify-content: space-between;
  align-items: center;
}

.body {
  flex: 1;
  min-height: 0;
}
</style>
