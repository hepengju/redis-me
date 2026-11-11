# 38. 开发 / 运维向：下一轮功能选题

> **类型**：选题（非实现方案）  
> **日期**：2026-11-09（同日按三家开放 Issue 增补 §3.8 起）  
> **视角**：写业务时要核对数据的开发，和值班时要回答「慢在哪、为何涨内存、主从齐不齐」的运维  
> **对照**：[`future.md`](../../docs/zh/changelog/future.md)、[23](./23_redisinsight-issues.md) / [24](./24_tinyrdm-issues.md) / [25](./25_anotherrdm-issues.md)；2026-11-09 重拉 [RedisInsight](https://github.com/redis/RedisInsight/issues)、[Another RDM](https://github.com/qishibo/AnotherRedisDesktopManager/issues)、[Tiny RDM](https://github.com/tiny-craft/tiny-rdm/issues) 的开放 Issue（按 reaction 排序，并点开正文）

键浏览、内存扫描、慢日志原文、图表、客户端断开、ACL、键迁移都已经有了。下面只排 **还没有入口、又是日常会反复做** 的事。

---

## 0. 结论（按落地排序）

正文编号 §3.1–§3.17 保持不动，避免互相引用错位。**做的顺序以这张表为准。**

判断标准：改动是不是落在现有页面上、数据是不是已经回来了、要不要新开一条后端命令、会不会碰到集群拨号或进程生命周期。用户票数高的集群地址、本机 SSH、可读导出都靠后，因为好落地的不是它们。

| 顺序 | 功能                        | 为什么好落地 / 为什么靠后                                                                      | 现状（2026-11-10 核对）                                                                                                       |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | 当前页按值过滤 §3.16        | 字段表已有本地筛选，把匹配从字段名扩到值。不打服务器                                           | **已有，不必再做。** 输入即对已加载行本地包含匹配：Hash / Set / ZSet 看字段名和值（ZSet 含分数），List 看值和下标。不打服务器 |
| 2    | 按完整键名直接打开 §3.12    | 精确回车先走 `TYPE`/`EXISTS`。值里「作为键打开」是同一条路                                     | **已完成。** 勾选精确后回车或点历史走 `EXISTS`，正好 1 条时直接打开值页。值里「作为键打开」不跟                               |
| 3    | 多种分隔符 §3.13            | `splitKeyPath` 现在按整段分隔符切。改成「每个字符都是一层」，并改拼接。范围就在 `conn.ts` 和树 | **先不做。** 等有用户带着真实键名再定。建议已写在 §3.13                                                                       |
| 4    | 大 List / ZSet 跳下标 §3.14 | `LRANGE` / `ZRANGE` 本来就有 start/stop。加一个起始下标。Hash / Set 不动                       | **已完成。** List 已有索引最小/最大。ZSet 用分数范围，不另做下标                                                              |
| 5    | 已加载键的 TTL 列 §3.11     | 只对当前已加载行批量 `PTTL`，再筛、再走现有批量删除                                            |                                                                                                                               |
| 6    | 命令画像 §3.1               | `INFO` 里已有 `cmdstat_*`，收成可排序的表。慢日志藏掉自己的 `INFO` 同批做。单独发版就做这条    |                                                                                                                               |
| 7    | 复制健康 §3.4               | 主从字段已在信息页的 replication 分类里，拆成从库表即可。哨兵的 `SENTINEL` 命令另加，可第二步  |                                                                                                                               |
| 8    | Stream 待处理积压 §3.6      | 消费者组弹框已有。补 `XPENDING`，后端照 `xinfo_groups` 加一条命令                              |                                                                                                                               |
| 9    | 生产环境确认 §3.7           | 连接多一个环境字段。生产标记只包住批量删除和清空库                                             |                                                                                                                               |
| 10   | 延迟事件 §3.2               | `LATENCY LATEST` / `DOCTOR` 两张只读结果。命令要新包一层，界面是一张表                         |                                                                                                                               |
| 11   | 按键名选用解码器 §3.15      | 自定义解码器加一条通配，命中则排在 Auto 前面。试解顺序要手测                                   |                                                                                                                               |
| 12   | 无 TTL 键巡检 §3.3          | 新扫描任务。进度、暂停、停止抄内存分析                                                         |                                                                                                                               |
| 13   | 可读 JSON 导出 §3.10        | 导出对话框已有 DUMP / CMD。另加一种解码后的 JSON，并守住 String 大小阈值                       |                                                                                                                               |
| 14   | 两连接同名键对比 §3.5       | 双连接和进度可抄键迁移。比的是类型、TTL 档、长度，不拉全量 value                               |                                                                                                                               |
| 15   | 集群种子与通告地址 §3.8     | 要改集群发现：多 seed、不可达时用种子域名、连接配置不能被改写成内网 IP。票数高，落地靠后       |                                                                                                                               |
| 16   | 委托本机 OpenSSH §3.9       | 要拉起系统 `ssh -N -L`，管进程、端口和断开。Windows 上 OpenSSH 还不一定在。票数高，落地靠后    |                                                                                                                               |
| 17   | 脚本与 Function 列表 §3.17  | 不单开。跟 `future.md` 的查询工作台一起做                                                      |                                                                                                                               |

前 5 条可以连着做，都是现有界面上的小改。其中第 1、2、4 条已完成，第 3 条先不做。第 6 条是第一件值得单独发版的功能：数据已经在，值班用得上。第 15、16 条先不要因为票数靠前就开工。

---

## 1. 已经有，不要再立项

| 能力                                       | 现况                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 总 QPS、内存、网络、命中率、集群多节点折线 | 图表页                                                                                                                                   |
| 慢日志列表、模糊过滤、慢参数广播           | 慢日志页                                                                                                                                 |
| 大 key / 内存分析，可暂停继续停止          | 内存页                                                                                                                                   |
| 客户端列表、复制原始行、按地址断开         | 信息 → 客户端                                                                                                                            |
| ACL 用户、DRYRUN、日志                     | 信息 → ACL                                                                                                                               |
| 键空间通知                                 | 通知页                                                                                                                                   |
| Stream 消费者组与消费者                    | 值页 `XINFO GROUPS` / `CONSUMERS`                                                                                                        |
| 跨连接搬键                                 | 键迁移（只复制，不对比）                                                                                                                 |
| 连接颜色、分组、只读切换                   | 连接管理                                                                                                                                 |
| SSH 会话保活                               | russh 已每 30 秒 keepalive。Insight [#6292](https://github.com/redis/RedisInsight/issues/6292) 不必再做                                  |
| `user::id` 不出现空层                      | 连续相同分隔符已折成一次。Another [#1150](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1150) 的空层不必再做              |
| 键搜索按回车才 SCAN                        | 不是每输入一个字就扫。Tiny [#557](https://github.com/tiny-craft/tiny-rdm/issues/557) 只剩「精确名仍要 SCAN」                             |
| JSON 美化不改数字字面量                    | 只动空白，不 `JSON.parse`。Another [#1109](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1109) 的 `22.00` → `22` 不必再做 |
| 终端指定集群节点                           | 节点下拉 + 广播。Insight [#2809](https://github.com/redis/RedisInsight/issues/2809) 不必再做                                             |
| 大 String 打开前确认                       | 阈值保护。Another [#1051](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1051) 已覆盖                                      |
| 反复打开同一个键                           | 收藏 + 搜索历史。Insight [#4493](https://github.com/redis/RedisInsight/issues/4493) 已覆盖                                               |

---

## 2. `future.md` 里和本角度重叠的

这些仍然值得做，本文不另写方案，避免两处排期：

| 已列项                                      | 和开发 / 运维的关系                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 查询工作台（多行脚本、结果表）              | 开发每天敲命令时，比下面任何新页都直接。若下一版受众是「写命令的人」而不是「值班的人」，把它排在命令画像前面 |
| 树节点内存占用                              | 和「无 TTL 巡检」互补：一个看子树有多大，一个看谁没设过期                                                    |
| 连接级自动解压、Viewer 解压                 | 开发看业务 value，不解决排障                                                                                 |
| 各类型命令更丰富、通知事件分类              | 值页打磨                                                                                                     |
| ACL 自定义角色、模块命令、TimeSeries 全参数 | 深度能力，不是值班第一刀                                                                                     |
| `rme` / CLI、MCP、主题、登录、应用商店      | 不在本次运维排障范围                                                                                         |

---

## 3. 建议新做

### 3.1 命令画像

**场景**：接口变慢或 CPU 升高。图表显示 8 万 QPS，仍不知道是 `GET`、`HGETALL` 还是某个 `EVAL`。

**首版**

- 数据：`INFO commandstats`（集群按节点，与图表的节点选择同一套）。
- 表列：命令、调用次数、总耗时、平均耗时、拒绝次数、失败次数（Redis 7+ 才有后两列，没有则留空）。
- 默按总耗时降序。沿用 MeTable：排序、导出跟列走。
- 入口：慢日志页增加「命令统计」页签，或信息页 `commandstats` 分类换成这张表。二选一，不要两个入口。
- 同一批把慢日志 **按命令汇总**（次数、最大、平均）放在现有慢日志表上方或一个切换。原文列表保留。
- 慢日志默认藏掉 `INFO` / `COMMAND` / `SLOWLOG` / `LATENCY` / `PING`（客户端自己的巡检，Tiny [#295](https://github.com/tiny-craft/tiny-rdm/issues/295)）。开关可恢复。

**不做**

- 用 `MONITOR` 采样做 Profiler。服务器要为每条命令付输出成本，图表和监视器已经覆盖「此刻在跑什么」。
- 百分位、火焰图、按 key 聚合。`commandstats` 没有这些字段。
- 跨节点把次数加总后假装是集群总量（各节点计数口径不同，加总会误导）。集群保持「先选节点」。

### 3.2 延迟事件

**场景**：慢日志是空的，但主从切换或 `BGSAVE` 之后有明显卡顿。原因经常是 fork、AOF 刷盘、过期循环，不是某一条慢命令。

**首版**

- `LATENCY LATEST`：事件名、最近发生时间、最近延迟、该事件历史最大延迟。
- `LATENCY DOCTOR`：原文放在表下方，只读。
- 服务端 `latency-monitor-threshold` 为 0 时，表为空并说明要先把该参数设成毫秒阈值（可跳到已有的参数编辑，不在本页直接 `CONFIG SET`）。

**不做**

- `LATENCY GRAPH` 的终端火花线、`LATENCY HISTOGRAM`。首版一张表加一段医生原文就够。
- `LATENCY RESET`。会清掉现场。

### 3.3 无 TTL 键巡检

**场景**：内存持续涨，内存页里最大的 key 并不夸张。常见是缓存、会话、验证码没设过期，键数量本身在涨。

**首版**

- 任务形态对齐内存分析：`SCAN` + 批量 `PTTL`，进度、暂停、继续、停止。
- 条件：`MATCH`（可空）、只看无过期、或剩余 TTL 小于 N 秒。
- 结果列：键、类型、TTL。支持导出。
- 集群只扫 master。设扫描上限，避免无确认地打满一整库。

**不做**

- 在键树每一行实时 `PTTL` / `MEMORY USAGE`。滚动时会放大请求。
- 同一次扫描里再调用 `MEMORY USAGE`。大 key 仍走内存页。
- 扫完自动 `EXPIRE` 或删除。巡检只读。

### 3.4 复制与哨兵健康

**场景**：主从「看起来连着」，从库数据却旧；或哨兵里某个 sentinel 主观下线。这些字段今天在信息页 replication 分类里，是扁平行，滞后秒数不突出。

**首版**

- 单机 / 主从：角色、主从链路是否在线、主库偏移、每个从库的状态、偏移差、`lag`（秒）。链路断开或 `lag` 超过阈值时整行标出。
- 当前连接是哨兵时：`SENTINEL MASTERS` / `REPLICAS` / `SENTINELS`，列里保留 flags、主观下线、客观下线。
- 挂在信息页，数据仍来自现有 `INFO`，不新开顶栏页签。

**不做**

- `REPLICAOF`、`SENTINEL FAILOVER`、集群 failover。改拓扑留给终端，并走人工确认。
- 把滞后画成历史折线。图表页若以后要加，单独再开。

### 3.5 两连接同名键对比

**场景**：迁移刚跑完，或本地改了一版缓存结构，要知道测试库和本地哪些键不一致。现在只能再迁一次或逐个打开。

**首版**

- 选两个已保存连接（及 DB）。同一连接同一 DB 拒绝；同一连接不同 DB 允许。
- 键范围：`MATCH` 或勾选，带数量上限。
- 每个键只比低成本字段：是否存在、类型、TTL 档（缺失 / 无过期 / 有过期）、尺寸（String 用 `STRLEN`，集合用 `HLEN` / `SCARD` / `ZCARD` / `LLEN` / `XLEN`）。
- 结果只列出差异：仅左侧、仅右侧、类型不同、尺寸不同、TTL 档不同。

**不做**

- 首版拉全量 value 或 `DUMP` 做字节级对比。大 String 和 Java 序列化会把对比变成另一次迁移。
- 对比完直接把差异再迁过去。迁移动作仍走键迁移。
- RedisSearch 索引、Stream 消费组位点。

### 3.6 Stream 待处理积压

**场景**：消费组「有消费者、lag 在涨」。现有弹框能看到组和消费者，看不到 PEL 里堆了多少、堆在谁身上、最老的一条是什么。

**首版**

- 就在现有消费者组弹框上加：`XPENDING` 摘要（条数、最小 ID、最大 ID、各消费者待处理数）。
- 点某个消费者再拉一页待处理 ID（只读）。

**不做**

- `XACK` / `XCLAIM` / `XNACK`。确认错一条消息就找不回来，首版不提供按钮。
- 全库扫描所有 Stream。只查当前打开的这个键。

### 3.7 生产环境确认

**场景**：桌面客户端可以同时打开本地和生产。连接颜色已经能涂红，但批量删除、`FLUSHDB` 不会因为「这是生产」而多问一句。

**首版**

- 连接增加环境：未标记 / 开发 / 测试 / 生产。默认未标记，行为与现在一致。
- 标记为生产时，批量删除、清空库、`FLUSHALL` 要求再输入连接名后才执行。
- 顶栏或页签上显示生产标记，不依赖用户记得颜色含义。

**不做**

- 未标记的连接一律加确认。会打断本地开发。
- 按环境禁止写入。只读开关已经有了。

### 3.8 集群种子与通告地址

**场景**：K8s NodePort、ElastiCache、OCI Cache。用户填的是域名，`CLUSTER SLOTS` 返回的是 Pod 或节点内网 IP。IP 一变就连不上，只能删掉连接重建。Insight [#1931](https://github.com/redis/RedisInsight/issues/1931)（+8）、[#1225](https://github.com/redis/RedisInsight/issues/1225)（+4）、[#5393](https://github.com/redis/RedisInsight/issues/5393)，Tiny [#185](https://github.com/tiny-craft/tiny-rdm/issues/185)。我们现在超时报「通告地址不可达」，云上的 `cluster-announce-ip` 经常改不了。

**首版**

- 种子可填多个 `host:port`，任一成功即可发现拓扑。一个入口挂了，整簇仍能开。
- 拓扑地址从本机不可达时，用种子主机名，或一张「通告地址 → 可达地址」映射去连。连接配置继续存用户填的域名，不改写成发现到的内网 IP。
- 失败信息写明实际用了哪条地址。

**不做**

- 去改服务器上的 `cluster-announce-ip`。
- 把发现到的 IP 写回已保存连接。

### 3.9 委托本机 OpenSSH

**场景**：密钥在 ssh-agent，不在磁盘上（Another [#781](https://github.com/qishibo/AnotherRedisDesktopManager/issues/781)，+8，该仓库开放需求里最高）。要先过跳板再进 Redis（[#351](https://github.com/qishibo/AnotherRedisDesktopManager/issues/351)、[#1177](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1177)）。整段配置在 `~/.ssh/config`，含 `ProxyJump`（Insight [#1880](https://github.com/redis/RedisInsight/issues/1880)，+7），甚至 AWS SSM 的 `ProxyCommand`（Another [#1002](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1002)）。有的机器只接受键盘交互密码（[#1186](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1186)）。

**首版**

- 隧道增加一种方式：调用本机 `ssh -N -L`。密钥、agent、`ProxyJump`、`ProxyCommand`、密钥交换算法都交给用户自己的 OpenSSH。
- 应用侧只填本地转发端口和 Redis 地址。现有的密码 / 私钥文件表单保留，给没有 OpenSSH 的环境。

**不做**

- 在 russh 里重做 agent、多跳、`KexAlgorithms`（Another [#498](https://github.com/qishibo/AnotherRedisDesktopManager/issues/498)）、SSM。系统 `ssh` 已经覆盖。
- 再做一份「SSH 保活秒数」。会话里已有 30 秒 keepalive。

### 3.10 可读 JSON 导出

**场景**：把一批键交给同事看结构，或对一下迁移前后的内容。Insight 开放需求里票数最高的就是这个：[#3819](https://github.com/redis/RedisInsight/issues/3819) +15，要 CSV/JSON，而不是再写脚本。[#4568](https://github.com/redis/RedisInsight/issues/4568) 补充要按 DB 下标。我们已有 DUMP 的 CSV 和可执行 CMD，适合搬库，不适合阅读。

**首版**

- 范围：当前库，MATCH 或勾选。换库再导一次，就覆盖「按下标」。
- JSON 行：键、类型、TTL、解码后的值。沿用 String 大小阈值，超过的只写长度，不把大文件读进导出。
- 和现有 DUMP / CMD 并列，不替换。

**不做**

- 一次勾选全部 DB 打包。
- 解码失败时猜结构。保留编码名和一段 base64 即可。

### 3.11 已加载键的 TTL 列

**场景**：Insight [#4062](https://github.com/redis/RedisInsight/issues/4062)。作者写的是每次都要：按 TTL 排序、筛出快过期的、多选删掉。分析页能排序，但不能按键名滤。这和 §3.3 不是一件事：§3.3 扫全库；这里只处理列表里已经出现的键。

**首版**

- 键列表可选 TTL 列，只对当前已加载行批量 `PTTL`。
- 可筛「无过期 / N 秒内过期」，勾选后走现有批量删除。

**不做**

- 树在滚动时对每个节点打 `PTTL`。
- 用这一列代替 §3.3。全库「谁没设过期」仍走巡检。

### 3.12 按完整键名直接打开

**现状**（2026-11-10）：已完成。精确回车走 `EXISTS`，不再 `SCAN`。回车或点历史且正好 1 条时直接打开值页；加载更多、暂停继续、刷新列表、收藏筛选不自动打开。值里「作为键打开」不跟：[#557](https://github.com/tiny-craft/tiny-rdm/issues/557) 要的是精确打开不要慢，以及在几个键之间来回看，后者收藏已有。

**场景**：Tiny [#557](https://github.com/tiny-craft/tiny-rdm/issues/557)。库里上百万键，勾了精确也慢，因为还是 `SCAN`。我们的搜索是回车才发，没有「每打一个字就扫」。缺的是跳过扫描。

**首版**

- 精确模式下回车先 `TYPE` / `EXISTS`，命中就直接打开，不再为了这一个键走 `SCAN`。

**不做**

- 值编辑器对选中文本「作为键打开」。原帖不是这个需求。
- 全库按 value 搜索。见 §5。

### 3.13 多种分隔符

**现状**（2026-11-10）：先不做。没有自己的用户带着真实键名来要。等有了再按他的键名定，下面只是当时的建议。

**场景**：键里同时有 `:` 和 `/`，树和分析里的命名空间只认一个符号就不准（Insight [#3989](https://github.com/redis/RedisInsight/issues/3989)、[#5373](https://github.com/redis/RedisInsight/issues/5373)）。`user::id` 的空层已经折叠。

**三家**

- Insight 2.62 做成多选，按正则 `:` 或 `/` 切。`user::id` 会空出一层。多个符号时目录路径用 `-` 拼接，不保留原来的符号。分析页的 Top Namespaces 仍只认一种。
- Another 仍是整段一个分隔符。`user::id` 显示成 `[Empty]` 层，作者认为这是故意的（[#1150](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1150)）。
- Tiny 明确不做。理由是 `A:B:C` 和 `A:B.C` 会变成同名的一层，看不出原来的符号（[#66](https://github.com/tiny-craft/tiny-rdm/issues/66)、[#183](https://github.com/tiny-craft/tiny-rdm/issues/183)）。

**若以后做，建议**

- 设置仍是一个字符串。`:` 只切冒号，`:/` 两个都切。每个字符是一层，不要做成正则，也不要做成多选。
- `splitKeyPath` 走一遍字符，不为每个键编译正则。连续分隔符折成一次：`user::id` 仍是两层，紧挨着的 `user:/id` 也不插空目录。
- 只有一个符号时，目录扫描保持现在的 `user:*`。多个符号时才用 `user[:/]*`，一次 `SCAN`。叶子上的键名保持原样。
- 目录下新建键的前缀用第一个字符。

**不做**

- 每个 DB 一套分隔符（Tiny [#439](https://github.com/tiny-craft/tiny-rdm/issues/439)）。连接级够用。

### 3.14 大 List / ZSet 跳下标

**现状**（2026-11-10）：已完成，不必再做。List 工具栏已有索引最小/最大，回车后 `LRANGE` 从该下标取一窗。ZSet 不按下标跳：浏览用分数范围（`ZRANGEBYSCORE`），另有 TopN（从最高或最低分取前 N 条）和单成员查排名。按名次从第 10000 条起取，没有这个入口，也不做。

**场景**：Another [#742](https://github.com/qishibo/AnotherRedisDesktopManager/issues/742)、Tiny [#561](https://github.com/tiny-craft/tiny-rdm/issues/561)。两万条以上只有「加载更多」，想到第 10000 条只能一直点。`LRANGE` / `ZRANGE` 本身能指定 start/stop。

**首版**

- List、ZSet 增加起始下标，直接取那一窗。

**不做**

- ZSet 起始名次。分数范围、TopN、单成员排名已够。
- 给 Hash / Set 编页码。它们只有游标，没有下标。

### 3.15 按键名选用解码器

**场景**：Tiny [#415](https://github.com/tiny-craft/tiny-rdm/issues/415)。自定义了 Java 解码器，自动识别仍落到 Hex，每个新键再选手动。Insight [#2946](https://github.com/redis/RedisInsight/issues/2946) 是同一句话：格式不该全局只有一个。`future.md` 里「记住上次解码」是为了省一次试解，和按键名路由不是一回事，那条继续暂缓。

**首版**

- 自定义解码器可填键名通配，命中则优先用它。未命中仍走现在的 Auto。

**不做**

- 每个键各记一份成功编码。

### 3.16 当前页按值过滤

**现状**（2026-11-10）：已有，不必再做。值页输入框随输入过滤已加载行：Hash / Set / ZSet 走 `filterFieldList`（字段名、值，ZSet 含分数），List 走 `filterDataList`（值、下标）。未勾选精确时按展示文本包含匹配，不为此请求服务器。回车或点搜索仍会按现有 `MATCH` 重扫；Hash 的 `HSCAN` 只认字段名，只靠值命中的行会从结果里消失。

**场景**：字段名不记得，只记得值里有个单号。Insight [#4163](https://github.com/redis/RedisInsight/issues/4163)、Another [#1174](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1174)。

**首版**

- Hash / List / ZSet / Set 已加载行上做本地包含匹配。

**不做**

- 让服务器扫描 value。全库搜值见 §5。

### 3.17 脚本与 Function 列表

**场景**：Another [#840](https://github.com/qishibo/AnotherRedisDesktopManager/issues/840) 要在工具里写 Lua、上传、导入导出，并希望能调试。Tiny [#385](https://github.com/tiny-craft/tiny-rdm/issues/385) 要编辑执行，[#510](https://github.com/tiny-craft/tiny-rdm/issues/510) 要看 Function。调试器不值得做。查询工作台已在 `future.md`，这里只定边界，避免以后做成第二个编辑器。

**首版**（随查询工作台，不单开页）

- `FUNCTION LIST`，查看代码，执行。本地草稿保存可以就是工作台的脚本列表。

**不做**

- 断点、单步、远程调试。

---

## 4. 可以夹在版本里的小改

不是本轮主功能，改动面小，开发和运维都会碰到。来源是 [23 文 §7](./23_redisinsight-issues.md)，此处只点名，不展开：

1. 切库保留当前 `MATCH`
2. 批量删除优先 `UNLINK`，不支持再退回 `DEL`
3. 键名自然排序（`item:2` 在 `item:10` 前）

---

## 5. 明确不做

| 项                                              | 原因                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONITOR` 命令聚合、按 key 的热点               | 负载高。Tiny [#128](https://github.com/tiny-craft/tiny-rdm/issues/128) 同时要了大 key 和热 key：大 key 已有内存页；热 key 靠采样 `MONITOR`，不跟。命令贵不贵用 §3.1 的累计计数 |
| 再次采样算 CPU 占比                             | `future.md` 已结论：要两次 `INFO`，收益小                                                                                                                                      |
| 从界面触发主从切换、槽迁移、`BGSAVE` 后下载 RDB | 误操作面大，文件还在服务器上                                                                                                                                                   |
| 全库按 value 内容搜索                           | Another [#1174](https://github.com/qishibo/AnotherRedisDesktopManager/issues/1174) 要过。等同扫全库 value。已加载行的本地过滤是 §3.16                                          |
| Lua 单步调试                                    | Another [#840](https://github.com/qishibo/AnotherRedisDesktopManager/issues/840) 的调试部分。执行和列表进 §3.17                                                                |
| 在应用里重写 OpenSSH                            | agent、多跳、SSM 交给系统 `ssh`（§3.9）                                                                                                                                        |
| 云账号、Entra、Copilot                          | 不是这个桌面端的运维路径                                                                                                                                                       |
| 同时把多个键并排打开                            | Tiny [#578](https://github.com/tiny-craft/tiny-rdm/issues/578)。每天会碰到，但是布局成本高，等有人卡在「一切走就丢」再做                                                       |
| 事故时把 `INFO` + 慢日志 + 客户端列表打成一个包 | 有用，是第 1、2 件做完之后的导出按钮，不单独立项                                                                                                                               |

---

## 6. 和旧差距文档的关系

[20260425 竞品差距](./20260425_redis-client-competitive-gap.md) 里的 Profiler、代理、SSH 集群、工作台：代理和 SSH 集群已做完；工作台仍以 `future.md` 为准，脚本列表用 **§3.17** 收口；Profiler 用本文 **§3.1 命令画像** 落地，不另做一套监视器采样。

2026-11-09 的 Issue 抽样里，Redisee 开放条目只有连接失败、配置丢失、Hash TTL 显示，没有可单独立项的功能。包装、白屏、商店上架没有收进本文。
