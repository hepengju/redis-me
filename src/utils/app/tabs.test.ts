import { describe, expect, it } from 'vite-plus/test'

import zhCn from '@/locales/lang/zh-cn'
import {
  DEFAULT_TABS_VISIBLE,
  TAB_NAMES,
  firstAvailableTab,
  isTabAvailable,
  isTabName,
  normalizeTabsVisible,
  resolveTabsVisible,
} from '@/utils/app/tabs'
import type { TabAvailabilityCtx, TabName } from '@/utils/app/tabs'

const FULL: TabAvailabilityCtx = {
  minimal: false,
  infoSupported: true,
  searchSupported: true,
  memorySupported: true,
  aclSupported: true,
}

const FALLBACK_VISIBLE: TabName[] = ['info', 'value', 'terminal', 'memory', 'pubsub', 'slow']

describe('normalizeTabsVisible', () => {
  it('过滤未知名称与重复项，并按注册顺序排列', () => {
    expect(normalizeTabsVisible(['slow', 'nope', 'slow', 'info'], FALLBACK_VISIBLE)).toEqual([
      'info',
      'slow',
    ])
  })

  it('非数组、空数组、全是未知名称时回落到默认集合', () => {
    expect(normalizeTabsVisible(undefined, FALLBACK_VISIBLE)).toEqual(FALLBACK_VISIBLE)
    expect(normalizeTabsVisible('info', FALLBACK_VISIBLE)).toEqual(FALLBACK_VISIBLE)
    expect(normalizeTabsVisible([], FALLBACK_VISIBLE)).toEqual(FALLBACK_VISIBLE)
    expect(normalizeTabsVisible(['x', 'y'], FALLBACK_VISIBLE)).toEqual(FALLBACK_VISIBLE)
  })

  it('返回新数组，不把默认值本身透给调用方', () => {
    expect(normalizeTabsVisible(null, FALLBACK_VISIBLE)).not.toBe(FALLBACK_VISIBLE)
  })
})

describe('resolveTabsVisible', () => {
  it('清洗设置里的可见集合，按注册顺序排列', () => {
    expect(resolveTabsVisible(['chart', 'info', 'nope', 'info'])).toEqual(['info', 'chart'])
  })

  it('设置项为空时回落到默认集合', () => {
    expect(resolveTabsVisible(undefined)).toEqual(DEFAULT_TABS_VISIBLE)
  })
})

describe('isTabName', () => {
  it('按注册表判断', () => {
    expect(isTabName('info')).toBe(true)
    expect(isTabName('chart')).toBe(true)
    expect(isTabName('unknown')).toBe(false)
    expect(isTabName(1)).toBe(false)
  })
})

describe('isTabAvailable', () => {
  it('极简模式只保留键值、终端、工作台', () => {
    const ctx = { ...FULL, minimal: true }
    expect(TAB_NAMES.filter(name => isTabAvailable(name, ctx))).toEqual([
      'value',
      'terminal',
      'workbench',
    ])
  })

  it('信息、搜索、内存、图表跟随能力位，慢日志等只要非极简即可用', () => {
    const ctx: TabAvailabilityCtx = {
      minimal: false,
      infoSupported: false,
      searchSupported: false,
      memorySupported: false,
      aclSupported: false,
    }
    expect(isTabAvailable('info', ctx)).toBe(false)
    expect(isTabAvailable('chart', ctx)).toBe(false)
    expect(isTabAvailable('client', ctx)).toBe(false)
    expect(isTabAvailable('config', ctx)).toBe(false)
    expect(isTabAvailable('acl', ctx)).toBe(false)
    expect(isTabAvailable('search', ctx)).toBe(false)
    expect(isTabAvailable('memory', ctx)).toBe(false)
    expect(isTabAvailable('slow', ctx)).toBe(true)
    expect(isTabAvailable('value', ctx)).toBe(true)
  })

  it('客户端/配置只看 INFO，ACL 还要 aclSupported', () => {
    const noAcl: TabAvailabilityCtx = { ...FULL, aclSupported: false }
    expect(isTabAvailable('client', noAcl)).toBe(true)
    expect(isTabAvailable('config', noAcl)).toBe(true)
    expect(isTabAvailable('acl', noAcl)).toBe(false)
    expect(isTabAvailable('acl', FULL)).toBe(true)
  })
})

describe('页签文案', () => {
  it('注册表里的每个页签都有中文文案', () => {
    const tabMain = zhCn.tabMain as Record<string, string>
    for (const name of TAB_NAMES) {
      expect(tabMain[name], name).toBeTruthy()
    }
  })
})

describe('firstAvailableTab', () => {
  it('取可见集合里注册顺序最靠前的可用页签', () => {
    expect(firstAvailableTab(['slow', 'value', 'terminal'], FULL)).toBe('value')
    expect(firstAvailableTab(['pubsub', 'memory'], FULL)).toBe('memory')
  })

  it('最靠前的不可用时往后顺延', () => {
    const ctx: TabAvailabilityCtx = { ...FULL, memorySupported: false }
    expect(firstAvailableTab(['memory', 'pubsub'], ctx)).toBe('pubsub')
  })

  it('可见项都不可用时回落到第一个可用页签', () => {
    const ctx: TabAvailabilityCtx = {
      minimal: false,
      infoSupported: false,
      searchSupported: true,
      memorySupported: false,
      aclSupported: false,
    }
    expect(firstAvailableTab(['info', 'memory'], ctx)).toBe('value')
    expect(firstAvailableTab([], ctx)).toBe('value')
  })
})
