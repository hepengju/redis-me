/**
 * 值区展示语法简易推断（wire 解码之后的纯文本层，与 detect-view-format 的编解码识别互补）。
 * 只做轻量特征判断，不做完整解析：误判代价仅是配色风格不同，可接受。
 * 优先级：INI → JSON / XML → YAML / Markdown（按命中行数计分，同分偏向 YAML）→ 纯文本。
 * - INI：首行 `[section]` 且存在 `key=value` 行（抢在 json 的 `[` 起始规则前，否则配置片段会被误判 json）。
 * - JSON：去空白后以 { 或 [ 开头即判（不要求尾部配对，半截/解码失败的值也维持 json 上色）。
 *   方括号开头的日志文本属已知误判，代价仅是颜色不对，换取规则简单。
 * - XML：起始 `<` 即判（报文/配置片段特征极强，几乎无误判面；legacy-modes 有现成 xml 模式）。
 * - YAML：`---` 文档头，或成片的 `key:` / `- ` 行。
 * - Markdown：# 标题、``` 围栏、[a](b) 链接、**加粗** 等明显特征；纯文本误判成
 *   markdown 只是部分字符着色，观感仍优于整片单色。
 */
export type CodeMode = 'json' | 'yaml' | 'markdown' | 'xml' | 'properties' | 'text'

/** `key:` 行：键为引号串或 \w/./$/- 字符，冒号后为空或跟空格（值可另起行） */
const YAML_KEY_RE = /^\s*(?:"[^"]+"|'[^']+'|[\w.$-]+):(\s.*)?$/
const YAML_DOC_START_RE = /^\s*---\s*$/
/** yaml 行特征：`key:` 行或 `- ` 列表项（与 markdown 列表歧义，同分时由偏向 yaml 兼顾） */
const YAML_LINE_RES = [YAML_KEY_RE, /^\s*-\s+[\w"']/]
/** INI：段头 `[name]` 独占一行；`key=value` 行用于与方括号开头的日志文本区分 */
const INI_SECTION_RE = /^\[[\w .-]+\]$/
const INI_KV_RE = /^\s*[\w.$-]+\s*=/
/** markdown 特征：标题 / 围栏 / 列表 / 引用 / 加粗 / 链接 / 分隔线 */
const MD_LINE_RES: RegExp[] = [
  /^#{1,6}\s+\S/,
  /^\s*```/,
  /^\s*[-*+]\s+\S/,
  /^\s*>\s+\S/,
  /\*\*[^*\n]+\*\*/,
  /\[[^\]\n]*\]\([^)\n]*\)/,
  /^\s*(\*|-|_){3,}\s*$/,
]

/** 按行统计特征命中数（同一行多个特征只记一次），达到 limit 提前退出 */
function countMatches(text: string, res: RegExp[], limit: number): number {
  let score = 0
  for (const line of text.split('\n')) {
    if (res.some(re => re.test(line))) {
      score++
      if (score >= limit) break
    }
  }
  return score
}

export function detectCodeMode(text: string): CodeMode {
  const trimmed = text.trim()
  if (!trimmed) return 'text'
  // 只看前 200 行，大文档足够定形且控制开销
  const lines = trimmed.split('\n')

  // INI 配置片段：首行段头 + 至少一行 key=value（仅段头更像日志前缀，不抢）
  if (INI_SECTION_RE.test(lines[0]) && lines.some(l => INI_KV_RE.test(l))) return 'properties'
  // json ⊂ yaml：起始是 { / [ 就先判 json，尾部不配对也不回退
  if (trimmed[0] === '{' || trimmed[0] === '[') return 'json'
  // xml：起始 `<` 即判，同 json 的宽松手法
  if (trimmed[0] === '<') return 'xml'

  const head = lines.slice(0, 200).join('\n')
  const yamlScore =
    (YAML_DOC_START_RE.test(lines[0]) ? 2 : 0) + countMatches(head, YAML_LINE_RES, 3)
  const mdScore = countMatches(head, MD_LINE_RES, 3)
  if (yamlScore === 0 && mdScore === 0) return 'text'
  // 同分偏向 YAML：误判成 yaml 后正文多按字符串着色，比 markdown 染色更接近纯文本
  return yamlScore >= mdScore ? 'yaml' : 'markdown'
}
