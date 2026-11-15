// #region 实时流批量缓冲
// 高频实时流（键空间通知 / MONITOR / 发布订阅）共用：
// 事件到达时只做 O(1) 落普通数组，攒一批后按 flushMs 一次性并入响应式列表，
// 把「每条 unshift(O(N)) 头插」降为「每批一次」，避免长时间大数据量下压垮主线程。
import { onScopeDispose, ref, type Ref } from 'vue'

export interface RealtimeStreamOptions {
  // 软上限：超过则丢弃尾部最旧数据，防止长时间不清空撑爆内存 / 拖慢虚拟列表
  maxRows: number
  // 批量刷新间隔（毫秒）：约 5fps，肉眼流畅且大幅降低重渲染频率
  flushMs?: number
}

export interface RealtimeStream<T> {
  // 响应式列表（新→旧，天然时间倒序），供 filterDataList computed 与表格绑定
  list: Ref<T[]>
  // 事件回调里调用：入缓冲并安排一次刷新
  push: (row: T) => void
  // 立即并入缓冲（停订/停用时收尾，避免丢最后未满一批的数据）
  flush: () => void
  // 清空缓冲与列表（清空按钮）
  clear: () => void
}

export function createRealtimeStream<T>(options: RealtimeStreamOptions): RealtimeStream<T> {
  const { maxRows, flushMs = 200 } = options
  const list = ref<T[]>([]) as Ref<T[]>
  const buffer: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function flush() {
    clearTimer()
    if (!buffer.length) return
    // 批内按到达顺序（旧→新）；表头需新→旧，故倒序后前置合并，列表保持时间倒序
    const batch = buffer.splice(0).reverse()
    const merged = batch.concat(list.value)
    list.value = merged.length > maxRows ? merged.slice(0, maxRows) : merged
  }

  function push(row: T) {
    buffer.push(row)
    if (timer === null) timer = setTimeout(flush, flushMs)
  }

  function clear() {
    clearTimer()
    buffer.length = 0
    list.value = []
  }

  // 组件作用域销毁时自动清理定时器，避免悬挂回调（各页面无需手动调用）
  onScopeDispose(clearTimer)

  return { list, push, flush, clear }
}
// #endregion

// #region 关键字过滤短路
// filterDataList computed 共用：无关键字时直接复用同一数组引用，
// 避免每条新数据都新建整表副本触发虚拟列表重渲染。
export function filterByKeyword<T>(
  list: T[],
  keyword: string,
  match: (row: T, key: string) => boolean,
): T[] {
  const key = keyword.toLowerCase()
  if (!key) return list
  return list.filter(row => match(row, key))
}
// #endregion
