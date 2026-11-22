import { afterEach, describe, expect, it } from 'vite-plus/test'

import i18n from '@/locales'
import { clientTip, clientTipOverlays } from '@/locales/client'
import { enClientTip } from '@/locales/client/en'
import { commandHelp, commandSummaryOverlays } from '@/locales/cmd'
import { enCommands } from '@/locales/cmd/en'
import { configTip, configTipOverlays } from '@/locales/config'
import { enConfigTip } from '@/locales/config/en'
import { infoTip, infoTipOverlays } from '@/locales/info'
import { enInfoTip } from '@/locales/info/en'
import { mergeLocaleOverlay } from '@/locales/overlay'

/** 说明类字典已与英文键对齐的语言。新语言可缺条，译全后再加入。 */
const COMPLETE_TIP_LOCALES = ['zhCN'] as const

function flatMessages(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (!value || typeof value !== 'object') return out
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object') Object.assign(out, flatMessages(child, path))
    else out[path] = String(child)
  }
  return out
}

/** vue-i18n 具名占位符；跳过 {'@'} {'|'} 这类字面量转义。复数两段里重复出现只计一次。 */
function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^{}'|@][^{}]*)\}/g)].map(match => match[1]!))].sort()
}

function assertSameKeys(label: string, english: object, overlay: object, complete: boolean) {
  const enKeys = new Set(Object.keys(english))
  const extra = Object.keys(overlay).filter(key => !enKeys.has(key))
  const missing = complete ? [...enKeys].filter(key => !(key in overlay)) : []
  expect(extra, `${label} 多出的键`).toEqual([])
  expect(missing, `${label} 缺少的键`).toEqual([])
}

describe('界面文案键对齐', () => {
  const messages = i18n.global.messages.value as Record<string, unknown>
  const english = flatMessages(messages.en)

  it('已注册语言与英文键、占位符一致', () => {
    for (const [locale, message] of Object.entries(messages)) {
      if (locale === 'en') continue
      const local = flatMessages(message)
      const missing = Object.keys(english).filter(key => !(key in local))
      const extra = Object.keys(local).filter(key => !(key in english))
      expect(missing, `${locale} 缺少的键`).toEqual([])
      expect(extra, `${locale} 多出的键`).toEqual([])
      const placeholderDiff = Object.keys(english).filter(
        key => placeholders(english[key]!).join() !== placeholders(local[key]!).join(),
      )
      expect(placeholderDiff, `${locale} 占位符不一致`).toEqual([])
    }
  })
})

describe('说明字典键对齐', () => {
  const catalogs: [string, object, Record<string, object>][] = [
    ['config', enConfigTip, configTipOverlays],
    ['info', enInfoTip, infoTipOverlays],
    ['client', enClientTip, clientTipOverlays],
  ]

  it('覆盖层键是英文的子集；已译全的语言没有缺条', () => {
    for (const [name, english, overlays] of catalogs) {
      for (const [locale, overlay] of Object.entries(overlays)) {
        assertSameKeys(
          `${name}.${locale}`,
          english,
          overlay,
          (COMPLETE_TIP_LOCALES as readonly string[]).includes(locale),
        )
      }
    }

    const commandKeys = Object.fromEntries(enCommands.map(row => [row.key, row.summary]))
    for (const [locale, overlay] of Object.entries(commandSummaryOverlays)) {
      assertSameKeys(
        `cmd.${locale}`,
        commandKeys,
        overlay,
        (COMPLETE_TIP_LOCALES as readonly string[]).includes(locale),
      )
    }
  })
})

describe('说明字典按语言回退', () => {
  afterEach(() => {
    i18n.global.locale.value = 'en'
  })

  it('未登记的语言整表用英文，缺条用英文补上', () => {
    const english = { a: 'en-a', b: 'en-b' }
    expect(mergeLocaleOverlay('en', english, { zhCN: { a: 'zh-a' } })).toBe(english)
    expect(mergeLocaleOverlay('ja', english, { zhCN: { a: 'zh-a' } })).toBe(english)
    expect(mergeLocaleOverlay('zhCN', english, { zhCN: { a: 'zh-a' } })).toEqual({
      a: 'zh-a',
      b: 'en-b',
    })
  })

  it('中文命令摘要覆盖英文，分组括号用【】', () => {
    i18n.global.locale.value = 'zhCN'
    const row = commandHelp.value.find(item => item.key === 'ACL')
    expect(row?.summary).toBe(commandSummaryOverlays.zhCN?.ACL)
    expect(row?.description).toContain('【server】')

    i18n.global.locale.value = 'en'
    const enRow = commandHelp.value.find(item => item.key === 'ACL')
    expect(enRow?.summary).toBe('A container for Access List Control commands.')
    expect(enRow?.description).toContain('[server]')
  })

  it('未登记的语言命令帮助和 tip 都用英文', () => {
    // 尚未加入 AppLocale 的语言，运行时仍应整表回英文
    ;(i18n.global.locale as { value: string }).value = 'ja'
    const row = commandHelp.value.find(item => item.key === 'ACL')
    expect(row?.summary).toBe('A container for Access List Control commands.')
    expect(row?.description).toContain('[server]')
    expect(configTip.value).toBe(enConfigTip)
    expect(infoTip.value).toBe(enInfoTip)
    expect(clientTip.value).toBe(enClientTip)
  })

  it('中文 tip 取覆盖层，英文取底表', () => {
    i18n.global.locale.value = 'zhCN'
    expect(configTip.value.port).toBe(configTipOverlays.zhCN.port)
    expect(infoTip.value.redis_version).toBe(infoTipOverlays.zhCN.redis_version)
    expect(clientTip.value.id).toBe(clientTipOverlays.zhCN.id)

    i18n.global.locale.value = 'en'
    expect(configTip.value.port).toBe(enConfigTip.port)
    expect(infoTip.value.redis_version).toBe(enInfoTip.redis_version)
    expect(clientTip.value.id).toBe(enClientTip.id)
  })
})

/** 只给 tsc 看：分开声明的覆盖层多写键时应报错，函数本身不调用。 */
function overlayExtraKeyIsTypeError(): void {
  const english = { a: 'en-a', b: 'en-b' }
  const zh = { a: 'zh-a', extra: 'nope' }
  // @ts-expect-error 覆盖层不能出现底表没有的键
  mergeLocaleOverlay('zhCN', english, { zhCN: zh })
}
void overlayExtraKeyIsTypeError
