/**
 * Vector Set 向量 / attrs 输入：
 * - 向量：JSON 数组或空白/逗号分隔浮点 → number[]；空/零不拦，交给 Redis
 * - attrs：JSON/JSON5 对象文本；空=不设或删除；非法格式前端拦截
 */
import JSON5 from 'json5'

/** 解析编辑区文本 → 浮点数组；仅格式非法时失败 */
export function parseVectorInput(text: string): { ok: true; nums: number[] } | { ok: false } {
  const t = text.trim()
  if (!t) return { ok: true, nums: [] }

  let nums: number[]
  try {
    if (t.startsWith('[')) {
      // 与项目其它处一致：数组也允许 JSON5（尾逗号等）
      const parsed: unknown = JSON5.parse(t)
      if (!Array.isArray(parsed)) return { ok: false }
      nums = parsed.map(Number)
    } else {
      nums = t
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
    }
  } catch {
    return { ok: false }
  }

  if (nums.some(n => !Number.isFinite(n))) return { ok: false }
  return { ok: true, nums }
}

/** 解析 attrs 文本 → 紧凑 JSON（Redis 用）；空串合法；须为 object（非数组）；支持 JSON5 */
export function parseAttrsInput(text: string): { ok: true; json: string } | { ok: false } {
  const t = text.trim()
  if (!t) return { ok: true, json: '' }
  try {
    const parsed: unknown = JSON5.parse(t)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false }
    }
    return { ok: true, json: JSON.stringify(parsed) }
  } catch {
    return { ok: false }
  }
}

/** 紧凑 JSON 比较，避免 pretty / JSON5 书写差异误判脏 */
export function attrsNormalizedEqual(a: string, b: string): boolean {
  const pa = parseAttrsInput(a)
  const pb = parseAttrsInput(b)
  if (!pa.ok || !pb.ok) return a.trim() === b.trim()
  return pa.json === pb.json
}
