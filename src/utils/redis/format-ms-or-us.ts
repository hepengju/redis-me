/** 图形上的耗时：毫秒取整。取整后为 0 时改显示取整微秒。 */
export function formatMsOrUs(usec: number): string {
  const ms = Math.round(usec / 1000)
  if (ms <= 0) return `${Math.round(usec)} µs`
  return `${ms} ms`
}
