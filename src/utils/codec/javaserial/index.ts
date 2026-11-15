/** JavaSerial：与 RedisInsight 同款只读解析；增强 java.time / 集合 / record 展示 */

import { ObjectInputStream, type JavaSerializable } from 'java-object-serialization'

import { registerJavaCollections } from './collections'
import { formatBigDecimal, formatBigInteger, registerJavaMisc } from './misc'
import { JAVA_TIME_SER_CLASS, JAVA_TIME_SER_UID, JavaTimeSer } from './time'

/** 对齐 RedisInsight `java-date.ts`：解析 `java.util.Date` 的 writeObject 时间戳 */
class JavaDate implements JavaSerializable {
  static readonly ClassName = 'java.util.Date'
  static readonly SerialVersionUID = '7523967970034938905'

  private readonly JAVA_MAX_LONG = 9223372036854775807n
  private readonly TWO_COMPLEMENT_MAX_LONG = 18446744073709551616n

  time: bigint = 0n

  readObject(stream: ObjectInputStream): void {
    // sql.Date / Timestamp 子类实例也会走这里写 time
    stream.defaultReadObject()
    this.time = stream.readLong()
  }

  readResolve(): Date {
    const signed =
      this.time > this.JAVA_MAX_LONG ? this.time - this.TWO_COMPLEMENT_MAX_LONG : this.time
    const timeValue = Number(signed)
    const date = new Date(timeValue)
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date value: ${timeValue} (original: ${this.time})`)
    }
    return date
  }
}

ObjectInputStream.RegisterObjectClass(JavaDate, JavaDate.ClassName, JavaDate.SerialVersionUID)
ObjectInputStream.RegisterObjectClass(JavaTimeSer, JAVA_TIME_SER_CLASS, JAVA_TIME_SER_UID)
registerJavaCollections(ObjectInputStream.RegisterObjectClass)
registerJavaMisc(ObjectInputStream.RegisterObjectClass)

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const BOXED = new Map<string, string>([
  ['java.lang.Integer', 'value'],
  ['java.lang.Long', 'value'],
  ['java.lang.Boolean', 'value'],
  ['java.lang.Double', 'value'],
  ['java.lang.Float', 'value'],
  ['java.lang.Short', 'value'],
  ['java.lang.Byte', 'value'],
  ['java.lang.Character', 'value'],
])

type JavaObjectLike = {
  fields?: Map<string, unknown>
  annotations?: unknown[]
  className?: string
  serialVersionUid?: bigint | string
  enumConstantName?: string
  classDesc?: { className?: string }
}

function isJavaObjectLike(v: unknown): v is JavaObjectLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    ((v as JavaObjectLike).fields instanceof Map ||
      typeof (v as JavaObjectLike).enumConstantName === 'string')
  )
}

function asBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v)
  return null
}

function formatUuid(mostSigBits: unknown, leastSigBits: unknown): string | null {
  const m = asBigInt(mostSigBits)
  const l = asBigInt(leastSigBits)
  if (m == null || l == null) return null
  const hex =
    BigInt.asUintN(64, m).toString(16).padStart(16, '0') +
    BigInt.asUintN(64, l).toString(16).padStart(16, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * 递归规范化：
 * - 能当 JSON 标量、且类型几乎不言自明 → 拆箱直接显示（BOXED：Double/Integer 等）
 * - 必须格式化才好看，且格式化后会和 String/Number 撞车 → `{ $type, value }`（BigDecimal / UUID / java.time）
 * - record / POJO：压成 `{ $class, ...fields }`（避免 Map 被 JSON.stringify 成 {}）
 * - enum → `{ $enum, value }`
 * - 循环引用（TC_REFERENCE 共享）→ `{ $ref: 'circular' }`，避免栈溢出
 */
export function normalizeJavaObject(
  decoded: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (decoded == null || typeof decoded !== 'object') return decoded
  if (decoded instanceof Date) return decoded
  if (seen.has(decoded)) return { $ref: 'circular' }
  seen.add(decoded)

  if (Array.isArray(decoded)) return decoded.map(v => normalizeJavaObject(v, seen))

  if (typeof (decoded as JavaObjectLike).enumConstantName === 'string') {
    const e = decoded as JavaObjectLike
    return { $enum: e.classDesc?.className ?? e.className ?? 'enum', value: e.enumConstantName }
  }

  if (isJavaObjectLike(decoded) && decoded.fields instanceof Map) {
    const fields: Record<string, unknown> = {}
    for (const [k, v] of decoded.fields) {
      fields[k] = normalizeJavaObject(v, seen)
    }

    const boxField = decoded.className ? BOXED.get(decoded.className) : undefined
    if (boxField != null && boxField in fields) {
      const v = fields[boxField]
      return typeof v === 'bigint' ? v.toString() : v
    }

    if (decoded.className === 'java.util.UUID') {
      const uuid = formatUuid(fields.mostSigBits, fields.leastSigBits)
      if (uuid) return { $type: 'java.util.UUID', value: uuid }
    }
    if (decoded.className === 'java.math.BigInteger') {
      const bi = formatBigInteger(fields.signum, fields.magnitude)
      if (bi != null) return { $type: 'java.math.BigInteger', value: bi }
    }
    if (decoded.className === 'java.math.BigDecimal') {
      const bd = formatBigDecimal(fields.scale, fields.intVal)
      if (bd != null) return { $type: 'java.math.BigDecimal', value: bd }
    }

    const out: Record<string, unknown> = {}
    if (decoded.className) out.$class = decoded.className
    Object.assign(out, fields)
    if (decoded.annotations && decoded.annotations.length > 0) {
      out.$annotations = decoded.annotations.map(v => normalizeJavaObject(v, seen))
    }
    return out
  }

  // 普通对象（如 HashMap readResolve 的 plain object）
  const obj = decoded as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = normalizeJavaObject(v, seen)
  }
  return out
}

/** wire base64 → 解析结果（顶层 String 为 string，其它为对象） */
export function javaSerBase64ToValue(base64: string): unknown {
  const stream = new ObjectInputStream(base64ToUint8Array(base64))
  return normalizeJavaObject(stream.readObject())
}

export function formatJavaSerDisplay(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'bigint') return v.toString()
      // JSON 默认把 NaN/Infinity 变成 null，保留字面量便于对照 Java double
      if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
      return v
    },
    2,
  )
}
