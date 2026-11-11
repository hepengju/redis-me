/// <reference types="vite-plus/client" />

declare global {
  /** tauri 插件挂载的响应式全局（结构随业务扩展） */
  interface MeTauriGlobal {
    connList: import('./tauri-specta').ConnConfig[]
    settings: Record<string, unknown> & {
      language?: string
      theme?: string
      keyScanCount?: number
      fieldScanCount?: number
      keyShow?: string
      keySort?: string
      /** 键列表是否显示 MEMORY USAGE。只在键列表菜单切换，默认关 */
      keyShowMemory?: boolean
      /** 键列表是否显示 PTTL。只在键列表菜单切换，默认关 */
      keyShowTtl?: boolean
      keyHeight?: number
      /** Hash/List 等值区默认展示：auto 默认表格、记住手动切换 | table 始终表格 */
      fieldShow?: 'auto' | 'table'
      /** auto 模式下上次手动选择的 json/table，切换连接/键时沿用 */
      fieldShowView?: 'json' | 'table'
      /** Hash 字段 TTL 列上次开关，换键/刷新沿用 */
      hashFieldTtl?: boolean
      /** 分组名顺序（与 conn.meta.group 配合） */
      connGroups?: string[]
      /** 各分组是否展开，键 '' 表示默认分组 */
      connGroupExpanded?: Record<string, boolean>
      uiFont?: string[]
      codeFont?: string[]
      autoUpdate?: boolean
      /** 更新源。auto 按中国大陆时区先 Gitee、否则先 GitHub，失败再试另一个；gitee / github 只用那一个 */
      updateSource?: 'auto' | 'gitee' | 'github'
      /** 自定义 STRING 值编解码脚本配置 */
      /** auto：内置识别落到 Hex 时参与试解，默认关 */
      customCodecs?: { name: string; command: string; auto?: boolean }[]
      /** 自定义编解码脚本执行超时（秒） */
      codecExecTimeoutSec?: number
      /** Redis 建连超时（秒），同步至 Rust */
      connectTimeout?: number
      /** Redis 命令读写超时（秒），同步至 Rust */
      commandTimeout?: number
      /** STRING 类型值全量加载安全阈值（MB） */
      valueByteLimitMB?: number
      /** STRING 类型值超过安全阈值时的预览字节数 */
      valuePreviewBytes?: number
    }
    systemTheme: string
    systemLanguage: string
    isAppStore: boolean
  }

  const meTauri: MeTauriGlobal

  interface Window {
    meTauri: MeTauriGlobal
    /** element-plus 插件写入，供运行时切换语言包 */
    ElementPlusLanguageMap?: Record<string, unknown>
    /**
     * Local Font Access（实验性；部分 TS 自带的 DOM lib 未收录）
     * https://wicg.github.io/local-font-access/
     */
    queryLocalFonts?: () => Promise<
      ReadonlyArray<{ readonly style: string; readonly fullName: string }>
    >
  }
}

export {}
