/** 终端和工作台共用的命令名匹配。排序与原先终端提示一致，最多 20 条。 */

const HINT_LIMIT = 20

export interface RankedCommandHint<T extends { key: string }> {
  item: T
  /** 终端下拉用的命令名，命中片段包在 t-cmd-key 里 */
  html: string
}

/** 空输入返回空数组。调用方仍要先判断是否还在输入命令名。 */
export function rankCommandHints<T extends { key: string }>(
  input: string,
  store: readonly T[],
): RankedCommandHint<T>[] {
  const inputTrimmed = input.trim()
  if (!inputTrimmed || store.length === 0) return []

  const inputParts = inputTrimmed.split(/\s+/).filter(part => part)
  const firstWord = inputParts[0]?.toLowerCase() ?? ''
  const normalizedInput = inputParts.join(' ').toUpperCase()

  let matched: T[] = []
  if (inputParts.length === 1) {
    matched = store.filter(cmd => cmd.key.toLowerCase().includes(firstWord))
  } else {
    let found = store.filter(cmd =>
      cmd.key.replace(/\s+/g, ' ').toUpperCase().startsWith(normalizedInput),
    )
    if (found.length === 0) {
      for (let i = inputParts.length - 1; i > 0; i--) {
        const shortInput = inputParts.slice(0, i).join(' ').toUpperCase()
        found = store.filter(cmd =>
          cmd.key.replace(/\s+/g, ' ').toUpperCase().startsWith(shortInput),
        )
        if (found.length > 0) break
      }
    }
    matched =
      found.length > 0 ? found : store.filter(cmd => cmd.key.toLowerCase().includes(firstWord))
  }

  const ranked = matched.map(cmd => {
    const cmdKey = cmd.key
    const cmdKeyLower = cmdKey.toLowerCase()
    const score: [number, number, number, number, number] = [0, 0, 0, 0, 0]

    if (firstWord.length === cmdKey.length) {
      score[0] = 1
    } else {
      score[1] = cmdKey.includes(inputParts[0] ?? '') ? 1 : 0
      score[2] = cmdKeyLower.indexOf(firstWord)
      let count = 0
      let idx = cmdKeyLower.indexOf(firstWord)
      while (idx !== -1) {
        count++
        idx = cmdKeyLower.indexOf(firstWord, idx + firstWord.length)
      }
      score[3] = count
      score[4] = cmdKey.length
    }

    return { item: cmd, html: highlightCommand(cmdKey, cmdKeyLower, inputParts), score }
  })

  ranked.sort((a, b) => compareHintScore(a.score, b.score))
  return ranked.slice(0, HINT_LIMIT).map(({ item, html }) => ({ item, html }))
}

function compareHintScore(
  scoreA: [number, number, number, number, number],
  scoreB: [number, number, number, number, number],
): number {
  if (scoreA[0] === 1 && scoreA[0] === scoreB[0]) return 0
  if (scoreA[0] === 1) return -1
  if (scoreB[0] === 1) return 1
  if (scoreA[1] === scoreB[1]) {
    let res = scoreA[2] - scoreB[2]
    if (res === 0) {
      res = scoreB[3] - scoreA[3]
      if (res === 0) res = scoreA[4] - scoreB[4]
    }
    return res
  }
  return scoreB[1] - scoreA[1]
}

function highlightCommand(cmdKey: string, cmdKeyLower: string, inputParts: string[]): string {
  const highlights: { start: number; end: number }[] = []
  inputParts.forEach(part => {
    const partLower = part.toLowerCase()
    let startIdx = cmdKeyLower.indexOf(partLower)
    while (startIdx !== -1) {
      highlights.push({ start: startIdx, end: startIdx + part.length })
      startIdx = cmdKeyLower.indexOf(partLower, startIdx + part.length)
    }
  })
  highlights.sort((a, b) => a.start - b.start)

  const merged: { start: number; end: number }[] = []
  if (highlights.length > 0) {
    let current = highlights[0]!
    for (let i = 1; i < highlights.length; i++) {
      const next = highlights[i]!
      if (next.start < current.end) current.end = Math.max(current.end, next.end)
      else {
        merged.push(current)
        current = next
      }
    }
    merged.push(current)
  }

  let result = ''
  let lastIndex = 0
  merged.forEach(range => {
    result += cmdKey.substring(lastIndex, range.start)
    result += `<span class="t-cmd-key">${cmdKey.substring(range.start, range.end)}</span>`
    lastIndex = range.end
  })
  return result + cmdKey.substring(lastIndex)
}
