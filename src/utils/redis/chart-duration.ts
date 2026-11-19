/** 总耗时柱状图的单位。
 * 只看这张图上画出来的柱子里最短的一根，取它仍然 ≥ 1 的最大单位，整图共用。
 * 最短柱不到 1 秒时保持毫秒，短时间运行的实例不会被改成秒。
 */

export type ChartDurationUnit = 'ms' | 's' | 'min' | 'h' | 'd'

const STEPS: { unit: ChartDurationUnit; ms: number }[] = [
  { unit: 'd', ms: 86_400_000 },
  { unit: 'h', ms: 3_600_000 },
  { unit: 'min', ms: 60_000 },
  { unit: 's', ms: 1_000 },
]

const MS: Record<ChartDurationUnit, number> = {
  ms: 1,
  s: 1_000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

/** 最短柱的毫秒数。0 或无效时保持毫秒。 */
export function chartDurationUnit(minMs: number): ChartDurationUnit {
  if (!(minMs > 0)) return 'ms'
  for (const step of STEPS) {
    if (minMs >= step.ms) return step.unit
  }
  return 'ms'
}

export function chartDurationDivisor(unit: ChartDurationUnit): number {
  return MS[unit]
}

/** 与平均耗时的 ms / µs 一样，符号直接写在柱端，不走文案。 */
const UNIT_LABEL: Record<ChartDurationUnit, string> = { ms: 'ms', s: 's', min: 'm', h: 'h', d: 'd' }

/** 柱端数字。毫秒取整；更大的单位不到 100 留 1 位小数，满 100 取整。 */
export function formatChartDurationAmount(ms: number, unit: ChartDurationUnit): string {
  if (unit === 'ms') return String(Math.round(ms))
  const n = ms / MS[unit]
  const digits = Math.abs(n) >= 100 ? 0 : 1
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits
  if (rounded === 0) return '0'
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(digits)
}

export function formatChartDuration(ms: number, unit: ChartDurationUnit): string {
  return `${formatChartDurationAmount(ms, unit)} ${UNIT_LABEL[unit]}`
}
