import { localeOverlay } from '@/locales/overlay'

import { enInfoTip } from './en'
import { zhInfoTip } from './zh-cn'

/** INFO 说明覆盖层：英文为底，缺条回英文 */
export const infoTipOverlays = { zhCN: zhInfoTip }

export const infoTip = localeOverlay(enInfoTip, infoTipOverlays)

/** 命令名、错误前缀随 INFO 变化，说明挂在 *_XXX 模板上 */
const PREFIX_TEMPLATES: readonly [prefix: string, templateKey: string][] = [
  ['cmdstat_', 'cmdstat_XXX'],
  ['latency_percentiles_usec_', 'latency_percentiles_usec_XXX'],
  ['errorstat_', 'errorstat_XXX'],
]

/** 精确键优先；cmdstat / latency / errorstat 以及编号键回落到模板说明 */
export function lookupInfoTip(map: Record<string, string | undefined>, key: string): string {
  const exact = map[key]
  if (exact) return exact
  for (const [prefix, templateKey] of PREFIX_TEMPLATES) {
    if (key.startsWith(prefix)) return map[templateKey] ?? ''
  }
  if (/^slave\d+$/.test(key)) return map.slaveXXX ?? ''
  if (/^io_thread_\d+$/.test(key)) return map.io_thread_0 ?? ''
  if (/^listener\d+$/.test(key)) return map.listener0 ?? ''
  if (/^db\d+$/.test(key)) return map.dbXXX ?? ''
  return ''
}
