import { describe, expect, it } from 'vite-plus/test'

import type { AclUserDetail } from '@/types/tauri-specta'
import {
  buildAclExecutableCommand,
  buildAclPreviewCommand,
  buildAclSavePayload,
  createAclModelFromDetail,
  createDefaultAclModel,
  getAclPresetCommandRules,
  getReadonlyPresetCommandRules,
  formatChannelPatternLabel,
  formatKeyPatternLabel,
  normalizeSelectorInput,
  summarizeSelectors,
  sha256Hex,
} from '@/utils/redis/acl'

function sampleDetail(overrides: Partial<AclUserDetail> = {}): AclUserDetail {
  return {
    username: 'user1',
    enabled: true,
    nopass: false,
    flags: [],
    passwordHashes: ['2bfce0458e8f8e0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0'],
    commandRules: ['+@read'],
    keyPatterns: ['*'],
    channelPatterns: ['*'],
    selectors: [],
    ...overrides,
  }
}

describe('normalizeSelectorInput', () => {
  it('去掉外层括号并 trim', () => {
    expect(normalizeSelectorInput('  (-@all +set ~key2)  ')).toBe('-@all +set ~key2')
    expect(normalizeSelectorInput('-@all +get ~key1')).toBe('-@all +get ~key1')
  })
})

describe('getReadonlyPresetCommandRules', () => {
  it('单机连接默认不含 +cluster', () => {
    expect(getReadonlyPresetCommandRules(false)).toEqual(['+@read', '+@connection', '-@dangerous'])
  })

  it('集群连接：+cluster 在 -@dangerous 之前，保留 NODES/SLOTS、排除 MEET 等危险子命令', () => {
    expect(getReadonlyPresetCommandRules(true)).toEqual([
      '+@read',
      '+@connection',
      '+cluster',
      '-@dangerous',
    ])
  })
})

describe('getAclPresetCommandRules', () => {
  it('只读项随 cluster 切换默认列表', () => {
    expect(getAclPresetCommandRules('readonly', { cluster: false })).toEqual(
      getReadonlyPresetCommandRules(false),
    )
    expect(getAclPresetCommandRules('readonly', { cluster: true })).toEqual(
      getReadonlyPresetCommandRules(true),
    )
  })

  it('普通/管理员模板不受 cluster 影响', () => {
    expect(getAclPresetCommandRules('normal', { cluster: true })).toEqual(['+@all', '-@dangerous'])
    expect(getAclPresetCommandRules('admin', { cluster: true })).toEqual(['+@all'])
  })
})

describe('buildAclSavePayload', () => {
  it('编辑未改密码时沿用原 passwordHashes', async () => {
    const model = createAclModelFromDetail(sampleDetail())
    const payload = await buildAclSavePayload(model)
    expect(payload.passwordHashes).toEqual(sampleDetail().passwordHashes)
  })

  it('编辑 nopass 用户允许空 passwordHashes', async () => {
    const model = createAclModelFromDetail(sampleDetail({ nopass: true, passwordHashes: [] }))
    model.nopass = true
    const payload = await buildAclSavePayload(model)
    expect(payload.passwordHashes).toEqual([])
  })

  it('勾选 nopass 时忽略已有 hash', async () => {
    const model = createAclModelFromDetail(sampleDetail())
    model.nopass = true
    const payload = await buildAclSavePayload(model)
    expect(payload.passwordHashes).toEqual([])
  })

  it('新密码会转为 sha256 hash', async () => {
    const model = createDefaultAclModel()
    model.password = 'secret'
    const payload = await buildAclSavePayload(model)
    expect(payload.passwordHashes).toEqual([await sha256Hex('secret')])
  })

  it('键/频道模式去掉 ~ & 前缀并去重', async () => {
    const model = createDefaultAclModel()
    model.keyPatterns = ['~app:*', 'app:*']
    model.channelPatterns = ['&room:*', 'room:*']
    const payload = await buildAclSavePayload(model)
    expect(payload.keyPatterns).toEqual(['app:*'])
    expect(payload.channelPatterns).toEqual(['room:*'])
  })

  it('编辑保存时规范化 selectors', async () => {
    const model = createAclModelFromDetail(
      sampleDetail({ selectors: ['-@all +set ~key2', '(-@all +get ~key1)'] }),
    )
    const payload = await buildAclSavePayload(model)
    expect(payload.selectors).toEqual(['-@all +set ~key2', '-@all +get ~key1'])
  })
})

describe('buildAclExecutableCommand', () => {
  it('复制命令包含真实 password hash', async () => {
    const model = createDefaultAclModel()
    model.username = 'demo'
    model.password = 'secret'
    const cmd = await buildAclExecutableCommand(model)
    expect(cmd).toContain(`#${await sha256Hex('secret')}`)
    expect(cmd).not.toContain('<')
  })

  it('编辑未改密码时复制已保存 hash', async () => {
    const model = createAclModelFromDetail(sampleDetail())
    const cmd = await buildAclExecutableCommand(model)
    expect(cmd).toContain(`#${sampleDetail().passwordHashes[0]}`)
    expect(cmd).not.toContain('saved-hash')
  })
})

describe('buildAclPreviewCommand', () => {
  it('预览命令包含规范化后的模式前缀', () => {
    const model = createDefaultAclModel()
    model.username = 'demo'
    model.keyPatterns = ['~*']
    model.channelPatterns = ['&*']
    const preview = buildAclPreviewCommand(model)
    expect(preview).toContain('~*')
    expect(preview).toContain('&*')
    expect(preview).toContain('demo')
  })

  it('allkeys / allchannels 关键字不加 ~ & 前缀', () => {
    const model = createDefaultAclModel()
    model.username = 'demo'
    model.keyPatterns = ['allkeys']
    model.channelPatterns = ['allchannels']
    const preview = buildAclPreviewCommand(model)
    expect(preview).toContain('allkeys')
    expect(preview).toContain('allchannels')
    expect(preview).not.toContain('~allkeys')
    expect(preview).not.toContain('&allchannels')
  })

  it('预览命令包含 selector 括号段', () => {
    const model = createDefaultAclModel()
    model.username = 'demo'
    model.selectors = ['-@all +set ~key2']
    const preview = buildAclPreviewCommand(model)
    expect(preview).toContain('(-@all +set ~key2)')
  })
})

describe('summarizeSelectors', () => {
  it('空列表为 --，多条带括号摘要', () => {
    expect(summarizeSelectors([])).toBe('--')
    expect(summarizeSelectors(['-@all +set ~key2'])).toBe('(-@all +set ~key2)')
    expect(summarizeSelectors(['-@all +set ~key2', '-@all +get ~key1'], 1)).toContain('...')
  })
})

describe('formatKeyPatternLabel', () => {
  it('关键字原样展示，普通模式加前缀', () => {
    expect(formatKeyPatternLabel('allkeys')).toBe('allkeys')
    expect(formatKeyPatternLabel('app:*')).toBe('~app:*')
    expect(formatChannelPatternLabel('allchannels')).toBe('allchannels')
    expect(formatChannelPatternLabel('room:*')).toBe('&room:*')
  })
})
