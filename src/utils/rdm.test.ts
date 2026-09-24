import { describe, expect, it } from 'vite-plus/test'

import { getConnGroup, mergeConnGroupsFromList } from '@/utils/conn'
import { checkConnList } from '@/utils/conn-compat'
import {
  ConnImportParseError,
  encodeRedisMeConnectionsToMec,
  parseAnotherRdmFromAno,
  parseRedisMeConnections,
} from '@/utils/rdm'

/** 与 `.ano` 一致：UTF-8 JSON → Base64 */
function toAno(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function expectParseErr(content: string, i18nKey: string): void {
  try {
    parseAnotherRdmFromAno(content)
    expect.unreachable('should throw')
  } catch (e) {
    expect(e).toBeInstanceOf(ConnImportParseError)
    expect((e as ConnImportParseError).i18nKey).toBe(i18nKey)
  }
}

describe('parseAnotherRdmFromAno', () => {
  it('旧版顶层数组：映射字段且无分组', () => {
    const list = parseAnotherRdmFromAno(
      toAno([
        {
          key: 'k1',
          host: '10.0.0.1',
          port: 6380,
          connectionName: 'prod',
          username: 'u',
          auth: 'p',
          cluster: true,
          connectionReadOnly: true,
          color: '#ff0000',
        },
      ]),
    )
    expect(list).toHaveLength(1)
    const c = list[0]!
    expect(c.id).toBe('another-k1')
    expect(c.name).toBe('prod')
    expect(c.host).toBe('10.0.0.1')
    expect(c.port).toBe(6380)
    expect(c.username).toBe('u')
    expect(c.password).toBe('p')
    expect(c.cluster).toBe(true)
    expect(c.readonly).toBe(true)
    expect(c.color).toBe('#ff0000')
    expect(getConnGroup(c)).toBe('')
    expect(c.proxy).toBe(false)
  })

  it('旧版数组里偶带 groupId 也不当分组（无 groups 表）', () => {
    const list = parseAnotherRdmFromAno(
      toAno([{ host: '127.0.0.1', port: 6379, groupId: 'g1', key: 'a' }]),
    )
    expect(getConnGroup(list[0]!)).toBe('')
  })

  it('新版 {connections, groups}：命中的 groupId 写入 meta.group', () => {
    const list = parseAnotherRdmFromAno(
      toAno({
        groups: [
          { id: 'g-prod', name: '生产' },
          { id: 'g-dev', name: '开发' },
        ],
        connections: [
          { key: 'c1', host: '10.0.0.1', port: 6379, name: 'a', groupId: 'g-prod' },
          { key: 'c2', host: '10.0.0.2', port: 6379, name: 'b', groupId: 'g-dev' },
          { key: 'c3', host: '10.0.0.3', port: 6379, name: 'c', groupId: null },
        ],
      }),
    )
    expect(list.map(c => c.name)).toEqual(['a', 'b', 'c'])
    expect(list.map(getConnGroup)).toEqual(['生产', '开发', ''])
  })

  it('未知 / 空 groupId、缺 name 的分组项 → 未分组；空分组不出现', () => {
    const list = parseAnotherRdmFromAno(
      toAno({
        groups: [
          { id: 'g-ok', name: '有人' },
          { id: 'g-empty', name: '空组' },
          { id: '', name: '无名id' },
          { id: 'g-noname', name: '   ' },
        ],
        connections: [
          { host: '1.1.1.1', port: 6379, name: 'ok', groupId: 'g-ok' },
          { host: '2.2.2.2', port: 6379, name: 'ghost', groupId: 'no-such' },
          { host: '3.3.3.3', port: 6379, name: 'blank', groupId: '' },
        ],
      }),
    )
    expect(getConnGroup(list.find(c => c.name === 'ok')!)).toBe('有人')
    expect(getConnGroup(list.find(c => c.name === 'ghost')!)).toBe('')
    expect(getConnGroup(list.find(c => c.name === 'blank')!)).toBe('')
    const groups: string[] = []
    mergeConnGroupsFromList(list, groups)
    expect(groups).toEqual(['有人'])
  })

  it('按 groups 数组顺序聚拢同组连接，未分组垫底', () => {
    const list = parseAnotherRdmFromAno(
      toAno({
        groups: [
          { id: 'g2', name: '第二' },
          { id: 'g1', name: '第一' },
        ],
        connections: [
          { host: '1.1.1.1', port: 6379, name: 'u', groupId: null },
          { host: '2.2.2.2', port: 6379, name: 'a1', groupId: 'g1' },
          { host: '3.3.3.3', port: 6379, name: 'b1', groupId: 'g2' },
          { host: '4.4.4.4', port: 6379, name: 'a2', groupId: 'g1' },
        ],
      }),
    )
    expect(list.map(c => c.name)).toEqual(['b1', 'a1', 'a2', 'u'])
    expect(list.map(getConnGroup)).toEqual(['第二', '第一', '第一', ''])
    const groups: string[] = []
    mergeConnGroupsFromList(list, groups)
    expect(groups).toEqual(['第二', '第一'])
  })

  it('新版无 groups 字段时仍导入连接', () => {
    const list = parseAnotherRdmFromAno(
      toAno({ connections: [{ host: '127.0.0.1', port: 6379, key: 'x', groupId: 'g1' }] }),
    )
    expect(list).toHaveLength(1)
    expect(list[0]!.host).toBe('127.0.0.1')
    expect(getConnGroup(list[0]!)).toBe('')
  })

  it('SSH / Sentinel 在新版对象里仍映射', () => {
    const list = parseAnotherRdmFromAno(
      toAno({
        connections: [
          {
            host: '10.0.0.8',
            port: 6379,
            sshOptions: { host: 'jump', port: 22, username: 'root', password: 'x' },
            sentinelOptions: { masterName: 'mymaster', nodePassword: 'np' },
          },
        ],
        groups: [],
      }),
    )
    const c = list[0]!
    expect(c.ssh).toBe(true)
    expect(c.sshOption.host).toBe('jump')
    expect(c.sentinel).toBe(true)
    expect(c.sentinelOption.masterName).toBe('mymaster')
    expect(c.sentinelOption.masterPassword).toBe('np')
  })

  it('缺 host / 非法端口报格式错误', () => {
    expectParseErr(toAno([{ host: '', port: 6379 }]), 'conn.importFormatErr')
    expectParseErr(toAno([{ host: '127.0.0.1', port: 0 }]), 'conn.importPortErr')
    expectParseErr(toAno({ connections: [{ host: 'h', port: 99999 }] }), 'conn.importPortErr')
  })

  it('空列表 / 非连接结构报无有效连接', () => {
    expectParseErr(toAno([]), 'conn.importConnErr')
    expectParseErr(toAno({ connections: [] }), 'conn.importConnErr')
    expectParseErr(toAno({ groups: [{ id: 'g', name: 'x' }] }), 'conn.importConnErr')
    expectParseErr(toAno({ foo: 1 }), 'conn.importConnErr')
  })

  it('非法 Base64 / 非 JSON 报对应错误', () => {
    expectParseErr('!!!not-base64!!!', 'conn.importAnoDecodeErr')
    expectParseErr(btoa('not-json'), 'conn.importJsonErr')
  })
})

describe('parseRedisMeConnections', () => {
  it('保留自身 JSON / .mec 中的代理字段', () => {
    const list = parseRedisMeConnections(
      JSON.stringify([
        {
          id: 'id1',
          name: 'with-proxy',
          host: '10.0.0.1',
          port: 6379,
          proxy: true,
          proxyOption: {
            proxyMode: 'manual',
            proxyType: 'socks5',
            host: '127.0.0.1',
            port: 1080,
            username: 'u',
            password: 'secret',
          },
        },
      ]),
    )
    expect(list).toHaveLength(1)
    expect(list[0]!.proxy).toBe(true)
    expect(list[0]!.proxyOption).toEqual({
      proxyMode: 'manual',
      proxyType: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      username: 'u',
      password: 'secret',
    })

    const round = parseRedisMeConnections(encodeRedisMeConnectionsToMec(list))
    checkConnList(round)
    expect(round[0]!.proxy).toBe(true)
    expect(round[0]!.proxyOption?.proxyType).toBe('socks5')
    expect(round[0]!.proxyOption?.port).toBe(1080)
    expect(round[0]!.proxyOption?.password).toBe('secret')
  })
})
