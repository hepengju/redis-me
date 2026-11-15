/**
 * 常见集合类型结构化展示。
 * 必须按流中的具体类名+UID 注册（不能按 Map/List 接口）；
 * 线格式相同的类可复用同一 handler（如 LinkedHashMap → HashMap 读逻辑）。
 */

import { ObjectInputStream, type JavaSerializable } from 'java-object-serialization'

/** OpenJDK 序列化 UID（与流中无符号 BigInt 一致） */
const UID = {
  ArrayList: '8683452581122892189',
  LinkedList: '876323262645176354',
  HashMap: '362498820763181265',
  LinkedHashMap: '3801124242820219131',
  HashSet: '13421999666996229940',
  LinkedHashSet: '15595076393738512926',
  TreeMap: '919286545866124006',
  TreeSet: '15967601073647880027',
  ConcurrentHashMap: '7249069246763182397',
  EnumMap: '458661240069192865',
  EnumSetProxy: '362491234563181265',
  Vector: '15679138459660562177',
  Stack: '1224463164541339165',
  ArrayDeque: '2340985798034038923',
  PriorityQueue: '10725939016403747505',
  Hashtable: '1421746759512286392',
  Properties: '4112578634029874840',
} as const

function mapResolve(className: string, entries: [unknown, unknown][]): unknown {
  const allStringKeys = entries.every(([k]) => typeof k === 'string')
  if (allStringKeys) {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of entries) obj[k as string] = v
    return obj
  }
  return { $class: className, $entries: entries }
}

function enumName(v: unknown): string | null {
  if (v == null || typeof v !== 'object') return null
  const e = v as { enumConstantName?: string }
  return typeof e.enumConstantName === 'string' ? e.enumConstantName : null
}

function applyFields(target: object, fields: Map<string, unknown>): void {
  for (const [k, v] of fields) {
    if (k in target) (target as Record<string, unknown>)[k] = v
  }
}

class JavaArrayList implements JavaSerializable {
  size = 0
  elements: unknown[] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    stream.readInt() // capacity，忽略
    this.elements = []
    for (let i = 0; i < this.size; i++) {
      this.elements.push(stream.readObject())
    }
  }

  readResolve(): unknown {
    return this.elements
  }
}

class JavaLinkedList implements JavaSerializable {
  elements: unknown[] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    const size = stream.readInt()
    this.elements = []
    for (let i = 0; i < size; i++) {
      this.elements.push(stream.readObject())
    }
  }

  readResolve(): unknown {
    return this.elements
  }
}

/** HashMap / LinkedHashMap：capacity + size + 交替 key/value（Linked 仅写出顺序不同） */
class JavaHashMap implements JavaSerializable {
  className = 'java.util.HashMap'
  entries: [unknown, unknown][] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    stream.readInt() // capacity
    const mappings = stream.readInt()
    this.entries = []
    for (let i = 0; i < mappings; i++) {
      const key = stream.readObject()
      const value = stream.readObject()
      this.entries.push([key, value])
    }
  }

  readResolve(): unknown {
    return mapResolve(this.className, this.entries)
  }
}

class JavaLinkedHashMap extends JavaHashMap {
  className = 'java.util.LinkedHashMap'
}

/** TreeMap：comparator（default fields）+ size + 交替 key/value */
class JavaTreeMap implements JavaSerializable {
  entries: [unknown, unknown][] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    const size = stream.readInt()
    this.entries = []
    for (let i = 0; i < size; i++) {
      const key = stream.readObject()
      const value = stream.readObject()
      this.entries.push([key, value])
    }
  }

  readResolve(): unknown {
    return mapResolve('java.util.TreeMap', this.entries)
  }
}

/** HashSet / LinkedHashSet：capacity/loadFactor/size + 元素 */
class JavaHashSet implements JavaSerializable {
  elements: unknown[] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    stream.readInt() // capacity
    stream.readFloat() // loadFactor
    const size = stream.readInt()
    this.elements = []
    for (let i = 0; i < size; i++) {
      this.elements.push(stream.readObject())
    }
  }

  readResolve(): unknown {
    return this.elements
  }
}

/** TreeSet：comparator + size + 元素（与 HashSet 线格式不同） */
class JavaTreeSet implements JavaSerializable {
  elements: unknown[] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    stream.readObject() // comparator，展示不保留
    const size = stream.readInt()
    this.elements = []
    for (let i = 0; i < size; i++) {
      this.elements.push(stream.readObject())
    }
  }

  readResolve(): unknown {
    return this.elements
  }
}

function isChmSegment(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { className?: string }).className === 'java.util.concurrent.ConcurrentHashMap$Segment'
  )
}

/**
 * ConcurrentHashMap：PutField(segments…) + 交替 key/value，以 null/null 结束。
 * 底层库读完 segments[] 后仍可能在 WriteMethod 数据区残留若干 Segment（见 annotations 前缀），需跳过再取键值。
 */
class JavaConcurrentHashMap implements JavaSerializable {
  /** serialPersistentFields：挂上以便 defaultReadObject 赋值消费 */
  segments: unknown = null
  segmentShift = 0
  segmentMask = 0
  entries: [unknown, unknown][] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    const items: unknown[] = []
    for (;;) {
      items.push(stream.readObject())
      const n = items.length
      if (n >= 2 && items[n - 1] == null && items[n - 2] == null) break
    }
    const body = items.slice(0, -2)
    let i = 0
    while (i < body.length && isChmSegment(body[i])) i++
    this.entries = []
    for (; i + 1 < body.length; i += 2) {
      this.entries.push([body[i], body[i + 1]])
    }
  }

  readResolve(): unknown {
    return mapResolve('java.util.concurrent.ConcurrentHashMap', this.entries)
  }
}

/** EnumMap：keyType + size + 交替 enum key / value */
class JavaEnumMap implements JavaSerializable {
  keyType: unknown = null
  entries: [unknown, unknown][] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    const size = stream.readInt()
    this.entries = []
    for (let i = 0; i < size; i++) {
      this.entries.push([stream.readObject(), stream.readObject()])
    }
  }

  readResolve(): unknown {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of this.entries) {
      const name = enumName(k)
      obj[name ?? String(k)] = v
    }
    return { $type: 'java.util.EnumMap', value: obj }
  }
}

/**
 * EnumSet 经 writeReplace 写成 SerializationProxy（elementType + elements: Enum[]）
 */
class JavaEnumSetProxy implements JavaSerializable {
  elementType: unknown = null
  elements: unknown = null

  readResolve(): unknown {
    const arr = Array.isArray(this.elements) ? this.elements : []
    return { $type: 'java.util.EnumSet', value: arr.map(e => enumName(e) ?? e) }
  }
}

/** Vector / Stack：PutField elementCount + elementData */
class JavaVector implements JavaSerializable {
  elementCount = 0
  elementData: unknown = null
  capacityIncrement = 0

  readObject(stream: ObjectInputStream): void {
    applyFields(this, stream.readFields())
  }

  readResolve(): unknown {
    const data = Array.isArray(this.elementData) ? this.elementData : []
    return data.slice(0, this.elementCount)
  }
}

/** ArrayDeque：size + 头到尾元素 */
class JavaArrayDeque implements JavaSerializable {
  elements: unknown[] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    const size = stream.readInt()
    this.elements = []
    for (let i = 0; i < size; i++) this.elements.push(stream.readObject())
  }

  readResolve(): unknown {
    return this.elements
  }
}

/** PriorityQueue：size/comparator 字段后丢弃一个 int，再读 size 个元素 */
class JavaPriorityQueue implements JavaSerializable {
  size = 0
  comparator: unknown = null
  elements: unknown[] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    stream.readInt() // 兼容旧版 array length
    this.elements = []
    for (let i = 0; i < this.size; i++) this.elements.push(stream.readObject())
  }

  readResolve(): unknown {
    return this.elements
  }
}

/** Hashtable：default fields + length/count + 交替 key/value（Properties 复用此读逻辑） */
class JavaHashtable implements JavaSerializable {
  className = 'java.util.Hashtable'
  loadFactor = 0.75
  threshold = 0
  entries: [unknown, unknown][] = []

  readObject(stream: ObjectInputStream): void {
    stream.defaultReadObject()
    stream.readInt() // table length
    const count = stream.readInt()
    this.entries = []
    for (let i = 0; i < count; i++) {
      this.entries.push([stream.readObject(), stream.readObject()])
    }
  }

  readResolve(): unknown {
    return mapResolve(this.className, this.entries)
  }
}

/**
 * Properties：无自有 writeObject，条目写在 Hashtable 超类槽；
 * 本类仅多 defaults 字段，注册后避免超类走 JavaObject 临时路径。
 */
class JavaProperties extends JavaHashtable {
  className = 'java.util.Properties'
  defaults: unknown = null

  readResolve(): unknown {
    const value = mapResolve(this.className, this.entries)
    const out: Record<string, unknown> = { $type: 'java.util.Properties', value }
    if (this.defaults != null) out.defaults = this.defaults
    return out
  }
}

export function registerJavaCollections(
  register: typeof ObjectInputStream.RegisterObjectClass,
): void {
  register(JavaArrayList, 'java.util.ArrayList', UID.ArrayList)
  register(JavaLinkedList, 'java.util.LinkedList', UID.LinkedList)
  register(JavaHashMap, 'java.util.HashMap', UID.HashMap)
  register(JavaLinkedHashMap, 'java.util.LinkedHashMap', UID.LinkedHashMap)
  register(JavaTreeMap, 'java.util.TreeMap', UID.TreeMap)
  register(JavaConcurrentHashMap, 'java.util.concurrent.ConcurrentHashMap', UID.ConcurrentHashMap)
  register(JavaHashSet, 'java.util.HashSet', UID.HashSet)
  register(JavaHashSet, 'java.util.LinkedHashSet', UID.LinkedHashSet)
  register(JavaTreeSet, 'java.util.TreeSet', UID.TreeSet)
  register(JavaEnumMap, 'java.util.EnumMap', UID.EnumMap)
  register(JavaEnumSetProxy, 'java.util.EnumSet$SerializationProxy', UID.EnumSetProxy)
  register(JavaVector, 'java.util.Vector', UID.Vector)
  register(JavaVector, 'java.util.Stack', UID.Stack)
  register(JavaArrayDeque, 'java.util.ArrayDeque', UID.ArrayDeque)
  register(JavaPriorityQueue, 'java.util.PriorityQueue', UID.PriorityQueue)
  register(JavaHashtable, 'java.util.Hashtable', UID.Hashtable)
  register(JavaProperties, 'java.util.Properties', UID.Properties)
}
