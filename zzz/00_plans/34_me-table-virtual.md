# 34. MeTable 改虚拟表格（el-table-v2）评估

> **实现状态**：未开始
> **关键代码**：[`src/components/MeTable.vue`](../../src/components/MeTable.vue)（401 行）、20 处 `<me-table>` 调用点、[`src/utils/export.ts`](../../src/utils/export.ts)
> **关联规则**：[`me-table-export-sync.mdc`](../../.cursor/rules/me-table-export-sync.mdc)（列与 `exportRows` 同步）、[`frontend-simplicity-and-reuse.mdc`](../../.cursor/rules/frontend-simplicity-and-reuse.mdc)（优先复用）
> **依赖确认**：`element-plus@2.14.6` 已带 `ElTableV2` / `ElAutoResizer`，全量引入无需改构建；项目**没有** `@vitejs/plugin-vue-jsx`，本计划不引入

## 一句话结论

**不要一次性全量替换。**

分页已经把 DOM 压在 20~100 行以内，渲染从来不是瓶颈；真瓶颈在数据层（流式表无上限 `unshift`、内存扫描每批全量重排）。el-table-v2 换掉的是「翻页」这个交互，不是「卡」。

所以顺序是：**先修数据层 → 再给 MeTable 加统一列描述 + 底部状态栏 → 最后按数据量分档切虚拟内核**。小数据量表（INFO / CONFIG / ACL / 命令帮助等）留在 `el-table`，明确写清不迁移的判据。

---

## 一、现状盘点

### 1.1 MeTable 现在做了什么

| 能力                | 实现                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 前端分页            | `currentPage` / `pageSize`（默认 20，可选 20/50/100），`pageData` 切片                                                             |
| 整表排序            | `orderBy`（从 `element-plus/es/components/table/src/util.mjs` 借来），对齐 `default-sort` / `sortable` / `sort-method` / `sort-by` |
| `sortable="custom"` | 不改行序，透传 `sort-change` 给父组件                                                                                              |
| 取消排序回落        | 有 `default-sort` 时回到它，而不是 `data` 插入顺序（监控页尾部最新）                                                               |
| 页码自愈            | 行变少后停在仍有数据的页                                                                                                           |
| 导出菜单            | 分页条右侧 `…`：RAW JSON 永远可用；其余 6 种格式由 `exportRows(data)` 从数据层算矩阵，不渲染 DOM                                   |
| 对外方法            | `scrollTo(top, left)`（`RedisInfo/index.vue` 用）、`resetPage()`（**无人调用，是死 API**）                                         |
| 列定义              | 默认插槽原样透传 `<el-table-column>`，`inheritAttrs: false` + `v-bind="elTableAttrs"` 透传其余 attrs                               |

### 1.2 20 处调用点与数据量分档

| 档       | 调用点                                                                                                                                 | 行数量级                         | 用到的 el-table 独有能力                                                                                                                        | 迁移难度 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A 大** | `RedisValue/index.vue` 字段表                                                                                                          | 十万级（字段扫描可「加载全部」） | index 列带编辑图标、`row-click`/`row-dblclick`、`row-class-name`、`fixed=right` 操作列（popconfirm + dropdown）、7 组条件列、动态 `sort-method` | ★★★★★    |
| **A 大** | `RedisMemory.vue`                                                                                                                      | 十万级（全库扫描无上限）         | `type="selection"` + `selection-change`、列 `:filters`/`filter-method`、`fixed=right`                                                           | ★★★★     |
| **A 大** | `TableHashKeys.vue`（HKEYS/HVALS 弹框）                                                                                                | 十万级                           | index 列、`default-sort`                                                                                                                        | ★        |
| **B 流** | `RedisMonitor.vue`                                                                                                                     | 无上限（每事件 `unshift`）       | 无                                                                                                                                              | ★        |
| **B 流** | `RedisPubsub.vue`                                                                                                                      | 无上限                           | 无                                                                                                                                              | ★        |
| **B 流** | `CommandLog.vue`                                                                                                                       | 上限 1000                        | `#header` 插槽内放搜索框 + 清空按钮、`row-class-name` + `row-style`、`empty-text`                                                               | ★★★★     |
| **C 中** | `RedisSearch.vue` 命中结果                                                                                                             | 万级                             | `fixed=left`、`v-for` 动态列、`min-width` 按内容算                                                                                              | ★★       |
| **C 中** | `RedisClient.vue`                                                                                                                      | 千级                             | 每列 `#header` 插槽套 `el-tooltip`、`v-for` 动态列、`formatter`、`fixed=right`                                                                  | ★★★      |
| **C 中** | `TableVSim.vue` / `TableZsetRange.vue`                                                                                                 | 千级                             | index 列、`row-class-name` + `row-style`、条件列                                                                                                | ★★       |
| **D 小** | `RedisSlow` `RedisConfig` `RedisInfo/index` `RedisACL` `AclLog` `CommandHelp` `RedisSearch`（索引/TAGVALS/SYNDUMP） `TableArLastItems` | ≤ 千级                           | `CommandHelp` 用了两列 `:filters`；其余基本只有 `show-overflow-tooltip`                                                                         | ★~★★★    |

### 1.3 现有能力的覆盖统计

脚本统计 20 处 `<me-table>` 块，共 **101 个 `<el-table-column>`**（这 101 个列定义就是本次改造的主要工作量）。虚拟内核必须补齐的 el-table 能力，按出现的调用点数排：

| 能力                                                                     | 调用点数 | 备注                                                        |
| ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------- |
| `show-overflow-tooltip`                                                  | 19 / 20  | 最高频，必须自建                                            |
| `align`                                                                  | 18       | v2 原生支持                                                 |
| `sortable`                                                               | 15       | v2 只给箭头，比较器要自己做                                 |
| `stripe` / `border`                                                      | 各 11    | v2 无此 prop，CSS 自建                                      |
| `height="100%"`                                                          | 11       | v2 要数字，需 `ElAutoResizer`                               |
| `min-width` 弹性列 / 不写 `width`                                        | 8        | v2 `width` 必填数字，需 `flexGrow` 映射                     |
| `type="index"`                                                           | 7        | 自建序号列                                                  |
| `fixed="left"/"right"`                                                   | 6        | v2 原生支持                                                 |
| `v-loading`                                                              | 6        | 走 `#overlay`                                               |
| `class-name`（列级）                                                     | 5        | v2 `column.class`                                           |
| `layout`（自定义分页条）                                                 | 5        | 虚拟内核下作废，由状态栏替代                                |
| `#header` 自定义表头                                                     | 3        | CommandLog 带交互控件；RedisClient / RedisSearch 带 tooltip |
| `row-class-name` / `row-style`                                           | 各 3     | 签名不同，需适配                                            |
| `:filters` 列筛选                                                        | 2        | RedisMemory（type）、CommandHelp（since/readonly）          |
| `type="selection"`                                                       | 1        | 仅 RedisMemory                                              |
| `row-click` / `row-dblclick`                                             | 各 1     | 仅 RedisValue 字段表                                        |
| `sort-change` / `filter-change` / `formatter` / `row-key` / `empty-text` | 各 1     | 逐个适配                                                    |

> 17 个视图共 20 处传了 `:export-rows`（`RedisSearch.vue` 一处 4 个），每处都是与模板列并行的第二份描述——见 5.4。

---

## 二、el-table-v2 能力对照

已核对 `node_modules/element-plus/es/components/table-v2/src/`：

| el-table 能力                     | el-table-v2                                                                           | 说明                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `<el-table-column>` 子组件        | ❌ `columns: Column[]` 数组（必填）                                                   | API 形态根本不同，是本次改造的主要工作量                                           |
| `width` / `min-width` 自动布局    | ⚠️ `width: number` **必填** + `flexGrow`/`flexShrink`                                 | 需自己按容器宽度分配弹性列                                                         |
| `height="100%"`                   | ⚠️ `width`/`height` 必须是数字                                                        | 用 `ElAutoResizer` 包裹拿尺寸                                                      |
| `show-overflow-tooltip`           | ❌ 默认单元格只给原生 `title`                                                         | 需自建（CSS 省略号 + `title` 或 `ElTooltip`）                                      |
| `sortable` / `default-sort`       | ⚠️ `column.sortable` + `sortBy` + `onColumnSort`                                      | **没有** `sort-method` / `sort-by`，比较器要自己实现                               |
| `sort-change` 的 `column` 参数    | ⚠️ `onColumnSort({ key, order })`                                                     | 只给 key/order，MeTable 需自己回查列描述                                           |
| `type="index"`                    | ❌                                                                                    | 自建序号列（`rowIndex + 1`）                                                       |
| `type="selection"`                | ❌                                                                                    | 自建勾选列 + 表头全选 + 半选态                                                     |
| `:filters` / `filter-method`      | ❌                                                                                    | 自建表头筛选浮层                                                                   |
| `fixed="left"/"right"`            | ✅ `column.fixed`                                                                     | 原生支持，内部渲染三张 grid                                                        |
| `align`                           | ✅ `column.align`                                                                     | —                                                                                  |
| `class-name` / `label-class-name` | ✅ `column.class` / `column.headerClass`                                              | —                                                                                  |
| `row-class-name`                  | ✅ `rowClass`                                                                         | 签名是 `({ columns, rowData, rowIndex })`，与 el-table 的 `{ row, rowIndex }` 不同 |
| `row-style`                       | ✅ `rowProps`                                                                         | getter 返回 `{ style }`，透传给 Row                                                |
| `row-click` / `row-dblclick`      | ✅ `rowEventHandlers.onClick/onDblclick`                                              | 签名 `{ rowKey, rowData, rowIndex, event }`                                        |
| `row-key`                         | ✅ `rowKey`                                                                           | 默认 `'id'`，虚拟表**必须**保证唯一，否则行复用错乱                                |
| `formatter`                       | ⚠️ 走 `cellRenderer`                                                                  | —                                                                                  |
| `stripe` / `border`               | ❌                                                                                    | 用 `rowClass` 按 `rowIndex % 2` + CSS 自建                                         |
| `empty-text`                      | ✅ `#empty` 插槽                                                                      | —                                                                                  |
| `v-loading`                       | ✅ `#overlay` 插槽 / 外层 div                                                         | —                                                                                  |
| `scrollTo(top, left)`             | ✅ `scrollTo({ scrollTop, scrollLeft })`、`scrollToTop`、`scrollToRow(row, strategy)` | 更强，可保留对外签名兼容                                                           |
| 表尾汇总行                        | ✅ `footerHeight` + `#footer`                                                         | 这是表格**内部**的固定行，不是我们要的状态栏                                       |

### 2.1 关键可行性发现：插槽桥接不需要 JSX

已核对 `table-v2.mjs` 第 173~186 行的 slot 装配：

```js
cell: props => slots.cell
  ? createVNode(CellRenderer, {...}, _isSlot(_slot = slots.cell(props)) ? _slot : { default: () => [_slot] })
  : createVNode(CellRenderer, {...}, null)
```

含义是：**用户提供的 `#cell` / `#header-cell` 插槽只替换单元格内部内容**，外层 `CellRenderer` / `HeaderCellRenderer` 照常执行——对齐 class、`column.class`、`cellProps`、以及 `HeaderCellRenderer` 里的**排序点击处理和 `SortIcon`** 都保留。

所以 MeTable 可以这样桥接，全程模板、零 `h()`、零 JSX 插件：

```vue
<el-table-v2 :columns="v2Columns" ...>
  <template #cell="{ column, cellData, rowData, rowIndex }">
    <slot :name="`cell-${String(column.key)}`" :row="rowData" :index="rowIndex" :value="cellData">
      <div class="me-cell-ellipsis" :title="tooltipText(column, cellData, rowData)">
        {{ tooltipText(column, cellData, rowData) }}
      </div>
    </slot>
  </template>
  <template #header-cell="{ column }">
    <slot :name="`header-${String(column.key)}`" :column="column">{{ column.title }}</slot>
  </template>
</el-table-v2>
```

这一条决定了整个方案的形态：**消费者用具名插槽写单元格，MeTable 负责把统一列描述翻译成两种内核各自需要的形式**。也顺带解决了 `me-table-export-sync` 规则里「界面列和 `exportRows` 是两份描述」的问题——列描述收敛成一份后，`exportRows` 可以从列描述自动生成（见 5.4）。

### 2.2 虚拟表带来的新风险

1. **行回收 + 组件卸载**：滚出视口的行会被卸载，行内已展开的 `el-dropdown` / `el-popconfirm` / `el-tooltip` 随之销毁，滚动中浮层会突然关闭或错位。缓解：开 `use-is-scrolling`，`isScrolling` 为真时不渲染操作列的浮层触发器（EP 官方 demo 同款做法）。
2. **`rowKey` 必须唯一且稳定**：RedisValue 字段表、内存分析都存在「同值不同行」（Set 成员去重后唯一，但 ZSET/List 可能重复）。必须为每行注入内部 `_rowKey`，不能用业务字段。
3. **固定行高**：所有现有表格都是单行省略，用固定 `rowHeight`（建议 34，与现在视觉一致），**不要**用 `estimatedRowHeight` 动态测高，否则滚动条抖动。
4. **`el-tooltip` 数量**：只有可见行（约 30 行）会有实例，可接受；但必须 `:persistent="false"` + `:show-after="300"`，避免快速滚动时疯狂建 popper。

---

## 三、性能真相：虚拟表能解决什么、不能解决什么

### 3.1 分页已经解决了 DOM 成本

当前每页最多 100 行，`el-table` 渲染 100 行毫无压力。**换成 el-table-v2 后 DOM 反而差不多**（可见约 30 行）。所以「改虚拟表 = 不卡」是错觉。

### 3.2 真正的瓶颈在数据层，虚拟表一点都帮不上

| 位置                                                    | 问题                                                       | 量级                                               |
| ------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `RedisMonitor.vue:81` `dataList.value.unshift(payload)` | 无上限增长；每条事件都触发一次响应式失效                   | 繁忙实例每秒数百条，几分钟到 5 万行                |
| `RedisPubsub.vue` 同上                                  | 同上                                                       | 同上                                               |
| `MeTable.sortedData` 的 `orderBy([...raw])`             | **每次 data 变化都全量拷贝 + 全量排序**                    | 5 万行 × 每秒数百次 = 界面冻结                     |
| `RedisMemory.vue` 的 `filterDataList`                   | 每次 data 变化全量 `filter`                                | 同上                                               |
| `memory-scan.ts:181` `mergeMemoryHits`                  | 每批都 `new Set(existing.map(...))` + `slice()` + `sort()` | 100 万键 / `scanCount=1000` = 1000 批 × O(n log n) |
| `RedisMemory` 的 `default-sort` 与上面重复              | 后端 merge 已按 size 降序排过，MeTable 又 `orderBy` 一遍   | 纯浪费                                             |

**结论**：上表三类问题（流式表无上限 push、MeTable 每次全量 `orderBy`、扫描每批全量重排）不修，换成 el-table-v2 之后照样卡，甚至更卡（虚拟表在数据频繁变更时要做行 key diff）。这也是 34.0 排在所有 UI 改动之前的原因。

### 3.3 虚拟表真正的收益

1. **UX**：不用翻页，连续滚动；滚动位置可保持；去掉「每页 100 条」这个硬上限。
2. **大数据静态表**：内存分析 20 万行、`HKEYS` 全量 10 万字段，一次加载后可自由滚动浏览。
3. **底部状态栏**：总数 + 导出 + 自定义 slot 常驻一行，把「加载更多 / 加载全部」从键值页底栏挪到表格底栏，语义更贴切。

---

## 四、方案选型

| 方案                              | 做法                                                                                                                                                    | 评价                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **A 双内核 + 统一列描述**（推荐） | MeTable 增加 `columns` prop 与 `virtual` prop；`virtual=false` 走现有 `el-table`，`true` 走 `el-table-v2`；两者共用一份列描述、一套导出、一个底部状态栏 | 渐进、可回滚、每步可验证；最终只有一个表格组件，符合「优先复用」。代价是 MeTable 会变厚（预计 700~800 行），需要拆 composable |
| B 新增独立 `MeTableV2.vue`        | 只给大数据场景用，`MeTable` 不动                                                                                                                        | 上手最快，但两套导出 / 两套底部栏 / 两套排序逻辑，直接违反 `frontend-simplicity-and-reuse`；后期两边改不同步                  |
| C 不换组件，只优化分页            | 加「每页 = 全部」+ 修数据层                                                                                                                             | 修数据层该做，但「每页全部」在没有虚拟滚动时等于自杀；UX 提升有限                                                             |
| D 全量一次性替换                  | 20 处一次改完                                                                                                                                           | 回归面覆盖键值页、内存分析、命令日志等核心界面，风险不可控。**否**                                                            |

**选 A**。理由：列描述抽象是这次改造真正的资产——它同时解决了「模板列 vs `exportRows` 两份描述容易不同步」这个长期问题（`me-table-export-sync.mdc` 存在的根因），双内核只是它的一个消费者。

---

## 五、目标设计

### 5.1 统一列描述 `MeColumn`

新增 `src/components/me-table-column.ts`（纯类型 + 少量纯函数，便于单测）：

```ts
/** MeTable 列描述：一份定义，同时喂给 el-table-column 与 el-table-v2 Column */
export type MeColumn<T = any> = {
  /** 唯一键；决定具名插槽名 `cell-${key}` / `header-${key}`；虚拟内核用作 v2 column.key */
  key: string
  /** 取值字段（el-table 的 prop / v2 的 dataKey）；纯插槽列可省 */
  prop?: string
  /** 表头文字；有 `header-${key}` 插槽时可省 */
  title?: string
  /** 固定宽度（px）。虚拟内核必需，缺省按 120 兜底 */
  width?: number
  /** 弹性列：虚拟内核映射为 width=minWidth + flexGrow=grow */
  minWidth?: number
  /** flexGrow 权重，默认 1 */
  grow?: number
  fixed?: 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean | 'custom'
  /** 自定义比较器；虚拟内核由 MeTable 在 sortedData 里调用，不交给 v2 */
  sortMethod?: (a: T, b: T) => number
  /** 序号列：内容 = rowIndex + 1（虚拟内核为排序后的全局序号） */
  index?: boolean
  /** 勾选列。虚拟内核由 MeTable 自建 checkbox + 表头全选/半选 */
  selection?: boolean
  /** 表头筛选项。虚拟内核由 MeTable 自建浮层 */
  filters?: { text: string; value: unknown }[]
  filterMethod?: (value: unknown, row: T) => boolean
  /** 超出省略 + 悬浮提示。虚拟内核用 CSS 省略号 + 原生 title（与 v2 默认一致） */
  tooltip?: boolean
  className?: string
  headerClassName?: string
  formatter?: (row: T, index: number) => string
}
```

**兼容策略**：`columns` 与默认插槽二选一。`columns` 存在时用列描述；不存在时退回现在的默认插槽透传（保证未迁移的调用点一行都不用动）。`virtual: true` 时 `columns` 必填，缺失直接 `meErr` 提示并降级为 `el-table`。

### 5.2 MeTable 对外 API 变化

新增 props：

| prop        | 类型                          | 默认     | 说明                                                           |
| ----------- | ----------------------------- | -------- | -------------------------------------------------------------- |
| `columns`   | `MeColumn[]`                  | —        | 统一列描述；给了就不再用默认插槽                               |
| `virtual`   | `boolean`                     | `false`  | 是否走 el-table-v2 内核                                        |
| `rowHeight` | `number`                      | `34`     | 虚拟内核行高                                                   |
| `rowKey`    | `string \| ((row) => string)` | 内部生成 | 虚拟内核行 key；未提供时 MeTable 用 `WeakMap` 生成稳定内部 key |
| `total`     | `number`                      | —        | 覆盖底部显示的总数（数据是后端分页时用）；默认取 `data.length` |
| `loading`   | `boolean`                     | `false`  | 虚拟内核走 `#overlay`；非虚拟内核仍可用 `v-loading`            |
| `footer`    | `boolean`                     | 自动     | 是否显示底部状态栏；默认「有数据 或 有 footer 插槽」时显示     |

移除 / 变更：

- `layout`、`hideOnSinglePage`：仅非虚拟内核有效，保留不删（未迁移调用点在用）。
- `defineExpose` 增加 `scrollToTop()`、`scrollToRow(index)`；`scrollTo(top, left)` 两个内核都保留同签名；**删掉 `resetPage()`**（全项目无人调用，虚拟内核下无意义）。
- `sort-change` 事件签名保持不变（`{ column, prop, order }`），虚拟内核由 MeTable 从 `onColumnSort({ key, order })` 回查列描述后合成，`RedisSlow.vue` 的 `sortChange` 不用改。

### 5.3 底部状态栏

三段式，替换现在的「分页条 + 右侧 `…`」：

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 共 12,345 条   [ #footer-left ]        [ #footer ]   [ #footer-right ]  … │
└──────────────────────────────────────────────────────────────────────┘
   left（总数/分页）      可选                中间主插槽        可选      导出菜单
```

- **left**：虚拟内核显示 `t('meTable.total', { total })`；非虚拟内核显示 `el-pagination`（含 total），与现状完全一致。
- **`#footer-left`**：紧跟总数，放扫描进度环、已选 N 项等。
- **`#footer`**：中间弹性区，放「加载更多 / 加载全部 / 批量删除」等主动作。`RedisValue/index.vue` 底栏那对 `me-icon-load-more` / `me-icon-load-all` 迁到这里。
- **`#footer-right`**：导出菜单左侧，放次级动作。
- **导出 `…`**：始终最右，行为不变。
- 无数据且无插槽时整行隐藏（保持现在 `showTableFooter` 的判断）。

i18n 新增（`zh-cn.ts` / `en.ts` 的 `meTable` 段）：

```ts
total: '共 {total} 条' // en: 'Total {total}'
```

### 5.4 导出：抽 composable + 从列描述自动生成

现在 `exportRows` 由 14 个视图各写一份，和模板列是两份描述，靠 `.cursor/rules/me-table-export-sync.mdc` 人肉同步。列描述收敛后：

1. 抽 `src/components/useTableExport.ts`：把 `MeTable.vue` 第 201~271 行（`ensureExportRows` / `rawJsonText` / `handleExportCommand` / 菜单项）整体搬过去，两个内核共用。签名 `useTableExport({ rows, exportName, columns?, exportRows? })`。
2. **`exportRows` 变为可选**：传了 `columns` 且未传 `exportRows` 时，`useTableExport` 用 `columns` 自动生成矩阵——`headers` 取 `title`（跳过 `selection` 列、`index` 列取 `#`），每行 cells 取 `formatter?.(row) ?? row[prop]`。
3. 有插槽自定义渲染、纯文本取不到的列（RedisACL 的 `el-tag` 状态、CommandLog 的时间截断），仍传 `exportRows` 覆盖。
4. 迁移完成的调用点，把 `exportRows` 删掉；`me-table-export-sync.mdc` 规则随之改写为「有自定义渲染的列才需要 `exportRows`」。

---

## 六、实施步骤

每步一次提交，标题按 [`git-commit-conventions.mdc`](../../.cursor/rules/git-commit-conventions.mdc) 只写一行、带功能前缀。每步做完跑 `vp check` + `vp test`，界面改动跑 `vp run tauri:dev` 手测。

### 34.0 先修数据层（与虚拟表无关，但必须先做）

不改 UI，只改数据流。做完这一步，现有分页版本的卡顿就应该基本消失。

1. `RedisMonitor.vue` / `RedisPubsub.vue`：事件回调只 `push` 到普通数组缓冲区，用 `@vueuse/core` 的 `useThrottleFn`（200ms）批量 `unshift` 进 `dataList`；加上限（建议 5000，超出丢尾部最旧），上限值进 `settings` 复用 `CommandLog` 的 `LOG_LIMIT` 模式。
2. `memory-scan.ts` 的 `mergeMemoryHits`：`seen` Set 提到循环外跨批复用（不要每批重建），`next.sort` 改为「incoming 先排序 + 归并」或干脆不排（排序交给 MeTable 的 `default-sort`，避免排两遍）。二选一，**不要两边都排**。
3. `RedisMemory.vue`：确认后端 merge 与 MeTable `orderBy` 不重复排序；若 merge 已排序，把 `default-sort` 改成 `sortable="custom"` 语义或直接由 merge 保证顺序。
4. `MeTable.sortedData`：`orderBy` 结果加 `shallowRef` 缓存，`data` 引用未变时不重算（现在每次渲染都重排）。

验收：MONITOR 挂在繁忙实例上 2 分钟不卡；内存分析扫 50 万键，扫描过程界面可交互。

### 34.1 PoC（1 个弹框表，验证全部技术风险）

拿 `TableHashKeys.vue`（列最简单：index + 一列，数据可达十万）做试点，**不改 MeTable**，直接在页面里裸写 `el-table-v2`：

- `ElAutoResizer` 撑满弹框容器
- 10 万行滚动帧率
- 固定行高 34 的视觉与现在 `el-table` 是否一致（行高、字号、边框、斑马纹）
- `#cell` / `#header-cell` 插槽桥接是否如 2.1 分析（排序图标、点击排序仍在）
- 行内放一个 `el-popconfirm`，滚动时观察浮层行为，确认 2.2 的缓解手段有效
- 深色主题下 `--el-table-v2-*` CSS 变量是否齐全

**PoC 不通过就停在这里**，回到方案 C（只做 34.0）。PoC 结论写回本文件。

### 34.2 抽 `useTableExport.ts`

纯搬家，`MeTable.vue` 的导出行为、菜单项、i18n key 全不变。跑一遍 17 个带 `exportRows` 的视图（20 处），逐个格式点一次（JSON/CSV/TSV/HTML/Markdown/Excel + RAW）。

### 34.3 加列描述（仍是 el-table 内核）

新增 `me-table-column.ts` 类型与 `columns → el-table-column props` 的映射；`MeTable.vue` 模板里加 `v-if="columns"` 分支，用 `v-for` 渲染 `<el-table-column>`，`#default` / `#header` 转发到 `cell-${key}` / `header-${key}` 具名插槽。

**先迁 3 个最简单的调用点验证抽象够用**：`RedisInfo/index.vue`、`AclLog.vue`、`TableArLastItems.vue`。这一步不改任何交互，diff 应该只是「模板列 → columns 数组 + 具名插槽」。

### 34.4 底部状态栏

按 5.3 改 `MeTable.vue` 的 footer：left / `#footer-left` / `#footer` / `#footer-right` / 导出。非虚拟内核下 left 仍是 `el-pagination`，所有现有调用点视觉不变（只有 margin 微调）。加 `meTable.total` i18n。

顺手把 `RedisValue/index.vue` 底栏的「加载更多 / 加载全部」挪进 `#footer`。

### 34.5 加虚拟内核

`MeTable.vue` 增加 `virtual` 分支：

- `v2Columns` computed：`MeColumn[]` → `Column[]`（`width` 兜底 120、`minWidth` → `flexGrow`、`index`/`selection` 列注入内部 `cellRenderer` 占位由插槽接管、`sortable` 透传）
- `sortedData` 复用现有 `orderBy` 逻辑，**排序不进 v2**（v2 只负责显示 `sortBy` 箭头，实际排序 MeTable 自己做，这样 `sortMethod` 能力不丢）
- `rowClass` / `rowProps` / `rowEventHandlers` 适配签名差异
- `stripe` → `rowClass` 按 `rowIndex % 2`；`border` → CSS
- `#cell` / `#header-cell` 按 2.1 桥接
- `#empty` / `#overlay` 接上
- `scrollTo` / `scrollToTop` / `scrollToRow` expose

MeTable 此时预计超 700 行，按职责拆：`useTableSort.ts`（现有 59~159 行整段搬走）、`useTableExport.ts`（34.2 已抽）、`useTableSelection.ts`（勾选态 + 全选/半选）、`me-table-column.ts`（列映射）。`MeTable.vue` 只留 props/slots/模板装配。

### 34.6 迁 A 档简单表 + B 档流式表

顺序：`TableHashKeys` → `TableZsetRange` → `TableArLastItems` → `RedisMonitor` → `RedisPubsub` → `CommandLog`。

每迁一个把 `virtual` 打开、去掉 `layout` / `hideOnSinglePage`，`exportRows` 能自动生成就删掉。

`CommandLog` 的自定义表头（搜索框 + 清空按钮）用 `#header-command` 具名插槽原样搬，注意在插槽根节点上 `@mousedown.stop`（现在就有）避免触发排序。

### 34.7 迁 RedisValue 字段表

最复杂，单独一步。要点：

- index 列的「当前编辑行显示眼睛/铅笔图标」→ `#cell-index` 插槽，用 `rowIndex` 对比 `fieldSetIndex`
- `row-click` / `row-dblclick` → `rowEventHandlers`，注意签名从 `(row, column, event)` 变成 `({ rowData, rowIndex, event })`
- `row-class-name` 的 `field-set-row` / `rowClassName({ rowIndex })` → `rowClass({ rowIndex, rowData })`
- 操作列 `fixed="right"` 里的 `el-popconfirm` + `el-dropdown`：开 `use-is-scrolling`，`isScrolling` 时只渲染图标不渲染浮层包装
- 7 组条件列 → `columns` computed 里按 `streamType` / `hashType` / `zsetType` / `vectorsetType` / `showHashFieldTtlOption` 过滤
- `:key="type\0key"` 重建逻辑保留
- `compareFieldRowValue` 走 `sortMethod`
- `exportValueTableRows` 与列描述逐列核对后决定保留或删除

### 34.8 迁 RedisMemory（勾选 + 列筛选）

需要 `useTableSelection.ts` 与表头筛选浮层两个新能力：

- 勾选：`selection` 列 → `#cell-selection` 渲染 `el-checkbox`；表头 `#header-selection` 渲染全选（含半选 `indeterminate`）；`selection-change` 事件签名保持 `el-table` 的 `(rows)`
- 筛选：`filters` + `filterMethod` → `#header-type` 里放 `el-popover` + `el-checkbox-group`，筛选结果进 MeTable 内部的 `filteredData`，与 `sortedData` 串成 `filter → sort` 管线（现在这条管线由 el-table 内部做，虚拟内核要自己接上）
- `fixed="right"` 操作列
- 批量删除按钮可挪进 `#footer`

### 34.9 C/D 档评估：默认不迁

明确判据，满足**任一**才迁：

1. 行数量级 ≥ 5000；
2. 数据是持续增长的流；
3. 用户明确反馈翻页难用。

按此判据：`RedisSearch` 命中结果（万级）迁；`RedisClient`（千级但列多、表头全自定义）不迁；`RedisSlow` `RedisConfig` `RedisInfo/index` `RedisACL` `AclLog` `CommandHelp` `RedisSearch` 索引/TAGVALS/SYNDUMP 不迁。

**不迁的理由要写进代码注释**（`frontend-simplicity-and-reuse.mdc` 要求）：这些表 ≤ 千行、列定义复杂（`CommandHelp` 两列筛选、`RedisClient` 每列 tooltip 表头 + `v-for` 动态列），迁移只有成本没有收益，`el-table` 的原生 `show-overflow-tooltip` / `:filters` / `min-width` 自动布局反而更省事。

### 34.10 收尾

1. 若 A/B 档全部迁移成功且无回归，评估把 `virtual` 默认值改为 `true`；只要 C/D 档还在用 `el-table`，就**不要**改默认值。
2. 更新 `.cursor/rules/me-table-export-sync.mdc`：改为「只有自定义渲染列需要 `exportRows`；其余由列描述自动生成」。
3. `docs/zh/changelog/future.md` 与 `docs/en/changelog/future.md` 加条目；发版时按 [`release-tag.mdc`](../../.cursor/rules/release-tag.mdc) 处理。
4. `docs/zh/handbook/` 若有表格相关说明，同步截图。

---

## 七、每步验收清单

- [ ] `vp install`（拉取远端改动后）、`vp check`、`vp test` 全绿
- [ ] `vp run typecheck:vue` 无新增错误（列描述类型较严，重点看这里）
- [ ] 迁移一个调用点，就手测这个页面的：排序（升/降/取消回落 default-sort）、筛选、勾选、行点击/双击、固定列横向滚动、导出 7 种格式、空数据、加载态、深色主题
- [ ] 大数据实测：内存分析扫 20 万键、`HKEYS` 10 万字段、MONITOR 挂 2 分钟，滚动流畅、无内存爆涨
- [ ] 底部状态栏：总数正确、插槽内容不挤压导出菜单、窄窗口下不换行不溢出
- [ ] 按 [`self-review-after-work.mdc`](../../.cursor/rules/self-review-after-work.mdc) 自查后再交用户验证

---

## 八、本计划不做

- 不引入 `@vitejs/plugin-vue-jsx` 或任何新依赖。`ElTableV2` / `ElAutoResizer` 已随 `element-plus` 全量引入。
- 不做动态行高（`estimatedRowHeight`）。所有表格保持单行省略 + 固定行高。
- 不做列宽拖拽（`ColumnResizeHandler`）、列显隐配置、列顺序拖拽。可以以后单开计划。
- 不做后端分页 / 无限滚动加载。MeTable 仍是「数据全在前端」的表。
- 不改 `ConnTable.vue`、`CustomCodec.vue`、`TableGroup.vue`（用了 `type="expand"` 展开行，v2 的展开是另一套 `expandColumnKey` 机制）、`TableInfo.vue` 等直接用 `el-table` 的地方，它们不走 MeTable。
- 不改 `src/utils/export.ts` 的导出格式与文件保存逻辑。
- 不把 `MeTable.vue` 拆成两个组件（方案 B 已否）。
- 不在 34.0 之前动任何 UI。
