/** Redis SCAN MATCH 通配符：* ? [ */
export function isRedisGlob(pattern: string): boolean {
  return /[*?[]/.test(pattern)
}

const GLOB_META = /[*?[\\]/

/** 转义 Redis glob 特殊字符，精确模式按字面键名过滤 */
export function escapeRedisGlobLiteral(s: string): string {
  return s.replace(/[\\*?[\]]/g, '\\$&')
}

function escapeRegex(s: string): string {
  return s.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
}

/**
 * 将 Redis MATCH 字符类体转成 JS 字符类体。
 * Redis `\X` 表示字面 X（不是 JS 的 \n 等转义）。
 */
function redisClassBodyToJs(body: string): string {
  let out = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && i + 1 < body.length) {
      const n = body[++i]
      out += '[]\\^-'.includes(n) ? `\\${n}` : n
      continue
    }
    const c = body[i]
    if (c === '\\' || c === ']') out += `\\${c}`
    else out += c
  }
  return out
}

/**
 * `[` 起的 Redis 字符类。未闭合时返回 null（按字面 `[` 处理，便于边输入边过滤）。
 */
function takeClass(pattern: string, start: number): { re: string; next: number } | null {
  let i = start + 1
  const n = pattern.length
  if (i >= n) return null
  let negate = false
  if (pattern[i] === '^') {
    negate = true
    i++
  }
  let j = i
  let closed = false
  while (j < n) {
    if (pattern[j] === '\\' && j + 1 < n) {
      j += 2
      continue
    }
    if (pattern[j] === ']') {
      closed = true
      break
    }
    j++
  }
  if (!closed) return null
  const jsBody = redisClassBodyToJs(pattern.slice(i, j))
  if (jsBody === '' && !negate) return { re: '(?!)', next: j + 1 }
  if (jsBody === '' && negate) return { re: '[\\s\\S]', next: j + 1 }
  return { re: `[${negate ? '^' : ''}${jsBody}]`, next: j + 1 }
}

/**
 * Redis SCAN MATCH → RegExp。`*` / `?` 可匹配 `/`，与路径 glob 不同。
 * nocase 对齐原先 minimatch 本地过滤（SCAN 服务端仍大小写敏感）。
 */
export function redisGlobToRegExp(pattern: string, nocase = true): RegExp {
  let out = '^'
  let i = 0
  const n = pattern.length
  while (i < n) {
    const c = pattern[i]
    if (c === '*') {
      while (i + 1 < n && pattern[i + 1] === '*') i++
      out += '[\\s\\S]*'
      i++
      continue
    }
    if (c === '?') {
      out += '[\\s\\S]'
      i++
      continue
    }
    if (c === '\\' && i + 1 < n) {
      out += escapeRegex(pattern[i + 1])
      i += 2
      continue
    }
    if (c === '[') {
      const cls = takeClass(pattern, i)
      if (cls) {
        out += cls.re
        i = cls.next
        continue
      }
      out += '\\['
      i++
      continue
    }
    out += escapeRegex(c)
    i++
  }
  out += '$'
  return new RegExp(out, nocase ? 'i' : '')
}

/**
 * 编译本地过滤谓词（pattern 变了才需重编）。
 * `*字面*` 且中间无通配时走 includes，输入 ME / *ME* 与 indexOf 同量级。
 */
export function compileRedisGlobFilter(pattern: string): ((s: string) => boolean) | null {
  if (!pattern) return null
  if (/^\*+$/.test(pattern)) return () => true

  // *literal*：子串（大小写不敏感，与旧 minimatch nocase 一致）
  if (pattern.length >= 2 && pattern.startsWith('*') && pattern.endsWith('*')) {
    const mid = pattern.slice(1, -1)
    if (mid && !GLOB_META.test(mid)) {
      const needle = mid.toLowerCase()
      return s => s.toLowerCase().includes(needle)
    }
  }

  // 无通配：精确相等。exact 且含 *?[] 时已被转义成 \* 等，走下面正则
  if (!GLOB_META.test(pattern)) {
    const exact = pattern.toLowerCase()
    return s => s.toLowerCase() === exact
  }

  const re = redisGlobToRegExp(pattern, true)
  return s => re.test(s)
}

/**
 * 未 Enter 重扫时的本地过滤 pattern：exact 转义字面，否则用服务端 match。
 */
export function buildLocalFilterPattern(keyword: string, exact: boolean, match: string): string {
  const key = keyword.trim()
  if (!key) return ''
  if (exact) return escapeRedisGlobLiteral(key)
  return match
}

/** 扫描进度环：按批次估算，finished 时 100% */
export function computeScanProgress(
  batchCount: number,
  batchSize: number,
  totalEstimate: number,
  finished: boolean,
): number {
  if (finished) return 100
  if (batchCount === 0) return 0
  if (totalEstimate > 0) {
    return Math.min(99, Math.round(((batchCount * batchSize) / totalEstimate) * 100))
  }
  return Math.min(99, batchCount * 5)
}

/**
 * 构建 SCAN 模式（目录扫描 loadFolder 时为 keyword + sep + *）
 *
 * 关闭完全匹配：含 glob（* ? [）则原样，否则前后补 *
 * 开启完全匹配：原样传给后端 EXISTS 判断（含 * 也按字面键名）
 */
export function buildScanPattern(
  keyword: string,
  exact: boolean,
  loadFolder = false,
  keySeparator = ':',
): string {
  if (loadFolder) {
    const sep = keySeparator || ':'
    return `${keyword}${sep}*`
  }
  if (exact) return keyword
  if (!keyword) return '*'
  if (isRedisGlob(keyword)) return keyword
  return `*${keyword}*`
}
