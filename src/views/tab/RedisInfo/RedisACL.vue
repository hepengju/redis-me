<script setup lang="ts">
// #region 导入
// ACL 用户管理主界面：列表展示 + 编辑态 form 由本组件持有，对话框 UI 在 UserAdd.vue
import { computed, inject, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import { shareProvideKey } from '@/types/me-interface'
import type { AclUserDetail } from '@/types/tauri-specta'
import {
  buildAclPreviewCommand,
  buildAclSavePayload,
  createAclModelFromDetail,
  createDefaultAclModel,
  summarizeRules,
  summarizeSelectors,
  type AclEditModel,
} from '@/utils/acl'
import { meCommands, meConfirm, meOk, meWarn } from '@/utils/util'

import AclDryrun from './AclDryrun.vue'
import AclLog from './AclLog.vue'
import AclResetPassword from './AclResetPassword.vue'
import UserAdd from './UserAdd.vue'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const keyword = ref('')
const loading = ref(false)
const users = ref<AclUserDetail[]>([])
const whoami = ref('')
const dryrunVisible = ref(false)
const dryrunUsername = ref('')
const logVisible = ref(false)
const resetPasswordVisible = ref(false)
const resetPasswordUser = ref<AclUserDetail | null>(null)
// 编辑对话框：form 与 UserAdd 共享同一 reactive 对象
const editVisible = ref(false)
const editLoading = ref(false)
const editMode = ref<'add' | 'edit' | 'view'>('add')
const form = reactive<AclEditModel>(createDefaultAclModel())
// #endregion

// #region 计算属性
const canEdit = computed(() => !share.readonly)
const dryrunSupported = computed(() => share.capabilities.aclDryrunSupported)
const filterUsers = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  const list = key
    ? users.value.filter(item => {
        const command = item.commandRules.join(' ').toLowerCase()
        return (
          item.username.toLowerCase().includes(key) ||
          command.includes(key) ||
          item.keyPatterns.join(' ').toLowerCase().includes(key) ||
          item.channelPatterns.join(' ').toLowerCase().includes(key) ||
          item.selectors.join(' ').toLowerCase().includes(key)
        )
      })
    : users.value
  // default 用户始终排第一，其余保持 ACL LIST 返回顺序
  return [...list].sort((a, b) => {
    if (a.username === 'default') return -1
    if (b.username === 'default') return 1
    return 0
  })
})

// 状态列导出/提示文本（单元格走 #cell-status 插槽渲染 el-tag）
function statusText(row: AclUserDetail): string {
  return `${row.enabled ? t('redisACL.enabled') : t('redisACL.disabled')}${
    row.nopass ? ` ${t('redisACL.passwordNopass')}` : ''
  }`
}

// 列描述：展示与导出文本单一来源；操作列为纯插槽列（无 formatter）不进导出矩阵
const userColumns = computed<MeColumn<AclUserDetail>[]>(() => [
  { key: 'username', prop: 'username', title: t('redisACL.username'), width: 120 },
  {
    key: 'status',
    title: t('redisACL.status'),
    width: 128,
    align: 'center',
    formatter: row => statusText(row),
  },
  {
    key: 'commandRules',
    title: t('redisACL.commandRules'),
    minWidth: 120,
    formatter: row => {
      const rules = row.commandRules
      return rules.length ? rules.join(' ') : '--'
    },
  },
  {
    key: 'keyPatterns',
    title: t('redisACL.keyPatternsCol'),
    width: 96,
    formatter: row => summarizeRules(row.keyPatterns, 2),
  },
  {
    key: 'channelPatterns',
    title: t('redisACL.channelPatternsCol'),
    width: 88,
    formatter: row => summarizeRules(row.channelPatterns, 2),
  },
  {
    key: 'selectors',
    title: t('redisACL.selectorsCol'),
    width: 120,
    formatter: row => summarizeSelectors(row.selectors, 2),
  },
  { key: 'action', title: t('action'), width: 80, align: 'center' },
])
const previewCommand = computed(() => buildAclPreviewCommand(form))
// 危险命令黑名单 ↔ form.commandRules 中的 -@dangerous，由 UserAdd 双向绑定
const dangerousBlocked = computed({
  get: () => form.commandRules.includes('-@dangerous'),
  set: (blocked: boolean) => {
    const next = form.commandRules.filter(v => v !== '-@dangerous')
    if (blocked) next.push('-@dangerous')
    form.commandRules = next
  },
})
// #endregion

// #region 面板操作
function resetForm() {
  Object.assign(form, createDefaultAclModel())
}

// ACL LIST 一次拉取并解析全部用户；另配合 ACL WHOAMI
async function refresh() {
  loading.value = true
  try {
    users.value = await meCommands.aclListUsers(share.conn!.id)
    whoami.value = await meCommands.aclWhoami(share.conn!.id)
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editMode.value = 'add'
  resetForm()
  editVisible.value = true
}

function confirmDefaultUser(row: AclUserDetail, action: () => void) {
  if (row.username === 'default') {
    meConfirm(t('redisACL.defaultEditConfirm'), action)
    return
  }
  action()
}

function openEdit(row: AclUserDetail) {
  confirmDefaultUser(row, () => {
    editMode.value = 'edit'
    Object.assign(form, createAclModelFromDetail(row))
    editVisible.value = true
  })
}

function openView(row: AclUserDetail) {
  editMode.value = 'view'
  Object.assign(form, createAclModelFromDetail(row))
  editVisible.value = true
}

async function genPassword() {
  form.nopass = false
  form.password = await meCommands.aclGenpass(share.conn!.id, 128)
  meOk(t('redisACL.passwordGenerated'))
}

// 校验 → buildAclSavePayload（密码 SHA256）→ aclSetuser；键/频道空列表在后端会放宽权限，故前端拦截
async function saveUser() {
  if (editMode.value === 'view') return
  const username = form.username.trim()
  if (!username) {
    meWarn(t('redisACL.usernameRequired'))
    return
  }
  if (editMode.value === 'add' && !form.nopass && !form.password.trim()) {
    meWarn(t('redisACL.passwordRequired'))
    return
  }
  if (
    editMode.value === 'edit' &&
    !form.nopass &&
    !form.password.trim() &&
    !form.passwordHashes.length
  ) {
    meWarn(t('redisACL.passwordRequired'))
    return
  }
  if (!form.keyPatterns.length) {
    meWarn(t('redisACL.keyPatternsRequired'))
    return
  }
  if (!form.channelPatterns.length) {
    meWarn(t('redisACL.channelPatternsRequired'))
    return
  }

  editLoading.value = true
  try {
    const payload = await buildAclSavePayload(form)
    if (editMode.value === 'add' && !form.nopass && !payload.passwordHashes.length) {
      meWarn(t('redisACL.passwordRequired'))
      return
    }
    await meCommands.aclSetuser(share.conn!.id, payload)
    meOk(editMode.value === 'add' ? t('addOk') : t('editOk'))
    editVisible.value = false
    await refresh()
  } finally {
    editLoading.value = false
  }
}

function deleteUser(row: AclUserDetail) {
  if (row.username === 'default') {
    meWarn(t('redisACL.defaultProtected'))
    return
  }
  meConfirm(t('redisACL.deleteConfirm', { user: row.username }), async () => {
    await meCommands.aclDeluser(share.conn!.id, [row.username])
    meOk(t('deleteOk'))
    await refresh()
  })
}

// 复制用户：预填规则/模式，用户名加后缀，需重新设密码（同连接管理复制）
function openCopy(row: AclUserDetail) {
  editMode.value = 'add'
  Object.assign(form, createAclModelFromDetail(row), {
    username: `${row.username}-copy`,
    nopass: false,
    password: '',
    passwordHashes: [],
  })
  editVisible.value = true
}

function aclSave() {
  meConfirm(t('redisACL.saveConfirm'), async () => {
    await meCommands.aclSave(share.conn!.id)
    meOk(t('redisACL.saveOk'))
  })
}

function aclLoad() {
  meConfirm(t('redisACL.loadConfirm'), async () => {
    await meCommands.aclLoad(share.conn!.id)
    meOk(t('redisACL.loadOk'))
    await refresh()
  })
}

function openDryrun(row: AclUserDetail) {
  if (!dryrunSupported.value) {
    meWarn(t('redisACL.dryrunUnsupported'))
    return
  }
  dryrunUsername.value = row.username
  dryrunVisible.value = true
}

function openResetPassword(row: AclUserDetail) {
  confirmDefaultUser(row, () => {
    resetPasswordUser.value = row
    resetPasswordVisible.value = true
  })
}

function toggleUserEnabled(row: AclUserDetail) {
  const enabling = !row.enabled
  const confirmKey = enabling ? 'redisACL.enableUserConfirm' : 'redisACL.disableUserConfirm'
  const okKey = enabling ? 'redisACL.enableUserOk' : 'redisACL.disableUserOk'

  const run = async () => {
    const model = createAclModelFromDetail(row)
    model.enabled = enabling
    const payload = await buildAclSavePayload(model)
    await meCommands.aclSetuser(share.conn!.id, payload)
    meOk(t(okKey))
    await refresh()
  }

  const askAndRun = () => {
    meConfirm(t(confirmKey, { user: row.username }), run)
  }

  if (row.username === 'default') {
    confirmDefaultUser(row, run)
  } else {
    askAndRun()
  }
}

function handleMoreCommand(command: string) {
  switch (command) {
    case 'save':
      aclSave()
      break
    case 'load':
      aclLoad()
      break
    case 'log':
      logVisible.value = true
      break
  }
}

function handleRowCommand(row: AclUserDetail, command: string) {
  switch (command) {
    case 'copy':
      openCopy(row)
      break
    case 'dryrun':
      openDryrun(row)
      break
    case 'resetPassword':
      openResetPassword(row)
      break
    case 'toggleEnabled':
      toggleUserEnabled(row)
      break
    case 'delete':
      deleteUser(row)
      break
  }
}

void refresh()
// #endregion
</script>

<template>
  <div class="redis-acl" v-loading="loading">
    <div class="me-flex header">
      <div class="me-flex header-left">
        <el-button v-if="canEdit" type="primary" icon="el-icon-plus" @click="openAdd">
          {{ t('redisACL.addUser') }}
        </el-button>
        <el-text type="info">{{ t('redisACL.currentUser') }}: {{ whoami || '--' }}</el-text>
      </div>
      <div class="me-flex">
        <el-dropdown
          placement="bottom-start"
          @command="handleMoreCommand"
          style="margin-right: 10px">
          <el-button icon="el-icon-more-filled" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="canEdit" command="save">
                <me-icon icon="el-icon-document-checked" :name="t('redisACL.save')" />
              </el-dropdown-item>
              <el-dropdown-item v-if="canEdit" command="load">
                <me-icon icon="el-icon-refresh-left" :name="t('redisACL.load')" />
              </el-dropdown-item>
              <el-dropdown-item command="log" :divided="canEdit">
                <me-icon icon="el-icon-document" :name="t('redisACL.log')" />
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-input
          v-model="keyword"
          :placeholder="t('redisACL.keyword')"
          style="width: 260px; margin-right: 10px"
          clearable />
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading" />
      </div>
    </div>

    <div class="table">
      <me-table
        :data="filterUsers"
        :columns="userColumns"
        :total="users.length"
        export-name="acl-users">
        <template #cell-status="{ row }">
          <el-tag
            size="small"
            :type="row.enabled ? (row.nopass ? 'warning' : 'success') : 'info'"
            class="status-tag">
            {{ row.enabled ? t('redisACL.enabled') : t('redisACL.disabled') }}
            <span v-if="row.nopass" class="status-nopass">{{ t('redisACL.passwordNopass') }}</span>
          </el-tag>
        </template>
        <template #cell-action="{ row }">
          <div class="action-icons">
            <me-icon
              v-if="canEdit"
              icon="el-icon-edit"
              class="icon-btn"
              :info="t('edit')"
              @click="openEdit(row)" />
            <me-icon
              v-else
              icon="el-icon-view"
              class="icon-btn"
              :info="t('view')"
              @click="openView(row)" />
            <el-dropdown
              trigger="click"
              placement="bottom-end"
              @command="(cmd: string) => handleRowCommand(row, cmd)">
              <me-icon icon="el-icon-more-filled" class="icon-btn" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="dryrunSupported" command="dryrun">
                    <me-icon icon="me-icon-terminal" :name="t('redisACL.dryRun')" />
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canEdit" command="resetPassword">
                    <me-icon icon="el-icon-key" :name="t('redisACL.resetPassword')" />
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canEdit" command="toggleEnabled" divided>
                    <me-icon
                      :icon="row.enabled ? 'el-icon-circle-close' : 'el-icon-check'"
                      :name="row.enabled ? t('redisACL.disableUser') : t('redisACL.enableUser')" />
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canEdit" command="copy">
                    <me-icon icon="el-icon-document-copy" :name="t('redisACL.copyUser')" />
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canEdit && row.username !== 'default'" command="delete">
                    <me-icon icon="el-icon-delete" :name="t('redisACL.deleteUser')" />
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
        <!-- 官网：紧挨合计行「更多」左侧 -->
        <template #footer>
          <me-website to="acl" />
        </template>
      </me-table>
    </div>
  </div>

  <UserAdd
    v-model="editVisible"
    v-model:dangerous-blocked="dangerousBlocked"
    :mode="editMode"
    :loading="editLoading"
    :form="form"
    :preview-command="previewCommand"
    @save="saveUser"
    @generate-password="genPassword" />

  <AclDryrun v-model="dryrunVisible" :username="dryrunUsername" />
  <AclLog v-model="logVisible" />
  <AclResetPassword v-model="resetPasswordVisible" :user="resetPasswordUser" @success="refresh" />
</template>

<style scoped lang="scss">
.redis-acl {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .header {
    margin-bottom: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .header-left {
    gap: 8px;
  }

  .table {
    flex-grow: 1;
    height: 0;
  }
}

.action-icons {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  flex-wrap: nowrap;
}

.status-tag {
  max-width: 100%;
  white-space: nowrap;
}

.status-nopass::before {
  content: ' · ';
}
</style>
