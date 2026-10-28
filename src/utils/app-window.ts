/** Tauri 窗口：默认尺寸、复位、全屏、新窗口 */
import { getAllWebviewWindows, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { type } from '@tauri-apps/plugin-os'
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state'
import { nanoid } from 'nanoid'

import i18n from '@/locales'
import { meErr, sleep } from '@/utils/util'

/** 与 tauri.conf.json 默认窗口尺寸一致 */
export const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800 } as const

/** 当前窗口恢复默认大小并居中，同时写入 window-state 持久化 */
export async function resetWindowToDefault(): Promise<void> {
  const win = getCurrentWindow()
  if (await win.isFullscreen()) {
    await win.setFullscreen(false)
    await sleep(100)
  }
  if (await win.isMaximized()) {
    await win.unmaximize()
    // Windows 取消最大化后需等布局稳定，否则 setSize 可能被忽略
    await sleep(100)
  }
  await win.setSize(new LogicalSize(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height))
  await win.center()
  await sleep(50)
  await saveWindowState(StateFlags.ALL)
}

/** F11 / macOS ⌘⇧F 切换当前 Tauri 窗口全屏；与全局快捷键「全屏应用」一致 */
export async function toggleAppFullscreen(): Promise<void> {
  const win = getCurrentWindow()
  await win.setFullscreen(!(await win.isFullscreen()))
}

/** 新建 Tauri 窗口（与 KeyHeader 菜单「新窗口」一致） */
export async function openNewWindow(): Promise<void> {
  const isMacOS = type() === 'macos'
  const windows = await getAllWebviewWindows()
  const hasMainWindow = !!windows.find(item => item.label === 'main')
  const label = hasMainWindow ? 'Window' + nanoid() : 'main'

  const appWindow = new WebviewWindow(label, {
    url: 'index.html',
    title: 'RedisME',
    hiddenTitle: true,
    width: 1200,
    height: 800 + 25,
    dragDropEnabled: false,
    titleBarStyle: 'overlay',
    decorations: isMacOS,
  })

  void appWindow.once('tauri://created', () => {})
  void appWindow.once('tauri://error', () => {
    meErr(i18n.global.t('keyHeader.newWindowError'))
  })
}
