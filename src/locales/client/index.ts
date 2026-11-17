import { localeOverlay } from '@/locales/overlay'

import { enClientTip } from './en'
import { zhClientTip } from './zh-cn'

/** CLIENT LIST 字段说明覆盖层：英文为底，缺条回英文 */
export const clientTipOverlays = { zhCN: zhClientTip }

export const clientTip = localeOverlay(enClientTip, clientTipOverlays)
