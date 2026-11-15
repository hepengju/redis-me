/**
 * Redis/Valkey 版本标签比较：从 Redis8.10 / 8.10.0 等字符串取出数字段，按主.次.修订数值比较。
 * 避免字典序把 8.10 排在 8.2 前面。
 */

/** 从标签中提取版本数字段，如 Redis8.10.1 → [8, 10, 1] */
export function parseVersionNums(label: string): number[] {
  const m = label.match(/(\d+(?:\.\d+)*)/)
  return m ? m[1].split('.').map(n => Number(n) || 0) : [0]
}

/** 升序比较：a < b 为负，相等为 0，a > b 为正 */
export function compareVersionLabel(a: string, b: string): number {
  const pa = parseVersionNums(a)
  const pb = parseVersionNums(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return a.localeCompare(b)
}

/** 按版本号降序（新版本在前） */
export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareVersionLabel(b, a))
}

/**
 * 在已按降序排好的版本列表中，选不超过 current 的最新一项。
 * 服务版本低于字典最小版本时（如 Redis 5 vs Redis6.2），回退到列表最旧项，避免空值。
 */
export function pickVersionAtOrBelow(current: string, versionsDesc: string[]): string {
  for (const version of versionsDesc) {
    if (compareVersionLabel(current, version) >= 0) return version
  }
  return versionsDesc[versionsDesc.length - 1] ?? ''
}
