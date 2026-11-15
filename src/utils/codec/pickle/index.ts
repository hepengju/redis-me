/** Pickle：前端只读解析（pickleparser，协议 0–5）；写回请用自定义编解码 + 本机 Python */

import { Parser } from 'pickleparser'

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** pickleparser 对未知类生成的代理：带 __module__ / __name__ */
type PickleProxy = { __module__: string; __name__: string; args?: unknown }

function isPickleProxy(v: object): v is PickleProxy {
  // 普通 dict 若自带 __module__/__name__ 键，不能当成代理
  if (Object.prototype.hasOwnProperty.call(v, '__module__')) return false
  const p = v as Partial<PickleProxy>
  return typeof p.__module__ === 'string' && typeof p.__name__ === 'string'
}

function pickleClassName(proxy: PickleProxy): string {
  const mod = proxy.__module__
  const name = proxy.__name__
  if (!mod || mod === '__main__') return name
  return `${mod}.${name}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad6(n: number): string {
  return String(n).padStart(6, '0')
}

function asByteTuple(v: unknown): number[] | null {
  if (v instanceof Uint8Array) return Array.from(v)
  if (Array.isArray(v) && v.every(x => typeof x === 'number')) return v as number[]
  return null
}

/** CPython pickle：date 4 字节 = year_hi,year_lo,month,day */
function formatDateBytes(b: number[]): string | null {
  if (b.length < 4) return null
  const year = (b[0]! << 8) | b[1]!
  const month = b[2]!
  const day = b[3]!
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** time 6 字节 = hour,minute,second,micro_hi,micro_mid,micro_lo */
function formatTimeBytes(b: number[]): string | null {
  if (b.length < 6) return null
  const hour = b[0]!
  const minute = b[1]!
  const second = b[2]!
  const micro = (b[3]! << 16) | (b[4]! << 8) | b[5]!
  const base = `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`
  return micro ? `${base}.${pad6(micro)}` : base
}

/** datetime 10 字节 = date(4) + time(6) */
function formatDateTimeBytes(b: number[]): string | null {
  if (b.length < 10) return null
  const d = formatDateBytes(b.slice(0, 4))
  const t = formatTimeBytes(b.slice(4, 10))
  if (!d || !t) return null
  return `${d}T${t}`
}

/**
 * 常见标准库类型友好展示（否则仍走 $class / $type+args）。
 * date/time/datetime 的二进制参数来自 CPython pickle 协议。
 */
function formatKnownProxy(
  proxy: PickleProxy,
  seen: WeakSet<object>,
): Record<string, unknown> | null {
  const className = pickleClassName(proxy)
  const args = Array.isArray(proxy.args) ? proxy.args : null
  if (!args) return null

  if (className === 'datetime.date' && args.length >= 1) {
    const b = asByteTuple(args[0])
    const value = b ? formatDateBytes(b) : null
    if (value) return { $type: className, value }
  }

  if (className === 'datetime.time' && args.length >= 1) {
    const b = asByteTuple(args[0])
    const value = b ? formatTimeBytes(b) : null
    if (value) return { $type: className, value }
  }

  if (className === 'datetime.datetime' && args.length >= 1) {
    const b = asByteTuple(args[0])
    const value = b ? formatDateTimeBytes(b) : null
    if (value) {
      const out: Record<string, unknown> = { $type: className, value }
      // 带 tzinfo 时第 2 参仍规范化挂上，便于辨认 aware
      if (args.length >= 2) out.tzinfo = normalizePickleObject(args[1], seen)
      return out
    }
  }

  if (className === 'datetime.timedelta' && args.length >= 3) {
    const days = args[0]
    const seconds = args[1]
    const microseconds = args[2]
    if (
      typeof days === 'number' &&
      typeof seconds === 'number' &&
      typeof microseconds === 'number'
    ) {
      return { $type: className, value: { days, seconds, microseconds } }
    }
  }

  if ((className === 'builtins.bytearray' || className === 'bytearray') && args.length >= 1) {
    const b = asByteTuple(args[0])
    if (b) return { $type: 'bytearray', value: b }
  }

  if ((className === 'builtins.complex' || className === 'complex') && args.length >= 2) {
    const real = args[0]
    const imag = args[1]
    if (typeof real === 'number' && typeof imag === 'number') {
      return { $type: 'complex', value: { real, imag } }
    }
  }

  if ((className === 'decimal.Decimal' || className === 'Decimal') && typeof args[0] === 'string') {
    return { $type: 'decimal.Decimal', value: args[0] }
  }

  return null
}

/**
 * 递归规范化便于 JSON 展示：
 * - Uint8Array → `{ $type: 'bytes', value: [97, 98, ...] }`
 * - datetime.date/time/datetime → `{ $type, value: ISO }`
 * - Set / Map → 数组 / 对象
 * - pickle 代理对象 → `{ $class, ...attrs }` 或 `{ $type, args }`
 * - 循环引用 → `{ $ref: 'circular' }`
 */
export function normalizePickleObject(
  decoded: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (decoded == null || typeof decoded !== 'object') return decoded
  if (seen.has(decoded)) return { $ref: 'circular' }
  seen.add(decoded)

  if (decoded instanceof Uint8Array) {
    return { $type: 'bytes', value: Array.from(decoded) }
  }
  if (decoded instanceof Set) {
    return Array.from(decoded, v => normalizePickleObject(v, seen))
  }
  if (decoded instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of decoded) {
      out[String(k)] = normalizePickleObject(v, seen)
    }
    return out
  }
  if (Array.isArray(decoded)) {
    return decoded.map(v => normalizePickleObject(v, seen))
  }

  if (isPickleProxy(decoded)) {
    const known = formatKnownProxy(decoded, seen)
    if (known) return known

    const className = pickleClassName(decoded)
    const ownKeys = Object.keys(decoded).filter(k => k !== 'args')
    if (ownKeys.length > 0) {
      const out: Record<string, unknown> = { $class: className }
      for (const k of ownKeys) {
        out[k] = normalizePickleObject((decoded as Record<string, unknown>)[k], seen)
      }
      return out
    }
    const args = decoded.args
    if (Array.isArray(args) && args.length > 0) {
      return { $type: className, args: args.map(v => normalizePickleObject(v, seen)) }
    }
    return { $class: className }
  }

  const obj = decoded as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = normalizePickleObject(v, seen)
  }
  return out
}

/** wire base64 → 解析结果（顶层 str 为 string，其它为规范化对象） */
export function pickleBase64ToValue(base64: string): unknown {
  const parser = new Parser()
  return normalizePickleObject(parser.parse(base64ToUint8Array(base64)))
}

export function formatPickleDisplay(value: unknown): string {
  if (typeof value === 'string') return value
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
