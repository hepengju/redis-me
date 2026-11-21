/** 结果标签：新命令追加到末尾；同一条命令再执行就覆盖原标签。关掉靠叉号。 */
import type { WorkbenchTable } from '@/types/tauri-specta'
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
  /** 返回原文的字符数。界面截断后仍用这个数；失败不展示。 */
  len: number
  error: boolean
  ms: number
  truncated: boolean
  /** 点名命令才有。没有表时界面只显示文本。 */
  table: WorkbenchTable | null
}

export interface WorkbenchTab extends WorkbenchResult {
  id: string
  /** 有表时默认表。已经手动切过的，再执行仍留在原来的视图。 */
  view: 'text' | 'table'
}

/** 一次一条。同一条命令盖住原标签，否则追加到末尾。 */
export function applyWorkbenchRun(
  tabs: WorkbenchTab[],
  result: WorkbenchResult,
  nextId: () => string,
): { tabs: WorkbenchTab[]; activeId: string } {
  const next = tabs.map(tab => ({ ...tab }))
  const key = commandKey(result.command)
  const slot = next.findIndex(tab => commandKey(tab.command) === key)
  if (slot < 0) {
    const tab: WorkbenchTab = { ...result, id: nextId(), view: result.table ? 'table' : 'text' }
    next.push(tab)
    return { tabs: next, activeId: tab.id }
  }
  const prev = next[slot]!
  next[slot] = {
    ...prev,
    ...result,
    view: result.table ? (prev.table ? prev.view : 'table') : 'text',
  }
  return { tabs: next, activeId: prev.id }
}
