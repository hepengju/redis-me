/** 用 FT.INFO 原文还原 FT.CREATE。默认停用词、默认权重、默认分隔符和隐式 UNF 不写回。 */

import JSON5 from 'json5'

const TAKES_VALUE = new Set([
  'identifier',
  'attribute',
  'type',
  'weight',
  'separator',
  'phonetic',
  'algorithm',
  'data_type',
  'dim',
  'distance_metric',
  'm',
  'ef_construction',
  'ef_runtime',
  'epsilon',
  'initial_cap',
  'block_size',
])

const VECTOR_ORDER: [string, string][] = [
  ['data_type', 'TYPE'],
  ['dim', 'DIM'],
  ['distance_metric', 'DISTANCE_METRIC'],
  ['m', 'M'],
  ['ef_construction', 'EF_CONSTRUCTION'],
  ['epsilon', 'EPSILON'],
  ['ef_runtime', 'EF_RUNTIME'],
  ['initial_cap', 'INITIAL_CAP'],
  ['block_size', 'BLOCK_SIZE'],
]

/** 和 FT.CREATE 参数顺序一致：NOSTEM 在 SORTABLE 前面。 */
const FLAG_ORDER = [
  'NOSTEM',
  'WITHSUFFIXTRIE',
  'INDEXEMPTY',
  'INDEXMISSING',
  'CASESENSITIVE',
  'SORTABLE',
  'UNF',
  'NOINDEX',
]

const DATA_TYPES = new Set(['FLOAT32', 'FLOAT64', 'FLOAT16', 'BFLOAT16'])
const ALGOS = new Set(['FLAT', 'HNSW', 'BF', 'SVS', 'TIERED'])

/** 和 RedisInsight 样例命令一致：ON / PREFIX / SCHEMA 4 格，其余选项 8 格，字段 6 格，向量参数 8 格。 */
const PAD_ON = 4
const PAD_OPT = 8
const PAD_SCHEMA = 4
const PAD_FIELD = 6
const PAD_VEC = 8

type FieldBag = {
  ident: string
  attr: string
  ty: string
  algo: string
  kv: Map<string, string>
  flags: Set<string>
}

/** RESP2 是交替数组，RESP3 是对象。统计里的裸 NaN 交给 JSON5。 */
export function indexDdl(raw: string, name: string): string {
  if (!raw.trim() || !name) return ''
  let parsed: unknown
  try {
    parsed = JSON5.parse(raw)
  } catch {
    return ''
  }
  const info = asPairs(parsed)
  const lines = [`FT.CREATE ${quoteArg(name)}`]
  const optPad = pushDefinition(lines, pairValue(info, 'index_definition'))
  for (const opt of stringList(pairValue(info, 'index_options'))) {
    lines.push(pad(optPad, opt.toUpperCase()))
  }
  pushStopwords(lines, info, optPad)
  lines.push(pad(PAD_SCHEMA, 'SCHEMA'))
  const keyType = text(
    pairValue(asPairs(pairValue(info, 'index_definition')), 'key_type'),
  ).toUpperCase()
  const attributes = pairValue(info, 'attributes')
  const fields = Array.isArray(attributes) ? attributes : attributes == null ? [] : [attributes]
  for (const field of fields) {
    const schema = schemaField(field, keyType)
    if (!schema.head) continue
    lines.push(pad(PAD_FIELD, schema.head))
    for (const param of schema.params) lines.push(pad(PAD_VEC, param))
  }
  return lines.join('\n')
}

function pad(spaces: number, text: string): string {
  return `${' '.repeat(spaces)}${text}`
}

function asPairs(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) {
    const out: [string, unknown][] = []
    for (let i = 0; i + 1 < value.length; i += 2) out.push([text(value[i]), value[i + 1]])
    return out
  }
  if (value && typeof value === 'object') return Object.entries(value)
  return []
}

function pairValue(pairs: [string, unknown][], key: string): unknown {
  return pairs.find(([k]) => k.toLowerCase() === key)?.[1]
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(s => s !== '')
  const s = text(value)
  return s ? [s] : []
}

/** 有 ON 时，PREFIX 与 ON 对齐，其余选项缩进 8。SCHEMA 始终和 ON 对齐。 */
function pushDefinition(lines: string[], value: unknown): number {
  if (value == null) return PAD_ON
  const pairs = asPairs(value)
  const keyType = text(pairValue(pairs, 'key_type'))
  const prefixes = stringList(pairValue(pairs, 'prefixes'))
  const filter = text(pairValue(pairs, 'filter'))
  const language = text(pairValue(pairs, 'language')) || text(pairValue(pairs, 'default_language'))
  const languageField = text(pairValue(pairs, 'language_field'))
  const score = text(pairValue(pairs, 'default_score'))
  const scoreField = text(pairValue(pairs, 'score_field'))
  const payloadField = text(pairValue(pairs, 'payload_field'))
  const indexesAll = text(pairValue(pairs, 'indexes_all')).toLowerCase()
  const optPad = keyType ? PAD_OPT : PAD_ON
  if (keyType) lines.push(pad(PAD_ON, `ON ${keyType.toUpperCase()}`))
  if (prefixes.length) {
    lines.push(pad(PAD_ON, `PREFIX ${prefixes.length} ${prefixes.map(quoteName).join(' ')}`))
  }
  if (filter) lines.push(pad(optPad, `FILTER ${quoteName(filter)}`))
  if (language && language.toLowerCase() !== 'english') {
    lines.push(pad(optPad, `LANGUAGE ${quoteName(language)}`))
  }
  if (languageField) lines.push(pad(optPad, `LANGUAGE_FIELD ${quoteName(languageField)}`))
  if (score && !isDefaultScore(score)) lines.push(pad(optPad, `SCORE ${quoteArg(score)}`))
  if (scoreField) lines.push(pad(optPad, `SCORE_FIELD ${quoteName(scoreField)}`))
  if (payloadField) lines.push(pad(optPad, `PAYLOAD_FIELD ${quoteName(payloadField)}`))
  if (['enable', 'enabled', 'true', '1', 'yes'].includes(indexesAll)) {
    lines.push(pad(optPad, 'INDEXALL ENABLE'))
  }
  return optPad
}

function pushStopwords(lines: string[], info: [string, unknown][], optPad: number): void {
  const value = pairValue(info, 'stopwords_list') ?? pairValue(info, 'stopwords')
  if (value == null) return
  const words = stringList(value)
  // 内置词表有几百个，手写的 FT.CREATE 不会带上。空列表才是 STOPWORDS 0。
  if (words.length > 64) return
  lines.push(pad(optPad, `STOPWORDS ${words.length} ${words.map(quoteName).join(' ')}`.trimEnd()))
}

function emptyBag(): FieldBag {
  return { ident: '', attr: '', ty: '', algo: '', kv: new Map(), flags: new Set() }
}

function schemaField(value: unknown, keyType: string): { head: string; params: string[] } {
  const bag = emptyBag()
  walkField(bag, value)
  const name = bag.ident || bag.attr
  if (!name) return { head: '', params: [] }
  const head = [quoteName(name)]
  if (bag.attr && bag.attr !== name) head.push('AS', quoteName(bag.attr))
  const type = bag.ty.toUpperCase()
  const flags = FLAG_ORDER.filter(
    flag => bag.flags.has(flag) && !omitFlag(flag, keyType, type, bag.flags),
  )
  if (type === 'VECTOR') {
    const algo = bag.algo || 'FLAT'
    const params: string[] = []
    const used = new Set<string>()
    for (const [key, label] of VECTOR_ORDER) {
      const val = bag.kv.get(key)
      if (val == null) continue
      params.push(`${label} ${quoteArg(val)}`)
      used.add(key)
    }
    for (const [key, val] of bag.kv) {
      if (key === 'algorithm' || used.has(key)) continue
      params.push(`${key.toUpperCase()} ${quoteArg(val)}`)
    }
    // 个数仍写在 VECTOR 后面。参数各自一行，展平后顺序和命令一致。
    head.push('VECTOR', algo, String(params.length * 2))
    return { head: head.join(' '), params: [...params, ...flags] }
  }
  if (type) head.push(type)
  const weight = bag.kv.get('weight')
  if (weight != null && !isDefaultScore(weight)) head.push('WEIGHT', quoteArg(weight))
  const separator = bag.kv.get('separator')
  if (separator != null && separator !== ',') head.push('SEPARATOR', quoteArg(separator))
  const phonetic = bag.kv.get('phonetic')
  if (phonetic != null) head.push('PHONETIC', quoteArg(phonetic))
  for (const [key, val] of bag.kv) {
    if (key === 'weight' || key === 'separator' || key === 'phonetic') continue
    head.push(key.toUpperCase(), quoteArg(val))
  }
  head.push(...flags)
  return { head: head.join(' '), params: [] }
}

/** flags 是字符串数组；向量的 initial_cap / block_size 可能嵌在 algorithm 或 index 里。 */
function walkField(bag: FieldBag, value: unknown): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const el = value[i]
      if (el && typeof el === 'object') {
        walkField(bag, el)
        continue
      }
      const key = text(el).toLowerCase()
      if (!key) continue
      const next = value[i + 1]
      if (next && typeof next === 'object') {
        walkField(bag, next)
        i++
        continue
      }
      if (TAKES_VALUE.has(key) && i + 1 < value.length) {
        noteScalar(bag, key, next)
        i++
        continue
      }
      noteFlag(bag, key)
    }
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      if (val && typeof val === 'object') {
        walkField(bag, val)
        continue
      }
      noteScalar(bag, key.toLowerCase(), val)
    }
  }
}

function noteScalar(bag: FieldBag, key: string, raw: unknown): void {
  const val = text(raw)
  if (!val) return
  if (key === 'identifier' && !bag.ident) bag.ident = val
  else if (key === 'attribute' && !bag.attr) bag.attr = val
  else if (key === 'type') {
    const upper = val.toUpperCase()
    if (DATA_TYPES.has(upper)) bag.kv.set('data_type', upper)
    else if (!bag.ty) bag.ty = val
  } else if (key === 'algorithm' || key === 'name') {
    const upper = val.toUpperCase()
    if (ALGOS.has(upper)) bag.algo = upper === 'BF' ? 'FLAT' : upper
  } else if (key === 'dimensions') {
    bag.kv.set('dim', val)
  } else if (key === 'initial_capacity') {
    bag.kv.set('initial_cap', val)
  } else if (TAKES_VALUE.has(key)) {
    bag.kv.set(key, val)
  } else {
    noteFlag(bag, key)
  }
}

function noteFlag(bag: FieldBag, word: string): void {
  const upper = word.toUpperCase()
  if (FLAG_ORDER.includes(upper)) bag.flags.add(upper)
}

/**
 * UNF 只决定排序值要不要做文本归一化（转小写、去掉变音符号）。
 * RediSearch 收下 FT.CREATE 时会自己把这个标记写上，FT.INFO 再原样报出来，
 * 所以回显里的 UNF 不一定是创建命令里写过的。下面几类和没写 UNF 是同一件事，省略：
 * - Hash 的 NUMERIC SORTABLE：数字没有归一化，隐式 UNF（如 price、weight）
 * - 大小写敏感的 TAG SORTABLE：同样隐式 UNF
 * - JSON 上任何 SORTABLE：文本也不归一化，一律隐式 UNF
 * Hash 文本上显式写的 UNF 要保留，那种才会关掉默认归一化。
 */
function omitFlag(flag: string, keyType: string, type: string, flags: Set<string>): boolean {
  if (flag !== 'UNF' || !flags.has('SORTABLE')) return false
  if (keyType === 'JSON') return true
  if (type === 'NUMERIC') return true
  return type === 'TAG' && flags.has('CASESENSITIVE')
}

/** 键详情预填的一个字段。value 是当前键里看到的值，用来猜索引类型。 */
export type IndexDraftField = { name: string; value?: unknown }

/** 无空格的短串当 TAG（状态、枚举、SKU）。再长仍当 TEXT，避免把大段内容建成标签索引。 */
const TAG_MAX_LEN = 64

/**
 * 从键详情预填一条 FT.CREATE。前缀是键名里最后一个冒号及其前面的部分。
 * 类型只看这一个键：JSON 数字、Hash 的整数或小数写成 NUMERIC；
 * JSON 布尔和 null、无空格的短串写成 TAG。嵌套对象、带空格的句子、认不出的仍是 TEXT。
 * 不猜 GEO / VECTOR，也不加 SORTABLE。JSON 用 `$.字段`。没有字段时留一行 field，方便改。
 */
export function indexCreateDraft(
  keyType: 'HASH' | 'JSON',
  key: string,
  fields: IndexDraftField[],
): string {
  const prefix = keyPrefix(key)
  const index = indexName(prefix)
  const lines = [`FT.CREATE ${quoteArg(index)}`, `    ON ${keyType}`]
  if (prefix) lines.push(`    PREFIX 1 ${quoteArg(prefix)}`)
  lines.push('    SCHEMA')
  const seen = new Set<string>()
  for (const field of fields) {
    const name = field.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const ident = keyType === 'JSON' ? jsonPath(name) : name
    lines.push(`      ${quoteArg(ident)} ${inferDraftType(keyType, field.value)}`)
  }
  if (!seen.size) lines.push('      field TEXT')
  return lines.join('\n')
}

/** 修改索引的起步命令。索引名来自当前行，字段是占位，改完再执行。 */
export function indexAlterDraft(name: string): string {
  const index = name.trim() || 'idx:name'
  return [
    `FT.ALTER ${quoteArg(index)}`,
    '    SCHEMA ADD',
    '      city TEXT',
    '      year NUMERIC',
  ].join('\n')
}

/** Hash 的数字字符串也算 NUMERIC；JSON 只认真正的数字，`"12"` 仍按短串处理。 */
function inferDraftType(keyType: 'HASH' | 'JSON', value: unknown): 'TEXT' | 'TAG' | 'NUMERIC' {
  if (keyType === 'JSON') {
    if (value === null || typeof value === 'boolean') return 'TAG'
    if (typeof value === 'number' && Number.isFinite(value)) return 'NUMERIC'
    if (typeof value !== 'string') return 'TEXT'
    return classifyText(value, false)
  }
  if (typeof value !== 'string') return 'TEXT'
  return classifyText(value, true)
}

function classifyText(value: string, numeric: boolean): 'TEXT' | 'TAG' | 'NUMERIC' {
  const text = value.trim()
  if (!text) return 'TEXT'
  if (numeric && /^-?\d+(\.\d+)?$/.test(text)) return 'NUMERIC'
  if (text.length <= TAG_MAX_LEN && !/\s/.test(text)) return 'TAG'
  return 'TEXT'
}

/** `user:1001` → `user:`；没有冒号就用整个键名。 */
function keyPrefix(key: string): string {
  const i = key.lastIndexOf(':')
  return i < 0 ? key : key.slice(0, i + 1)
}

function indexName(prefix: string): string {
  const base = prefix.replace(/:+$/, '')
  return base ? `idx:${base}` : 'idx:name'
}

function jsonPath(name: string): string {
  if (name.startsWith('$.')) return name
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `$.${name}`
  return `$["${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`
}

function quoteName(s: string): string {
  return `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function quoteArg(s: string): string {
  const simple = s.length > 0 && /^[0-9A-Za-z_:\-.$*[\]/@+\\]+$/.test(s)
  if (simple) return s
  return `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function isDefaultScore(s: string): boolean {
  const n = Number(s)
  return Number.isFinite(n) && Math.abs(n - 1) < 1e-9
}
