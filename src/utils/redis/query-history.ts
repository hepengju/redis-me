/** FT.SEARCH 查询条件历史。搜索页和键区 Search 模式共用同一份 localStorage。 */

export const FT_QUERY_HISTORY_KEY = 'redis-me:ft-query-history'

const MAX_FT_QUERY_HISTORY = 10

/** 空串和 * 不记。相同条件提到最前，最多 10 条。 */
export function rememberFtQuery(history: string[], query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed || trimmed === '*') return history
  return [trimmed, ...history.filter(item => item !== trimmed)].slice(0, MAX_FT_QUERY_HISTORY)
}
