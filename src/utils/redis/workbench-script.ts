/** 工作台脚本：引号外的换行结束一条命令，引号内的换行仍属同一条。 */

export interface ScriptCommand {
  /** 去掉首尾空白后发给服务器的文本，引号内换行保留 */
  text: string
  /** 在原文中的起点，含行首空白 */
  from: number
  /** 光标停在这条命令末尾（换行符的位置，或文末）仍算这条 */
  end: number
}

export function splitWorkbenchScript(source: string): ScriptCommand[] {
  const commands: ScriptCommand[] = []
  let start = 0
  let quote: '"' | "'" | null = null

  const flush = (end: number) => {
    const text = source.slice(start, end).trim()
    // 整行以 # 开头是注释。引号里的 # 不会走到这里单独成行
    if (text && !text.startsWith('#')) commands.push({ text, from: start, end })
  }

  for (let i = 0; i < source.length;) {
    const ch = source[i]!
    if (quote) {
      if (quote === '"' && ch === '\\' && i + 1 < source.length) {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      flush(i)
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      i += 1
      start = i
      continue
    }
    i += 1
  }
  flush(source.length)
  return commands
}

/** 光标落在空白行、注释行上时没有命令 */
export function commandAt(commands: ScriptCommand[], offset: number): ScriptCommand | null {
  return commands.find(command => offset >= command.from && offset <= command.end) ?? null
}

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
