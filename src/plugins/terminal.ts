import type { App } from 'vue'
import type { Command, InputTipsSearchHandlerFunc } from 'vue-web-terminal'
import { createTerminal } from 'vue-web-terminal'

import i18n from '@/locales'
import type { MeXtermCommandItem } from '@/types/me-interface'
import { rankCommandHints } from '@/utils/redis/command-hints'
import {
  buildTerminalKeyHintTips,
  isTypingTerminalCommandName,
  parseTerminalKeyHintContext,
  terminalHintInput,
  terminalKeyHints,
} from '@/utils/redis/terminal-key-hints'

const terminal = createTerminal()

// 配置本地存储名
// default is 'terminal'
// terminal.configStoreName('terminal')

// 配置每个Terminal实例记忆历史指令的最大数量
// default is 100
// terminal.configMaxStoredCommandCountPerInstance(100)

// 配置自定义主题
// import customTheme from '/your-style-dir/terminal-custom-theme1.css?inline'
// terminal.configTheme('my-custom-theme', customTheme)

export default function setupTerminal(app: App): void {
  app.use(terminal)
}

/**
 * 自定义命令搜索提示处理函数（由 Qwen AI 辅助编写）
 *
 * 替代 vue-web-terminal 默认的简单前缀匹配，实现以下功能：
 * 1. 支持空格分隔的多词匹配（如输入 `config get` 精确匹配子命令）
 * 2. 多词子命令按前缀匹配；已进入参数后不再回退成命令列表
 * 3. 多词同时高亮（如 `CONFIG` 和 `GET` 都会高亮）
 * 4. 排序与 vue-web-terminal 默认逻辑保持一致（完全匹配 > 大小写匹配 > 索引位置）
 * 5. 命令后的键槽用 SCAN/收藏键补全（按光标前的输入判断槽位）
 */
export const handleInputTipsSearch: InputTipsSearchHandlerFunc = (
  command,
  cursorIndex,
  commandStore,
  callback,
) => {
  const input = terminalHintInput(command, cursorIndex)

  const store = commandStore as MeXtermCommandItem[]
  const keyCtx = parseTerminalKeyHintContext(input)
  if (keyCtx) {
    const keys = terminalKeyHints.value
    if (keys.length > 0) {
      const origin = store?.find(cmd => cmd.key.toUpperCase() === keyCtx.cmd.toUpperCase())
      const tips = buildTerminalKeyHintTips(
        keyCtx,
        keys,
        {
          scanned: i18n.global.t('redisTerminal.keyHintScanned'),
          favorite: i18n.global.t('redisTerminal.keyHintFavorite'),
        },
        origin
          ? {
              title: origin.title,
              group: origin.group,
              usage: origin.usage,
              description: origin.description ?? origin.summary,
            }
          : undefined,
      )
      callback(tips, tips.length > 0)
      return
    }
    callback([], false)
    return
  }

  if (!store || store.length === 0) {
    callback([], true)
    return
  }

  // 已进入参数槽（field / value / numkeys 等）时不要把 HGET/MSET 再当命令补全
  if (
    !isTypingTerminalCommandName(
      input,
      store.map(cmd => cmd.key),
    )
  ) {
    callback([], false)
    return
  }

  if (!input.trim()) {
    callback([], true)
    return
  }

  const tips = rankCommandHints(input, store).map(match => ({
    content: match.html,
    description: match.item.summary ?? match.item.description ?? match.item.usage ?? '',
    command: match.item as Command,
  }))

  callback(tips, tips.length > 0)
}
