import type { ConnConfig } from '@/types/tauri-specta'
import { DEFAULT_KEY_SEPARATOR } from '@/utils/conn'

/** 本地 store / 旧版数据：字段可能缺失，或含已迁移的扁平哨兵字段 */
export type ConnFromStore = { [K in keyof ConnConfig]?: ConnConfig[K] } & Record<string, unknown>

/** 代理默认值；勾选后默认系统模式便于立刻检测；系统模式不使用这些 host/port（每次建连实时检测） */
export const DEFAULT_PROXY_OPTION = {
  proxyMode: 'system',
  proxyType: 'http',
  host: '127.0.0.1',
  port: 7897,
  username: '',
  password: '',
}

/**
 * 连接数据兼容性处理（版本迁移）
 * - v1.6.0: 补充哨兵模式属性，迁移 masterName/masterUsername/masterPassword → sentinelOption
 * - v2.5.0: 补充 meta 属性，处理 group 字段
 * - v2.7.0: 补充 SSH 属性
 */
export function checkConnList(connList: ConnFromStore[]): void {
  connList.forEach(conn => {
    // v1.6.0 兼容旧版本，补充哨兵模式属性;
    // v2.7.0 属性移动到sentinelOption中
    if (!('sentinel' in conn) || typeof conn.sentinel != 'boolean') conn.sentinel = false
    if (!conn.sentinelOption)
      conn.sentinelOption = { masterName: '', masterUsername: '', masterPassword: '' }
    const so = conn.sentinelOption

    const legacyMasterName = conn['masterName']
    const legacyMasterUsername = conn['masterUsername']
    const legacyMasterPassword = conn['masterPassword']
    if (typeof legacyMasterName === 'string' && !so.masterName) so.masterName = legacyMasterName
    if (typeof legacyMasterUsername === 'string' && !so.masterUsername)
      so.masterUsername = legacyMasterUsername
    if (typeof legacyMasterPassword === 'string' && !so.masterPassword)
      so.masterPassword = legacyMasterPassword
    if ('masterName' in conn) delete conn.masterName
    if ('masterUsername' in conn) delete conn.masterUsername
    if ('masterPassword' in conn) delete conn.masterPassword

    // v2.5.0 兼容旧版本，补充meta属性
    if (!('meta' in conn) || typeof conn.meta !== 'object' || conn.meta === null) conn.meta = {}
    const meta = conn.meta as Record<string, unknown>
    const group = meta['group']
    if (group !== undefined && typeof group !== 'string') delete meta['group']
    else if (typeof group === 'string') meta['group'] = group.trim()

    // 命令映射：meta.commandMap 为 { 原命令小写: 映射名 }
    const commandMap = meta['commandMap']
    if (commandMap !== undefined) {
      if (!commandMap || typeof commandMap !== 'object' || Array.isArray(commandMap)) {
        delete meta['commandMap']
      } else {
        const cleaned: Record<string, string> = {}
        for (const [k, v] of Object.entries(commandMap as Record<string, unknown>)) {
          const cmd = typeof k === 'string' ? k.trim().toLowerCase() : ''
          const mapped = typeof v === 'string' ? v.trim() : ''
          if (cmd && mapped) cleaned[cmd] = mapped
        }
        if (Object.keys(cleaned).length) meta['commandMap'] = cleaned
        else delete meta['commandMap']
      }
    }

    // 树形键分隔符：非字符串删除；空 / 默认值不落库
    const keySeparator = meta['keySeparator']
    if (keySeparator !== undefined) {
      if (typeof keySeparator !== 'string') {
        delete meta['keySeparator']
      } else {
        const sep = keySeparator.trim()
        if (!sep || sep === DEFAULT_KEY_SEPARATOR) delete meta['keySeparator']
        else meta['keySeparator'] = sep
      }
    }

    // 通信协议：仅保留 resp3，其余（含默认 resp2 / 非法值）删除
    const protocol = meta['protocol']
    if (protocol !== undefined && protocol !== 'resp3') delete meta['protocol']

    // v2.7.0 兼容旧版本，补充SSH属性
    if (!('ssh' in conn) || typeof conn.ssh != 'boolean') conn.ssh = false
    if (!conn.sshOption)
      conn.sshOption = {
        host: '',
        port: 22,
        loginType: 'pwd', // pwd 用户名/密码, pkfile 私钥文件
        username: '',
        password: '',
        pkfile: '', // 私钥文件
        passphrase: '', // 私钥密码
      }

    // 网络代理：旧连接缺字段视为未开。RedisME 导入若已有字段则保留；竞品转换不映射代理。
    if (!('proxy' in conn) || typeof conn.proxy != 'boolean') conn.proxy = false
    const po = conn.proxyOption
    const poObj = po && typeof po === 'object' && !Array.isArray(po) ? po : {}
    conn.proxyOption = { ...DEFAULT_PROXY_OPTION, ...poObj }
    if (!conn.proxyOption.port) conn.proxyOption.port = DEFAULT_PROXY_OPTION.port

    // db 未填或为 null 时默认赋值 0
    if (conn.db == null) conn.db = 0
  })
}
