/** sleep、JSON 格式化与解析 */
import JSON5 from 'json5'
import { applyEdits, format } from 'jsonc-parser'

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function meJsonFormat(jsonString: string): string {
  return applyEdits(jsonString, format(jsonString, undefined, { insertSpaces: true, tabSize: 2 }))
}

/** 单字段/字符串值的展示格式化（与 RedisValue isPretty 规则对齐） */
export function meFormatDisplayValue(raw: string, pretty: boolean): string {
  if (!pretty || !raw) return raw
  const trimmed = raw.trim()
  // 下标越界是 undefined，不抛错。空串、长度为 1 时 open/close 为空或同一个字符，成对判断为 false。
  const open = trimmed[0]
  const close = trimmed[trimmed.length - 1]
  // jsonc format 容错，会给 `[server]` 这类 ini/日志插换行，保存时固化损坏。
  // 只要求首尾括号成对，不再 JSON5.parse：Fastjson 的 Set[...] 等非标准 JSON 也能美化（只动空白）。
  if ((open === '{' && close === '}') || (open === '[' && close === ']')) {
    const nl = trimmed.indexOf('\n')
    const firstLine = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim()
    // 首行整行只是 [名字] / {名字}：单行 [server]，或以段头开头、以 ] 结尾的 ini。true/false/null 是合法 JSON。
    const bareName = firstLine.match(/^[{[]\s*([A-Za-z_][\w .-]*)\s*[}\]]$/)
    if (bareName && bareName[1] !== 'true' && bareName[1] !== 'false' && bareName[1] !== 'null')
      return raw
    try {
      return meJsonFormat(raw)
    } catch {
      return raw
    }
  }
  return raw
}

export function meJsonParse(jsonString: string | null | undefined): unknown {
  if (!jsonString) return null
  if (jsonString === 'undefined') return null
  if (jsonString === 'null') return null
  return JSON5.parse(jsonString)
}

export function meJsonNormal(jsonString: string): string {
  return JSON.stringify(JSON5.parse(jsonString), null, 2)
}
