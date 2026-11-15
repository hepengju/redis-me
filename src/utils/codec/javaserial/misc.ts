/**
 * 其它常见 JDK 内置类型展示：
 * BitSet / StringBuilder·Buffer / InetAddress / Calendar / sql.Date·Timestamp /
 * BigInteger·BigDecimal / Locale / SimpleTimeZone
 */

import { ObjectInputStream, type JavaSerializable } from 'java-object-serialization'

const UID = {
  BitSet: '7997698588986878753',
  StringBuilder: '4383685877147921099',
  StringBuffer: '3388685877147921107',
  Calendar: '16639196567887960974',
  GregorianCalendar: '10321643238979588289',
  InetAddress: '3286316764910316507',
  SqlDate: '1511598038487230103',
  Timestamp: '2745179027874758501',
  /** 与流中无符号 BigInt 一致；未注册时库会 console.warn */
  BigInteger: '10159169817773079325',
  BigDecimal: '6108874887143696463',
  Locale: '9149081749638150636',
  SimpleTimeZone: '18043493102494086566',
} as const

const JAVA_MAX_LONG = 9223372036854775807n
const TWO_COMPLEMENT_MAX_LONG = 18446744073709551616n

function toSignedLong(v: bigint): bigint {
  return v > JAVA_MAX_LONG ? v - TWO_COMPLEMENT_MAX_LONG : v
}

function longToNumber(v: bigint): number {
  return Number(toSignedLong(v))
}

function charArrayToString(chars: unknown, count: number): string {
  if (!Array.isArray(chars)) return ''
  const n = Math.min(count, chars.length)
  let s = ''
  for (let i = 0; i < n; i++) {
    const c = chars[i]
    if (typeof c === 'string') s += c
    else if (typeof c === 'number') s += String.fromCharCode(c)
  }
  return s
}

function applyFields(target: object, fields: Map<string, unknown>): void {
  for (const [k, v] of fields) {
    if (k in target) (target as Record<string, unknown>)[k] = v
  }
}

/** BitSet：PutField bits:long[] → 置位下标列表 */
class JavaBitSet implements JavaSerializable {
  bits: unknown = null

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    const words = Array.isArray(this.bits) ? this.bits : []
    const indices: number[] = []
    for (let wi = 0; wi < words.length; wi++) {
      let w = asBigInt(words[wi])
      if (w == null) continue
      w = BigInt.asUintN(64, w)
      for (let b = 0; b < 64; b++) {
        if ((w & (1n << BigInt(b))) !== 0n) indices.push(wi * 64 + b)
      }
    }
    return { $type: 'java.util.BitSet', value: indices }
  }
}

function asBigInt(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v)
  return null
}

/** StringBuilder：count + char[] */
class JavaStringBuilder implements JavaSerializable {
  count = 0
  value: unknown = null

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    this.count = stream.readInt()
    this.value = stream.readObject()
  }

  readResolve(): unknown {
    return { $type: 'java.lang.StringBuilder', value: charArrayToString(this.value, this.count) }
  }
}

/** StringBuffer：PutField value/count/shared */
class JavaStringBuffer implements JavaSerializable {
  count = 0
  value: unknown = null
  shared = false

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    return { $type: 'java.lang.StringBuffer', value: charArrayToString(this.value, this.count) }
  }
}

/** InetAddress（含 Inet4 writeReplace）：hostName + address(int) + family */
class JavaInetAddress implements JavaSerializable {
  hostName: unknown = null
  address = 0
  family = 0

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    const u = this.address >>> 0
    const ip = `${(u >>> 24) & 255}.${(u >>> 16) & 255}.${(u >>> 8) & 255}.${u & 255}`
    const host = typeof this.hostName === 'string' ? this.hostName : null
    return { $type: 'java.net.InetAddress', value: host && host !== ip ? `${host}/${ip}` : ip }
  }
}

/** Calendar.writeObject：default fields + 可选 ZoneInfo；具体类多为 GregorianCalendar */
class JavaCalendar implements JavaSerializable {
  time: bigint | number = 0
  zone: unknown = null
  isTimeSet = false

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    try {
      const z = stream.readObject()
      if (z != null) this.zone = z
    } catch {
      // 旧流可能无 ZoneInfo
    }
  }

  readResolve(): unknown {
    return formatCalendar(this.time, this.zone, 'java.util.Calendar')
  }
}

class JavaGregorianCalendar extends JavaCalendar {
  gregorianCutover: bigint | number = 0

  readResolve(): unknown {
    return formatCalendar(this.time, this.zone, 'java.util.GregorianCalendar')
  }
}

function zoneLabel(zone: unknown): string | undefined {
  if (zone == null || typeof zone !== 'object') return undefined
  const z = zone as { fields?: Map<string, unknown>; ID?: unknown; className?: string }
  if (z.fields instanceof Map) {
    const id = z.fields.get('ID') ?? z.fields.get('id')
    if (typeof id === 'string') return id
  }
  if (typeof z.ID === 'string') return z.ID
  return z.className
}

function formatCalendar(time: bigint | number, zone: unknown, type: string): unknown {
  const ms = typeof time === 'bigint' ? longToNumber(time) : Number(time)
  const out: Record<string, unknown> = { $type: type, value: new Date(ms).toISOString() }
  const zl = zoneLabel(zone)
  if (zl) out.zone = zl
  return out
}

/**
 * java.sql.Date / Timestamp：超类 java.util.Date 的 writeObject（readLong）已由 JavaDate 注册处理；
 * 此处实例承接 time，再格式化展示。
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** sql.Date 按本地日历日展示（对齐 Date.valueOf 的本地午夜语义） */
function formatLocalDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export class JavaSqlDate implements JavaSerializable {
  time: bigint = 0n

  readResolve(): unknown {
    return { $type: 'java.sql.Date', value: formatLocalDate(longToNumber(this.time)) }
  }
}

export class JavaSqlTimestamp implements JavaSerializable {
  time: bigint = 0n
  nanos = 0

  readResolve(): unknown {
    const ms = longToNumber(this.time)
    const iso = new Date(ms).toISOString() // …sssZ
    const nano = typeof this.nanos === 'number' ? this.nanos : 0
    return {
      $type: 'java.sql.Timestamp',
      value: `${iso.slice(0, 19)}.${String(nano).padStart(9, '0')}Z`,
    }
  }
}

/** 流中 int 常以无符号读出（如 -1 → 4294967295） */
function toSignedInt32(n: number): number {
  return n > 0x7fffffff ? n - 0x100000000 : n
}

/** BigInteger：signum + magnitude(big-endian bytes) → 十进制字符串 */
export function formatBigInteger(signum: unknown, magnitude: unknown): string | null {
  if (typeof signum !== 'number' || !Array.isArray(magnitude)) return null
  const sign = toSignedInt32(signum)
  if (sign === 0 || magnitude.length === 0) return '0'
  let abs = 0n
  for (const b of magnitude) {
    if (typeof b !== 'number') return null
    abs = (abs << 8n) | BigInt(b & 0xff)
  }
  return sign < 0 ? `-${abs}` : abs.toString()
}

/** BigDecimal：unscaled / 10^scale */
export function formatBigDecimal(scale: unknown, intVal: unknown): string | null {
  if (typeof scale !== 'number') return null
  let unscaled: string | null = null
  if (typeof intVal === 'string') {
    unscaled = intVal
  } else if (
    intVal &&
    typeof intVal === 'object' &&
    (intVal as { $type?: string }).$type === 'java.math.BigInteger'
  ) {
    const v = (intVal as { value?: unknown }).value
    unscaled = typeof v === 'string' ? v : null
  } else if (intVal && typeof intVal === 'object') {
    const f = intVal as { signum?: unknown; magnitude?: unknown; fields?: Map<string, unknown> }
    if (f.fields instanceof Map) {
      unscaled = formatBigInteger(f.fields.get('signum'), f.fields.get('magnitude'))
    } else {
      unscaled = formatBigInteger(f.signum, f.magnitude)
    }
  }
  if (unscaled == null) return null

  const sc = toSignedInt32(scale)
  const neg = unscaled.startsWith('-')
  const digits = neg ? unscaled.slice(1) : unscaled
  if (sc === 0) return unscaled
  if (sc > 0) {
    if (digits.length <= sc) {
      const frac = digits.padStart(sc, '0')
      return `${neg ? '-' : ''}0.${frac}`
    }
    const i = digits.length - sc
    return `${neg ? '-' : ''}${digits.slice(0, i)}.${digits.slice(i)}`
  }
  // scale < 0：末尾补零
  return `${unscaled}${'0'.repeat(-sc)}`
}

/** BigInteger.writeObject：PutField signum + magnitude */
class JavaBigInteger implements JavaSerializable {
  signum = 0
  magnitude: unknown = null

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    const bi = formatBigInteger(this.signum, this.magnitude)
    if (bi == null) return { $type: 'java.math.BigInteger', value: null }
    return { $type: 'java.math.BigInteger', value: bi }
  }
}

/** BigDecimal.writeObject：PutField scale + intVal(BigInteger) */
class JavaBigDecimal implements JavaSerializable {
  scale = 0
  intVal: unknown = null

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    const bd = formatBigDecimal(this.scale, this.intVal)
    if (bd == null) return { $type: 'java.math.BigDecimal', value: null }
    return { $type: 'java.math.BigDecimal', value: bd }
  }
}

/** 对齐 Locale.toString()：language[_country[_variant]] */
function formatLocaleToString(language: string, country: string, variant: string): string {
  let s = language || ''
  if (country || variant) s += `_${country || ''}`
  if (variant) s += `_${variant}`
  return s
}

/** Locale.writeObject：PutField language/script/country/variant/extensions */
class JavaLocale implements JavaSerializable {
  language = ''
  script = ''
  country = ''
  variant = ''
  extensions = ''
  hashcode = -1

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    const out: Record<string, unknown> = {
      $type: 'java.util.Locale',
      value: formatLocaleToString(this.language, this.country, this.variant),
    }
    if (this.script) out.script = this.script
    if (this.extensions) out.extensions = this.extensions
    return out
  }
}

/**
 * SimpleTimeZone.writeObject：default fields + optional rules/times。
 * Calendar 流里常嵌套此类；只展示 id / rawOffset（及 DST）。
 */
class JavaSimpleTimeZone implements JavaSerializable {
  /** TimeZone 超类字段 */
  ID = ''
  rawOffset = 0
  dstSavings = 0
  useDaylight = false
  serialVersionOnStream = 2

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    const ver = toSignedInt32(this.serialVersionOnStream)
    if (ver >= 1) {
      const length = stream.readInt()
      for (let i = 0; i < length; i++) stream.readByte()
    }
    if (ver >= 2) stream.readObject() // packed times:int[]
  }

  readResolve(): unknown {
    const out: Record<string, unknown> = {
      $type: 'java.util.SimpleTimeZone',
      id: this.ID,
      rawOffset: toSignedInt32(this.rawOffset),
    }
    if (this.useDaylight) out.dstSavings = toSignedInt32(this.dstSavings)
    return out
  }
}

export function registerJavaMisc(register: typeof ObjectInputStream.RegisterObjectClass): void {
  register(JavaBitSet, 'java.util.BitSet', UID.BitSet)
  register(JavaStringBuilder, 'java.lang.StringBuilder', UID.StringBuilder)
  register(JavaStringBuffer, 'java.lang.StringBuffer', UID.StringBuffer)
  register(JavaInetAddress, 'java.net.InetAddress', UID.InetAddress)
  register(JavaCalendar, 'java.util.Calendar', UID.Calendar)
  register(JavaGregorianCalendar, 'java.util.GregorianCalendar', UID.GregorianCalendar)
  register(JavaSqlDate, 'java.sql.Date', UID.SqlDate)
  register(JavaSqlTimestamp, 'java.sql.Timestamp', UID.Timestamp)
  register(JavaBigInteger, 'java.math.BigInteger', UID.BigInteger)
  register(JavaBigDecimal, 'java.math.BigDecimal', UID.BigDecimal)
  register(JavaLocale, 'java.util.Locale', UID.Locale)
  register(JavaSimpleTimeZone, 'java.util.SimpleTimeZone', UID.SimpleTimeZone)
}
