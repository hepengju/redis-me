<script setup lang="ts">
// #region 导入
import { ElLoading, type FormItemRule } from 'element-plus'
import { cloneDeep } from 'lodash'
import { nanoid } from 'nanoid'
import { computed, inject, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey, type UiConn } from '@/types/me-interface'
import { buildRedisUrl } from '@/utils/conn'
import {
  getConnCommandMap,
  getConnGroup,
  getConnKeySeparator,
  getConnProtocol,
  getConnUiMode,
  normalizeGroupName,
  setConnCommandMap,
  setConnGroup,
  setConnKeySeparator,
  setConnProtocol,
  setConnUiMode,
  type ConnProtocol,
} from '@/utils/conn'
import { meCommands, PREDEFINE_COLORS, meRandomString, meOk, meErr, meCopy } from '@/utils/util'
const { t } = useI18n()
// #endregion

// #region 核心状态

// 与 me-icon 默认 showAfter 一致
const tipShowAfter = 1000

const emit = defineEmits(['success', 'closed'])

// 表单和校验规则
const form = reactive({
  id: '',
  name: '',

  host: '',
  port: 6379,
  username: '',
  password: '',
  db: 0,

  readonly: false,
  color: '#409eff',

  // 集群模式
  cluster: false,

  // SSL连接
  ssl: false,
  sslOption: { key: '', cert: '', ca: '' },

  // 哨兵模式
  sentinel: false,
  sentinelOption: { masterName: '', masterUsername: '', masterPassword: '' },

  // SSH隧道
  ssh: false,
  sshOption: {
    host: '',
    port: 22,
    loginType: 'pwd', // pwd 用户名/密码, pkfile 私钥文件
    username: '',
    password: '',
    pkfile: '', // 私钥文件
    passphrase: '', // 私钥密码
  },

  // 其他元信息补充: 复制连接时不保留
  meta: {
    // 数据库别名
    // db0: '会话登录'
    // 未来的其他扩展
  },
})

const rules = {
  host: [{ required: true, message: t('conn.nameRequired') }],
  port: [{ required: true, message: t('conn.portRequired') }],
  'sshOption.host': [
    {
      required: true,
      message: t('conn.sshOption.hostRequired'),
      trigger: 'blur',
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (form.ssh && !value) {
          callback(new Error(t('conn.sshOption.hostRequired')))
        } else {
          callback()
        }
      },
    },
  ],
  'sshOption.port': [
    {
      required: true,
      message: t('conn.sshOption.portRequired'),
      trigger: 'blur',
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (form.ssh && !value) {
          callback(new Error(t('conn.sshOption.portRequired')))
        } else {
          callback()
        }
      },
    },
  ],
  'sshOption.username': [
    {
      required: true,
      message: t('conn.sshOption.usernameRequired'),
      trigger: 'blur',
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (form.ssh && !value) {
          callback(new Error(t('conn.sshOption.usernameRequired')))
        } else {
          callback()
        }
      },
    },
  ],
  'sshOption.password': [
    {
      required: true,
      message: t('conn.sshOption.passwordRequired'),
      trigger: 'blur',
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (form.ssh && form.sshOption.loginType === 'pwd' && !value) {
          callback(new Error(t('conn.sshOption.passwordRequired')))
        } else {
          callback()
        }
      },
    },
  ],
  'sshOption.pkfile': [
    {
      required: true,
      message: t('conn.sshOption.pkfileRequired'),
      trigger: 'blur',
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (form.ssh && form.sshOption.loginType === 'pkfile' && !value) {
          callback(new Error(t('conn.sshOption.pkfileRequired')))
        } else {
          callback()
        }
      },
    },
  ],
}
// #endregion

// #region 面板操作

// 外部打开对话框
defineExpose({ open })
const visible = ref(false)
const mode = ref('add')
function open(modeValue: 'add' | 'edit', data?: UiConn) {
  visible.value = true
  mode.value = modeValue
  if (data) {
    const newData = cloneDeep(data)
    // 新增时给了数据，则是复制连接。id和name需要重置, meta信息不复制
    if (modeValue === 'add') {
      newData.id = nanoid()
      newData.name = data.name + '-' + t('copy')
      newData.meta = {}
    }
    Object.assign(form, newData)
  }
}

// 提交表单
const share = inject(shareProvideKey)!
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate((valid: boolean) => {
    if (!valid) return
    // db 未填时默认赋值 0
    if (form.db == null) form.db = 0
    if (mode.value === 'add') {
      form.id = nanoid()
      autoGenName()
      share.connList.push(form)
      meOk(t('addOk'))
      emit('success', form, mode.value)
    } else if (mode.value === 'edit') {
      autoGenName()
      const conn = share.connList.filter(c => c.id === form.id)[0]
      Object.assign(conn, cloneDeep(form))
      meOk(t('editOk'))
      emit('success', form, mode.value)
    }
    visible.value = false
  })
}

// 自动生成名称
function autoGenName() {
  if (!form.name) {
    form.name = form.host + ':' + form.port
  }

  if (share.connList.find(c => c.name === form.name && c.id !== form.id)) {
    form.name += ' (' + meRandomString(3) + ')'
  }
}

/**
 * 主机输入框粘贴解析：自动提取连接信息。
 * 支持完整 URL（redis[s]://[user[:pass]@]host[:port][/db]）、
 * host:port、[IPv6]:port 格式；无合法端口时仅填充主机。
 */
function onHostPaste(e: ClipboardEvent): void {
  const text = e.clipboardData?.getData('text')?.trim()
  if (!text) return

  // 完整 URL 解析
  if (/^rediss?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      const isSsl = url.protocol === 'rediss:'
      let host = url.hostname
      if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
      const port = url.port ? Number(url.port) : isSsl ? 6379 : 6379
      if (!Number.isInteger(port) || port < 1 || port > 65535) return
      e.preventDefault()
      form.host = host
      form.port = port
      if (url.username) form.username = decodeURIComponent(url.username)
      if (url.password) form.password = decodeURIComponent(url.password)
      form.ssl = isSsl
      const dbStr = url.pathname.replace(/^\//, '')
      if (dbStr) {
        const db = Number(dbStr)
        if (Number.isInteger(db) && db >= 0) form.db = db
      }
      return
    } catch {
      return
    }
  }

  // 简单 host:port 格式（含 [IPv6]:port）
  let hostPart = text
  let portPart = ''
  if (text.startsWith('[')) {
    const closeBracket = text.indexOf(']')
    if (closeBracket === -1) return
    hostPart = text.slice(1, closeBracket)
    if (text[closeBracket + 1] === ':') portPart = text.slice(closeBracket + 2)
    else if (text.length > closeBracket + 1) return
  } else {
    const lastColon = text.lastIndexOf(':')
    if (lastColon <= 0) return
    hostPart = text.slice(0, lastColon)
    portPart = text.slice(lastColon + 1)
  }
  if (!portPart) {
    e.preventDefault()
    form.host = hostPart
    return
  }
  const port = Number(portPart)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return
  e.preventDefault()
  form.host = hostPart
  form.port = port
}

// 根据当前表单生成 Redis URL（便于复制）
const redisUrl = computed(() =>
  buildRedisUrl({
    host: form.host,
    port: form.port,
    username: form.username,
    password: form.password,
    ssl: form.ssl,
    db: form.db,
    protocol: getConnProtocol(form as UiConn),
  }),
)

// 测试连接：整弹窗 loading，避免按钮变宽挤动底栏
function testConn() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    // db 未填时默认赋值 0
    if (form.db == null) form.db = 0
    const target = document.querySelector('.el-dialog.conn-save-dialog') as HTMLElement | null
    const loadingInstance = ElLoading.service({ target: target || undefined, lock: true })
    try {
      await meCommands.testConn(form)
      meOk(t('conn.testOk'))
    } finally {
      loadingInstance.close()
    }
  })
}

// 哨兵模式获取 master 名称（与 `meCommands.masters` 返回项一致：string 键值）
const masters = ref<Record<string, string>[]>([])
async function autoDiscover(alert: boolean = false) {
  // db 未填时默认赋值 0
  if (form.db == null) form.db = 0
  try {
    masters.value = await meCommands.masters(form, false)
    if (!form.sentinelOption.masterName && masters.value.length > 0) {
      form.sentinelOption.masterName = masters.value[0].name
    }

    if (alert) {
      meOk(t('conn.autoDiscoverOk', { count: masters.value.length }, masters.value.length))
    }
  } catch (e: unknown) {
    masters.value = []
    if (alert) {
      meErr(e instanceof Error ? e : String(e), t('error'))
    }
  }
}

// 哨兵模式自动发现
watch(
  () => form.sentinel,
  (newValue: boolean, _oldValue: boolean) => {
    if (newValue) {
      autoDiscover()
    }
  },
)

watch(
  () => form.sentinelOption.masterName,
  (newValue: string | undefined, _oldValue: string | undefined) => {
    if (newValue === undefined) {
      form.sentinelOption.masterName = ''
    }
  },
)
// #endregion

// #region 计算属性

// 分组展示模式下，分组选择与名称 input 并排；值写入 form.meta.group
const connShowGroup = computed(() => meTauri.settings.connShow === 'group')

const connGroups = computed(() => {
  const list = meTauri.settings.connGroups
  return Array.isArray(list) ? list.map(normalizeGroupName).filter(Boolean) : []
})

// 下拉选项 = 已登记分组 + 当前连接所属分组（避免仅存在于 meta 时分组名不可选）
const connGroupOptions = computed(() => {
  const set = new Set(connGroups.value)
  const current = getConnGroup(form as UiConn)
  if (current) set.add(current)
  return [...set]
})

const connGroup = computed({
  get: () => getConnGroup(form as UiConn),
  set: (v: string) => setConnGroup(form as UiConn, v),
})

const connMinimal = computed({
  get: () => getConnUiMode(form as UiConn) === 'minimal',
  set: (v: boolean) => setConnUiMode(form as UiConn, v ? 'minimal' : 'normal'),
})

// 高级选项：键分隔符（meta.keySeparator）+ 通信协议（meta.protocol）+ CONFIG 命令映射（meta.commandMap）
const advancedVisible = ref(false)
const advancedForm = reactive({
  keySeparator: ':',
  protocol: 'resp2' as ConnProtocol,
  configMapped: '',
})

function openAdvanced() {
  advancedForm.keySeparator = getConnKeySeparator(form as UiConn)
  advancedForm.protocol = getConnProtocol(form as UiConn)
  advancedForm.configMapped = getConnCommandMap(form as UiConn).config ?? ''
  advancedVisible.value = true
}

function applyAdvanced() {
  setConnKeySeparator(form as UiConn, advancedForm.keySeparator)
  setConnProtocol(form as UiConn, advancedForm.protocol)
  const mapped = advancedForm.configMapped.trim()
  setConnCommandMap(form as UiConn, mapped ? { config: mapped } : {})
  advancedVisible.value = false
}
// #endregion
</script>

<template>
  <el-dialog
    class="conn-save-dialog"
    :title="mode === 'add' ? t('conn.addConn') : t('conn.editConn')"
    @closed="emit('closed')"
    draggable
    v-model="visible"
    width="600"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    append-to-body
    destroy-on-close
    align-center>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="right"
      :label-width="t('conn.labelWidth')">
      <!-- 连接名称（分组展示时，分组选择与名称 input 并排，间距 10px） -->
      <el-row :gutter="24">
        <el-col :span="24">
          <el-form-item :label="t('conn.name')" prop="name">
            <div class="conn-name-row">
              <el-input
                v-model.trim="form.name"
                :placeholder="t('conn.nameHint')"
                clearable
                class="conn-name-input" />
              <el-select
                v-if="connShowGroup"
                v-model="connGroup"
                clearable
                :placeholder="t('conn.ungrouped')"
                class="conn-name-group-select">
                <el-option :label="t('conn.ungrouped')" value="" />
                <el-option v-for="g in connGroupOptions" :key="g" :label="g" :value="g" />
              </el-select>
            </div>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 主机、端口 -->
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item :label="t('conn.host')" prop="host">
            <el-input
              v-model.trim="form.host"
              placeholder="IP or paste redis://URL"
              clearable
              @paste="onHostPaste" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('conn.port')" prop="port">
            <el-input-number
              :min="1"
              :max="65535"
              v-model="form.port"
              :controls="false"
              align="left"
              style="width: 100%"
              placeholder="6379" />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 用户名、密码 -->
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item :label="t('conn.username')">
            <el-input v-model.trim="form.username" placeholder="ACL in Redis >= 6.0" clearable />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('conn.password')">
            <el-input
              type="password"
              v-model.trim="form.password"
              placeholder="password"
              clearable
              show-password />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 其他：颜色 + db + 模式复选框；右：高级更多 -->
      <div class="conn-other-row">
        <el-form-item :label="t('conn.other')" class="conn-other-form-item">
          <div class="conn-other-content">
            <el-color-picker v-model="form.color" :predefine="PREDEFINE_COLORS" />
            <div class="conn-db-input-group">
              <div class="conn-db-input-group__prepend">
                <me-icon
                  icon="me-icon-db"
                  name="db"
                  :info="t('conn.dbTip')"
                  placement="top"
                  raw-content />
              </div>
              <el-input-number
                v-model="form.db"
                :min="0"
                :controls="false"
                align="left"
                class="conn-db-input"
                placeholder="0" />
            </div>
            <div class="conn-mode-checkboxes">
              <el-checkbox v-model="form.cluster">
                <el-tooltip
                  placement="top"
                  raw-content
                  :show-after="tipShowAfter"
                  :content="t('conn.clusterTip')">
                  <span>{{ t('conn.cluster') }}</span>
                </el-tooltip>
              </el-checkbox>
              <el-checkbox v-model="form.sentinel">
                <el-tooltip
                  placement="top"
                  raw-content
                  :show-after="tipShowAfter"
                  :content="t('conn.sentinelTip')">
                  <span>{{ t('conn.sentinel') }}</span>
                </el-tooltip>
              </el-checkbox>
              <el-checkbox v-model="form.ssl">
                <el-tooltip
                  placement="top"
                  raw-content
                  :show-after="tipShowAfter"
                  :content="t('conn.sslTip')">
                  <span>SSL</span>
                </el-tooltip>
              </el-checkbox>
              <el-checkbox v-model="form.ssh">
                <el-tooltip
                  placement="top"
                  raw-content
                  :show-after="tipShowAfter"
                  :content="t('conn.sshTip')">
                  <span>SSH</span>
                </el-tooltip>
              </el-checkbox>
            </div>
          </div>
        </el-form-item>

        <el-button
          class="conn-advanced-btn"
          icon="el-icon-more-filled"
          :title="t('conn.advancedTitle')"
          @click="openAdvanced" />
      </div>

      <!-- 哨兵模式 -->
      <div v-show="form.sentinel">
        <el-divider content-position="left">{{ t('conn.sentinelConfig') }}</el-divider>
        <el-form-item
          :label="t('conn.sentinelOption.masterName')"
          :label-width="t('conn.sentinelLabelWidth')">
          <div class="me-flex" style="width: 100%">
            <el-select
              v-model="form.sentinelOption.masterName"
              clearable
              filterable
              allow-create
              style="flex: 1"
              :placeholder="t('conn.sentinelOption.masterNameHint')">
              <el-option v-for="item in masters" :key="item.name" :value="item.name">
                <span style="float: left">{{ item.name }}</span>
                <span style="float: right; color: var(--el-text-color-secondary)">{{
                  item.ip + ':' + item.port
                }}</span>
              </el-option>
            </el-select>
            <el-button @click="autoDiscover(true)">{{ t('conn.autoDiscover') }}</el-button>
          </div>
        </el-form-item>
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item
              :label="t('conn.sentinelOption.masterUsername')"
              :label-width="t('conn.sentinelLabelWidth')">
              <el-input
                v-model.trim="form.sentinelOption.masterUsername"
                :placeholder="t('conn.sentinelOption.masterUsername')"
                clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item
              :label="t('conn.sentinelOption.masterPassword')"
              :label-width="t('conn.sentinelLabelWidth')">
              <el-input
                v-model.trim="form.sentinelOption.masterPassword"
                :placeholder="t('conn.sentinelOption.masterPassword')"
                type="password"
                clearable
                show-password />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- SSL加密 -->
      <div v-show="form.ssl">
        <el-divider content-position="left">{{ t('conn.ssl') }}</el-divider>
        <el-form-item :label="t('conn.sslOption.cert')">
          <me-file-input
            v-model="form.sslOption.cert"
            :placeholder="t('conn.sslOption.certHint')" />
        </el-form-item>
        <el-form-item :label="t('conn.sslOption.key')">
          <me-file-input v-model="form.sslOption.key" :placeholder="t('conn.sslOption.keyHint')" />
        </el-form-item>
        <el-form-item :label="t('conn.sslOption.ca')">
          <me-file-input v-model="form.sslOption.ca" :placeholder="t('conn.sslOption.caHint')" />
        </el-form-item>
      </div>

      <!-- SSH隧道 -->
      <div v-show="form.ssh">
        <el-divider content-position="left">{{ t('conn.ssh') }}</el-divider>

        <!-- SSH主机、端口 -->
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item :label="t('conn.sshOption.host')" prop="sshOption.host">
              <el-input v-model.trim="form.sshOption.host" placeholder="SSH host" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('conn.sshOption.port')" prop="sshOption.port">
              <el-input-number
                :min="1"
                :max="65535"
                v-model="form.sshOption.port"
                :controls="false"
                align="left"
                style="width: 100%"
                placeholder="22" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 登录方式 -->
        <el-form-item :label="t('conn.loginType')">
          <el-segmented
            v-model="form.sshOption.loginType"
            :options="[
              { label: t('conn.sshOption.loginTypePwd'), value: 'pwd' },
              { label: t('conn.sshOption.loginTypePkfile'), value: 'pkfile' },
            ]" />
        </el-form-item>

        <!-- 密码模式 -->
        <template v-if="form.sshOption.loginType === 'pwd'">
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item :label="t('conn.sshOption.username')" prop="sshOption.username">
                <el-input
                  v-model.trim="form.sshOption.username"
                  placeholder="SSH username"
                  clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="t('conn.sshOption.password')" prop="sshOption.password">
                <el-input
                  v-model.trim="form.sshOption.password"
                  type="password"
                  placeholder="SSH password"
                  clearable
                  show-password />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 私钥模式 -->
        <template v-if="form.sshOption.loginType === 'pkfile'">
          <el-form-item :label="t('conn.sshOption.username')" prop="sshOption.username">
            <el-input v-model.trim="form.sshOption.username" placeholder="SSH username" clearable />
          </el-form-item>
          <el-form-item :label="t('conn.sshOption.pkfile')" prop="sshOption.pkfile">
            <me-file-input
              v-model="form.sshOption.pkfile"
              :placeholder="t('conn.sshOption.pkfileHint')" />
          </el-form-item>
          <el-form-item :label="t('conn.sshOption.passphrase')">
            <el-input
              v-model.trim="form.sshOption.passphrase"
              type="password"
              :placeholder="t('conn.sshOption.passphraseHint')"
              clearable
              show-password />
          </el-form-item>
        </template>
      </div>
    </el-form>

    <el-dialog
      v-model="advancedVisible"
      :title="t('conn.advancedTitle')"
      width="520"
      draggable
      append-to-body
      destroy-on-close
      align-center>
      <el-form label-position="right" :label-width="t('conn.advancedLabelWidth')">
        <el-form-item>
          <template #label>
            <me-icon
              :name="t('conn.keySeparator')"
              icon="el-icon-question-filled"
              :info="t('conn.keySeparatorTip')"
              :icon-left="false"
              placement="top" />
          </template>
          <el-input
            v-model="advancedForm.keySeparator"
            :placeholder="t('conn.keySeparatorPlaceholder')"
            style="width: 120px" />
        </el-form-item>
        <el-form-item>
          <template #label>
            <me-icon
              :name="t('conn.protocol')"
              icon="el-icon-question-filled"
              :info="t('conn.protocolTip')"
              :icon-left="false"
              placement="top" />
          </template>
          <el-segmented
            v-model="advancedForm.protocol"
            :options="[
              { label: 'RESP2', value: 'resp2' },
              { label: 'RESP3', value: 'resp3' },
            ]" />
        </el-form-item>
        <el-form-item>
          <template #label>
            <me-icon
              :name="t('conn.commandMap')"
              icon="el-icon-question-filled"
              :info="t('conn.commandMapTip')"
              :icon-left="false"
              placement="top" />
          </template>
          <div class="conn-command-map-row">
            <span class="conn-command-map-cmd">CONFIG</span>
            <span class="conn-command-map-arrow">→</span>
            <el-input
              v-model.trim="advancedForm.configMapped"
              :placeholder="t('conn.commandMapMappedHint')" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="advancedVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="applyAdvanced">{{ t('ok') }}</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <div class="conn-footer">
        <div class="conn-footer-left">
          <el-button type="success" :disabled="!(form.host && form.port)" @click="testConn">{{
            t('conn.testConn')
          }}</el-button>
          <el-checkbox v-model="form.readonly" border>
            <el-tooltip
              placement="top"
              raw-content
              :show-after="tipShowAfter"
              :content="t('conn.readonlyTip')">
              <span>{{ t('conn.readonly') }}</span>
            </el-tooltip>
          </el-checkbox>
          <el-checkbox v-model="connMinimal" border>
            <el-tooltip
              placement="top"
              raw-content
              :show-after="tipShowAfter"
              :content="t('conn.uiModeTip')">
              <span>{{ t('conn.uiModeMinimal') }}</span>
            </el-tooltip>
          </el-checkbox>
        </div>
        <div>
          <me-button
            :info="redisUrl"
            :disabled="!(form.host && form.port)"
            @click="meCopy(redisUrl)">
            URL
          </me-button>
          <el-button @click="visible = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" @click="submit">{{ t('ok') }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.conn-other-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
}

.conn-other-form-item {
  margin-bottom: 0;
  flex: 1;
  min-width: 0;
}

.conn-other-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.conn-db-input-group {
  display: inline-flex;
  width: 88px;
  flex-shrink: 0;

  &__prepend {
    display: flex;
    align-items: center;
    padding: 0 8px;
    color: var(--el-text-color-regular);
    background-color: var(--el-fill-color-light);
    box-shadow:
      1px 0 0 0 var(--el-border-color) inset,
      0 1px 0 0 var(--el-border-color) inset,
      0 -1px 0 0 var(--el-border-color) inset;
    border-radius: var(--el-input-border-radius, var(--el-border-radius-base)) 0 0
      var(--el-input-border-radius, var(--el-border-radius-base));
  }
}

.conn-db-input {
  width: 0;
  flex: 1;

  :deep(.el-input__wrapper) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding-left: 8px;
    padding-right: 8px;
  }
}

.conn-name-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
}

.conn-name-input {
  flex: 1;
  min-width: 0;
}

.conn-name-group-select {
  width: 150px;
  flex-shrink: 0;
}

.conn-advanced-btn {
  min-width: 32px;
  padding: 8px 10px;
  flex-shrink: 0;
}

.conn-command-map-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  .el-input {
    flex: 1;
  }
}

.conn-command-map-cmd {
  flex-shrink: 0;
  font-family: var(--el-font-family);
  color: var(--el-text-color-regular);
}

.conn-command-map-arrow {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.conn-mode-checkboxes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 10px;
}

.conn-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.conn-footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 20px;
}

:deep(.el-checkbox) {
  margin-right: 0;
}
</style>
