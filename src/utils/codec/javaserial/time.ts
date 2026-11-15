/** java.time.Ser（Externalizable）解析；对齐 OpenJDK Ser.readInternal */

import type { ObjectInputStream, JavaSerializable } from 'java-object-serialization'

/** 流里的 UID 为无符号形式（对应 OpenJDK -7683839454370182990L） */
export const JAVA_TIME_SER_UID = '10762904619339368626'
export const JAVA_TIME_SER_CLASS = 'java.time.Ser'

const DURATION_TYPE = 1
const INSTANT_TYPE = 2
const LOCAL_DATE_TYPE = 3
const LOCAL_TIME_TYPE = 4
const LOCAL_DATE_TIME_TYPE = 5
const ZONE_DATE_TIME_TYPE = 6
const ZONE_REGION_TYPE = 7
const ZONE_OFFSET_TYPE = 8
const OFFSET_TIME_TYPE = 9
const OFFSET_DATE_TIME_TYPE = 10
const YEAR_TYPE = 11
const YEAR_MONTH_TYPE = 12
const MONTH_DAY_TYPE = 13
const PERIOD_TYPE = 14

const JAVA_MAX_LONG = 9223372036854775807n
const TWO_COMPLEMENT_MAX_LONG = 18446744073709551616n

/** 库 readInt → Uint32；按 Java signed int 纠偏 */
function toSignedInt32(n: number): number {
  return n > 0x7fffffff ? n - 0x100000000 : n
}

/** 库 readLong → Uint64；按 Java signed long 纠偏 */
function toSignedLong(v: bigint): bigint {
  return v > JAVA_MAX_LONG ? v - TWO_COMPLEMENT_MAX_LONG : v
}

function readSignedByte(stream: ObjectInputStream): number {
  const u = stream.readByte()
  return u > 127 ? u - 256 : u
}

function readSignedInt(stream: ObjectInputStream): number {
  return toSignedInt32(stream.readInt())
}

function readSignedLong(stream: ObjectInputStream): bigint {
  return toSignedLong(stream.readLong())
}

/** DataInput.readUTF（modified UTF-8）；常见 ZoneId 为 ASCII */
function readUTF(stream: ObjectInputStream): string {
  const len = stream.readShort()
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = stream.readByte()
  return new TextDecoder().decode(bytes)
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatLocalDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function formatLocalTime(hour: number, minute: number, second: number, nano: number): string {
  let s = `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`
  if (nano > 0) {
    s += `.${String(nano).padStart(9, '0').replace(/0+$/, '')}`
  }
  return s
}

function readLocalDate(stream: ObjectInputStream): string {
  const year = readSignedInt(stream)
  const month = stream.readByte()
  const day = stream.readByte()
  return formatLocalDate(year, month, day)
}

function readLocalTime(stream: ObjectInputStream): string {
  let hour = readSignedByte(stream)
  let minute = 0
  let second = 0
  let nano = 0
  if (hour < 0) {
    hour = ~hour
  } else {
    minute = readSignedByte(stream)
    if (minute < 0) {
      minute = ~minute
    } else {
      second = readSignedByte(stream)
      if (second < 0) {
        second = ~second
      } else {
        nano = readSignedInt(stream)
      }
    }
  }
  return formatLocalTime(hour, minute, second, nano)
}

function readLocalDateTime(stream: ObjectInputStream): string {
  return `${readLocalDate(stream)}T${readLocalTime(stream)}`
}

function readInstant(stream: ObjectInputStream): string {
  const seconds = readSignedLong(stream)
  const nanos = readSignedInt(stream)
  const ms = Number(seconds) * 1000 + Math.floor(nanos / 1_000_000)
  return new Date(ms).toISOString()
}

function readZoneOffset(stream: ObjectInputStream): string {
  const offsetByte = readSignedByte(stream)
  let totalSeconds: number
  if (offsetByte === 127) {
    totalSeconds = readSignedInt(stream)
  } else {
    totalSeconds = offsetByte * 900
  }
  if (totalSeconds === 0) return 'Z'
  const sign = totalSeconds < 0 ? '-' : '+'
  const abs = Math.abs(totalSeconds)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  return s === 0 ? `${sign}${pad2(h)}:${pad2(m)}` : `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

function readJavaTime(type: number, stream: ObjectInputStream): unknown {
  switch (type) {
    case LOCAL_DATE_TYPE:
      return { $type: 'java.time.LocalDate', value: readLocalDate(stream) }
    case LOCAL_TIME_TYPE:
      return { $type: 'java.time.LocalTime', value: readLocalTime(stream) }
    case LOCAL_DATE_TIME_TYPE:
      return { $type: 'java.time.LocalDateTime', value: readLocalDateTime(stream) }
    case INSTANT_TYPE:
      return { $type: 'java.time.Instant', value: readInstant(stream) }
    case ZONE_OFFSET_TYPE:
      return { $type: 'java.time.ZoneOffset', value: readZoneOffset(stream) }
    case ZONE_REGION_TYPE:
      return { $type: 'java.time.ZoneId', value: readUTF(stream) }
    case ZONE_DATE_TIME_TYPE: {
      const dateTime = readLocalDateTime(stream)
      const offset = readZoneOffset(stream)
      const zoneType = stream.readByte()
      const zone = readJavaTime(zoneType, stream) as { value: string }
      return { $type: 'java.time.ZonedDateTime', value: `${dateTime}${offset}[${zone.value}]` }
    }
    case OFFSET_DATE_TIME_TYPE: {
      const dateTime = readLocalDateTime(stream)
      const offset = readZoneOffset(stream)
      return { $type: 'java.time.OffsetDateTime', value: `${dateTime}${offset}` }
    }
    case OFFSET_TIME_TYPE: {
      const time = readLocalTime(stream)
      const offset = readZoneOffset(stream)
      return { $type: 'java.time.OffsetTime', value: `${time}${offset}` }
    }
    case YEAR_TYPE:
      return { $type: 'java.time.Year', value: String(readSignedInt(stream)) }
    case YEAR_MONTH_TYPE:
      return {
        $type: 'java.time.YearMonth',
        value: `${readSignedInt(stream)}-${pad2(stream.readByte())}`,
      }
    case MONTH_DAY_TYPE:
      return {
        $type: 'java.time.MonthDay',
        value: `--${pad2(stream.readByte())}-${pad2(stream.readByte())}`,
      }
    case PERIOD_TYPE:
      return {
        $type: 'java.time.Period',
        years: readSignedInt(stream),
        months: readSignedInt(stream),
        days: readSignedInt(stream),
      }
    case DURATION_TYPE:
      return {
        $type: 'java.time.Duration',
        seconds: readSignedLong(stream).toString(),
        nanos: readSignedInt(stream),
      }
    default:
      throw new Error(`Unknown java.time.Ser type: ${type}`)
  }
}

/** 注册到 ObjectInputStream；依赖库对 Externalizable + readExternal 的支持（pnpm patch） */
export class JavaTimeSer implements JavaSerializable {
  value: unknown

  readExternal(stream: ObjectInputStream): void {
    const type = stream.readByte()
    this.value = readJavaTime(type, stream)
  }

  readResolve(): unknown {
    return this.value
  }
}
