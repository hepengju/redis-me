/**
 * PhpSerial：前端只读解析（php-serialize 库，与 Another Redis Desktop Manager 同源）；
 * 写回请用自定义编解码 + 本机 PHP。
 * unserialize 必须直传 wire 字节 Buffer 并以 encoding: 'utf8' 解析：库内偏移均为字节级，
 * s: 长度按字节计数，中文等多字节串不截断；传 JS 字符串会经 Buffer.from 按 utf8 重编码，
 * 高位字节（≥0x80）会被改写导致错乱。字符串按 UTF-8 解码，非法序列 lossy（展示层可接受）。
 * 展示约定对齐 Pickle：PHP 对象 → { $class, ...属性 }；顶层 string 直接展示。
 */

import { Buffer } from 'buffer'

import { unserialize } from 'php-serialize'

/** php-serialize 对未知类的占位实例：类名挂在 __PHP_Incomplete_Class_Name */
const INCOMPLETE_CLASS_KEY = '__PHP_Incomplete_Class_Name'

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 递归规范化便于 JSON 展示：
 * - __PHP_Incomplete_Class（O:/C: 未知类）→ { $class, ...属性 }
 * - bigint / NAN / INF 保留原值，由 formatPhpSerialDisplay 兜底为文本
 */
function normalizePhpValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(normalizePhpValue)

  const obj = value as Record<string, unknown>
  const className = obj[INCOMPLETE_CLASS_KEY]
  if (typeof className === 'string') {
    const out: Record<string, unknown> = { $class: className }
    for (const [k, v] of Object.entries(obj)) {
      if (k === INCOMPLETE_CLASS_KEY) continue
      out[k] = normalizePhpValue(v)
    }
    return out
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = normalizePhpValue(v)
  }
  return out
}

/** wire base64 → 解析结果（顶层 str 为 string，其它为规范化对象）；非法输入抛错 */
export function phpSerialBase64ToValue(base64: string): unknown {
  const bytes = base64ToBytes(base64)
  return normalizePhpValue(unserialize(Buffer.from(bytes), {}, { strict: false, encoding: 'utf8' }))
}

export function formatPhpSerialDisplay(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
      return v
    },
    2,
  )
}
