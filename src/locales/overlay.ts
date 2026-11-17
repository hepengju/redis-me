import { computed, type ComputedRef } from 'vue'

import i18n, { type AppLocale } from '@/locales'

/**
 * 英文为底的说明文案。
 * overlays 只登记译好的条目；缺条回英文，未登记的语言整表用英文。
 */
export function mergeLocaleOverlay<T extends object>(
  locale: string,
  english: T,
  overlays: Partial<Record<AppLocale, object>>,
): T {
  if (locale === 'en') return english
  const extra = overlays[locale as AppLocale]
  if (!extra) return english
  return { ...english, ...extra } as T
}

export function localeOverlay<T extends object>(
  english: T,
  overlays: Partial<Record<AppLocale, object>>,
): ComputedRef<T> {
  return computed(() => mergeLocaleOverlay(i18n.global.locale.value, english, overlays))
}
