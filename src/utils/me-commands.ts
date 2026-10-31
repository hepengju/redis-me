/**
 * Specta 命令包装。单独成模块，避免 key 缓存为了调用命令去动态导入 util
 * （util 会引用缓存的失效函数，两边静态导入会成环）。
 */
import { ElMessageBox } from 'element-plus'

import i18n from '@/locales'
import type { MeCommands } from '@/types/me-interface'
import { commands as spectaCommands } from '@/types/tauri-specta'

type SpectaResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: unknown }

interface AppErrorPayload {
  code: string
  [key: string]: unknown
}

const isDev = import.meta.env.DEV
const t = i18n.global.t

const SPECTA_EOF_MESSAGE = 'unexpected end of file'
/** 与原先 `spectaEofRetries <= 3` 一致：最多额外重试 4 次 */
const SPECTA_EOF_MAX_RETRY = 3

let spectaEofRetryCount = 0

function errString(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return Object.prototype.toString.call(e)
  }
}

/** 开发环境打印日志 */
export function meLog(...args: unknown[]): void {
  if (isDev) {
    console.log(...args)
  }
}

/** 若 `errorStr` 为带 `code` 的应用错误 JSON 则走 i18n，否则原样返回（供弹窗/终端内联复用） */
export function formatSpectaErrorForUser(errorStr: string): string {
  try {
    const parsed = JSON.parse(errorStr) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('code' in parsed) ||
      typeof (parsed as AppErrorPayload).code !== 'string'
    ) {
      return errorStr
    }
    const { code, ...params } = parsed as AppErrorPayload
    const key = `errors.${code}`
    const message = t(key, params as Record<string, unknown>)
    return message === key ? `${code}: ${JSON.stringify(params)}` : message
  } catch {
    return errorStr
  }
}

export function meErr(message: unknown, title: string = t('error')): void {
  const raw =
    message instanceof Error
      ? message.message
      : typeof message === 'string'
        ? message
        : errString(message)
  const text = formatSpectaErrorForUser(raw)
  void ElMessageBox.alert(text, title, { type: 'error', draggable: true }).then(() => {})
}

function unwrapSpecta<T>(raw: SpectaResult<T>): T {
  if (raw.status === 'ok') return raw.data
  throw raw.error
}

async function invokeSpectaCommand<T>(
  name: string,
  args: readonly unknown[],
  run: () => Promise<SpectaResult<T>>,
  alert: boolean,
): Promise<T> {
  const t0 = Date.now()
  try {
    const data = unwrapSpecta(await run())
    meLog(`命令：${name}, 耗时：${Date.now() - t0}ms, 参数：`, args, '结果：', data)
    spectaEofRetryCount = 0
    return data
  } catch (e) {
    const msg = errString(e)
    if (msg === SPECTA_EOF_MESSAGE && spectaEofRetryCount <= SPECTA_EOF_MAX_RETRY) {
      spectaEofRetryCount++
      meLog(`第${spectaEofRetryCount}次重试：${name}`)
      return invokeSpectaCommand(name, args, run, alert)
    }
    if (alert) {
      const title = t('error') + (isDev ? ': ' + name : '')
      meErr(formatSpectaErrorForUser(msg), title)
    }
    meLog(`命令：${name}, 耗时：${Date.now() - t0}ms, 参数:`, args, `, 错误：${msg}`)
    throw msg
  }
}

type SpectaCommandFn = (...a: unknown[]) => Promise<SpectaResult<unknown>>

/**
 * 与 Specta `commands` 同键。比原函数多传一个末尾 `false` 时失败不弹窗。
 * 原参数本身是 `false`（如 deleteDocs）时不能剥掉，否则 Tauri 会报缺参。
 */
function bindMeCommand(name: string, fn: unknown): unknown {
  if (typeof fn !== 'function') return fn
  const spectaFn = fn as SpectaCommandFn
  const arity = spectaFn.length
  return (...args: unknown[]) => {
    const silent = args.length > arity && args[args.length - 1] === false
    const pass = silent ? args.slice(0, -1) : args
    return invokeSpectaCommand(String(name), pass, () => spectaFn(...pass), !silent)
  }
}

export const meCommands = Object.fromEntries(
  Object.entries(spectaCommands).map(([name, fn]) => [name, bindMeCommand(name, fn)]),
) as MeCommands
