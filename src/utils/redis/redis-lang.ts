/** FT.CREATE / FT.ALTER 高亮。只覆盖 DDL 里会出现的词，颜色在浅色和深色背景上都能看清。 */

import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'

const REDIS_KEYWORDS = new Set([
  'FT.CREATE',
  'FT.ALTER',
  'ADD',
  'ON',
  'PREFIX',
  'FILTER',
  'LANGUAGE',
  'LANGUAGE_FIELD',
  'SCORE',
  'SCORE_FIELD',
  'PAYLOAD_FIELD',
  'STOPWORDS',
  'INDEXALL',
  'SCHEMA',
  'AS',
  'NOOFFSETS',
  'NOHL',
  'NOFIELDS',
  'NOFREQS',
  'MAXTEXTFIELDS',
  'TEMPORARY',
  'SKIPINITIALSCAN',
])

const REDIS_ARGS = new Set([
  'HASH',
  'JSON',
  'TEXT',
  'TAG',
  'NUMERIC',
  'GEO',
  'GEOSHAPE',
  'VECTOR',
  'FLAT',
  'HNSW',
  'SVS',
  // 'NOSTEM',  // 手动注释掉，以便: TEXT NOSETM SORTABLE中间的NOSTEM颜色不一致，和RedisInsight类似
  'SORTABLE',
  'UNF',
  'NOINDEX',
  'WITHSUFFIXTRIE',
  'INDEXEMPTY',
  'INDEXMISSING',
  'CASESENSITIVE',
  'TYPE',
  'FLOAT32',
  'FLOAT64',
  'FLOAT16',
  'BFLOAT16',
  'DIM',
  'DISTANCE_METRIC',
  'L2',
  'COSINE',
  'IP',
  'INITIAL_CAP',
  'BLOCK_SIZE',
  'M',
  'EF_CONSTRUCTION',
  'EF_RUNTIME',
  'EPSILON',
  'WEIGHT',
  'SEPARATOR',
  'PHONETIC',
  'ENABLE',
  'DISABLE',
])

/** 向量参数独占一行时比字段更缩进。和字段名撞车的 TYPE、M 只在这种行上当参数。 */
const VECTOR_LINE = new Set([
  'TYPE',
  'DIM',
  'DISTANCE_METRIC',
  'M',
  'EF_CONSTRUCTION',
  'EF_RUNTIME',
  'EPSILON',
  'INITIAL_CAP',
  'BLOCK_SIZE',
])

type RedisHighlightState = {
  indexDone: boolean
  words: number
  inSchema: boolean
  /** 上一词是 AS，下一个词是别名，按字符串上色 */
  afterAs: boolean
  lineIndent: number
  /** 第一条字段行的缩进。-1 表示还没遇到字段。 */
  schemaIndent: number
}

/** 同一次调用结果要复用。tags.special 每次都会新建 tag，高亮规则对不上。 */
const indexTag = tags.special(tags.variableName)

/**
 * 不用 themeType。编辑器没标成 dark 时会退回默认高亮：
 * typeName 是 #164，深色背景上看不见，浅色又和正文差不多。
 * 颜色取两种背景都能分开的一档。
 */
const redisHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#409eff' }, // 关键字
  { tag: indexTag, color: '#67C23A' }, // 索引名
  { tag: tags.typeName, color: '#E6A23C' }, // 参数名
  { tag: tags.string, color: '#909399' }, // 字符串
])

/** 必须作为非 fallback 高亮挂上，否则默认高亮会盖住 TEXT / NOSTEM 这类词。 */
export const redisHighlighting = syntaxHighlighting(redisHighlight)

export const redisLang = new LanguageSupport(
  StreamLanguage.define<RedisHighlightState>({
    startState: () => ({
      indexDone: false,
      words: 0,
      inSchema: false,
      afterAs: false,
      lineIndent: 0,
      schemaIndent: -1,
    }),
    token(stream, state) {
      if (stream.sol()) {
        state.words = 0
        state.lineIndent = 0
        while (stream.peek() === ' ' || stream.peek() === '\t') {
          state.lineIndent += stream.peek() === '\t' ? 2 : 1
          stream.next()
        }
        if (state.lineIndent > 0) return null
      }
      if (stream.eatSpace()) return null
      if (stream.peek() === '"') {
        stream.next()
        while (!stream.eol()) {
          const ch = stream.next()
          if (ch === '\\') {
            stream.next()
            continue
          }
          if (ch === '"') break
        }
        state.words++
        // 引号里的别名仍是字符串。引号里的索引名要标成索引，否则下一行的 HASH 会被当成索引名。
        if (state.afterAs) {
          state.afterAs = false
          return 'string'
        }
        if (!state.indexDone && state.words === 2) {
          state.indexDone = true
          return 'index'
        }
        // 第一条字段行记下缩进，后面更深的 TYPE、DIM 不当成字段名。
        if (state.inSchema && state.words === 1 && state.schemaIndent < 0) {
          state.schemaIndent = state.lineIndent
        }
        return 'string'
      }
      stream.match(/[^\s"]+/)
      const word = stream.current().toUpperCase()
      state.words++
      // 别名不论写不写引号，都跟字符串一个颜色
      if (state.afterAs) {
        state.afterAs = false
        return 'string'
      }
      if (!state.indexDone && state.words === 1 && (word === 'FT.CREATE' || word === 'FT.ALTER'))
        return 'keyword'
      if (!state.indexDone && state.words === 2) {
        state.indexDone = true
        return 'index'
      }
      // 字段名在类型前面，就算叫 type、score 也按字符串上色。更深缩进的 TYPE、DIM 仍是参数。
      if (state.inSchema && state.words === 1 && word !== 'SCHEMA' && word !== 'ADD') {
        if (state.schemaIndent < 0) state.schemaIndent = state.lineIndent
        const nestedParam = state.lineIndent > state.schemaIndent && VECTOR_LINE.has(word)
        if (!nestedParam) return 'string'
      }
      if (REDIS_KEYWORDS.has(word)) {
        if (word === 'SCHEMA') state.inSchema = true
        if (word === 'AS') state.afterAs = true
        return 'keyword'
      }
      if (REDIS_ARGS.has(word)) return 'arg'
      return null
    },
    tokenTable: { keyword: tags.keyword, index: indexTag, arg: tags.typeName, string: tags.string },
  }),
  [redisHighlighting],
)
