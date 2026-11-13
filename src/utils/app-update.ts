/** 应用内自动更新（Tauri updater） */
import { type } from '@tauri-apps/plugin-os'
import { relaunch } from '@tauri-apps/plugin-process'
import { Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { ElMessage } from 'element-plus'
import type { ElMessageBoxOptions } from 'element-plus'
import { h } from 'vue'

import i18n from '@/locales'
import type { MeAppUpdateState } from '@/types/me-interface'
import {
  DoNothing,
  meCommands,
  meCommandsQuiet,
  meConfirm,
  meErr,
  meLog,
  meOpenUrl,
} from '@/utils/util'

const t = i18n.global.t

function errString(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return Object.prototype.toString.call(e)
  }
}

const manualCloseOptions: ElMessageBoxOptions = {
  closeOnClickModal: false,
  closeOnPressEscape: false,
  type: 'info',
}

/** 每个更新源各自的超时。自动模式里，前一个挂起时最多等这么久再试下一个。 */
const UPDATE_CHECK_TIMEOUT_MS = 5000

const UPDATE_ENDPOINT_GITEE =
  'https://gitee.com/hepengju/redis-me/releases/download/latest/latest.json'
const UPDATE_ENDPOINT_GITHUB =
  'https://github.com/hepengju/redis-me/releases/latest/download/latest.json'

/**
 * 中国大陆时区。香港、澳门、台湾不放进来。
 * Asia/Beijing 不在 IANA 库里，规范名是 Asia/Shanghai；openEuler 等发行版会自行加上并链到上海。
 */
const MAINLAND_CHINA_TIMEZONES = new Set([
  'Asia/Shanghai',
  'Asia/Beijing',
  'Asia/Urumqi',
  'Asia/Chongqing',
  'Asia/Harbin',
])

/**
 * 要请求的更新清单。
 * 指定 Gitee 或 GitHub 时只用那一个。自动时中国大陆时区先 Gitee，其余先 GitHub，失败再试另一个。
 * 未知取值也按自动处理。
 */
export function updateEndpoints(source: unknown, timeZone: string): string[] {
  if (source === 'gitee') return [UPDATE_ENDPOINT_GITEE]
  if (source === 'github') return [UPDATE_ENDPOINT_GITHUB]
  const preferGitee = MAINLAND_CHINA_TIMEZONES.has(timeZone)
  return preferGitee
    ? [UPDATE_ENDPOINT_GITEE, UPDATE_ENDPOINT_GITHUB]
    : [UPDATE_ENDPOINT_GITHUB, UPDATE_ENDPOINT_GITEE]
}

/** 按当前更新源设置检查。没有更新时返回 null。 */
export async function checkAppUpdate(): Promise<Update | null> {
  const endpoints = updateEndpoints(
    window.meTauri.settings.updateSource,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  meLog('检查更新端点:', endpoints)
  // Quiet：失败不弹命令错误，交给调用方决定是否提示
  const metadata = await meCommandsQuiet.checkAppUpdate(endpoints, UPDATE_CHECK_TIMEOUT_MS)
  if (!metadata) return null
  return new Update({
    rid: metadata.rid,
    currentVersion: metadata.currentVersion,
    version: metadata.version,
    date: metadata.date ?? undefined,
    body: metadata.body ?? undefined,
    rawJson: (metadata.rawJson ?? {}) as Record<string, unknown>,
  })
}

export async function meCheckUpdate(quiet = true, app: MeAppUpdateState): Promise<void> {
  if (window?.meTauri?.isAppStore) {
    meLog('应用商店内部的应用更新，忽略检查接口')
    return
  }

  if (!quiet) {
    ElMessage.primary(t('util.checking'))
  }

  const update = await checkAppUpdate().catch(DoNothing)
  if (update) {
    await meDownloadUpdate(quiet, update, app)
  } else if (update === null) {
    if (!quiet) {
      ElMessage.success(t('util.latestVersion'))
    }
  } else {
    if (!quiet) {
      ElMessage.error(t('util.checkUpdateErr'))
    }
  }
}

export async function meDownloadUpdate(
  quiet = true,
  update: Update,
  app: MeAppUpdateState,
): Promise<void> {
  meLog('检查结果:', update)
  const hint = t('util.updateHint', { version: update.version })
  const changelog = t('util.changelog')
  const changelogUrl = t('util.changelogUrl')
  const message = () =>
    h('p', null, [
      h('span', hint),
      h(
        'a',
        {
          style:
            'color: var(--el-color-primary); text-decoration: none; margin-left: 5px; cursor: pointer; ',
          onClick: () => {
            meOpenUrl(changelogUrl)
          },
        },
        changelog,
      ),
    ])

  meConfirm(
    'MessageInvalid',
    async () => {
      try {
        app.downloading = true
        app.downloadPercentage = 0

        let downloaded = 0
        let contentLength = 0
        const downloadingHandle = (event: DownloadEvent) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength ?? 0
              break
            case 'Progress':
              downloaded += event.data.chunkLength
              app.downloadPercentage = contentLength
                ? Math.round((downloaded / contentLength) * 100)
                : 0
              break
            case 'Finished':
              app.downloadPercentage = 100
              break
          }
        }

        const isWindows = type() === 'windows'
        const isMacOS = type() === 'macos'
        if (isWindows) {
          await update.download(downloadingHandle)
          meConfirm(t('util.downloadDown'), async () => await update.install(), manualCloseOptions)
        } else {
          await update.downloadAndInstall(downloadingHandle)
          // macOS：relaunch 会与 single-instance 竞态，改走 Rust 延迟 open 重启
          meConfirm(
            t('util.updateDone'),
            async () => {
              if (isMacOS) {
                await meCommands.restartAfterUpdate()
              } else {
                await relaunch()
              }
            },
            manualCloseOptions,
          )
        }
      } catch (e) {
        meErr(t('util.updateErr', { message: errString(e) }))
      } finally {
        app.downloading = false
      }
    },
    { ...manualCloseOptions, message },
  )
}
