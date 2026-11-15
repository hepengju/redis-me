import { describe, expect, it } from 'vite-plus/test'

import type { ConnFromStore } from '@/utils/conn/conn-compat'
import { DEFAULT_PROXY_OPTION, DEFAULT_SSH_OPTION, checkConnList } from '@/utils/conn/conn-compat'

function run(conn: Record<string, unknown>): ConnFromStore {
  const list = [conn as ConnFromStore]
  checkConnList(list)
  return list[0]!
}

describe('checkConnList', () => {
  it('缺字段的旧连接补上哨兵、meta、SSH、代理和 db', () => {
    const conn = run({})
    expect(conn.sentinel).toBe(false)
    expect(conn.sentinelOption).toEqual({ masterName: '', masterUsername: '', masterPassword: '' })
    expect(conn.meta).toEqual({})
    expect(conn.ssh).toBe(false)
    expect(conn.sshOption).toEqual(DEFAULT_SSH_OPTION)
    expect(conn.proxy).toBe(false)
    expect(conn.proxyOption).toEqual(DEFAULT_PROXY_OPTION)
    expect(conn.db).toBe(0)
  })

  it('扁平哨兵字段迁进 sentinelOption 后删除；已有主名不覆盖', () => {
    const conn = run({
      sentinel: true,
      sentinelOption: { masterName: 'kept', masterUsername: '', masterPassword: '' },
      masterName: 'legacy',
      masterUsername: 'user',
      masterPassword: 'secret',
    })
    expect(conn.sentinel).toBe(true)
    expect(conn.sentinelOption).toEqual({
      masterName: 'kept',
      masterUsername: 'user',
      masterPassword: 'secret',
    })
    expect(conn).not.toHaveProperty('masterName')
    expect(conn).not.toHaveProperty('masterUsername')
    expect(conn).not.toHaveProperty('masterPassword')
  })

  it('空的 sentinelOption 仍用扁平字段填满，空主名会被旧值盖上', () => {
    const conn = run({
      sentinelOption: {},
      masterName: 'm',
      masterUsername: '',
      masterPassword: 'p',
    })
    expect(conn.sentinelOption).toEqual({
      masterName: 'm',
      masterUsername: '',
      masterPassword: 'p',
    })
    expect(conn).not.toHaveProperty('masterName')
  })

  it('没有 sentinelOption 时用扁平字段填满', () => {
    const conn = run({ masterName: 'm', masterUsername: 'u', masterPassword: 'p' })
    expect(conn.sentinelOption).toEqual({
      masterName: 'm',
      masterUsername: 'u',
      masterPassword: 'p',
    })
  })

  it('非布尔的 sentinel / ssh / proxy 视为关闭', () => {
    const conn = run({ sentinel: 1, ssh: 'yes', proxy: 'yes' })
    expect(conn.sentinel).toBe(false)
    expect(conn.ssh).toBe(false)
    expect(conn.proxy).toBe(false)
  })

  it('meta.group 只保留 trim 后的字符串', () => {
    expect(run({ meta: { group: '  ops  ' } }).meta).toEqual({ group: 'ops' })
    expect(run({ meta: { group: 1 } }).meta).toEqual({})
    expect(run({ meta: null }).meta).toEqual({})
  })

  it('commandMap 清洗为小写原命令 → 非空映射', () => {
    const conn = run({
      meta: { commandMap: { ' GET ': '  myget  ', HGET: 'myhget', set: '', '': 'x', bad: 1 } },
    })
    expect(conn.meta).toEqual({ commandMap: { get: 'myget', hget: 'myhget' } })
  })

  it('非法或空的 commandMap 删除', () => {
    expect(run({ meta: { commandMap: [] } }).meta).toEqual({})
    expect(run({ meta: { commandMap: null } }).meta).toEqual({})
    expect(run({ meta: { commandMap: { get: '  ' } } }).meta).toEqual({})
  })

  it('keySeparator：自定义保留，空和默认冒号不落库', () => {
    expect(run({ meta: { keySeparator: ' / ' } }).meta).toEqual({ keySeparator: '/' })
    expect(run({ meta: { keySeparator: ' : ' } }).meta).toEqual({})
    expect(run({ meta: { keySeparator: '' } }).meta).toEqual({})
    expect(run({ meta: { keySeparator: 1 } }).meta).toEqual({})
  })

  it('protocol 只保留 resp3', () => {
    expect(run({ meta: { protocol: 'resp3' } }).meta).toEqual({ protocol: 'resp3' })
    expect(run({ meta: { protocol: 'resp2' } }).meta).toEqual({})
    expect(run({ meta: { protocol: 'RESP3' } }).meta).toEqual({})
    expect(run({ meta: {} }).meta).toEqual({})
  })

  it('已有 sshOption 补缺省字段；代理与默认值合并，端口 0 回退默认', () => {
    const conn = run({
      ssh: true,
      sshOption: { host: 'bastion', port: 2222 },
      proxy: true,
      proxyOption: { host: '10.0.0.8', port: 0, proxyMode: 'manual' },
    })
    expect(conn.ssh).toBe(true)
    expect(conn.sshOption).toEqual({ ...DEFAULT_SSH_OPTION, host: 'bastion', port: 2222 })
    expect(run({ sshOption: { host: 'bastion', port: 0 } }).sshOption?.port).toBe(
      DEFAULT_SSH_OPTION.port,
    )
    expect(conn.proxy).toBe(true)
    expect(conn.proxyOption).toEqual({
      ...DEFAULT_PROXY_OPTION,
      host: '10.0.0.8',
      port: DEFAULT_PROXY_OPTION.port,
      proxyMode: 'manual',
    })
  })

  it('代理或 SSH 字段是数组时用默认；db 为 null 时写成 0，已填的 db 保留', () => {
    const conn = run({ proxyOption: [], sshOption: [], db: null })
    expect(conn.proxyOption).toEqual(DEFAULT_PROXY_OPTION)
    expect(conn.sshOption).toEqual(DEFAULT_SSH_OPTION)
    expect(conn.db).toBe(0)
    expect(run({ db: 3 }).db).toBe(3)
    expect(run({ db: 0 }).db).toBe(0)
  })
})
