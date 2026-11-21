/** 工作台结果标题和文本截断。编辑器全文或选区当作一条命令，换行不在这里切开。 */

/** 空白收成一格。标题和「是不是同一条命令」都用这个。 */
export function collapseWorkbenchSpace(command: string): string {
  return command.replace(/\s+/g, ' ').trim()
}

export function workbenchTitle(command: string): string {
  const one = collapseWorkbenchSpace(command)
  return one.length > 48 ? `${one.slice(0, 48)}…` : one
}

/** 结果文本只留前若干行。调用方另显示截断说明，避免说明被复制进正文。 */
export function capResultLines(
  text: string,
  maxLines: number,
): { text: string; truncated: boolean } {
  let lines = 1
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') continue
    lines += 1
    if (lines > maxLines) return { text: text.slice(0, i), truncated: true }
  }
  return { text, truncated: false }
}
