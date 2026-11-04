import { describe, expect, it } from 'vite-plus/test'

import type { UiConn } from '@/types/me-interface'
import {
  buildConnGroupSections,
  buildRedisUrl,
  connsInGroupOrder,
  isConnMinimalMode,
} from '@/utils/conn'

describe('buildRedisUrl', () => {
  it('基本单机：redis://host:port', () => {
    expect(buildRedisUrl({ host: '127.0.0.1', port: 6379 })).toBe('redis://127.0.0.1:6379')
  })

  it('TLS：rediss:// 协议', () => {
    expect(buildRedisUrl({ host: 'redis.example.com', port: 6380, ssl: true })).toBe(
      'rediss://redis.example.com:6380',
    )
  })

  it('含用户名和密码', () => {
    expect(
      buildRedisUrl({ host: '10.0.0.1', port: 6379, username: 'admin', password: 's3cret' }),
    ).toBe('redis://admin:s3cret@10.0.0.1:6379')
  })

  it('仅密码无用户名', () => {
    expect(buildRedisUrl({ host: '10.0.0.1', port: 6379, password: 'pass' })).toBe(
      'redis://:pass@10.0.0.1:6379',
    )
  })

  it('密码含特殊字符自动编码', () => {
    expect(
      buildRedisUrl({ host: '10.0.0.1', port: 6379, username: 'user', password: 'p@ss:w/rd' }),
    ).toBe('redis://user:p%40ss%3Aw%2Frd@10.0.0.1:6379')
  })

  it('db > 0 时追加路径', () => {
    expect(buildRedisUrl({ host: '127.0.0.1', port: 6379, db: 3 })).toBe('redis://127.0.0.1:6379/3')
  })

  it('db = 0 时不追加路径', () => {
    expect(buildRedisUrl({ host: '127.0.0.1', port: 6379, db: 0 })).toBe('redis://127.0.0.1:6379')
  })

  it('IPv6 地址自动加方括号', () => {
    expect(buildRedisUrl({ host: '::1', port: 6379 })).toBe('redis://[::1]:6379')
  })

  it('已有方括号的 IPv6 不重复加', () => {
    expect(buildRedisUrl({ host: '[::1]', port: 6379 })).toBe('redis://[::1]:6379')
  })

  it('空 host 默认 127.0.0.1', () => {
    expect(buildRedisUrl({ host: '', port: 6379 })).toBe('redis://127.0.0.1:6379')
  })

  it('RESP3 协议追加查询参数', () => {
    expect(buildRedisUrl({ host: '127.0.0.1', port: 6379, protocol: 'resp3' })).toBe(
      'redis://127.0.0.1:6379?protocol=resp3',
    )
  })

  it('RESP3 + db + TLS 组合', () => {
    expect(
      buildRedisUrl({ host: '10.0.0.1', port: 6380, ssl: true, db: 2, protocol: 'resp3' }),
    ).toBe('rediss://10.0.0.1:6380/2?protocol=resp3')
  })

  it('resp2 不追加查询参数', () => {
    expect(buildRedisUrl({ host: '127.0.0.1', port: 6379, protocol: 'resp2' })).toBe(
      'redis://127.0.0.1:6379',
    )
  })

  it('Unix 套接字：路径、账号和协议走 query', () => {
    expect(
      buildRedisUrl({
        host: '',
        port: 6379,
        network: 'unix',
        socketPath: '/var/run/redis.sock',
        username: 'u',
        password: 'p@ss',
        db: 2,
        protocol: 'resp3',
      }),
    ).toBe('unix:///var/run/redis.sock?user=u&pass=p%40ss&db=2&protocol=resp3')
  })

  it('路径中的空格会被编码', () => {
    expect(
      buildRedisUrl({ host: '', port: 6379, network: 'unix', socketPath: '/tmp/my redis.sock' }),
    ).toBe('unix:///tmp/my%20redis.sock')
  })
})

describe('isConnMinimalMode', () => {
  const conn = (meta: Record<string, unknown> = {}) => ({ meta }) as unknown as UiConn

  it('meta.uiMode=minimal 为真', () => {
    expect(isConnMinimalMode(conn({ uiMode: 'minimal' }))).toBe(true)
  })

  it('缺省或其它值不为极简', () => {
    expect(isConnMinimalMode(null)).toBe(false)
    expect(isConnMinimalMode(conn())).toBe(false)
    expect(isConnMinimalMode(conn({ uiMode: 'normal' }))).toBe(false)
  })
})

describe('buildConnGroupSections', () => {
  it('无连接时仍保留已登记的有名空分组', () => {
    const sections = buildConnGroupSections([], ['生产', '开发'], '')
    expect(sections.map(s => s.key)).toEqual(['生产', '开发'])
    expect(sections.every(s => s.conns.length === 0)).toBe(true)
  })

  it('无连接且未登记分组时不出现默认分组', () => {
    expect(buildConnGroupSections([], [], '')).toEqual([])
  })
})

describe('connsInGroupOrder', () => {
  const c = (id: string, group = '') => ({ id, meta: group ? { group } : {} }) as UiConn

  it('按分组顺序展开，组内保持原相对顺序，默认分组在最后', () => {
    const list = [c('d'), c('b', 'ValKey'), c('a', '常用'), c('e', '常用')]
    expect(connsInGroupOrder(list, ['常用', 'ValKey']).map(x => x.id)).toEqual(['a', 'e', 'b', 'd'])
  })
})
