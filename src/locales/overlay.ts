import { computed, type ComputedRef } from 'vue'

import i18n, { type AppLocale } from '@/locales'

/**
 * 覆盖层的键必须是底表已有的键，多出来的键落成 never。
 * 文案是 as const，比较前把值放宽成 string，否则中文句对不上英文原句。
 * 分开声明的对象不会走 excess property 检查，靠 never 才能在编译期拦住拼写错误。缺条仍然允许。
 */
type TipValue<V> = V extends string ? string : V

type LocaleOverlayOf<T, O> = {
  [K in keyof O]: K extends keyof T ? TipValue<T[K]> : never
}

function mergeLocaleOverlayRaw<T extends object>(
  locale: string,
  english: T,
  overlays: Partial<Record<string, object>>,
): T {
  if (locale === 'en') return english
  const extra = overlays[locale]
  if (!extra) return english
  return { ...english, ...(extra as Partial<T>) }
}

/**
 * 英文为底的说明文案。
 * overlays 只登记译好的条目；缺条回英文，未登记的语言整表用英文。
 */
export function mergeLocaleOverlay<T extends object, O extends Partial<Record<AppLocale, object>>>(
  locale: string,
  english: T,
  overlays: { [L in keyof O]: LocaleOverlayOf<T, O[L]> },
): T {
  return mergeLocaleOverlayRaw(locale, english, overlays)
}

export function localeOverlay<T extends object, O extends Partial<Record<AppLocale, object>>>(
  english: T,
  overlays: { [L in keyof O]: LocaleOverlayOf<T, O[L]> },
): ComputedRef<T> {
  return computed(() => mergeLocaleOverlayRaw(i18n.global.locale.value, english, overlays))
}
