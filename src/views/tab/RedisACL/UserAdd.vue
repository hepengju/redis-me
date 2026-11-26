<script setup lang="ts">
// #region 导入
// ACL 新增/编辑对话框：只负责表单 UI，form 数据与保存逻辑在 RedisACL.vue
import { Sortable, type SortableEvent } from 'sortablejs'
import { computed, inject, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import { meCommands, meCopy, meWarn } from '@/utils/app/util'
import {
  ACL_PRESET_COMMAND_RULES,
  getReadonlyPresetCommandRules,
  buildAclExecutableCommand,
  formatChannelPatternLabel,
  formatKeyPatternLabel,
  formatSelectorLabel,
  normalizeSelectorInput,
  type AclEditModel,
  type AclPreset,
} from '@/utils/redis/acl'
// #endregion

// #region 核心状态
const { t } = useI18n()
const share = inject(shareProvideKey)!
const visible = defineModel<boolean>({ default: false })
const dangerousBlocked = defineModel<boolean>('dangerousBlocked', { required: true })
const props = defineProps<{
  mode: 'add' | 'edit' | 'view'
  loading: boolean
  form: AclEditModel
  previewCommand: string
}>()
const emit = defineEmits<{ (e: 'save'): void; (e: 'generatePassword'): void }>()
// 规则/模式输入框草稿，未点「添加」前不入 form；打开对话框时清空
const ruleInput = ref('')
const keyPatternInput = ref('')
const channelPatternInput = ref('')
const selectorInput = ref('')
// ACL 命令类别列表
const aclCategories = ref<string[]>([])
const categoriesLoading = ref(false)
const selectedCategory = ref('')
// 类别命令 popover 仅对话框打开时展示（popover 挂 body，关窗须显式隐藏）
const categoryCommandsLoading = ref(false)
// 当前选中类别的命令详情
const categoryCommands = ref<string[]>([])
// 命令规则 / 键模式 / 频道模式标签区拖拽排序，顺序影响预览与 ACL SETUSER
const commandTagsRef = useTemplateRef<HTMLElement>('commandTagsRef')
const keyPatternTagsRef = useTemplateRef<HTMLElement>('keyPatternTagsRef')
const channelPatternTagsRef = useTemplateRef<HTMLElement>('channelPatternTagsRef')
let tagSortables: Sortable[] = []
// #endregion

// #region 计算属性
// 7.2+ 可编辑 selector；已有 selector 的用户在旧版本上也展示；查看且无配置时不占空行
const selectorUiVisible = computed(() => {
  if (props.form.selectors.length > 0) return true
  if (props.mode === 'view') return false
  return share.capabilities.aclSelectorSupported
})
const isView = computed(() => props.mode === 'view')
const dialogTitle = computed(() => {
  if (props.mode === 'add') return t('redisACL.addUser')
  if (props.mode === 'view') return t('redisACL.viewUser')
  return t('redisACL.editUser')
})
const categoryPopoverVisible = computed(() => visible.value && !!selectedCategory.value)
// #endregion

// #region 命令类别
async function loadAclCategories() {
  if (!share.conn?.id || aclCategories.value.length > 0) return
  categoriesLoading.value = true
  try {
    const categories = await meCommands.aclCat(share.conn.id, null)
    aclCategories.value = categories.sort()
  } catch (error) {
    console.error('Failed to load ACL categories:', error)
  } finally {
    categoriesLoading.value = false
  }
}

async function loadCategoryCommands(category: string) {
  if (!category || !share.conn?.id) {
    categoryCommands.value = []
    return
  }
  categoryCommandsLoading.value = true
  try {
    const commands = await meCommands.aclCat(share.conn.id, category)
    categoryCommands.value = commands.sort()
  } catch (error) {
    console.error(`Failed to load commands for category ${category}:`, error)
    categoryCommands.value = []
  } finally {
    categoryCommandsLoading.value = false
  }
}

// 类别选择变化时加载命令详情
watch(selectedCategory, async newCategory => {
  if (newCategory) {
    await loadCategoryCommands(newCategory)
  } else {
    categoryCommands.value = []
  }
})

function copyCategoryCommands() {
  if (categoryCommands.value.length === 0) return
  const text = categoryCommands.value.join(', ')
  meCopy(text, t('redisACL.commandsCopied'))
}

function addCategoryRule() {
  if (!selectedCategory.value) return
  const rule = `+@${selectedCategory.value}`
  pushUnique(props.form.commandRules, rule)
  selectedCategory.value = ''
  categoryCommands.value = []
}

function pushUnique(target: string[], value: string) {
  const text = value.trim()
  if (!text) return
  if (!target.includes(text)) target.push(text)
}
// #endregion

// #region 表单操作
// 快捷模板：覆盖 commandRules；只读项按当前连接是否集群取默认列表
function applyPreset(preset: AclPreset) {
  props.form.commandRules =
    preset === 'readonly'
      ? getReadonlyPresetCommandRules(!!share.conn?.cluster)
      : [...ACL_PRESET_COMMAND_RULES[preset]]
  // 编辑已有用户时只换命令规则，避免覆盖键/频道模式
  if (props.mode === 'add') {
    props.form.keyPatterns = ['*']
    props.form.channelPatterns = ['*']
  }
}

function addRule() {
  pushUnique(props.form.commandRules, ruleInput.value)
  ruleInput.value = ''
}

function copyPassword() {
  const pwd = props.form.password.trim()
  if (!pwd) {
    meWarn(t('redisACL.passwordRequired'))
    return
  }
  meCopy(pwd)
}

function onNopassChange(nopass: boolean) {
  if (nopass) {
    props.form.password = ''
    props.form.passwordHashes = []
  }
}

async function copyPreviewCommand() {
  meCopy(await buildAclExecutableCommand(props.form))
}

// 键模式存不含 ~ 前缀的纯 pattern，展示/保存时由 acl.ts 统一加 ~
function addKeyPattern() {
  const v = keyPatternInput.value.trim().replace(/^~/, '')
  pushUnique(props.form.keyPatterns, v)
  keyPatternInput.value = ''
}

// 频道模式同理，不含 & 前缀
function addChannelPattern() {
  const v = channelPatternInput.value.trim().replace(/^&/, '')
  pushUnique(props.form.channelPatterns, v)
  channelPatternInput.value = ''
}

function addSelector() {
  const normalized = normalizeSelectorInput(selectorInput.value)
  if (!normalized) return
  pushUnique(props.form.selectors, normalized)
  selectorInput.value = ''
}

function removeSelector(item: string) {
  props.form.selectors = props.form.selectors.filter(v => v !== item)
}

function resetDraftInputs() {
  ruleInput.value = ''
  keyPatternInput.value = ''
  channelPatternInput.value = ''
  selectorInput.value = ''
  selectedCategory.value = ''
  categoryCommands.value = []
}

// 至少保留一条，避免保存时后端 empty → allkeys / resetchannels
function removeKeyPattern(item: string) {
  if (props.form.keyPatterns.length <= 1) {
    meWarn(t('redisACL.keyPatternsRequired'))
    return
  }
  props.form.keyPatterns = props.form.keyPatterns.filter(v => v !== item)
}

function removeChannelPattern(item: string) {
  if (props.form.channelPatterns.length <= 1) {
    meWarn(t('redisACL.channelPatternsRequired'))
    return
  }
  props.form.channelPatterns = props.form.channelPatterns.filter(v => v !== item)
}
// #endregion

// #region 拖拽排序
function destroyTagSortables() {
  for (const s of tagSortables) s.destroy()
  tagSortables = []
}

function reorderList(list: string[], oldIndex: number, newIndex: number) {
  if (oldIndex === newIndex) return
  const [item] = list.splice(oldIndex, 1)
  if (item) list.splice(newIndex, 0, item)
}

function bindTagSortable(el: HTMLElement | null, list: () => string[]) {
  if (!el) return
  tagSortables.push(
    Sortable.create(el, {
      draggable: '.acl-tag-item',
      filter: '.el-tag__close',
      preventOnFilter: true,
      animation: 150,
      onEnd({ oldIndex, newIndex }: SortableEvent) {
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        reorderList(list(), oldIndex, newIndex)
      },
    }),
  )
}

async function setupTagSortables() {
  destroyTagSortables()
  if (isView.value) return
  await nextTick()
  bindTagSortable(commandTagsRef.value, () => props.form.commandRules)
  bindTagSortable(keyPatternTagsRef.value, () => props.form.keyPatterns)
  bindTagSortable(channelPatternTagsRef.value, () => props.form.channelPatterns)
}

onBeforeUnmount(destroyTagSortables)

watch(visible, open => {
  if (!open) {
    destroyTagSortables()
    resetDraftInputs()
    return
  }
  resetDraftInputs()
  void loadAclCategories()
  void setupTagSortables()
})
// #endregion
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="800px"
    class="acl-edit-dialog"
    append-to-body
    align-center
    :close-on-press-escape="isView"
    :close-on-click-modal="isView"
    destroy-on-close
    draggable>
    <el-form label-position="right" label-width="auto" class="acl-form">
      <!-- 用户行：左输入 + 右启用开关；field-inline-trail 固定宽保证与密码行对齐 -->
      <el-form-item :label="t('redisACL.username')">
        <div class="field-inline-row">
          <el-input
            v-model="props.form.username"
            :disabled="mode === 'edit' || isView"
            clearable
            :placeholder="t('redisACL.usernamePlaceholder')"
            class="base-input">
          </el-input>
          <div class="field-inline-trail">
            <div class="field-inline-action">
              <span>{{ t('redisACL.enableSwitch') }}</span>
              <el-switch v-model="props.form.enabled" :disabled="isView" />
            </div>
          </div>
        </div>
      </el-form-item>

      <el-form-item v-if="!isView" :label="t('redisACL.password')">
        <div class="field-inline-row">
          <el-input
            v-model="props.form.password"
            show-password
            clearable
            :readonly="props.form.nopass"
            :placeholder="t('redisACL.passwordPlaceholder')"
            :class="[
              'base-input',
              'password-input',
              { 'password-input--nopass': props.form.nopass },
            ]">
            <template #prefix>
              <el-checkbox v-model="props.form.nopass" @change="onNopassChange">
                {{ t('redisACL.passwordNopass') }}
              </el-checkbox>
            </template>
          </el-input>
          <div class="field-inline-trail">
            <el-button-group v-if="!props.form.nopass">
              <el-button @click="emit('generatePassword')">GenPass</el-button>
              <el-button icon="el-icon-document-copy" @click="copyPassword" />
            </el-button-group>
          </div>
        </div>
      </el-form-item>

      <el-form-item v-else :label="t('redisACL.password')">
        <el-text type="info">
          {{ props.form.nopass ? t('redisACL.passwordNopass') : t('redisACL.passwordSet') }}
        </el-text>
      </el-form-item>

      <el-row v-if="!isView" :gutter="12">
        <el-col :span="16">
          <el-form-item :label="t('redisACL.quickPreset')">
            <div class="preset-row">
              <el-button @click="applyPreset('normal')">{{ t('redisACL.presetNormal') }}</el-button>
              <el-button @click="applyPreset('readonly')">{{
                t('redisACL.presetReadonly')
              }}</el-button>
              <el-button @click="applyPreset('admin')">{{ t('redisACL.presetAdmin') }}</el-button>
            </div>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <!-- dangerousBlocked 实际读写 RedisACL 里 form.commandRules 的 -@dangerous -->
          <el-form-item class="no-label-right">
            <div class="danger-row">
              <span>{{ t('redisACL.dangerousBlacklist') }}</span>
              <el-switch v-model="dangerousBlocked" />
            </div>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 命令规则可删至空（后端 nocommands）；键/频道至少保留一条 -->
      <el-form-item :label="t('redisACL.commandRules')">
        <div class="rule-box command-rule-box">
          <div ref="commandTagsRef" class="pattern-tags command-tags">
            <el-tag
              v-for="item in props.form.commandRules"
              :key="item"
              :class="{ 'acl-tag-item': !isView }"
              :closable="!isView"
              disable-transitions
              style="margin: 0 6px 0 0"
              @close="props.form.commandRules = props.form.commandRules.filter(v => v !== item)">
              {{ item }}
            </el-tag>
          </div>

          <!-- ACL 类别选择器和规则输入；与下方键/频道/选择器共用四列 grid -->
          <div v-if="!isView" class="rule-input-row">
            <el-popover
              :width="500"
              trigger="manual"
              :visible="categoryPopoverVisible"
              placement="bottom-start"
              popper-class="category-commands-popper">
              <template #reference>
                <el-select
                  v-model="selectedCategory"
                  :placeholder="t('redisACL.selectCategory')"
                  :loading="categoriesLoading"
                  clearable
                  filterable
                  class="category-select">
                  <el-option v-for="cat in aclCategories" :key="cat" :label="cat" :value="cat" />
                </el-select>
              </template>
              <div v-if="selectedCategory" class="category-commands-popover">
                <div v-if="categoryCommandsLoading" class="loading-text">
                  {{ t('loading') }}
                </div>
                <template v-else-if="categoryCommands.length > 0">
                  <div class="popover-header">
                    <span class="category-name">@{{ selectedCategory }}</span>
                    <span class="command-count"
                      >({{ categoryCommands.length }} {{ t('redisACL.commands') }})</span
                    >
                    <el-button
                      link
                      type="primary"
                      size="small"
                      class="copy-commands-btn"
                      @click="copyCategoryCommands">
                      {{ t('redisACL.copyCommands') }}
                    </el-button>
                  </div>
                  <div class="commands-list">
                    <el-tag
                      v-for="cmd in categoryCommands"
                      :key="cmd"
                      size="small"
                      type="warning"
                      disable-transitions
                      class="command-tag">
                      {{ cmd }}
                    </el-tag>
                  </div>
                </template>
                <div v-else class="empty-text">
                  {{ t('redisACL.noCommands') }}
                </div>
              </div>
            </el-popover>
            <el-button
              class="add-category-btn"
              :disabled="!selectedCategory"
              @click="addCategoryRule">
              {{ t('redisACL.addCategory') }}
            </el-button>
            <el-input
              v-model="ruleInput"
              :placeholder="t('redisACL.rulePlaceholder')"
              class="rule-input-field" />
            <el-button class="add-item-btn" @click="addRule">{{ t('redisACL.addRule') }}</el-button>
          </div>
        </div>
      </el-form-item>

      <el-form-item :label="t('redisACL.keyPatterns')">
        <div class="rule-box">
          <div class="rule-input-row rule-input-row--3col">
            <div class="rule-input-leading">
              <div ref="keyPatternTagsRef" class="pattern-tags">
                <el-tag
                  v-for="item in props.form.keyPatterns"
                  :key="item"
                  :class="{ 'acl-tag-item': !isView }"
                  :closable="!isView"
                  disable-transitions
                  style="margin: 0 6px 0 0"
                  @close="removeKeyPattern(item)">
                  {{ formatKeyPatternLabel(item) }}
                </el-tag>
              </div>
            </div>
            <template v-if="!isView">
              <el-input
                v-model="keyPatternInput"
                :placeholder="t('redisACL.keyPatternPlaceholder')"
                class="rule-input-field" />
              <el-button class="add-item-btn" @click="addKeyPattern">{{
                t('redisACL.addPattern')
              }}</el-button>
            </template>
          </div>
        </div>
      </el-form-item>

      <el-form-item :label="t('redisACL.channelPatterns')">
        <div class="rule-box">
          <div class="rule-input-row rule-input-row--3col">
            <div class="rule-input-leading">
              <div ref="channelPatternTagsRef" class="pattern-tags">
                <el-tag
                  v-for="item in props.form.channelPatterns"
                  :key="item"
                  :class="{ 'acl-tag-item': !isView }"
                  :closable="!isView"
                  disable-transitions
                  style="margin: 0 6px 0 0"
                  @close="removeChannelPattern(item)">
                  {{ formatChannelPatternLabel(item) }}
                </el-tag>
              </div>
            </div>
            <template v-if="!isView">
              <el-input
                v-model="channelPatternInput"
                :placeholder="t('redisACL.channelPatternPlaceholder')"
                class="rule-input-field" />
              <el-button class="add-item-btn" @click="addChannelPattern">{{
                t('redisACL.addPattern')
              }}</el-button>
            </template>
          </div>
        </div>
      </el-form-item>

      <!-- Redis 7.2+ 选择器：布局与键/频道模式一致 -->
      <el-form-item v-if="selectorUiVisible" :label="t('redisACL.selectors')">
        <div class="rule-box">
          <div class="rule-input-row rule-input-row--3col">
            <div class="rule-input-leading">
              <div class="pattern-tags">
                <el-tag
                  v-for="item in props.form.selectors"
                  :key="item"
                  :closable="!isView"
                  disable-transitions
                  style="margin: 0 6px 0 0"
                  @close="removeSelector(item)">
                  {{ formatSelectorLabel(item) }}
                </el-tag>
              </div>
            </div>
            <template v-if="!isView">
              <el-input
                v-model="selectorInput"
                :placeholder="t('redisACL.selectorPlaceholder')"
                class="rule-input-field"
                @keyup.enter="addSelector" />
              <el-button class="add-item-btn" @click="addSelector">{{
                t('redisACL.addSelector')
              }}</el-button>
            </template>
          </div>
        </div>
      </el-form-item>

      <el-form-item :label="t('redisACL.preview')">
        <!-- 展示占位符；点击复制可直执行的 ACL SETUSER（含真实 #hash） -->
        <el-text class="preview-text" @click="copyPreviewCommand">{{
          props.previewCommand
        }}</el-text>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('cancel') }}</el-button>
      <el-button v-if="!isView" type="primary" :loading="loading" @click="emit('save')">{{
        t('save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.rule-box {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 8px;
}

.password-row,
.preset-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.password-input :deep(.el-input__prefix) {
  padding-left: 4px;
  padding-right: 16px;
  margin-right: 10px;
  border-right: 1px solid var(--el-border-color);
}

.password-input :deep(.el-input__prefix-inner > .el-checkbox) {
  height: auto;
  margin-right: 0;
}

.password-input :deep(.el-input__prefix-inner > .el-checkbox .el-checkbox__label) {
  padding-left: 6px;
  font-size: 13px;
}

.password-input--nopass :deep(.el-input__wrapper) {
  background-color: var(--el-fill-color-light);
}

.password-input--nopass :deep(input) {
  cursor: not-allowed;
}

.base-input {
  flex: 1;
  min-width: 0;
  width: auto;
}

.field-inline-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.acl-form {
  // 用户/密码行右侧区域统一宽度，保证两行输入框对齐（密码行右侧为 GenPass + 复制）
  --field-inline-trail-width: 9.5rem;
}

.field-inline-trail {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 var(--field-inline-trail-width);
  width: var(--field-inline-trail-width);
}

.field-inline-action {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.acl-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.acl-edit-dialog :deep(.el-dialog__body) {
  padding-top: 14px;
  padding-bottom: 10px;
}

.danger-row {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

.no-label-right :deep(.el-form-item__content) {
  justify-content: flex-end;
}

/** 命令规则输入行与键/频道/选择器共用四列：类别选择 | 添加类别 | 输入 | 添加 */
.rule-input-row {
  display: grid;
  grid-template-columns: 200px 108px 1fr 108px;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.rule-input-row--3col .rule-input-leading {
  grid-column: 1 / 3;
  min-width: 0;
  overflow: hidden;
}

.rule-input-field {
  min-width: 0;
  width: 100%;
}

.pattern-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: hidden;
  white-space: nowrap;
}

.acl-tag-item {
  cursor: grab;
}

.acl-tag-item:active {
  cursor: grabbing;
}

.pattern-tags :deep(.sortable-ghost) {
  opacity: 0.45;
}

.pattern-tags :deep(.sortable-chosen) {
  opacity: 0.85;
}

.add-item-btn {
  flex-shrink: 0;
  width: 108px;
}

.command-rule-box {
  min-height: 108px;
}

.command-tags {
  min-height: 54px;
  align-items: flex-start;
  flex-wrap: wrap;
  overflow: visible;
  white-space: normal;
}

.command-rule-box .rule-input-row {
  margin-top: 8px;
}

.category-select {
  width: 200px;
}

.category-commands-popover {
  max-height: 400px;
  overflow-y: auto;
}

.loading-text,
.empty-text {
  text-align: center;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.popover-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color);
}

.category-name {
  font-weight: 600;
  color: var(--el-color-primary);
  font-size: 14px;
}

.command-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.copy-commands-btn {
  margin-left: auto;
  padding: 0;
}

.commands-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.command-tag {
  margin: 0;
  font-family: var(--code-font);
}

.add-category-btn {
  flex-shrink: 0;
  width: 108px;
}

.preview-text {
  color: var(--el-color-primary);
  cursor: pointer;
  word-break: break-all;
}
</style>
