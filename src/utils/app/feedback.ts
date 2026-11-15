/** Element Plus 提示、确认框、剪贴板、外链 */
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useClipboard } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ElMessageBoxOptions } from 'element-plus'

import i18n from '@/locales'
import { meLog } from '@/utils/app/me-commands'

const t = i18n.global.t

export const DoNothing = (): void => {}

export function meOk(
  message: string,
  isAlert = false,
  title = '',
  options: Record<string, unknown> = {},
): void {
  if (isAlert) {
    const finalOptions = { type: 'success' as const, draggable: true, ...options }
    void ElMessageBox.alert(message, title || t('info'), finalOptions).then(DoNothing)
  } else {
    ElMessage.success(message)
  }
}

export function meWarn(message: string): void {
  ElMessage.warning(message)
}

/** 错误弹窗（HTML 换行，用于自定义编解码测试等） */
export function meErrHtml(message: string, title: string = t('error')): void {
  void ElMessageBox.alert(message, title, {
    type: 'error',
    draggable: true,
    dangerouslyUseHTMLString: true,
  }).then(DoNothing)
}

export function meConfirm(
  message: string,
  thenFun: () => void | Promise<void>,
  boxOptions: ElMessageBoxOptions = {},
): void {
  ElMessageBox.confirm(message, boxOptions?.type === 'info' ? t('info') : t('warn'), {
    type: 'warning',
    ...boxOptions,
  })
    .then(thenFun)
    .catch(DoNothing)
}

export function mePrompt(
  message: string,
  options: ElMessageBoxOptions,
  thenFun: (result: { value: string }) => void | Promise<void>,
): void {
  ElMessageBox.prompt(message, options).then(thenFun).catch(DoNothing)
}

// 复制文本
export function meCopy(text: string, hintContent?: string, hint = true): void {
  void useClipboard({ legacy: true }).copy(text)
  if (hint) {
    meOk(hintContent || t('copyOk'))
  }
}

/** 打开外部链接：Tauri opener → 原生 window.open（非 Tauri 环境）→ 降级复制网址 + 提示 */
export function meOpenUrl(url: string): void {
  void (async () => {
    if (isTauri()) {
      try {
        await openUrl(url)
        return
      } catch (e) {
        meLog('打开链接失败:', url, e)
      }
    } else if (window.open(url, '_blank')) {
      return
    }
    meCopy(url, '', false) // 静默复制，便于用户手动粘贴打开
    meWarn(`${t('util.openUrlFail')}${url}`)
  })()
}
