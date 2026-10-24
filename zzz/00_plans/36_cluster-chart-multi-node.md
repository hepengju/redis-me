# 36. 集群图表多节点折线同屏

> **实现状态**：待实现（方案已定稿，等排期）
> **关联 backlog**：[`future.md`](../../docs/zh/changelog/future.md) L5「集群的图形: 默认显示所有节点的线，支持选择主节点、从节点和单独某个节点」、L16「图表：集群多节点折线同屏展示」、L17「图表显示优化」
> **关键代码**：[`src/views/tab/RedisChart.vue`](../../src/views/tab/RedisChart.vue)（730 行）、[`src/views/ext/NodeList.vue`](../../src/views/ext/NodeList.vue)、后端 [`client/me_cluster.rs`](../../src-tauri/src/client/me_cluster.rs) `info_list` / [`client/me_client.rs`](../../src-tauri/src/client/me_client.rs) `chart` / `chart_list` 默认实现、[`api.rs`](../../src-tauri/src/api.rs) `chart_list`
> **依赖确认**：后端 `chart_list(id) -> RedisChart[]` 已存在（`RedisChart` 带 `node` 字段），**无需新增采集逻辑**；`PREDEFINE_COLORS` 仅 5 色，多节点需扩色板

> 目标：集群图表默认把**主节点**的折线画在同一张图上，节点选择器支持「全部 / 仅主 / 仅从 / 指定单节点」四态（均用显式 token `'all'`/`'master'`/`'slave'`/`'ip:port'`，**不用空串**）。改动以前端为主，后端只给 `chart_list`、`info_list` 增加可选 `node_filter` 参数（避免「仅主」时还去采从节点）。**不处理节点动态增减**（扩缩容重连即可）。

---

## 一、现状

### 1.1 数据链路已就绪

| 层       | 现状                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端采集 | `info_list()` 遍历 `self.node_list` 逐节点发 `INFO`，返回 `Vec<RedisInfo{node, info}>`；`chart_list()` = `info_list` → `info_to_chart` 映射    |
| 后端模型 | `RedisChart` 已含 `node: String`（[`model.rs`](../../src-tauri/src/model.rs) L250），每条自带来源节点                                          |
| 前端 API | `tauri-specta.ts` 已有 `chartList(id)`；`RedisChart.vue` **目前只调 `chart(id, node)` 取单节点**，`chartList` 前端无人用                       |
| 节点信息 | `share.nodeList` 每项带 `isMaster` / `isSlave` / `shortLabel`（`enrichNodeList` 富化，[`redis-display.ts`](../../src/utils/redis-display.ts)） |

**结论**：多节点数据一次 `chartList` 即可拿全，核心工作在前端「单线 → 多线」的图表改造 + 选择器交互。

### 1.2 图表当前是「每块固定 1~2 条线」

`initData`（`RedisChart.vue` L425-504）为每个图表块写死 datasets：`command`/`memory` 各 1 条、`network` 2 条（in/out）、更多图表块各 1 条。`getData()` 每次 `push` 一个点到 `datasets[0]`/`datasets[1]`。多节点后 datasets 长度 = 节点数（network 还要 ×2），固定结构不再适用。

### 1.3 NodeList 是「单选、值为具体节点地址」的复用组件

`NodeList.vue` 被 7 处使用：终端、配置、客户端、慢日志、监控、信息、图表。除图表外，`v-model` 的值都是**某个 `ip:port`**（空串 = 后端默认路由到随机 master）。因此**不能**直接把「全部 / 仅主 / 仅从」混进公共组件——会破坏其它页语义。

---

## 二、决策摘要

| 项         | 结论                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 选择器形态 | 复用 `NodeList`，新增 opt-in prop `filterable`；仅图表页开启，其它页零影响                                                                                                                                        |
| 四态取值   | `node` 值均用**显式 token**：`'all'`=全部、`'master'`=仅主、`'slave'`=仅从、`'ip:port'`=指定单节点；**不用空串**（空串保留传统语义=默认/随机路由，仅服务于终端等非 filterable 页）；下拉用 `el-option-group` 分组 |
| 默认       | 集群进入图表页默认 `node='master'`（仅主：从节点与主节点高度重叠，线条最少最清晰）；单机 `node='all'`（`info_list` 恒返回 1 个→单条线）；下拉仍可切「全部/仅从/单节点」                                           |
| 后端参数   | `chart_list` 与 `info_list` **均**加可选 `node_filter: Option<String>`（**仅 `"all"`=全部**、`"master"`/`"slave"`=按角色、`"ip:port"`=单节点；`None`/空串=不匹配返回空）                                          |
| 取数路径   | **统一走 `chartList(id, filter)`**：返回节点列表逐条成线，单机/单节点时列表长度为 1，**无需 `if (multi)` 分支**（`chart` 命令前端不再使用）                                                                       |
| 折线配色   | 扩色板 + **按节点稳定映射**（`node → color` Map），切筛选同一节点不跳色                                                                                                                                           |
| 历史数据   | 切筛选 `watch(node) → resetData()` 清缓冲重建（现有逻辑，扩展到 filter 值变化即触发）                                                                                                                             |
| 节点动态   | **不处理**：扩缩容靠重连；`nodeList` 变化不主动重建 datasets                                                                                                                                                      |
| 点数上限   | 暂不动 `maxPointCount`（默认 100），实测卡顿再调                                                                                                                                                                  |
| 延后       | 见 §九                                                                                                                                                                                                            |

---

## 三、后端设计（逐文件）

改动很小：给两个已有命令加一个可选参数，透传到集群遍历循环做角色/地址过滤。单机实现忽略该参数（只有一个节点）。

### 3.1 [`model.rs`](../../src-tauri/src/model.rs) / 常量

无需新模型。约定 `node_filter` 语义（写进注释，前端 §4 对齐）：

- `Some("all")` → 全部节点（图表页唯一表示“全部”的取值；**`None`/`Some("")` 不再代表全部，而是返回空**，契约唯一无歧义）
- `Some("master")` → 仅 `flags` 含 `master`
- `Some("slave")` → 仅 `flags` 含 `slave`
- `Some("ip:port")` → 仅该地址（等价单节点）

### 3.2 [`client/me_client.rs`](../../src-tauri/src/client/me_client.rs) trait

`chart_list` 默认实现改为带参：

```rust
/// 各节点监控图，由 INFO 列表换算；node_filter 见 model 注释。
fn chart_list(&self, node_filter: Option<String>) -> AnyResult<Vec<RedisChart>> {
    let info_list = self.info_list(node_filter)?;
    info_list.into_iter().map(info_to_chart).collect()
}
```

`info_list` trait 签名同步为 `fn info_list(&self, node_filter: Option<String>) -> AnyResult<Vec<RedisInfo>>;`。

### 3.3 [`client/me_cluster.rs`](../../src-tauri/src/client/me_cluster.rs) `info_list`

在现有 `for redis_node in &self.node_list` 循环首部加过滤（不改其余逻辑）：

```rust
fn info_list(&self, node_filter: Option<String>) -> AnyResult<Vec<RedisInfo>> {
    // node_filter：仅 "all"=全部；含':'按地址精确匹配单节点，否则按角色（master/slave）子串匹配；
    // None/空串/未识别值一律不匹配（调用方须传显式 token）
    let Some(filter) = node_filter.as_deref().filter(|s| !s.is_empty()) else {
        return Ok(vec![]);
    };
    let mut conn = self.get_conn()?;
    let mut infos = vec![];
    for redis_node in &self.node_list {
        if filter != "all" {
            // 角色过滤（master/slave）或指定地址；两者都不匹配则跳过
            let hit = filter.contains(':')
                ? redis_node.node == filter
                : redis_node.flags.contains(filter);
            if !hit { continue; }
        }
        let node = redis_node.node.clone();
        let (route, _) = self.get_node_route(Some(node.clone()))?;
        let value = conn.route_command(&redis::cmd("info"), route)?;
        let info: String = FromRedisValue::from_redis_value(value)?;
        infos.push(RedisInfo { node, info });
    }
    Ok(infos)
}
```

> 角色判定沿用仓库既有约定：`flags.contains("master")` / `flags.contains("slave")`（`get_node_list_master`、`enrichNodeList` 同款）。

### 3.4 [`client/me_single.rs`](../../src-tauri/src/client/me_single.rs) `info_list`

签名加参、忽略过滤（单机只有一个节点，直接返回）：

```rust
fn info_list(&self, _node_filter: Option<String>) -> AnyResult<Vec<RedisInfo>> {
    let info = self.info(None)?;
    Ok(vec![info])
}
```

### 3.5 [`api.rs`](../../src-tauri/src/api.rs) `api_commands!`

```rust
info_list(node_filter: Option<String>) -> Vec<RedisInfo>;   // 信息列表（可过滤）
chart_list(node_filter: Option<String>) -> Vec<RedisChart>; // 图表列表（可过滤）
```

### 3.6 [`lib.rs`](../../src-tauri/src/lib.rs) + 重生成绑定

命令已注册，签名变化后跑 specta 导出测试，重生成 [`src/types/tauri-specta.ts`](../../src/types/tauri-specta.ts)：

```ts
infoList: (id: string, nodeFilter: string | null) => typedError<RedisInfo[], string>(...);
chartList: (id: string, nodeFilter: string | null) => typedError<RedisChart[], string>(...);
```

> 勿手改 `tauri-specta.ts`，由测试生成。

---

## 四、前端设计（逐文件）

### 4.1 [`NodeList.vue`](../../src/views/ext/NodeList.vue)：加 `filterable` 分组下拉

新增可选 prop `filterable: Boolean`。**仅当为 `true`** 时，在现有节点列表上方插入「快捷筛选」预设项（全部/仅主/仅从），与原有节点一起用 `el-option-group` 分组；选中值直接写进 `v-model`（`node`）：

```text
filterable=true 时的下拉（集群）
┌ 全部节点            (value = "all")     ┐
│ 仅主节点            (value = "master")  │  ← 集群默认
│ 仅从节点            (value = "slave")   │
├ 8.159..:7001 | M1   (value = "ip:port") │  ← el-option-group「指定节点」
│ 8.159..:7002 | M2                        │
│ 8.159..:7003 | S1                        │
└──────────────────────────────────────────┘
```

- 用 `el-option-group` 分「快捷筛选」「指定节点」两段。
- `filterable=false`（其它 6 个调用点）：模板与行为**完全不变**，不出现预设项。
- 图表页 `<node-list v-model="node" filterable />`（去掉 `init-node`）；进入时初始化 `node`：集群 `'master'`、单机 `'all'`。**不用空串**（避免与终端等页「空=随机节点」语义冲突）。
- i18n 新增（`nodeList` 段，见 §4.5）。

### 4.2 [`RedisChart.vue`](../../src/views/tab/RedisChart.vue) `getData()`：统一按列表取数（无分支）

单机 `info_list` 本就返回 1 个元素，集群返回 N 个——**一律视为列表**，无需区分单/多线：

```ts
async function getData() {
  // 统一走列表：单机/指定单节点时长度为 1，天然复用同一渲染路径
  const list = await meCommands.chartList(share.conn!.id, node.value) // node 恒为显式 token（all/master/slave/ip:port）
  const label = Date.now()
  for (const res of list) addNodeSeries(label, res) // 按 res.node 落到各 dataset
  trimAndRefresh()
}
```

- 抽出 `addNodeSeries(label, res)`：对每个图表块，按 `res.node` 找到（或惰性创建）该节点的 dataset，`push` 一个点。
- labels 各块共用一份（同一 `label` 写入所有节点，天然对齐）。
- 前端不再调 `chart(id, node)`；后端 `chart` 命令保留（API 完整性），仅本页不再使用。

### 4.3 datasets 动态构建 + 稳定配色

- 新增 `ensureSeries(blockKey, node)`：若该块尚无此节点的 dataset，按 `nodeColor(node)` 追加一条（`label` = `shortLabel` 或 `node`，`borderColor` = 稳定色，`data` 用已存 labels 长度补 `null` 占位对齐）。
- `nodeColor` 用模块级 `Map<string,string>` 缓存：首次出现的节点按色板顺序取色，之后固定——**切筛选不跳色**。
- 扩色板（`PREDEFINE_COLORS` 只有 5 色）：在 `util.ts` 增补到 ~12 色，或超出后按 HSL 色相均匀生成 `hsl(i*360/n, 65%, 55%)`。
- 切到「指定单节点」或换筛选值时 `resetData()` 清空 `chartData`，`ensureSeries` 依据新一批 `chartList` 结果重建。

### 4.4 network 图 2×N 线条处理（定稿：单 Y 轴 + 实线/虚线）

`network` 块每节点有 in/out 两条线，N 节点即 2N 条，同图易糊。**定稿方案**（独立改造，见 §六 36.0，**单机/集群通用**）：仍是一张图、**共用单 Y 轴**，只靠线型区分——

- **单 Y 轴（关键）**：in/out 单位相同（Kb/s），必须同轴才能**诚实比大小**——这正是看网络图的核心诉求（读多还是写多）。双轴是同类量对比的反模式：刻度独立后「线更高」不再等于「值更大」，反而误导；且双轴不减少线条数、解决不了「糊」。故沿用现有 `options`，**不新增 `networkOptions`**。
- **线型**：`in` 实线、`out` 虚线（`borderDash: [6, 3]`），一眼分辨方向。
- **颜色**：同节点 in/out **共用同一稳定色**（`nodeColor(node)`），不同节点异色。

单节点模式同样单轴，in 实/out 虚各 1 条。多节点若个别节点流量远超其余，低流量线会被压扁——与内存/ops 等图同理，属单轴固有取舍，可接受（必要时 legend 点击隐藏高流量节点放大对比）。

### 4.5 i18n（[`zh-cn.ts`](../../src/locales/lang/zh-cn.ts) / [`en.ts`](../../src/locales/lang/en.ts)）

`nodeList` 段新增：

```ts
all: '全部节点' // en: 'All nodes'
masterOnly: '仅主节点' // en: 'Masters'
slaveOnly: '仅从节点' // en: 'Replicas'
groupQuick: '快捷筛选' // en: 'Quick filter'
groupNode: '指定节点' // en: 'Nodes'
```

> network 不拆图（同图单轴），in/out 标题沿用现有 `redisChart.networkIn`/`networkOut` 键，无需新增。

---

## 五、各注意问题的推荐解决方案

| #   | 问题                              | 推荐方案                                                                                                                                                  |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | 公共组件语义污染                  | `NodeList` 加 `filterable` opt-in，仅图表页开启；其它 6 处零改动。                                                                                        |
| ②   | 「仅主」还采从节点（性能）        | 后端 `chart_list`/`info_list` 加 `node_filter`，在 `info_list` 循环内 `continue` 跳过不匹配节点，从源头不采。                                             |
| ③   | 折线颜色跳变                      | `node → color` 模块级 `Map` 稳定映射，节点首次出现定色后固定；切筛选不清色板。                                                                            |
| ④   | 色板只有 5 色                     | 扩到 ~12 色，超出用 HSL 色相均匀生成；避免相邻节点同色。                                                                                                  |
| ⑤   | network 图 2N 条线糊              | 同图**单轴**：in 实线 / out 虚线（`borderDash`）辨方向，同节点共用稳定色；in/out 同单位必须同轴才能诚实比大小，不用双轴（双轴是同类量反模式、也不减线）。 |
| ⑥   | datasets 固定结构写死             | 改 `ensureSeries` 惰性按节点建 dataset；`initData` 只提供空块骨架。                                                                                       |
| ⑦   | 切筛选残留旧节点数据              | `watch(node, resetData)` 扩展到所有 token 值变化（`all`/`master`/`slave`/具体 `ip:port`），清空缓冲重建。                                                 |
| ⑧   | 多线时间轴对齐                    | 一次 `chartList` 用同一 `label=Date.now()` 写所有节点；新出现节点对历史点补 `null` 占位。                                                                 |
| ⑨   | legend 换行占高 / tooltip 膨胀    | 多线时 `legend.position:'bottom'`；tooltip 用 `mode:'index'` 但限制 `maxPoints` 或按角色分组；节点 >8 时 legend 支持点击隐藏单条线。                      |
| ⑩   | `chartList` 串行采 INFO 慢        | 暂不改（节点数可控）；若实测 >2s，后续把 `info_list` 循环改 `tokio::join!` 并发。                                                                         |
| ⑪   | 无 slave 时选「仅从」返回空       | 空列表时图表区显示「无匹配节点」空态，不报错。                                                                                                            |
| ⑫   | 语言切换更新 dataset label        | 多线 label 用节点 `shortLabel`/地址（非 i18n 文案），语言切换只影响块标题，无需逐线更新。                                                                 |
| ⑬   | 单机/集群取数分叉（`if (multi)`） | **取消分支**：一律 `chartList` 拿列表逐条成线，单机/单节点时列表长度为 1，同一渲染路径，更统一简洁。                                                      |
| ⑭   | 下拉「空」的语义冲突              | 图表不用空串：全部=`'all'`、仅主=`'master'`、仅从=`'slave'`、单节点=`'ip:port'` 均显式；空串与「随机节点」旧语义只属于终端等非 filterable 页。            |

---

## 六、分阶段实施

每阶段：实现 → 手工验收 → 单独 commit（一行中文 Conventional 标题，遵循 [`git-commit-conventions.mdc`](../../.cursor/rules/git-commit-conventions.mdc)）。做完跑 `vp check` + `vp test`。

### 36.0 network 实线/虚线区分 in/out（独立改造，单机/集群通用）

与多节点无关、可先行落地的纯图表改造（**保持单 Y 轴**）：

- network 块 in 实线、out 虚线（`borderDash:[6,3]`），in/out 同单位共用单轴，便于直接比大小
- 沿用现有 `options`，不引入双轴 / `networkOptions`
- 单机、集群、指定单节点下均生效（in/out 各 1~N 条）
- 验收：单机网络图虚线=out、实线=in，同轴刻度下能看出谁大。

### 36.1 后端：`node_filter` 参数

- `me_client.rs` trait `chart_list`/`info_list` 加参 + 默认实现
- `me_cluster.rs` `info_list` 过滤循环；`me_single.rs` 忽略参数
- `api.rs` 命令签名；重生成 `tauri-specta.ts`
- 验收：`chartList(id, 'master')` 只回主节点；`chartList(id, 'all')` 回全部；`chartList(id, 'ip:port')` 回单节点；单机调用不受影响。

### 36.2 NodeList `filterable` 分组下拉

- 加 prop、`el-option-group` 预设项 + i18n
- 验收：图表页出现「全部/仅主/仅从/指定节点」四态；终端/配置/慢日志/监控/客户端/信息页下拉**外观与行为不变**。

### 36.3 RedisChart 多线渲染（核心）

- `getData` 统一走 `chartList`（无 `if (multi)`）、`ensureSeries`、`nodeColor` 稳定映射、扩色板、`resetData` 扩展
- 先支持 `command`/`memory` 两块跑通多线
- 验收：集群默认仅主节点折线同屏（单机 1 条），颜色稳定，切「全部/仅从/单节点」正确重绘。

### 36.4 更多图表块多线化

- `keyTotal`/`connectedClients`/`cacheHitRatio`/`total*` 全部走 `ensureSeries`
- legend/tooltip 优化（§5⑨）
- 验收：「更多图表」开启后各块多节点正常；缓存命中率等多线 Y 轴 0~1 仍正确。

### 36.5 收尾

- 空态（§5⑪）、深色主题、窄窗口 legend 换行自查
- 勾 [`future.md`](../../docs/zh/changelog/future.md) L5/L16 对应条目；发版按 [`release-tag.mdc`](../../.cursor/rules/release-tag.mdc)
- 按 [`self-review-after-work.mdc`](../../.cursor/rules/self-review-after-work.mdc) 自查后交用户验证

---

## 七、改动清单（汇总）

### 后端

1. [`client/me_client.rs`](../../src-tauri/src/client/me_client.rs)：`chart_list`/`info_list` trait 签名 + 默认实现加 `node_filter`
2. [`client/me_cluster.rs`](../../src-tauri/src/client/me_cluster.rs)：`info_list` 过滤循环
3. [`client/me_single.rs`](../../src-tauri/src/client/me_single.rs)：`info_list` 忽略参数
4. [`api.rs`](../../src-tauri/src/api.rs)：两命令签名
5. [`lib.rs`](../../src-tauri/src/lib.rs)：specta 重生成（触发）

### 前端

1. [`views/ext/NodeList.vue`](../../src/views/ext/NodeList.vue)：`filterable` prop + 分组下拉
2. [`views/tab/RedisChart.vue`](../../src/views/tab/RedisChart.vue)：多线取数、`ensureSeries`、`nodeColor`、`resetData`、network 实虚线（单轴）、legend/tooltip
3. [`utils/util.ts`](../../src/utils/util.ts)：扩色板
4. [`locales/lang/zh-cn.ts`](../../src/locales/lang/zh-cn.ts) / [`en.ts`](../../src/locales/lang/en.ts)：`nodeList.*` 新键
5. [`types/tauri-specta.ts`](../../src/types/tauri-specta.ts)：由测试重生成，勿手改

---

## 八、风险

- **性能**：6 节点 × 100 点 × 8 图 ≈ 4800 点，Chart.js 可承受；节点 >10 或刷新 <5s 需观察。暂不动上限，实测再调。
- **`chartList` 串行采 INFO**：多节点一次采集可能 1~2s，刷新间隔不宜过小；必要时后续并发化（§5⑩）。
- **`node_filter` 角色字符串**：依赖 `flags` 含 `master`/`slave`（与仓库既有 `get_node_list_master`、`enrichNodeList` 一致）；若某些发行版报 `replica` 而非 `slave`，需兼容匹配（实施时确认目标 Redis 版本）。
- **公共组件回归面**：`NodeList` 改 `filterable` 分支务必保证 `false` 时模板零变化，逐一回归 6 个调用点。
- **多线可读性**：节点多时折线密集，靠稳定配色 + legend 点击隐藏单条缓解；不追求「所有节点永远全显」。

---

## 九、不做 / 延后

- 节点**动态增减**（扩缩容）自动重建 datasets —— 靠重连。
- 每节点**独立 Y 轴 / 小多图（small multiples）**布局。
- `chartList` 后端**并发采集**（先串行，实测慢再优化）。
- 图表数据**持久化 / 导出图片**（`图表显示优化` L17 另议）。
- CPU 占比等需两次 INFO 的派生指标（backlog L23 已标暂缓）。
- 单机模式外观/交互改动（保持现状单线）。
