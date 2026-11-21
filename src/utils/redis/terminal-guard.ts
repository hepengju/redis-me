import { parseCommandName } from '@/locales/cmd'

/** 订阅类：会把共享连接切进订阅态。终端和工作台都不发，改去发布订阅面板。 */
export const subscribeCommands = new Set([
  'SUBSCRIBE',
  'PSUBSCRIBE',
  'SSUBSCRIBE',
  'UNSUBSCRIBE',
  'PUNSUBSCRIBE',
  'SUNSUBSCRIBE',
])

/** 阻塞 / 独占类：会挂住共享连接，界面其它操作一起卡住。 */
export const blockingCommands = new Set([
  'MONITOR',
  'BLPOP',
  'BRPOP',
  'BLMOVE',
  'BLMOVEM',
  'BRPOPLPUSH',
  'BLMPOP',
  'BZMPOP',
  'BZPOPMIN',
  'BZPOPMAX',
  'WAIT',
])

export type TerminalCommandKind =
  | 'subscribe'
  | 'monitor'
  | 'blocking'
  | 'select-invalid'
  | { select: number }

/** 不能原样打到共享连接的命令。普通命令返回 null。 */
export function classifyTerminalCommand(command: string): TerminalCommandKind | null {
  const name = parseCommandName(command)
  if (subscribeCommands.has(name)) return 'subscribe'
  if (name === 'MONITOR') return 'monitor'
  if (blockingCommands.has(name)) return 'blocking'
  if (name !== 'SELECT') return null

  const arg = command.trim().split(/\s+/)[1]
  const db = Number(arg)
  if (arg === undefined || arg === '' || !Number.isInteger(db) || db < 0) return 'select-invalid'
  return { select: db }
}
