/**
 * 值/键视图格式与 base64 wire 编解码。
 * IPC 对 STRING/Hash/List/Set/ZSet 恒为 base64；UTF8/Hex/JdkSerial 等仅为前端展示。
 * custom 走 shell 脚本。
 */

import { decode, encode } from '@msgpack/msgpack'
import { isTauri } from '@tauri-apps/api/core'
import { type } from '@tauri-apps/plugin-os'
import { Command } from '@tauri-apps/plugin-shell'
import JSON5 from 'json5'

import i18n from '@/locales'
import type { BytesFormat } from '@/types/tauri-specta'
import { base64ToUtf8Text } from '@/utils/detect-view-format'
import { formatJavaSerDisplay, javaSerBase64ToValue } from '@/utils/javaserial'
import { formatPhpSerialDisplay, phpSerialBase64ToValue } from '@/utils/phpserial'
import { formatPickleDisplay, pickleBase64ToValue } from '@/utils/pickle'

const t = i18n.global.t

// #region 自定义 Codec（shell 脚本 decode/encode）

/** Base64 参数超过此长度时改走 stdin（Windows cmd 命令行约 8191 字符上限） */
export const CODEC_STDIN_B64_THRESHOLD = 8000
const STDIN_ARG = '--stdin'

/** 持久化于 settings.customCodecs；CustomCodec.vue CRUD */
export interface CustomCodec {
  name: string
  /** 可执行入口，如 `python3 /path/codec.py` */
  command: string
}

export type CodecMode = 'decode' | 'encode'

interface ShellExecResult {
  code: number
  stdout: string
  stderr: string
}

const B64_RE = /^[A-Za-z0-9+/]+=*$/

function isValidBase64(s: string): boolean {
  return B64_RE.test(s)
}

function textUtf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

/** 按名称查 settings.customCodecs；meFormatViewValueAsync / meViewToWireAsync 内部 */
export function findCustomCodec(name: string): CustomCodec | undefined {
  const list = window.meTauri.settings.customCodecs
  if (!Array.isArray(list)) return undefined
  return list.find(f => f.name === name)
}

function getExecTimeoutSec(): number {
  const n = window.meTauri.settings.codecExecTimeoutSec
  return typeof n === 'number' && n > 0 ? n : 5
}

export function needsStdinInput(b64: string): boolean {
  return b64.length >= CODEC_STDIN_B64_THRESHOLD
}

/** 拼完整命令行；CustomCodec.vue 测试弹窗展示用 */
export function buildCodecCommand(codec: CustomCodec, mode: CodecMode, b64: string): string {
  const cmd = codec.command.trim()
  if (!cmd) throw new Error(t('customCodec.emptyCommand'))
  if (needsStdinInput(b64)) return `${cmd} ${mode} ${STDIN_ARG}`
  return `${cmd} ${mode} ${b64}`
}

function formatExecError(name: string, result: ShellExecResult, fullCommand: string): string {
  const err = result.stderr?.trim() || result.stdout?.trim()
  let detail: string
  if (err) {
    detail = err
  } else if (result.code !== 0) {
    detail = t('customCodec.execFailed', { name, code: result.code })
  } else {
    detail = t('customCodec.invalidOutput', { name })
  }
  return withExecCommand(name, fullCommand, detail)
}

/** 与内置同结构：`Name Decode Error` + Reason + Script */
function withExecCommand(name: string, fullCommand: string, message: string): string {
  return formatViewDecodeError(`${name} Decode Error`, fullCommand, message, 'Script')
}

/** 从失败文案取 Reason（可多行）；CustomCodec.vue 展示 */
export function parseCodecErrorDetail(message: string): string {
  const m = /(?:^|\n)Reason: ([\s\S]*?)(?:\n(?:Script|Base64): |$)/.exec(message)
  return m?.[1]?.trim() || message.trim()
}

function toExecError(name: string, fullCommand: string, e: unknown): Error {
  const detail = e instanceof Error ? e.message : String(e)
  return new Error(withExecCommand(name, fullCommand, detail))
}

function createExecCommand(fullCommand: string) {
  if (type() === 'windows') {
    return Command.create('exec-cmd', ['/C', fullCommand])
  }
  return Command.create('exec-sh', ['-c', fullCommand])
}

function execTimeoutPromise(
  codecName: string,
  timeoutSec: number,
): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(t('customCodec.timeout', { name: codecName, sec: timeoutSec }))),
      timeoutSec * 1000,
    )
  })
  return {
    promise,
    clear: () => {
      if (timer) clearTimeout(timer)
    },
  }
}

async function execShell(fullCommand: string, codecName: string): Promise<ShellExecResult> {
  if (!isTauri()) {
    throw new Error(t('customCodec.shellUnavailable'))
  }
  const timeoutSec = getExecTimeoutSec()
  const cmd = createExecCommand(fullCommand)
  const timeout = execTimeoutPromise(codecName, timeoutSec)
  try {
    const result = await Promise.race([cmd.execute(), timeout.promise])
    return { code: result.code ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } catch (e) {
    throw toExecError(codecName, fullCommand, e)
  } finally {
    timeout.clear()
  }
}

async function execShellWithStdin(
  fullCommand: string,
  b64: string,
  codecName: string,
): Promise<ShellExecResult> {
  if (!isTauri()) {
    throw new Error(t('customCodec.shellUnavailable'))
  }
  const timeoutSec = getExecTimeoutSec()
  const cmd = createExecCommand(fullCommand)
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const closePromise = new Promise<{ code: number | null }>((resolve, reject) => {
    cmd.on('close', data => resolve({ code: data.code }))
    cmd.on('error', err => reject(new Error(String(err))))
    cmd.stdout.on('data', line => stdoutChunks.push(String(line)))
    cmd.stderr.on('data', line => stderrChunks.push(String(line)))
  })

  const timeout = execTimeoutPromise(codecName, timeoutSec)
  let child: Awaited<ReturnType<typeof cmd.spawn>> | undefined
  let finished = false
  try {
    child = await cmd.spawn()
    await child.write(`${b64}\n`)
    const closed = await Promise.race([closePromise, timeout.promise])
    finished = true
    return {
      code: closed.code ?? 0,
      stdout: stdoutChunks.join('\n'),
      stderr: stderrChunks.join('\n'),
    }
  } catch (e) {
    throw toExecError(codecName, fullCommand, e)
  } finally {
    timeout.clear()
    if (!finished) await child?.kill().catch(() => undefined)
  }
}

async function execCodec(
  codec: CustomCodec,
  mode: CodecMode,
  b64: string,
  kind: 'decode' | 'encode' | 'test',
): Promise<string> {
  if (kind === 'decode' && !b64) return ''
  const fullCommand = buildCodecCommand(codec, mode, b64)
  const result = needsStdinInput(b64)
    ? await execShellWithStdin(fullCommand, b64, codec.name)
    : await execShell(fullCommand, codec.name)
  const out = kind === 'encode' ? result.stdout.trim() : result.stdout.trimEnd()
  if (result.code !== 0) {
    throw new Error(formatExecError(codec.name, result, fullCommand))
  }
  if (kind !== 'test' && !out) {
    const msg =
      mode === 'decode'
        ? t('customCodec.decodeEmpty', { name: codec.name })
        : t('customCodec.encodeEmpty', { name: codec.name })
    throw new Error(withExecCommand(codec.name, fullCommand, msg))
  }
  if (kind === 'encode' && out && !isValidBase64(out)) {
    throw new Error(
      withExecCommand(
        codec.name,
        fullCommand,
        t('customCodec.encodeNotBase64', { name: codec.name }),
      ),
    )
  }
  return out
}

/** wire base64 → 展示文本；meFormatViewValueAsync 调用 */
export async function runDecode(wireBase64: string, codec: CustomCodec): Promise<string> {
  return execCodec(codec, 'decode', wireBase64, 'decode')
}

/** 编辑区文本 → wire base64；meViewToWireAsync 调用 */
export async function runEncode(editorText: string, codec: CustomCodec): Promise<string> {
  return execCodec(codec, 'encode', textUtf8ToBase64(editorText), 'encode')
}

/** 弹窗内测试 decode / encode；CustomCodec.vue */
export async function testCodec(
  codec: CustomCodec,
  mode: CodecMode,
  sampleBase64: string,
): Promise<string> {
  return execCodec(codec, mode, sampleBase64, 'test')
}

// #endregion

// #region 视图格式与 wire 转换

/** 键重命名等基础字节视图；KeyRename、FieldAdd */
export const BYTES_FORMAT = ['UTF8', 'Hex', 'Binary', 'Base64'] as const

/** 前端值/键展示格式；IPC wire 恒 base64，本类型仅控展示（auto：STRING 键级 / 字段弹窗） */
export type ViewBytesFormat =
  | 'auto'
  | 'utf8'
  | 'hex'
  | 'binary'
  | 'base64'
  | 'msgpack'
  | 'strjson'
  | 'javaserial'
  | 'pickle'
  | 'phpserial'
  | `custom:${string}`

export const CUSTOM_FORMAT_PREFIX = 'custom:' as const

/** 适用类型（STRING/Hash/List/Set/ZSet）IPC 固定 wire 格式 */
export const IPC_WIRE_FORMAT: BytesFormat = 'base64'

export function isCustomView(view: ViewBytesFormat): view is `custom:${string}` {
  return view.startsWith(CUSTOM_FORMAT_PREFIX)
}

/** custom 下拉项 value：`custom:${name}`；RedisValue 下拉 */
export function customFormatValue(name: string): ViewBytesFormat {
  return `${CUSTOM_FORMAT_PREFIX}${name}`
}

/** 从 custom view 解析名称；RedisValue、FieldSet */
export function customFormatName(view: ViewBytesFormat): string | null {
  return isCustomView(view) ? view.slice(CUSTOM_FORMAT_PREFIX.length) : null
}

/** 仅 STRING 键级可选（Auto、StrJson、JdkSerial、Pickle、PhpSerial、MsgPack、custom）；非 STRING 键级降为 utf8 */
export function isStringOnlyView(view: ViewBytesFormat): boolean {
  return (
    view === 'auto' ||
    view === 'msgpack' ||
    view === 'strjson' ||
    view === 'javaserial' ||
    view === 'pickle' ||
    view === 'phpserial' ||
    isCustomView(view)
  )
}

/** 内置只读视图（不可写回）；RedisValue / FieldSet canSave */
export function isReadonlyView(view: ViewBytesFormat): boolean {
  return view === 'javaserial' || view === 'pickle' || view === 'phpserial'
}

/** 只读视图的保存按钮 tooltip 文案；RedisValue / FieldSet saveTip */
export function readonlyViewTip(view: ViewBytesFormat): string {
  if (view === 'pickle') return t('util.pickleReadonly')
  if (view === 'phpserial') return t('util.phpSerialReadonly')
  return t('util.javaSerialReadonly')
}

function resolveCustomCodec(view: ViewBytesFormat): CustomCodec {
  const name = customFormatName(view)
  if (!name) throw new Error(t('customCodec.notFound', { name: view }))
  const codec = findCustomCodec(name)
  if (!codec) throw new Error(t('customCodec.notFound', { name }))
  return codec
}

/** 下拉内置项固定顺序（Auto 单独置顶、custom 分组殿后；JdkSerial 值仍为 javaserial）；RedisValue、fieldViewOptions */
export const VIEW_FORMAT_OPTIONS: ReadonlyArray<{ label: string; value: ViewBytesFormat }> = [
  { label: 'UTF8', value: 'utf8' },
  { label: 'StrJson', value: 'strjson' },
  { label: 'JdkSerial', value: 'javaserial' },
  { label: 'Pickle', value: 'pickle' },
  { label: 'PhpSerial', value: 'phpserial' },
  { label: 'MsgPack', value: 'msgpack' },
  { label: 'Hex', value: 'hex' },
  { label: 'Binary', value: 'binary' },
  { label: 'Base64', value: 'base64' },
]

/** 解码失败标题：下拉 label + Decode Error（isViewDecodeError 依赖该格式） */
export function decodeErrTitle(label: string): string {
  return `${label} Decode Error`
}

/** 解码失败展示：标题 + 可选 Reason + Base64/Script（编辑区只读提示，不可保存） */
function formatViewDecodeError(
  title: string,
  payload: string,
  detail?: string,
  payloadLabel: 'Base64' | 'Script' = 'Base64',
): string {
  const lines = [title]
  if (detail) lines.push(`Reason: ${detail}`)
  lines.push(`${payloadLabel}: ${payload}`)
  return lines.join('\n')
}

/** 内置或自定义解码失败文案；RedisValue、FieldSet 保存校验 */
export function isViewDecodeError(text: string): boolean {
  return /^[^\n]+ Decode Error\n/.test(text) && (/\nBase64: /.test(text) || /\nScript: /.test(text))
}

/**
 * 非 STRING 键级：string-only view 降为 utf8 展示（不改 wire）；auto 也降 utf8
 */
export function toWireFormat(_view?: ViewBytesFormat): BytesFormat {
  return IPC_WIRE_FORMAT
}

/** 非 STRING 键级：string-only view 降为 utf8 展示（不改 wire）；auto 也降 utf8 */
export function viewFmtForField(view: ViewBytesFormat): ViewBytesFormat {
  if (view === 'auto') return 'utf8'
  return isStringOnlyView(view) ? 'utf8' : view
}

export type FieldViewOption = { label: string; value: ViewBytesFormat }

/** 字段编辑下拉选项（与 STRING 键级一致：Auto 置顶）；FieldSet */
export function fieldViewOptions(customNames: string[] = []): FieldViewOption[] {
  const opts: FieldViewOption[] = [
    { label: 'Auto', value: 'auto' },
    ...VIEW_FORMAT_OPTIONS.map(({ label, value }) => ({ label, value })),
  ]
  for (const name of customNames) {
    opts.push({ label: name, value: customFormatValue(name) })
  }
  return opts
}

/** 保存前需 JSON compact；仅 MsgPack（编辑区可 JSON5）。StrJson 写回已用 JSON.parse，不再走 JSON5 */
export function needsJsonNormalize(view: ViewBytesFormat): boolean {
  return view === 'msgpack'
}

/** UTF-8 文本 → base64 wire */
export function utf8TextToBase64(text: string): string {
  if (!text) return ''
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

/** base64 wire → UTF-8 展示；非法 UTF-8 时 lossy（对齐旧 from_utf8_lossy） */
export function base64WireToUtf8Display(base64: string): string {
  if (!base64) return ''
  const strict = base64ToUtf8Text(base64)
  if (strict !== null) return strict
  const binary = tryAtob(base64)
  if (binary === null) return formatViewDecodeError(decodeErrTitle('Bytes'), base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/** base64 wire → 编辑器/表格展示（同步）；解码失败返回错误文案，避免渲染抛错打挂 Vue */
export function meFormatViewValue(wire: string, view: ViewBytesFormat): string {
  if (!wire) return ''
  if (view === 'base64') return wire
  if (view === 'utf8') return base64WireToUtf8Display(wire)
  try {
    if (view === 'hex' || view === 'binary') return meFormatBytes(wire, view)
    if (view === 'msgpack') return meMsgpackBase64ToJson(wire)
    if (view === 'strjson') return meStrJsonWireToDisplay(wire)
    if (view === 'javaserial') return meJavaSerialBase64ToDisplay(wire)
    if (view === 'pickle') return mePickleBase64ToDisplay(wire)
    if (view === 'phpserial') return mePhpSerialBase64ToDisplay(wire)
    if (isCustomView(view)) {
      throw new Error('custom view requires meFormatViewValueAsync')
    }
    return wire
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return formatViewDecodeError(decodeErrTitle('Bytes'), wire, detail)
  }
}

/** base64 wire → 展示（含 custom）；RedisValue、FieldSet */
export async function meFormatViewValueAsync(wire: string, view: ViewBytesFormat): Promise<string> {
  if (!wire) return ''
  if (isCustomView(view)) {
    return runDecode(wire, resolveCustomCodec(view))
  }
  return meFormatViewValue(wire, view)
}

/** 编辑区 → base64 wire（同步）；RedisValue、FieldSet、FieldAdd */
export function meViewToWire(text: string, view: ViewBytesFormat): string {
  if (view === 'base64') return text
  if (view === 'utf8') return utf8TextToBase64(text)
  if (!text) {
    if (view === 'hex' || view === 'binary' || view === 'msgpack' || view === 'strjson') return ''
  }
  if (view === 'hex' || view === 'binary') return meToBase64(text, view)
  if (view === 'msgpack') return meJsonToMsgpackBase64(text)
  if (view === 'strjson') return utf8TextToBase64(meDisplayToStrJsonWire(text))
  if (view === 'javaserial') return meDisplayToJavaSerialBase64(text)
  if (view === 'pickle') return meDisplayToPickleBase64(text)
  if (view === 'phpserial') return meDisplayToPhpSerialBase64(text)
  if (isCustomView(view)) {
    throw new Error('custom view requires meViewToWireAsync')
  }
  return text
}

/** 编辑区 → base64 wire（含 custom）；RedisValue 保存、FieldSet */
export async function meViewToWireAsync(text: string, view: ViewBytesFormat): Promise<string> {
  if (isCustomView(view)) {
    if (!text) return ''
    return runEncode(text, resolveCustomCodec(view))
  }
  return meViewToWire(text, view)
}

/** base64 wire → hex/base64 展示；KeyRename、meFormatViewValue */
export function meFormatBytes(base64: string, bytesFormat: string): string {
  if (bytesFormat === 'base64') return base64
  if (bytesFormat === 'hex') return base64ToHex(base64)
  if (bytesFormat === 'binary') return base64ToBinary(base64)
  return 'Unknown bytesFormat: ' + bytesFormat
}

/** hex/base64 输入 → base64 wire；KeyRename、meViewToWire */
export function meToBase64(bytes: string, encoding: string): string {
  if (encoding === 'base64') return bytes
  if (encoding === 'hex') return hexToBase64(bytes)
  if (encoding === 'binary') return binaryToBase64(bytes)
  return 'Unknown encoding: ' + encoding
}

/** atob 失败时返回 null（非法字符/填充），供展示层降级，禁止在渲染路径抛错 */
function tryAtob(base64: string): string | null {
  if (!base64) return ''
  try {
    // 去空白并补齐 padding，兼容偶发未填充的 wire
    const compact = base64.replace(/\s+/g, '')
    const pad = compact.length % 4
    const padded = pad === 0 ? compact : pad === 1 ? compact : compact + '='.repeat(4 - pad)
    return atob(padded)
  } catch {
    return null
  }
}

function base64ToHex(base64: string): string {
  if (!base64) return ''
  const binary = tryAtob(base64)
  if (binary === null) return formatViewDecodeError(decodeErrTitle('Bytes'), base64)
  return Array.from(binary)
    .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
}

function base64ToBinary(base64: string): string {
  if (!base64) return ''
  const binary = tryAtob(base64)
  if (binary === null) return formatViewDecodeError(decodeErrTitle('Bytes'), base64)
  return Array.from(binary)
    .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('')
}

function hexToBase64(hex: string): string {
  if (!hex) return ''
  if (hex.length % 2 !== 0) {
    throw new Error(t('util.invalidHexString'))
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(t('util.invalidHexCharacter'))
  }
  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error(t('util.invalidHexCharacter'))
    }
    bytes.push(byte)
  }
  const binary = bytes.map(b => String.fromCharCode(b)).join('')
  return btoa(binary)
}

function binaryToBase64(binary: string): string {
  if (!binary) return ''
  if (binary.length % 8 !== 0) {
    throw new Error(t('util.invalidBinaryString'))
  }
  if (!/^[01]+$/.test(binary)) {
    throw new Error(t('util.invalidBinaryCharacter'))
  }
  const bytes: number[] = []
  for (let i = 0; i < binary.length; i += 8) {
    const byte = Number.parseInt(binary.slice(i, i + 8), 2)
    if (Number.isNaN(byte)) {
      throw new Error(t('util.invalidBinaryCharacter'))
    }
    bytes.push(byte)
  }
  const binaryStr = bytes.map(b => String.fromCharCode(b)).join('')
  return btoa(binaryStr)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = tryAtob(base64)
  if (binary === null) throw new Error('invalid base64')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export function meMsgpackBase64ToJson(base64: string): string {
  if (!base64) return ''
  try {
    const decoded = decode(base64ToUint8Array(base64))
    return JSON.stringify(decoded, null, 2)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return formatViewDecodeError(decodeErrTitle('MsgPack'), base64, detail)
  }
}

export function meJsonToMsgpackBase64(json: string): string {
  const v = JSON5.parse(json.trim())
  return uint8ArrayToBase64(encode(v))
}

function unwrapStrJsonValue(wire: string): unknown {
  // 与 Auto 一致：只用 JSON.parse（~1.5MB 约 4ms；JSON5.parse 约 260ms）
  const parsed = JSON.parse(wire.trim())
  if (typeof parsed !== 'string') {
    throw new Error('StrJson wire is not a JSON string wrapper')
  }
  return JSON.parse(parsed.trim())
}

/** base64 wire → StrJson 展示（先解 UTF-8 再拆双层 JSON） */
export function meStrJsonWireToDisplay(base64: string): string {
  if (!base64) return ''
  const utf8 = base64ToUtf8Text(base64)
  if (utf8 === null)
    return formatViewDecodeError(decodeErrTitle('StrJson'), base64, 'invalid UTF-8')
  try {
    const value = unwrapStrJsonValue(utf8)
    return JSON.stringify(value, null, 2)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return formatViewDecodeError(decodeErrTitle('StrJson'), base64, detail)
  }
}

/** 编辑区 JSON → 双层 JSON 字符串（UTF-8 文本，再由 meViewToWire 转 base64） */
export function meDisplayToStrJsonWire(text: string): string {
  const value = JSON.parse(text.trim())
  return JSON.stringify(JSON.stringify(value))
}

export function meJavaSerialBase64ToDisplay(base64: string): string {
  if (!base64) return ''
  try {
    return formatJavaSerDisplay(javaSerBase64ToValue(base64))
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return formatViewDecodeError(decodeErrTitle('JdkSerial'), base64, detail)
  }
}

/** JdkSerial 只读（与 RedisInsight / AnotherRDM 一致），不支持写回 */
export function meDisplayToJavaSerialBase64(_text: string): string {
  throw new Error(t('util.javaSerialReadonly'))
}

export function mePickleBase64ToDisplay(base64: string): string {
  if (!base64) return ''
  try {
    return formatPickleDisplay(pickleBase64ToValue(base64))
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return formatViewDecodeError(decodeErrTitle('Pickle'), base64, detail)
  }
}

/** Pickle 只读（与 JdkSerial 一致），不支持写回 */
export function meDisplayToPickleBase64(_text: string): string {
  throw new Error(t('util.pickleReadonly'))
}

export function mePhpSerialBase64ToDisplay(base64: string): string {
  if (!base64) return ''
  try {
    return formatPhpSerialDisplay(phpSerialBase64ToValue(base64))
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return formatViewDecodeError(decodeErrTitle('PhpSerial'), base64, detail)
  }
}

/** PhpSerial 只读（与 JdkSerial / Pickle 一致），不支持写回 */
export function meDisplayToPhpSerialBase64(_text: string): string {
  throw new Error(t('util.phpSerialReadonly'))
}

// #endregion
