# 23. Redis Insight Issue：对照 RedisME 后的结论

> **类型**：选题分析（非实现方案）  
> **日期**：2026-09-06（同日二次对照代码，纠正「已有仍写成可跟」）  
> **来源**：[redis/RedisInsight Issues](https://github.com/redis/RedisInsight/issues)（含已关闭）809 / 809  
> **原始清单**：`zzz/00_plans/_insight_raw/`  
> **同系列**：[24_tinyrdm-issues.md](./24_tinyrdm-issues.md)、[25_anotherrdm-issues.md](./25_anotherrdm-issues.md)  
> **前序**：[future.md](../../docs/zh/changelog/future.md)

Insight 用户要的很多能力，**RedisME 已经有了**。下文先列「不要再立项」，再列真正缺口。排期只含后者。

判定（收紧后）：

| 标记            | 含义                                   |
| --------------- | -------------------------------------- |
| **已覆盖**      | 代码里已有对应用户路径，Issue 只当备忘 |
| **可完善**      | 有雏形，差一截（不是从零）             |
| **可跟**        | 代码里没有                             |
| **future 已列** | 已在 `future.md`，本文不另立项         |
| **核对**        | 可能是 bug / 边界，先手测再决定        |
| **不跟**        | 云 / Copilot / 模块护城河 / 过窄       |

---

## 0. 结论（先看这个）

Insight 809 条里，桌面 RDM 高频诉求大约一半 RedisME 已覆盖（TTL 悬停过期时刻、逻辑库别名、扫完全部、Ctrl+F、切库带键数、复制为命令、收藏、SCAN、Hash 字段 TTL 等）。

首轮文档把这些仍写进「建议优先 / 近期小步」，会误导排期。本次纠正后：

- **不要当新功能做**：§1
- **真缺口很少**：§2（多分隔符、键列表 TTL 列、按 value 搜、自然序、UNLINK、SSH 增强、集群 seed/DNS 等）
- **已在 future**：代理、Unix Socket、SSH×集群/哨兵、解压

---

## 1. 已覆盖（竞品还在要，RedisME 不要再写「需要支持」）

| 竞品诉求                                  | 代表 Issue                                                                                                             | RedisME 现况                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| TTL 不要只显示「23h」，要过期时刻         | [#2548](https://github.com/redis/RedisInsight/issues/2548)                                                             | 值页 TTL **悬停**已有本地/UTC/剩余秒（`formatTtlExpireTooltip`）；Hash 字段 TTL 列同样有 tooltip。主文案仍是剩余时间，这是展示偏好，不是缺功能 |
| 改 TTL 换单位                             | [#1078](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1078) 等同题                                      | `TTLSet` 已支持秒/分/时/天                                                                                                                     |
| 逻辑库别名（db0=会话）                    | [#6437](https://github.com/redis/RedisInsight/issues/6437)、[#1816](https://github.com/redis/RedisInsight/issues/1816) | 切库下拉可 **编辑定制名称**（`meta['db'+n]`，`editDbName`）                                                                                    |
| 切库下拉带各库键数                        | [#3323](https://github.com/redis/RedisInsight/issues/3323)、[#2499](https://github.com/redis/RedisInsight/issues/2499) | 已是 `db0 (123)`（`dbSizeMap`）                                                                                                                |
| Scan All / 不要连点 Scan more             | [#526](https://github.com/redis/RedisInsight/issues/526)、[#1841](https://github.com/redis/RedisInsight/issues/1841)   | 底栏已有 **加载更多** + **加载全部**（`scanKey(..., loadAll=true)` 扫到 cursor 结束，可暂停）                                                  |
| 长 String / JSON 里 Ctrl+F                | [#2180](https://github.com/redis/RedisInsight/issues/2180)、[#4424](https://github.com/redis/RedisInsight/issues/4424) | `MeCode` 已接入 CodeMirror `searchKeymap`                                                                                                      |
| Hash 字段精确搜                           | [#427](https://github.com/qishibo/AnotherRedisDesktopManager/issues/427) 等同题                                        | 字段 MATCH + **精确勾选**（`fieldExact`）                                                                                                      |
| 自定义字体                                | [#1837](https://github.com/redis/RedisInsight/issues/1837)                                                             | 设置已有界面字体 / 代码字体；终端与编辑器走 `--code-font`                                                                                      |
| 搜索历史 / 收藏键 / 类型筛选 / 精确 MATCH | [#1611](https://github.com/redis/RedisInsight/issues/1611) 等                                                          | 均已有                                                                                                                                         |
| 复制为命令 / COPY 副本 / 多选导出         | [#3288](https://github.com/redis/RedisInsight/issues/3288) 等                                                          | 已有                                                                                                                                           |
| 树节点删子树                              | [#3700](https://github.com/redis/RedisInsight/issues/3700)                                                             | 文件夹右键批量删                                                                                                                               |
| 导入忽略 TTL                              | [#2701](https://github.com/redis/RedisInsight/issues/2701)                                                             | 导入 TTL：解析文件 / 永久                                                                                                                      |
| 集群 CLI 打指定节点                       | [#2809](https://github.com/redis/RedisInsight/issues/2809)                                                             | 终端节点下拉 + 广播                                                                                                                            |
| 关 TLS 校验                               | [#4471](https://github.com/redis/RedisInsight/issues/4471)                                                             | `#insecure` + CA 文件                                                                                                                          |
| MsgPack / Java / PHP / 二进制键 / Auto    | #106 等                                                                                                                | 已有且更强                                                                                                                                     |
| ACL / Monitor / Stream / PubSub 按频道    | #52 #3138                                                                                                              | 已有                                                                                                                                           |
| 连接颜色 / 分组 / 多页签 / 切 DB          | #3693 #3128                                                                                                            | 已有                                                                                                                                           |
| 用 SCAN 不要 KEYS                         | #3706                                                                                                                  | 键列表已 SCAN                                                                                                                                  |
| Hit Rate                                  | Tiny [#444](https://github.com/tiny-craft/tiny-rdm/issues/444)                                                         | Info 已算并展示 `cacheRatio`                                                                                                                   |
| 复制连接                                  | Another [#412](https://github.com/qishibo/AnotherRedisDesktopManager/issues/412)                                       | `TabConn` `@copy` → `ConnSave` 新增并重置 id                                                                                                   |
| 密码小眼睛                                | Another [#1391](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1391)                                     | `show-password`                                                                                                                                |
| List 正序倒序                             | Another [#1353](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1353)                                     | 已有                                                                                                                                           |
| 测试连接                                  | Another [#1381](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1381)                                     | 已有                                                                                                                                           |
| 集群节点 / slot                           | Tiny [#308](https://github.com/tiny-craft/tiny-rdm/issues/308)                                                         | Info `NodeList` 已有节点与 Slots                                                                                                               |

**内联过期时刻、表格铺等宽字体、别名再加标签/可分享 json**：属于打磨，不要再写成「需要支持别名 / 需要 Scan All / 需要 Ctrl+F」。

---

## 2. 真正缺口（代码里没有，值得跟）

只列 RedisME **没有**的能力。Issue 热度仅作参考。

| 需求                                                                | 代表 Issue                                                                                                                                                                         | 说明                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **多个**键分隔符（`:` 且 `/`）                                      | [#3989](https://github.com/redis/RedisInsight/issues/3989)                                                                                                                         | 现仅单个 `meta.keySeparator`                                              |
| 键树/列表 **TTL、Size 列** + 按即将过期过滤                         | [#4062](https://github.com/redis/RedisInsight/issues/4062)                                                                                                                         | 现无列；批量改 TTL 只能勾已上屏的键。要补 `PTTL`/`MEMORY USAGE`，注意性能 |
| Hash/List **按 value 内容**过滤                                     | [#4163](https://github.com/redis/RedisInsight/issues/4163)                                                                                                                         | MATCH 是字段名 glob，不是值；当前页本地滤即可先做                         |
| 键名 **自然排序**（`item:2` &lt; `item:10`）                        | [#5461](https://github.com/redis/RedisInsight/issues/5461)                                                                                                                         | 现字符串序                                                                |
| 批量删走 **UNLINK**（不支持再回退 DEL）                             | [#4658](https://github.com/redis/RedisInsight/issues/4658)                                                                                                                         | `batch_del` 现走 `DEL`                                                    |
| 集群 **多个 seed**                                                  | [#5379](https://github.com/redis/RedisInsight/issues/5379)                                                                                                                         | 现单 host:port                                                            |
| 集群发现后 **保留用户填的 hostname**，不要钉内网 IP                 | [#1931](https://github.com/redis/RedisInsight/issues/1931) open +8                                                                                                                 | 弹性云很常见；实现前先核对 redis-rs 发现逻辑                              |
| SSH：`~/.ssh/config` / ProxyJump / keepalive / keyboard-interactive | [#1880](https://github.com/redis/RedisInsight/issues/1880)、[#6292](https://github.com/redis/RedisInsight/issues/6292)、[#3214](https://github.com/redis/RedisInsight/issues/3214) | 现粘贴/选私钥；agent 见 25 文                                             |
| 改 TTL **日历 / PEXPIREAT**                                         | [#2548](https://github.com/redis/RedisInsight/issues/2548) 的绝对时间部分                                                                                                          | 相对时长已有；缺绝对时刻                                                  |
| Bitmap **位视图**                                                   | [#877](https://github.com/redis/RedisInsight/issues/877)                                                                                                                           | 无独立位表；BIT* 在终端。P2                                               |
| 已扫结果上叠加 **正则排除**                                         | [#2961](https://github.com/redis/RedisInsight/issues/2961)                                                                                                                         | 不必改 Redis MATCH                                                        |
| 每键记住展示编码                                                    | [#2946](https://github.com/redis/RedisInsight/issues/2946)                                                                                                                         | 现页级，换键可能被带走。P2                                                |
| 导出 **解码后 JSON**（带 db 字段）                                  | [#3819](https://github.com/redis/RedisInsight/issues/3819) +14                                                                                                                     | 已有 DUMP-CSV/CMD；不要新做 Bulk Action。大库二次确认                     |
| 切库 **不清空搜索框**                                               | Tiny [#534](https://github.com/tiny-craft/tiny-rdm/issues/534)                                                                                                                     | `selectDB` → `refresh` → `initReset` 会清空 `keyword`。真缺口             |

Protobuf schema UI（[#4200](https://github.com/redis/RedisInsight/issues/4200)）：自定义 Codec 已能外包 `protoc`，**不单做一等公民**。

---

## 3. 可完善（有雏形，不要当新功能）

| 点                             | Issue | 差在哪                                                             |
| ------------------------------ | ----- | ------------------------------------------------------------------ |
| TTL 主文案内联过期时刻         | #2548 | tooltip 已满足原诉求；内联是展示偏好                               |
| 键树/表格单元格走代码等宽字体  | #4896 | 设置已有字体，未铺到树/表                                          |
| 扫完全部时树根是否齐全         | #4510 | 按钮已有；若 SCAN 先填满 `a:*` 提前停，可能看不到 `c:`，属扫描策略 |
| 首页连接过滤进库再返回         | #3181 | 有 keyword；是否保持需手测                                         |
| 终端写命令后刷新左侧           | #171  | 有手动刷新                                                         |
| 超时可取消、失败仍能改 Host    | #3598 | 体验                                                               |
| 删键确认可关                   | #2979 | 默认仍应确认                                                       |
| 连接级 DB 颜色 / Prod 防误操作 | #2911 | 已有连接颜色；环境标签可后做                                       |

---

## 4. future.md 已列（本文不立项）

代理 HTTP/SOCKS5、Unix Socket、SSH×集群/哨兵、连接级 GZIP/LZ4/ZSTD/Snappy、Viewer Gzip/Deflate/Brotli（含 GLIDE 短魔数 [#6451](https://github.com/redis/RedisInsight/issues/6451)）、树节点内存、TimeSeries、RedisSearch、CLI。

---

## 5. 核对（可能是 bug，不是新功能）

Hash `"00014"` 当前导零 [#6269](https://github.com/redis/RedisInsight/issues/6269)；JSON 大整数精度 [#4858](https://github.com/redis/RedisInsight/issues/4858)；集群从节点是否进列表 [#3685](https://github.com/redis/RedisInsight/issues/3685)；证书轮换后能否改 [#5179](https://github.com/redis/RedisInsight/issues/5179)；Pickle 协议 4/5 [#2083](https://github.com/redis/RedisInsight/issues/2083)；JavaSerial 日期 [#2667](https://github.com/redis/RedisInsight/issues/2667)。

---

## 6. 不跟

云账号 / AWS IAM / Azure Entra、Copilot、Workbench、Search/TS/GEO 地图、Bloom GUI、Agent Memory、Docker Extension、全库模糊搜（会 KEYS）。

---

## 7. 建议排期（只含真缺口）

**近期（小、桌面本职）**

1. 切库保留 MATCH（Tiny #534，改 `initReset` 即可）
2. 自然排序（#5461）
3. 批量删 UNLINK（#4658）
4. 改 TTL 增加日历 / `PEXPIREAT`（相对时长已有）
5. 字段表当前页按 value 过滤（#4163 本地先做）

**随后**

6. 多分隔符（#3989）
7. 键列表可选 TTL/Size 列 + 过期过滤（#4062）
8. 集群多 seed + 保留 hostname（#5379 / #1931）
9. SSH keepalive / config / 交互认证 / agent（与 24、25 合并成 SSH 专题）
10. 导出 JSON 选项（#3819 收敛版）

**P2 / 跟 future**

- Bitmap 位视图、每键记住编码、正则排除
- 代理、Unix Socket、SSH×集群、解压 → `future.md`

**不要再排**

- 逻辑库别名、Scan All、Ctrl+F、切库键数、TTL hover、复制连接、Hit Rate、Hash 字段精确搜

---

## 8. 普查范围（809）

| 切片            | 条数 | 处理                |
| --------------- | ---- | ------------------- |
| 全部 Issue      | 809  | 标题过目            |
| open            | 66   | 正文                |
| `label:feature` | 318  | 标题 + 绝大多数正文 |

粗分（可重叠）：云/OAuth ~37，Docker ~39，i18n ~40，CVE ~8，空白屏 ~14。剩下才是桌面功能。

原始标题：[`_insight_raw/all-titles.txt`](./_insight_raw/all-titles.txt)。
