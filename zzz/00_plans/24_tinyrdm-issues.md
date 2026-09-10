# 24. Tiny RDM Issue：对照 RedisME 后的结论

> **类型**：选题分析（非实现方案）  
> **日期**：2026-09-06（同日二次对照代码，纠正「已有仍写成可跟」）  
> **来源**：[tiny-craft/tiny-rdm](https://github.com/tiny-craft/tiny-rdm/issues) 543 / 543  
> **原始清单**：`zzz/00_plans/_tiny_raw/`  
> **同系列**：[23_redisinsight-issues.md](./23_redisinsight-issues.md)、[25_anotherrdm-issues.md](./25_anotherrdm-issues.md)

作者重心已转向 Redisee，未关闭需求大量打 `rewrite feature`。对 RedisME 仍是用户痛点，但 **多数 RedisME 已有**，不要当新功能排期。

判定同 23 文（已覆盖 / 可完善 / 可跟 / future / 核对 / 不跟）。

---

## 0. 结论

Tiny 543 条里，和 Insight 同题的「别名、TTL、Scan All、复制为命令、收藏、JavaSerial、Hit Rate、集群节点表」**RedisME 已覆盖**。Tiny 侧真正多出来的，主要是：切库保留筛选、值里跳转到另一个 key、同连接多 key 页签、大表跳页、Lua 草稿。

排期以 23 文 §7 为准，本文只补 Tiny 独有增量。

---

## 1. 已覆盖（Tiny 还在要，不要再写「需要支持」）

| Tiny 诉求                          | Issue                                                                                                                                                                           | RedisME                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 逻辑库备注 / 别名                  | [#522](https://github.com/tiny-craft/tiny-rdm/issues/522)、[#292](https://github.com/tiny-craft/tiny-rdm/issues/292)、[#470](https://github.com/tiny-craft/tiny-rdm/issues/470) | 切库下拉可编辑 `meta['db'+n]`                             |
| 切库显示键数 / 切库排序            | [#559](https://github.com/tiny-craft/tiny-rdm/issues/559)                                                                                                                       | `db0 (123)`，按 db index                                  |
| TTL 友好 / >30 天                  | [#122](https://github.com/tiny-craft/tiny-rdm/issues/122)、[#448](https://github.com/tiny-craft/tiny-rdm/issues/448)                                                            | 悬停已有过期时刻                                          |
| 复制为命令                         | [#571](https://github.com/tiny-craft/tiny-rdm/issues/571)、[#477](https://github.com/tiny-craft/tiny-rdm/issues/477)                                                            | 已有                                                      |
| 收藏键 / 搜索历史 / 命令提示       | [#476](https://github.com/tiny-craft/tiny-rdm/issues/476)、[#523](https://github.com/tiny-craft/tiny-rdm/issues/523)、[#483](https://github.com/tiny-craft/tiny-rdm/issues/483) | 已有                                                      |
| JavaSerial / Array / Hash 字段 TTL | [#402](https://github.com/tiny-craft/tiny-rdm/issues/402)、[#563](https://github.com/tiny-craft/tiny-rdm/issues/563)、[#393](https://github.com/tiny-craft/tiny-rdm/issues/393) | 已有                                                      |
| CONFIG 改名                        | [#27](https://github.com/tiny-craft/tiny-rdm/issues/27)                                                                                                                         | `meta.commandMap`                                         |
| 统计 Hit Rate                      | [#444](https://github.com/tiny-craft/tiny-rdm/issues/444)                                                                                                                       | Info `cacheRatio`                                         |
| 集群节点 / slot                    | [#308](https://github.com/tiny-craft/tiny-rdm/issues/308)、[#307](https://github.com/tiny-craft/tiny-rdm/issues/307)                                                            | Info `NodeList` + Slots。若还要「每 master 键数」才是增量 |
| 整库导入导出方向                   | [#383](https://github.com/tiny-craft/tiny-rdm/issues/383)                                                                                                                       | MATCH/勾选 DUMP-CSV、CMD；解码 JSON 见 23 文可完善        |
| 连接可改分组                       | [#576](https://github.com/tiny-craft/tiny-rdm/issues/576)                                                                                                                       | 编辑 `meta.group`                                         |
| Pub/Sub 指定频道、过滤             | [#521](https://github.com/tiny-craft/tiny-rdm/issues/521)、[#341](https://github.com/tiny-craft/tiny-rdm/issues/341)                                                            | 已订频道 + 表过滤                                         |
| Stream / 消费组                    | [#517](https://github.com/tiny-craft/tiny-rdm/issues/517)                                                                                                                       | 已有                                                      |
| 内存分析 / 大 key                  | [#528](https://github.com/tiny-craft/tiny-rdm/issues/528)、[#128](https://github.com/tiny-craft/tiny-rdm/issues/128)                                                            | 有 Memory 页                                              |
| SCAN 可停                          | [#472](https://github.com/tiny-craft/tiny-rdm/issues/472)                                                                                                                       | 有暂停/停止（清空搜索是否 abort：**核对**）               |
| Flatpak                            | [#74](https://github.com/tiny-craft/tiny-rdm/issues/74)                                                                                                                         | RedisME 已上                                              |

Protobuf / CBOR / Fory / Django / YAML：走自定义 Codec 或 Pretty JSON，**不内置一堆序列化**。

---

## 2. Tiny 独有、代码里确实没有

与 23 文重复的（多分隔符、按 value 搜、SSH config、多 seed、Bitmap、UNLINK）见 23 §2，此处不展开。

| 需求                                | Issue                                                                                                                | 说明                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 切库后 **保留筛选词**               | [#534](https://github.com/tiny-craft/tiny-rdm/issues/534)                                                            | `selectDB` → `initReset` 清空 keyword。小改、真缺口 |
| 值里选中文本 **当作 key 打开**      | [#557](https://github.com/tiny-craft/tiny-rdm/issues/557)                                                            | 缓存里嵌 key 名很常见                               |
| 同连接 **多 key 页签**              | [#578](https://github.com/tiny-craft/tiny-rdm/issues/578)、[#395](https://github.com/tiny-craft/tiny-rdm/issues/395) | 现一连接一值页。P2，成本中等                        |
| 大 Hash/List **跳页 / 输入 offset** | [#561](https://github.com/tiny-craft/tiny-rdm/issues/561)、[#352](https://github.com/tiny-craft/tiny-rdm/issues/352) | 已有 fieldScanCount + 续扫，无页码框                |
| 按类型或按键 **锁定默认查看方式**   | [#505](https://github.com/tiny-craft/tiny-rdm/issues/505)、[#420](https://github.com/tiny-craft/tiny-rdm/issues/420) | 与 Insight #2946 合并                               |
| 每 DB 不同分隔符                    | [#439](https://github.com/tiny-craft/tiny-rdm/issues/439)                                                            | 比多分隔符再细一档，可后做                          |
| Lua 草稿 / FUNCTION 列表            | [#385](https://github.com/tiny-craft/tiny-rdm/issues/385)、[#510](https://github.com/tiny-craft/tiny-rdm/issues/510) | 终端可 SCRIPT。P2                                   |
| 跨连接拷贝 key                      | [#83](https://github.com/tiny-craft/tiny-rdm/issues/83)                                                              | 同实例 COPY 已有。P2                                |
| 慢日志内置排除 INFO 等探测          | [#295](https://github.com/tiny-craft/tiny-rdm/issues/295)                                                            | 已有模糊过滤，差预设排除                            |

---

## 3. future / 不跟 / 核对

**future 已列**：代理 [#159](https://github.com/tiny-craft/tiny-rdm/issues/159)、Unix Socket [#156](https://github.com/tiny-craft/tiny-rdm/issues/156)、GZIP/ZSTD [#300](https://github.com/tiny-craft/tiny-rdm/issues/300)、自定义编码 Auto [#415](https://github.com/tiny-craft/tiny-rdm/issues/415)、TimeSeries / TopK。

**不跟**：FLUSH 所有 DB [#462](https://github.com/tiny-craft/tiny-rdm/issues/462)；做成 Hexhub/Docker 全能台 [#544](https://github.com/tiny-craft/tiny-rdm/issues/544)；32 位 Win。

**核对**：终端跟当前 DB [#403](https://github.com/tiny-craft/tiny-rdm/issues/403)；终端 DEL 后左侧刷新 [#375](https://github.com/tiny-craft/tiny-rdm/issues/375)；清空搜索是否 abort SCAN [#472](https://github.com/tiny-craft/tiny-rdm/issues/472)。

---

## 4. 建议排期（Tiny 增量，不重复 23）

1. 切库保留 MATCH（#534）— 与 23 文第 1 条同一件事
2. 值内「当作 key 打开」（#557）
3. 大表跳页（#561，可后）
4. 同连接多 key 页签 / Lua 草稿（P2）

SSH config、多分隔符、按值搜、UNLINK、Bitmap → 见 23 §7。

---

## 5. 普查范围（543）

| 切片                                    | 条数                         | 处理         |
| --------------------------------------- | ---------------------------- | ------------ |
| 全部                                    | 543                          | 标题过目     |
| open                                    | 173                          | 诉求类读正文 |
| feature / enhancement / rewrite feature | ~107 标签 + 大量 `[FEATURE]` | 纳入上表     |

构成：大量 Windows/mac 白屏、杀毒、WebView2、发行渠道。功能向已收进 §1–§2。
