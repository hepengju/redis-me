# 25. Another RDM Issue：对照 RedisME 后的结论

> **类型**：选题分析（非实现方案）  
> **日期**：2026-09-06（同日二次对照代码，纠正「已有仍写成可跟」）  
> **来源**：[qishibo/AnotherRedisDesktopManager](https://github.com/qishibo/AnotherRedisDesktopManager/issues) 1124 条  
> **原始清单**：`zzz/00_plans/_another_raw/`  
> **同系列**：[23_redisinsight-issues.md](./23_redisinsight-issues.md)、[24_tinyrdm-issues.md](./24_tinyrdm-issues.md)

Another 历史更长：分组、树、Stream、JSON 等很多 **closed = 他们后来做了**。RedisME 对应能力多数已有。热度 `+N` 为 thumbs up。

判定同 23 文。

---

## 0. 结论

Another 1124 条里，喊了多年的分组、别名、切库键数、复制连接、密码眼睛、精确字段搜、收藏、类型筛选、List 倒序、测试连接——**RedisME 都已有**。

未关闭里真正还缺的，集中在 **SSH Agent / 跳板 / 交互认证**（代理和 SSH×集群已在 future）。不要把已覆盖项再写进排期。

---

## 1. 已覆盖（不要再写「需要支持」）

| Another 诉求                          | 代表 Issue                                                                                                                                                                                                                         | RedisME                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 连接文件夹 / 分组                     | [#830](https://github.com/qishibo/AnotherRedisDesktopManager/issues/830) +6 等一长串                                                                                                                                               | **已有分组**（他们 2026-07 才补）                     |
| DB 别名 / 备注                        | [#957](https://github.com/qishibo/AnotherRedisDesktopManager/issues/957)、[#1149](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1149) +4                                                                            | 切库下拉可编辑定制名称                                |
| 切库显示键数量                        | [#637](https://github.com/qishibo/AnotherRedisDesktopManager/issues/637)                                                                                                                                                           | `db0 (123)`                                           |
| 测试连接                              | [#1381](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1381) +2                                                                                                                                                      | 已有                                                  |
| 复制连接                              | [#412](https://github.com/qishibo/AnotherRedisDesktopManager/issues/412)                                                                                                                                                           | `TabConn` 复制 → 新建表单                             |
| 密码小眼睛                            | [#1391](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1391)                                                                                                                                                         | `show-password`                                       |
| Hash 字段精确搜                       | [#892](https://github.com/qishibo/AnotherRedisDesktopManager/issues/892)、[#427](https://github.com/qishibo/AnotherRedisDesktopManager/issues/427)                                                                                 | `fieldExact` 勾选                                     |
| 导出选中键为命令                      | [#1368](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1368)                                                                                                                                                         | CMD 导出 / 复制为命令                                 |
| 收藏键                                | [#1364](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1364)                                                                                                                                                         | 已有                                                  |
| List 正序倒序                         | [#1353](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1353)                                                                                                                                                         | 已有                                                  |
| 主题跟随系统                          | [#535](https://github.com/qishibo/AnotherRedisDesktopManager/issues/535)                                                                                                                                                           | `system`                                              |
| 按类型筛选                            | [#664](https://github.com/qishibo/AnotherRedisDesktopManager/issues/664)                                                                                                                                                           | 类型下拉                                              |
| 搜索历史                              | [#897](https://github.com/qishibo/AnotherRedisDesktopManager/issues/897)                                                                                                                                                           | 已有                                                  |
| 只读模式                              | [#795](https://github.com/qishibo/AnotherRedisDesktopManager/issues/795)                                                                                                                                                           | 已有                                                  |
| TTL 可读 / 换单位                     | [#1016](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1016)、[#1078](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1078)                                                                             | 悬停过期时刻；改 TTL 有单位                           |
| JavaSerial / HEXPIRE / Vector / Array | [#1155](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1155)、[#1252](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1252)、[#1394](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1394) | 已有                                                  |
| 大 value 加载前提示                   | [#1051](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1051)                                                                                                                                                         | String 阈值保护                                       |
| JSON 值内搜索                         | [#497](https://github.com/qishibo/AnotherRedisDesktopManager/issues/497)                                                                                                                                                           | CodeMirror 查找                                       |
| 连接导入导出                          | 大量                                                                                                                                                                                                                               | 已有（含 Another 格式导入）                           |
| 默认打开指定 DB                       | [#614](https://github.com/qishibo/AnotherRedisDesktopManager/issues/614)                                                                                                                                                           | 连接已存 db                                           |
| Flatpak                               | [#1063](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1063)                                                                                                                                                         | RedisME 已上                                          |
| 集群节点可视（方向）                  | [#872](https://github.com/qishibo/AnotherRedisDesktopManager/issues/872)                                                                                                                                                           | Info `NodeList` + Slots；若还要每 master 键数才是增量 |

CBOR / Kryo / Hessian / Fory / Protostuff：自定义 Codec，**不内置**。

---

## 2. 真正缺口（Another 侧还值得跟的）

与 23 重复的（多分隔符、按 value 搜、SSH config）见 23 §2。

| 需求                   | Issue                                                                                                                                                | 说明                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| SSH **ssh-agent**      | [#781](https://github.com/qishibo/AnotherRedisDesktopManager/issues/781) open **+8**                                                                 | 现只粘贴/选私钥。生产很常见；Tiny 1.2.6 已加。三家里赞最高的连接类之一 |
| keyboard-interactive   | [#1186](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1186)                                                                           | 与 23 #3214、Tiny #218 合并                                            |
| 两跳 / ProxyJump       | [#351](https://github.com/qishibo/AnotherRedisDesktopManager/issues/351)、[#1177](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1177) | 跟 `.ssh/config` 一起                                                  |
| 默认精确搜索（设置项） | [#1356](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1356)                                                                           | **已有精确勾选**，只是默认模糊。可加设置，不是新搜索能力               |
| 中键关页签             | [#1385](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1385)                                                                           | 小体验                                                                 |
| 命令收藏一条           | [#1373](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1373)                                                                           | 已有命令日志 + 终端历史，差「钉住一条」                                |
| 按 key 记住 Proto      | [#1417](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1417)                                                                           | 无 proto UI；与每键记住编码合并即可                                    |
| 集合类型跳页           | [#742](https://github.com/qishibo/AnotherRedisDesktopManager/issues/742)                                                                             | 与 Tiny #561 一起                                                      |
| 改 key 少弹确认        | [#1370](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1370)                                                                           | 设置可关，默认仍确认                                                   |

---

## 3. future / 不跟

**future 已列**：HTTP/SOCKS 代理（[#952](https://github.com/qishibo/AnotherRedisDesktopManager/issues/952) +4 等）、SSH+Cluster（[#1054](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1054)）、Gzip/LZ4/Snappy Viewer、树节点内存、TimeSeries。

**不跟**：SSDB / Codis / 鸿蒙包 / 云同步账号；SCAN 被禁时改回 KEYS（文档提示即可）。

---

## 4. 三家对照（避免重复立项）

| 主题                          | Insight       | Tiny        | Another          | RedisME                  |
| ----------------------------- | ------------- | ----------- | ---------------- | ------------------------ |
| DB 别名 / 切库键数            | #6437 / #3323 | #522        | #957 / #637      | **已有**                 |
| TTL 时刻                      | #2548         | #122        | #1016            | **悬停已有**；日历是增量 |
| Scan All                      | #526          |             |                  | **已有加载全部**         |
| Ctrl+F                        | #2180         |             | #497             | **已有**                 |
| 复制连接 / 密码眼睛           |               |             | #412 / #1391     | **已有**                 |
| 按值搜                        | #4163         | #511        | #1174            | **可跟**（当前页）       |
| 多分隔符                      | #3989         | #183        | #1150            | **可跟**                 |
| SSH agent / config / 交互认证 | #1880 / #3214 | #426 / #218 | **#781** / #1186 | **可跟**（SSH 专题）     |
| 代理 / Unix / 解压 / SSH×集群 | #4665 等      | #159 等     | #952 等          | **future**               |
| 连接分组                      |               |             | 喊了多年         | **已有**                 |
| Bitmap                        | #877          | #495        | #1322            | P2                       |
| 切库保留筛选                  |               | **#534**    |                  | **可跟**（小改）         |

---

## 5. 建议排期（Another 增量）

1. **SSH Agent**（#781）— 并入 23 文 SSH 专题，不要单独再开「连接文件夹 / 别名」
2. 默认精确：可选设置（#1356），勾选已存在
3. 中键关页签（#1385，可后）

不要再排：别名、键数、复制连接、密码眼睛、Hash 精确搜、Scan All、Ctrl+F。

---

## 6. 普查范围（1124）

| 切片                                  | 条数 | 处理              |
| ------------------------------------- | ---- | ----------------- |
| 全部                                  | 1124 | 标题过目          |
| open                                  | 147  | 功能/连接类读正文 |
| new feature wanted + Feature Optimize | 83   | 纳入上表          |

构成：早期大量「要树/分组/哨兵/Stream/JSON」现已实现；现存 open 里包装、SSH 失败、白屏仍多。
