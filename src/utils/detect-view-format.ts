/**
 * STRING 值 Auto 编码识别：基于 base64 wire 原始字节。
 * Auto 入口（detectViewFormatAuto）先认 Gzip 魔数 1f 8b 并解一层（失败当无壳；只剥一层），
 * 再对内层走：JdkSerial(ACED) → Pickle(PROTO 0x80) → PhpSerial(a:/O:/C:) → MsgPack → StrJson → UTF-8 → Hex。
 * JdkSerial/Pickle/PhpSerial：特征前缀 + 全量试解，失败则继续下一种（展示层再解析一遍）。
 * 各格式均全量试解：wire 已在内存，不再按体积跳过。
 * StrJson：仅原生 JSON.parse（双层字符串包装）。JSON5.parse 对 ~1.5MB 约 260ms，
 * 原生约 4ms，故不用 JSON5。
 */
import { decode } from '@msgpack/msgpack'
import { gunzipSync } from 'fflate'

import { javaSerBase64ToValue } from '@/utils/javaserial'
import { phpSerialBase64ToValue } from '@/utils/phpserial'
import { pickleBase64ToValue } from '@/utils/pickle'

/** Auto 识别结果（不含 auto / binary / base64 / custom） */
export type DetectedViewFormat =
  | 'javaserial'
  | 'pickle'
  | 'phpserial'
  | 'msgpack'
  | 'strjson'
  | 'utf8'
  | 'hex'

const JAVA_STREAM_MAGIC_0 = 0xac
const JAVA_STREAM_MAGIC_1 = 0xed
/** Pickle PROTO opcode；下一字节为协议号（常见 0–5） */
const PICKLE_PROTO = 0x80
const PICKLE_PROTO_MAX = 5
/** java 序列化流：magic(2) + version(2)，至少 4 字节 */
const JAVA_STREAM_MIN_LEN = 4

const DETECTED_LABELS: Record<DetectedViewFormat, string> = {
  javaserial: 'JdkSerial',
  pickle: 'Pickle',
  phpserial: 'PhpSerial',
  msgpack: 'MsgPack',
  strjson: 'StrJson',
  utf8: 'UTF8',
  hex: 'Hex',
}

export function detectedViewLabel(view: DetectedViewFormat, gzip = false): string {
  const label = DETECTED_LABELS[view]
  return gzip ? `Gzip · ${label}` : label
}

function base64ToBytes(base64: string): Uint8Array | null {
  if (!base64) return new Uint8Array()
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

const GZIP_ID1 = 0x1f
const GZIP_ID2 = 0x8b
/** gzip 头至少 10 字节；再短不当壳 */
const GZIP_HEADER_MIN = 10

/**
 * 认 Gzip 魔数并解一层。解压失败 / 非 Gzip → 原样返回。
 * 只剥一层：内层仍是 Gzip 时交给后续识别（通常落到 Hex）。
 */
export function peelGzipWire(base64: string): { gzip: boolean; wire: string } {
  if (!base64) return { gzip: false, wire: base64 }
  const bytes = base64ToBytes(base64)
  if (!bytes || bytes.length < GZIP_HEADER_MIN) return { gzip: false, wire: base64 }
  if (bytes[0] !== GZIP_ID1 || bytes[1] !== GZIP_ID2) return { gzip: false, wire: base64 }
  try {
    const inner = gunzipSync(bytes)
    return { gzip: true, wire: bytesToBase64(inner) }
  } catch {
    return { gzip: false, wire: base64 }
  }
}

/** Auto 识别结果：内层格式 + 是否剥过 Gzip + 展示用 wire（剥壳后或原值） */
export type DetectedViewAuto = { view: DetectedViewFormat; gzip: boolean; wire: string }

export type DetectViewFormatOptions = {
  /** GETRANGE 预览：允许去掉不完整 UTF-8 尾部后再判，避免误判 Hex */
  truncated?: boolean
}

/**
 * Auto 入口：可选剥一层 Gzip，再对内层 detectViewFormat。
 * GETRANGE 截断几乎解不开完整 gzip，跳过剥壳。
 */
export function detectViewFormatAuto(
  base64: string,
  opts?: DetectViewFormatOptions,
): DetectedViewAuto {
  if (opts?.truncated) {
    return { view: detectViewFormat(base64, opts), gzip: false, wire: base64 }
  }
  const peeled = peelGzipWire(base64)
  return { view: detectViewFormat(peeled.wire, opts), gzip: peeled.gzip, wire: peeled.wire }
}

function bytesToUtf8Text(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** base64 wire → UTF-8 文本；无效序列返回 null */
export function base64ToUtf8Text(base64: string): string | null {
  const bytes = base64ToBytes(base64)
  if (!bytes) return null
  return bytesToUtf8Text(bytes)
}

/** UTF-8 首字节期望的序列长度；非法首字节返回 0 */
function utf8ExpectedLen(lead: number): number {
  if (lead < 0x80) return 1
  if ((lead & 0xe0) === 0xc0) return 2
  if ((lead & 0xf0) === 0xe0) return 3
  if ((lead & 0xf8) === 0xf0) return 4
  return 0
}

/**
 * 去掉末尾不完整的 UTF-8 序列（最多 3 字节），仅供 Auto 判断。
 * GETRANGE 预览按字节截断时，汉字/emoji 常被切在中间；展示层仍 lossy 解码，不在此裁掉。
 */
function trimIncompleteUtf8Tail(bytes: Uint8Array): Uint8Array {
  const n = bytes.length
  if (n === 0) return bytes
  let i = n - 1
  let cont = 0
  while (i >= 0 && (bytes[i]! & 0xc0) === 0x80) {
    cont++
    if (cont > 3) return bytes
    i--
  }
  if (i < 0) return bytes
  const expected = utf8ExpectedLen(bytes[i]!)
  const actual = n - i
  if (expected > 0 && actual < expected) return bytes.subarray(0, i)
  return bytes
}

function isDisplayableUtf8(text: string): boolean {
  if (!text) return true
  let control = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    // 允许常见空白；其余 C0/C1 控制符计为不可展示
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue
    if (c < 0x20 || (c >= 0x7f && c < 0xa0)) control++
  }
  // 控制符过多则倾向 Hex
  return control / text.length < 0.1
}

/** 魔数 + 全量试解；失败不认（避免截断/坏数据锁死 Decode Error） */
function looksLikeJavaSerial(base64: string, bytes: Uint8Array): boolean {
  if (bytes.length < JAVA_STREAM_MIN_LEN) return false
  if (bytes[0] !== JAVA_STREAM_MAGIC_0 || bytes[1] !== JAVA_STREAM_MAGIC_1) return false
  try {
    javaSerBase64ToValue(base64)
    return true
  } catch {
    return false
  }
}

/**
 * 魔数（PROTO + 协议号）+ 全量试解。
 * 单字节 0x80（MsgPack 空 map）长度不足，不会误判为 Pickle。
 */
function looksLikePickle(base64: string, bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false
  if (bytes[0] !== PICKLE_PROTO || bytes[1]! > PICKLE_PROTO_MAX) return false
  try {
    pickleBase64ToValue(base64)
    return true
  } catch {
    return false
  }
}

/**
 * 复合根（a:/O:/C:）+ 全量试解；标量根（s:/i: 等）与常见文本易撞，不参与 Auto。
 */
function looksLikePhpSerial(base64: string, bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false
  const c0 = bytes[0]
  if (c0 !== 0x61 /* a */ && c0 !== 0x4f /* O */ && c0 !== 0x43 /* C */) return false
  if (bytes[1] !== 0x3a /* : */) return false
  try {
    phpSerialBase64ToValue(base64)
    return true
  } catch {
    return false
  }
}

/** 保守：仅根为 object/array 才认 MsgPack，避免短文本误判 */
function looksLikeMsgpack(bytes: Uint8Array): boolean {
  try {
    const decoded = decode(bytes)
    if (decoded === null || typeof decoded !== 'object') return false
    return true
  } catch {
    return false
  }
}

/** 双层 JSON 字符串：wire parse → string → 再 parse 为 object/array。只用 JSON.parse（~1.5MB 约 4ms；JSON5 约 260ms） */
function looksLikeStrJson(utf8: string): boolean {
  const trimmed = utf8.trim()
  if (trimmed.length < 2 || trimmed[0] !== '"') return false
  try {
    const outer = JSON.parse(trimmed)
    if (typeof outer !== 'string') return false
    const inner = JSON.parse(outer.trim())
    return inner !== null && typeof inner === 'object'
  } catch {
    return false
  }
}

/**
 * 从 base64 wire 识别展示格式。
 * 空值 → utf8。
 */
export function detectViewFormat(
  base64: string,
  opts?: DetectViewFormatOptions,
): DetectedViewFormat {
  if (!base64) return 'utf8'

  const bytes = base64ToBytes(base64)
  if (!bytes) return 'hex'

  if (looksLikeJavaSerial(base64, bytes)) return 'javaserial'
  if (looksLikePickle(base64, bytes)) return 'pickle'
  if (looksLikePhpSerial(base64, bytes)) return 'phpserial'
  if (looksLikeMsgpack(bytes)) return 'msgpack'

  let utf8 = bytesToUtf8Text(bytes)
  // 预览截断可能切在多字节字符中间，严格解码会失败并落到 Hex
  if (utf8 === null && opts?.truncated) {
    const trimmed = trimIncompleteUtf8Tail(bytes)
    if (trimmed.length < bytes.length) utf8 = bytesToUtf8Text(trimmed)
  }
  if (utf8 !== null) {
    if (looksLikeStrJson(utf8)) return 'strjson'
    if (isDisplayableUtf8(utf8)) return 'utf8'
  }

  return 'hex'
}
