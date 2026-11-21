/** 结果标签：新命令追加到末尾；同一条命令再执行就覆盖原标签。关掉靠叉号。 */
import { collapseWorkbenchSpace } from '@/utils/redis/workbench-script'

/** 命令名不区分大小写，后面的键名保持原样。 */
function commandKey(command: string): string {
  const one = collapseWorkbenchSpace(command)
  const space = one.indexOf(' ')
  if (space < 0) return one.toLowerCase()
  return one.slice(0, space).toLowerCase() + one.slice(space)
}

export interface WorkbenchResult {
  /** 重跑时用的原命令，不截断 */
  command: string
  title: string
  text: string
  error: boolean
  ms: number
  truncated: boolean
}

export interface WorkbenchTab extends WorkbenchResult {
  id: string
}

export function applyWorkbenchRun(
  tabs: WorkbenchTab[],
  results: WorkbenchResult[],
  nextId: () => string,
): { tabs: WorkbenchTab[]; activeId: string } {
  if (results.length === 0) return { tabs, activeId: tabs.at(-1)?.id ?? '' }
  const next = tabs.map(tab => ({ ...tab }))
  const indexByKey = new Map(next.map((tab, index) => [commandKey(tab.command), index]))
  let activeId = ''
  for (const result of results) {
    const key = commandKey(result.command)
    const slot = indexByKey.get(key)
    if (slot === undefined) {
      const tab: WorkbenchTab = { ...result, id: nextId() }
      indexByKey.set(key, next.length)
      next.push(tab)
      activeId = tab.id
      continue
    }
    const prev = next[slot]!
    next[slot] = { ...prev, ...result }
    activeId = prev.id
  }
  return { tabs: next, activeId }
}
