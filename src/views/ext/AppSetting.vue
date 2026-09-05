<script setup lang="ts">
// #region 导入
import { getVersion } from '@tauri-apps/api/app'
import { appConfigDir, appLogDir } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { getSystemFonts } from 'tauri-plugin-system-fonts-api'
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { appProvideKey, connUiProvideKey } from '@/types/me-interface'
import { meCheckUpdate } from '@/utils/app-update'
import { resetWindowToDefault } from '@/utils/app-window'
import { defaultSettings } from '@/utils/settings-defaults'
import { meConfirm, meCommands, meErr, meOk } from '@/utils/util'
// #endregion

// #region 核心状态
const { t } = useI18n()
const settings = window.meTauri.settings
const isAppStore = window.meTauri.isAppStore
const connUi = inject(connUiProvideKey)!

const visible = ref(false)

// `window.queryLocalFonts()` 返回项中用到的字段（Local Font Access，与 FontData 子集一致）
interface LocalFontFace {
  readonly style: string
  readonly fullName: string
}

// 主题
const themeList = computed(() => [
  { value: 'light', label: t('setting.light') },
  { value: 'dark', label: t('setting.dark') },
  { value: 'system', label: t('setting.system') },
])

// 语言
const langList = computed(() => [
  { value: 'system', label: t('setting.systemLanguage') },
  { value: 'en', label: 'English' },
  { value: 'zhCN', label: '简体中文' },
])

// 字体
const fonts = ref<string[]>([])
const loadFonts = async () => {
  // 浏览器直接获取系统字体, safari不支持
  // 取fullName作为显示, style过滤Regular去除粗体/斜体
  // 示例1: FontData {postscriptName: 'SimHei', fullName: '黑体', family: 'SimHei', style: 'Regular'}
  // 示例2: FontData {postscriptName: 'Arial-Black', fullName: 'Arial Black Normal', family: 'Arial', style: 'Black'}
  try {
    const localFonts: LocalFontFace[] = window.queryLocalFonts
      ? [...(await window.queryLocalFonts())]
      : []
    if (localFonts.length > 0) {
      fonts.value = localFonts
        .filter(f => f.style === 'Regular')
        .map(f => f.fullName)
        .sort()
      return
    }
  } catch {
    // 无用户激活 / 拒绝授权等 → 走 Rust 回退
  }

  // 用户未授权时采用rust获取字体（名称就没有中文了）, 但可以判断是否为等宽字体
  // 示例1: {"id":"4294967481","name":"SimHei","fontName":"SimHei","path":"C:\\Windows\\Fonts\\simhei.ttf","weight":400,"style":"Normal","monospaced":false}
  // 示例2: {"id":"4294967341","name":"Consolas","fontName":"Consolas","path":"C:\\Windows\\Fonts\\consola.ttf","weight":400,"style":"Normal","monospaced":true}
  // 示例3: {"id":"4294967479","name":"Segoe UI Variable","fontName":"SegoeUIVariable","path":"C:\\Windows\\Fonts\\SegUIVar.ttf","weight":400,"style":"Normal","monospaced":false}
  const systemFonts = await getSystemFonts()
  fonts.value = [...new Set(systemFonts.map(f => f.name))].sort()
}

function open() {
  visible.value = true
  // queryLocalFonts 需要用户手势；在打开设置（点击）时再拉字体，避免启动 onMounted 抛 SecurityError
  if (fonts.value.length === 0) void loadFonts()
}
defineExpose({ open })

// 检查更新
const appVersion = ref('')
getVersion()
  .then(res => (appVersion.value = res))
  .catch(_ => {})
const loading = ref(false)
const app = inject(appProvideKey)!
async function checkUpdate() {
  loading.value = true
  try {
    await meCheckUpdate(false, { timeout: 10000 }, app)
  } finally {
    loading.value = false
  }
}
// #endregion

// #region 设置配置
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const keyShowList = computed(() => [
  { value: 'tree', label: t('setting.keyShowTree') },
  { value: 'list', label: t('setting.keyShowList') },
])
const keySortList = computed(() => [
  { value: 'count', label: t('setting.sortByCount') },
  { value: 'alphabet', label: t('setting.sortByAlphabet') },
])
const fieldShowList = computed(() => [
  { value: 'auto', label: t('setting.fieldShowAuto') },
  { value: 'table', label: t('setting.fieldShowTable') },
])

// 默认设置（从 settings-defaults.ts 导入，避免修改时遗漏）
const baseDefaultSettings = {
  theme: defaultSettings.theme,
  language: defaultSettings.language,
  uiFont: defaultSettings.uiFont,
  codeFont: defaultSettings.codeFont,
  autoUpdate: defaultSettings.autoUpdate,
}

const moreDefaultSettings = {
  keyScanCount: defaultSettings.keyScanCount,
  fieldScanCount: defaultSettings.fieldScanCount,
  keyShow: defaultSettings.keyShow,
  keySort: defaultSettings.keySort,
  keyHeight: defaultSettings.keyHeight,
  fieldShow: defaultSettings.fieldShow,
  fieldShowView: defaultSettings.fieldShowView,
  hashFieldTtl: defaultSettings.hashFieldTtl,
  commandTimeout: defaultSettings.commandTimeout,
  connectTimeout: defaultSettings.connectTimeout,
  codecExecTimeoutSec: defaultSettings.codecExecTimeoutSec,
  valueByteLimitMB: defaultSettings.valueByteLimitMB,
  valuePreviewBytes: defaultSettings.valuePreviewBytes,
}

/** 更多设置数字项 min/max，与表单项及 ? 提示共用 */
const MORE_SETTING_LIMITS = {
  keyScanCount: { min: 10, max: 50000 },
  fieldScanCount: { min: 10, max: 1000 },
  commandTimeout: { min: 5, max: 300 },
  connectTimeout: { min: 5, max: 300 },
  codecExecTimeoutSec: { min: 1, max: 120 },
  keyHeight: { min: 16, max: 28 },
  valueByteLimitMB: { min: 1, max: 5 },
  valuePreviewBytes: { min: 1000, max: 10000 },
} as const

type BaseSettingKey = keyof typeof baseDefaultSettings
type MoreSettingKey = keyof typeof moreDefaultSettings

// 任何一个字段不同则视为不同
// 判断设置是否与默认值不同
const isBaseDiff = computed(() =>
  (Object.keys(baseDefaultSettings) as BaseSettingKey[]).some(key => {
    const current = settings[key]
    const defaultValue = baseDefaultSettings[key]

    // 处理数组类型的比较
    if (Array.isArray(current) && Array.isArray(defaultValue)) {
      return (
        current.length !== defaultValue.length ||
        current.some((item, index) => item !== defaultValue[index])
      )
    }

    return current !== defaultValue
  }),
)

const isMoreDiff = computed(() =>
  (Object.keys(moreDefaultSettings) as MoreSettingKey[]).some(
    key => settings[key] !== moreDefaultSettings[key],
  ),
)

// 恢复默认
function toDefault(name: 'baseSetting' | 'moreSetting') {
  meConfirm(t('setting.confirmToDefault', { name: t('setting.' + name) }), () => {
    Object.assign(settings, name === 'baseSetting' ? baseDefaultSettings : moreDefaultSettings)
  })
}

// 键高度：失焦时纠正非法输入（方向键/步进由 el-input-number 处理）
function normalizeKeyHeight() {
  const { min, max } = MORE_SETTING_LIMITS.keyHeight
  let n = Number(settings.keyHeight)
  if (!Number.isFinite(n)) n = moreDefaultSettings.keyHeight
  settings.keyHeight = Math.min(max, Math.max(min, Math.round(n)))
}

// 打开目录
const dirType = ref<'config' | 'app' | 'log'>('config')
const dirList = computed(() => [
  { value: 'config' as const, label: t('setting.configDir') },
  { value: 'app' as const, label: t('setting.appDir') },
  { value: 'log' as const, label: t('setting.logDir') },
])
async function openDir(dirType: 'config' | 'app' | 'log') {
  let dir = ''
  if (dirType === 'config') {
    dir = await appConfigDir()
  } else if (dirType === 'app') {
    dir = await meCommands.appDir()
  } else {
    dir = await appLogDir()
  }
  await openPath(dir)
}

async function resetWindowSize() {
  try {
    await resetWindowToDefault()
    meOk(t('setting.resetWindowOk'))
  } catch (e) {
    meErr(e)
  }
}
// #endregion
</script>

<template>
  <el-dialog v-model="visible" width="650" align-center draggable>
    <template #header>
      <me-icon icon="el-icon-setting" :name="t('setting.title')"></me-icon>
    </template>
    <!-- 基础设置 -->
    <el-card>
      <template #header>
        <div class="me-flex" style="align-items: center">
          <div>{{ t('setting.baseSetting') }}</div>
          <el-text
            class="restore"
            type="info"
            @click="toDefault('baseSetting')"
            v-if="isBaseDiff"
            >{{ t('setting.toDefault') }}</el-text
          >
        </div>
      </template>
      <el-form inline label-position="right" :label-width="t('setting.labelWidth')">
        <!-- 主题、语言 -->
        <el-row class="me-flex">
          <el-form-item :label="t('setting.theme')">
            <el-segmented v-model="settings.theme" :options="themeList" />
          </el-form-item>
          <el-form-item :label="t('setting.language')">
            <el-select v-model="settings.language" style="width: 120px">
              <el-option
                v-for="item in langList"
                :label="item.label"
                :value="item.value"
                :key="item.value" />
            </el-select>
          </el-form-item>
        </el-row>

        <!-- 界面字体 -->
        <el-row>
          <el-form-item :label="t('setting.uiFont')" style="width: 100%">
            <el-select
              v-model="settings.uiFont"
              :placeholder="t('setting.uiFontHint')"
              clearable
              multiple
              allow-create
              filterable
              :reserve-keyword="false">
              <el-option v-for="item in fonts" :label="item" :value="item" :key="item" />
            </el-select>
          </el-form-item>
        </el-row>

        <!-- 代码字体 -->
        <el-row>
          <el-form-item :label="t('setting.codeFont')" style="width: 100%">
            <el-select
              v-model="settings.codeFont"
              :placeholder="t('setting.codeFontHint')"
              clearable
              multiple
              allow-create
              filterable
              :reserve-keyword="false">
              <el-option v-for="item in fonts" :label="item" :value="item" :key="item" />
            </el-select>
          </el-form-item>
        </el-row>

        <!-- 目录、快捷键 -->
        <el-row class="me-flex setting-inline-row">
          <el-form-item :label="t('setting.dir')">
            <div class="me-flex">
              <el-select v-model="dirType" style="width: 100px">
                <el-option
                  v-for="item in dirList"
                  :label="item.label"
                  :value="item.value"
                  :key="item.value" />
              </el-select>
              <el-button
                style="margin-left: 8px"
                icon="el-icon-folder-opened"
                @click="openDir(dirType)" />
            </div>
          </el-form-item>
          <el-form-item>
            <div class="setting-row-btns">
              <me-button plain icon="me-icon-keyshort" @click="connUi.openShortcuts()">{{
                t('setting.shortcuts')
              }}</me-button>
              <me-button
                plain
                icon="el-icon-full-screen"
                :info="t('setting.resetWindowTip')"
                @click="resetWindowSize"
                >{{ t('setting.resetWindow') }}</me-button
              >
            </div>
          </el-form-item>
        </el-row>

        <!-- 更新设置 -->
        <el-row class="me-flex">
          <el-form-item :label="t('setting.update')">
            <el-tag v-if="isAppStore" type="info">{{ t('setting.updateAppStore') }}</el-tag>
            <el-checkbox v-else v-model="settings.autoUpdate" :label="t('setting.updateAuto')" />
          </el-form-item>

          <el-form-item :label="t('setting.nowVersion')">
            <span
              ><el-tag type="info">v{{ appVersion }}</el-tag></span
            >
            <el-button
              style="margin-left: 10px"
              plain
              @click="checkUpdate"
              :loading="loading"
              icon="el-icon-check"
              :disabled="app.downloading"
              v-if="!isAppStore"
              >{{ t('setting.updateNow') }}</el-button
            >
          </el-form-item>
        </el-row>
      </el-form>
    </el-card>

    <!-- 更多设置 -->
    <el-card style="margin-top: 10px">
      <template #header>
        <div class="me-flex" style="align-items: center">
          <div>{{ t('setting.moreSetting') }}</div>
          <el-text
            class="restore"
            type="info"
            @click="toDefault('moreSetting')"
            v-if="isMoreDiff"
            >{{ t('setting.toDefault') }}</el-text
          >
        </div>
      </template>
      <el-form
        inline
        label-position="right"
        class="setting-more-form"
        :label-width="t('setting.extLabelWidth')">
        <!-- 扫描数量 -->
        <el-row class="me-flex">
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.keyScanCount')"
                icon="el-icon-question-filled"
                :info="t('setting.keyScanCountTip', MORE_SETTING_LIMITS.keyScanCount)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.keyScanCount"
              :min="MORE_SETTING_LIMITS.keyScanCount.min"
              :max="MORE_SETTING_LIMITS.keyScanCount.max"
              :controls="false"
              style="width: 100px"
              align="left">
              <template #suffix>{{ t('setting.countUnit') }}</template>
            </el-input-number>
          </el-form-item>
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.fieldScanCount')"
                icon="el-icon-question-filled"
                :info="t('setting.fieldScanCountTip', MORE_SETTING_LIMITS.fieldScanCount)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model.number="settings.fieldScanCount"
              :min="MORE_SETTING_LIMITS.fieldScanCount.min"
              :max="MORE_SETTING_LIMITS.fieldScanCount.max"
              :controls="false"
              style="width: 100px"
              align="left">
              <template #suffix>{{ t('setting.countUnit') }}</template>
            </el-input-number>
          </el-form-item>
        </el-row>

        <!-- 连接超时、安全阈值 -->
        <el-row class="me-flex">
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.connectTimeout')"
                icon="el-icon-question-filled"
                :info="t('setting.connectTimeoutTip', MORE_SETTING_LIMITS.connectTimeout)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.connectTimeout"
              :min="MORE_SETTING_LIMITS.connectTimeout.min"
              :max="MORE_SETTING_LIMITS.connectTimeout.max"
              :controls="false"
              style="width: 100px"
              align="left">
              <template #suffix>{{ t('setting.secUnit') }}</template>
            </el-input-number>
          </el-form-item>
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.valueByteLimitMB')"
                icon="el-icon-question-filled"
                :info="t('setting.valueByteLimitMBTip', MORE_SETTING_LIMITS.valueByteLimitMB)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.valueByteLimitMB"
              :min="MORE_SETTING_LIMITS.valueByteLimitMB.min"
              :max="MORE_SETTING_LIMITS.valueByteLimitMB.max"
              :controls="false"
              :step="1"
              style="width: 100px"
              align="left">
              <template #suffix>M</template>
            </el-input-number>
          </el-form-item>
          <!-- 预览字节：暂不展示
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.valuePreviewBytes')"
                icon="el-icon-question-filled"
                :info="t('setting.valuePreviewBytesTip', MORE_SETTING_LIMITS.valuePreviewBytes)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.valuePreviewBytes"
              :min="MORE_SETTING_LIMITS.valuePreviewBytes.min"
              :max="MORE_SETTING_LIMITS.valuePreviewBytes.max"
              :controls="false"
              style="width: 100px"
              align="left">
              <template #suffix>B</template>
            </el-input-number>
          </el-form-item>
          -->
        </el-row>

        <!-- 超时 -->
        <el-row class="me-flex">
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.commandTimeout')"
                icon="el-icon-question-filled"
                :info="t('setting.commandTimeoutTip', MORE_SETTING_LIMITS.commandTimeout)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.commandTimeout"
              :min="MORE_SETTING_LIMITS.commandTimeout.min"
              :max="MORE_SETTING_LIMITS.commandTimeout.max"
              :controls="false"
              style="width: 100px"
              align="left">
              <template #suffix>{{ t('setting.secUnit') }}</template>
            </el-input-number>
          </el-form-item>
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.scriptTimeout')"
                icon="el-icon-question-filled"
                :info="t('setting.scriptTimeoutTip', MORE_SETTING_LIMITS.codecExecTimeoutSec)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.codecExecTimeoutSec"
              :min="MORE_SETTING_LIMITS.codecExecTimeoutSec.min"
              :max="MORE_SETTING_LIMITS.codecExecTimeoutSec.max"
              :controls="false"
              style="width: 100px"
              align="left">
              <template #suffix>{{ t('setting.secUnit') }}</template>
            </el-input-number>
          </el-form-item>
        </el-row>

        <!-- 键展示、键高度 -->
        <el-row class="me-flex">
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.keyShow')"
                icon="el-icon-question-filled"
                :info="t('setting.keyShowTip')"
                :icon-left="false"
                placement="top" />
            </template>
            <el-segmented v-model="settings.keyShow" :options="keyShowList" />
          </el-form-item>

          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.keyHeight')"
                icon="el-icon-question-filled"
                :info="t('setting.keyHeightTip', MORE_SETTING_LIMITS.keyHeight)"
                :icon-left="false"
                placement="top" />
            </template>
            <el-input-number
              v-model="settings.keyHeight"
              :min="MORE_SETTING_LIMITS.keyHeight.min"
              :max="MORE_SETTING_LIMITS.keyHeight.max"
              :controls="false"
              style="width: 100px"
              align="left"
              @blur="normalizeKeyHeight">
              <template #suffix>{{ t('setting.pxUnit') }}</template>
            </el-input-number>
          </el-form-item>
        </el-row>

        <!-- 字段展示、树形排序 -->
        <el-row class="me-flex">
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.fieldShow')"
                icon="el-icon-question-filled"
                :info="t('setting.fieldShowTip')"
                :icon-left="false"
                placement="top" />
            </template>
            <el-segmented v-model="settings.fieldShow" :options="fieldShowList" />
          </el-form-item>
          <el-form-item>
            <template #label>
              <me-icon
                :name="t('setting.keySort')"
                icon="el-icon-question-filled"
                :info="t('setting.keySortTip')"
                :icon-left="false"
                placement="top" />
            </template>
            <el-segmented
              v-model="settings.keySort"
              :options="keySortList"
              :disabled="settings.keyShow !== 'tree'" />
          </el-form-item>
        </el-row>
      </el-form>
    </el-card>
  </el-dialog>
</template>

<style scoped lang="scss">
:deep(.el-card__header) {
  font-weight: bold;
}

:deep(.el-card__body) {
  padding: 20px 20px 0 20px;
}

.restore {
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
  }
}

.setting-inline-row {
  align-items: center;
}

.setting-row-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-more-form {
  width: 100%;

  :deep(.me-flex) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex-wrap: nowrap;

    .el-form-item:first-child {
      justify-self: start;
    }

    .el-form-item:last-child {
      justify-self: end;
    }
  }

  :deep(.el-form-item) {
    align-items: center;
    margin-right: 0;
    margin-bottom: 10px;
  }

  :deep(.el-form-item__label) {
    white-space: nowrap;
  }
}
</style>
