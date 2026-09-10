/** 设置项默认值（唯一数据源，修改时请同步检查 AppSetting.vue 和 tauri.ts） */
export const defaultSettings = {
  language: 'system',
  theme: 'system',
  uiFont: [] as string[],
  codeFont: [] as string[],
  autoUpdate: true,

  // 扩展设置
  keyScanCount: 1000,
  fieldScanCount: 20,
  keyShow: 'tree',
  keySort: 'count',
  keyHeight: 20,
  fieldShow: 'auto', // 'table' 始终表格 | 'auto' 默认表格、记住手动切换
  fieldShowView: 'table', // auto 模式下上次手动选择的 json/table，持久化供切换连接/键沿用
  hashFieldTtl: false, // Hash 字段 TTL 列：记住 HTTL 开关，换键/刷新沿用
  // 首页连接分组（见 src/utils/conn.ts）
  connShow: 'flat', // 'flat' | 'group'
  connGroups: [] as string[], // 分组名有序列表
  connGroupExpanded: {} as Record<string, boolean>, // 分组折叠状态，键为分组名（''=默认分组）
  // 自定义 Codec（STRING 值编解码，见 zzz/plans/05_custom-formatter.md）
  customCodecs: [] as { name: string; command: string }[],
  codecExecTimeoutSec: 5,
  // Redis 建连超时（秒，TCP+握手+PING），同步至 Rust AppSettings
  connectTimeout: 10,
  // Redis 命令读写超时（秒），同步至 Rust AppSettings
  commandTimeout: 30,
  // STRING 类型值全量加载安全阈值（MB）
  valueByteLimitMB: 1,
  // STRING 类型值超过安全阈值时的预览字节数（4KB：够看结构，远低于 1MB 安全阈值）
  valuePreviewBytes: 4096,
}
