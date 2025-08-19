// https://redis.ac.cn/docs/latest/commands/info/
const INFO_HELP_STRING = `
# 特定的信息部分
server：关于 Redis 服务器的一般信息
clients：客户端连接部分
memory：内存消耗相关信息（理想情况下，used_memory_rss 的值应该只比 used_memory 略高。当 rss >> used 时，较大的差异可能意味着存在（外部）内存碎片，这可以通过检查 allocator_frag_ratio、allocator_frag_bytes 来评估。当 used >> rss 时，意味着部分 Redis 内存已被操作系统交换到磁盘：预期会出现显著的延迟。）
persistence：RDB 和 AOF 相关信息
threads：I/O 线程信息
stats：一般统计数据
replication：主从复制信息
cpu：CPU 消耗统计
commandstats：Redis 命令统计
latencystats：Redis 命令延迟百分位分布统计
sentinel：Redis Sentinel 部分（仅适用于 Sentinel 实例）
cluster：Redis Cluster 部分
modules：模块部分
keyspace：数据库相关统计
errorstats：Redis 错误统计

# server
redis_version：Redis 服务器版本
redis_git_sha1：Git SHA1
redis_git_dirty：Git dirty 标志
redis_build_id：构建 ID
redis_mode：服务器模式（"standalone"、"sentinel" 或 "cluster"）
os：托管 Redis 服务器的操作系统
arch_bits：架构（32 位或 64 位）
multiplexing_api：Redis 使用的事件循环机制
atomicvar_api：Redis 使用的 Atomicvar API
gcc_version：用于编译 Redis 服务器的 GCC 编译器版本
process_id：服务器进程的 PID
process_supervised：受监控的系统（"upstart"、"systemd"、"unknown" 或 "no"）
run_id：识别 Redis 服务器的随机值（供 Sentinel 和 Cluster 使用）
tcp_port：TCP/IP 监听端口
server_time_usec：基于 Epoch 的系统时间，精确到微秒
uptime_in_seconds：自 Redis 服务器启动以来的秒数
uptime_in_days：相同值以天表示
hz：服务器当前频率设置
configured_hz：服务器配置的频率设置
lru_clock：每分钟递增的时钟，用于 LRU 管理
executable：服务器可执行文件的路径
config_file：配置文件的路径
io_threads_active：标志，表示 I/O 线程是否活跃
shutdown_in_milliseconds：副本在完成关闭序列前追赶复制数据的剩余最长时间。此字段仅在关闭期间存在。

# clients 
connected_clients：客户端连接数（不包括副本连接）
cluster_connections：Cluster 总线使用的套接字数量的近似值
maxclients：maxclients 配置指令的值。这是 connected_clients、connected_slaves 和 cluster_connections 之和的上限。
client_recent_max_input_buffer：当前客户端连接中最大的输入缓冲区
client_recent_max_output_buffer：当前客户端连接中最大的输出缓冲区
blocked_clients：在阻塞调用 (BLPOP, BRPOP, BRPOPLPUSH, BLMOVE, BZPOPMIN, BZPOPMAX) 上等待的客户端数量
tracking_clients：正在被跟踪的客户端数量 (CLIENT TRACKING)
pubsub_clients：处于发布/订阅模式的客户端数量 (SUBSCRIBE, PSUBSCRIBE, SSUBSCRIBE)。在 Redis 7.4 中添加
watching_clients：处于 WATCH 模式的客户端数量 (WATCH)。在 Redis 7.4 中添加
clients_in_timeout_table：客户端超时表中的客户端数量
total_watched_keys：被监视键的数量。在 Redis 7.4 中添加。
total_blocking_keys：阻塞键的数量。在 Redis 7.2 中添加。
total_blocking_keys_on_nokey：一个或多个客户端希望在键删除时解除阻塞的阻塞键数量。在 Redis 7.2 中添加。

# memory 
used_memory：Redis 使用其分配器（标准 libc、jemalloc 或 tcmalloc 等替代分配器）分配的总字节数
used_memory_human：上一个值的易读表示
used_memory_rss：操作系统看到的 Redis 分配的字节数（又称常驻集大小）。这是 top(1) 和 ps(1) 等工具报告的数字。
used_memory_rss_human：上一个值的易读表示
used_memory_peak：Redis 消耗的峰值内存量（字节）
used_memory_peak_human：上一个值的易读表示
used_memory_peak_perc：used_memory 占 used_memory_peak 的百分比
used_memory_overhead：服务器为管理其内部数据结构分配的所有开销的总字节数
used_memory_startup：Redis 启动时消耗的初始内存量（字节）
used_memory_dataset：数据集大小（字节）（used_memory 减去 used_memory_overhead）
used_memory_dataset_perc：used_memory_dataset 占净内存使用量（used_memory 减去 used_memory_startup）的百分比
total_system_memory：Redis 主机拥有的总内存量
total_system_memory_human：上一个值的易读表示
used_memory_lua：Lua 引擎用于 EVAL 脚本的字节数。在 Redis 7.0 中已弃用，重命名为 used_memory_vm_eval
used_memory_vm_eval：脚本 VM 引擎用于 EVAL 框架的字节数（不属于 used_memory）。在 Redis 7.0 中添加
used_memory_lua_human：上一个值的易读表示。在 Redis 7.0 中已弃用
used_memory_scripts_eval：EVAL 脚本的字节开销（属于 used_memory）。在 Redis 7.0 中添加
number_of_cached_scripts：服务器缓存的 EVAL 脚本数量。在 Redis 7.0 中添加
number_of_functions：函数数量。在 Redis 7.0 中添加
number_of_libraries：库数量。在 Redis 7.0 中添加
used_memory_vm_functions：脚本 VM 引擎用于 Functions 框架的字节数（不属于 used_memory）。在 Redis 7.0 中添加
used_memory_vm_total：used_memory_vm_eval + used_memory_vm_functions（不属于 used_memory）。在 Redis 7.0 中添加
used_memory_vm_total_human：上一个值的易读表示。
used_memory_functions：Function 脚本的字节开销（属于 used_memory）。在 Redis 7.0 中添加
used_memory_scripts：used_memory_scripts_eval + used_memory_functions（属于 used_memory）。在 Redis 7.0 中添加
used_memory_scripts_human：上一个值的易读表示
maxmemory：maxmemory 配置指令的值
maxmemory_human：上一个值的易读表示
maxmemory_policy：maxmemory-policy 配置指令的值
mem_fragmentation_ratio：used_memory_rss 和 used_memory 之间的比率。注意，这不仅包括碎片，还包括其他进程开销（参见 allocator_* 指标）以及代码、共享库、堆栈等开销。
mem_fragmentation_bytes：used_memory_rss 和 used_memory 之间的差值。注意，当总碎片字节数很低（几兆字节）时，高比率（例如 1.5 或更高）并不表示问题。
allocator_frag_ratio:：allocator_active 和 allocator_allocated 之间的比率。这是真实的（外部）碎片指标（不是 mem_fragmentation_ratio）。
allocator_frag_bytes：allocator_active 和 allocator_allocated 之间的差值。参见关于 mem_fragmentation_bytes 的说明。
allocator_rss_ratio：allocator_resident 和 allocator_active 之间的比率。这通常表示分配器可以且可能很快会释放回操作系统的页面。
allocator_rss_bytes：allocator_resident 和 allocator_active 之间的差值
rss_overhead_ratio：used_memory_rss（进程 RSS）和 allocator_resident 之间的比率。这包括不属于分配器或堆的 RSS 开销。
rss_overhead_bytes：used_memory_rss（进程 RSS）和 allocator_resident 之间的差值
allocator_allocated：从分配器分配的总字节数，包括内部碎片。通常与 used_memory 相同。
allocator_active：分配器活跃页中的总字节数，包括外部碎片。
allocator_resident：分配器中常驻（RSS）的总字节数，包括可以释放回操作系统的页面（通过 MEMORY PURGE 或仅等待）。
allocator_muzzy：分配器中“模糊”(muzzy) 内存（RSS）的总字节数。模糊内存是指已释放但尚未完全返回给操作系统的内存。在需要时可以立即重用，或者在系统压力增加时由操作系统回收。
mem_not_counted_for_evict：不计入键逐出的已用内存。这基本上是临时的副本和 AOF 缓冲区。
mem_clients_slaves：副本客户端使用的内存 - 从 Redis 7.0 开始，副本缓冲区与复制积压共享内存，因此当副本未触发内存使用量增加时，此字段可能显示 0。
mem_clients_normal：普通客户端使用的内存
mem_cluster_links：启用集群模式时，集群总线上连接到对等节点的链接使用的内存。
mem_aof_buffer：用于 AOF 和 AOF 重写缓冲区的临时内存
mem_replication_backlog：复制积压使用的内存
mem_total_replication_buffers：复制缓冲区消耗的总内存量 - 在 Redis 7.0 中添加。
mem_allocator：内存分配器，在编译时选择。
mem_overhead_db_hashtable_rehashing：当前正在重新哈希的数据库字典的临时内存开销 - 在 7.4 中添加。
active_defrag_running：当启用 activedefrag 时，这表示碎片整理当前是否活跃，以及它打算利用的 CPU 百分比。
lazyfree_pending_objects：等待释放的对象数量（调用 UNLINK 或使用 ASYNC 选项调用 FLUSHDB 和 FLUSHALL 的结果）
lazyfreed_objects：已延迟释放的对象数量。

# persistence 
loading：标志，表示转储文件加载是否正在进行
async_loading：当前正在异步加载复制数据集，同时提供旧数据。这意味着 repl-diskless-load 已启用并设置为 swapdb。在 Redis 7.0 中添加。
current_cow_peak：子进程 fork 运行时写时复制内存的峰值大小（字节）
current_cow_size：子进程 fork 运行时写时复制内存的大小（字节）
current_cow_size_age：current_cow_size 值的年龄（秒）。
current_fork_perc：当前 fork 进程的进度百分比。对于 AOF 和 RDB fork，它是 current_save_keys_processed 占 current_save_keys_total 的百分比。
current_save_keys_processed：当前保存操作处理的键数量
current_save_keys_total：当前保存操作开始时的键数量
rdb_changes_since_last_save：自上次转储以来的更改次数
rdb_bgsave_in_progress：标志，表示 RDB 保存正在进行
rdb_last_save_time：上次成功 RDB 保存的基于 Epoch 的时间戳
rdb_last_bgsave_status：上次 RDB 保存操作的状态
rdb_last_bgsave_time_sec：上次 RDB 保存操作的持续时间（秒）
rdb_current_bgsave_time_sec：如果正在进行 RDB 保存操作，则为此操作的持续时间（秒）
rdb_last_cow_size：上次 RDB 保存操作期间写时复制内存的大小（字节）
rdb_last_load_keys_expired：上次 RDB 加载期间删除的易失性键数量。在 Redis 7.0 中添加。
rdb_last_load_keys_loaded：上次 RDB 加载期间加载的键数量。在 Redis 7.0 中添加。
aof_enabled：标志，表示 AOF 日志记录已激活
aof_rewrite_in_progress：标志，表示 AOF 重写操作正在进行
aof_rewrite_scheduled：标志，表示一旦当前 RDB 保存完成，将安排一个 AOF 重写操作。
aof_last_rewrite_time_sec：上次 AOF 重写操作的持续时间（秒）
aof_current_rewrite_time_sec：如果正在进行 AOF 重写操作，则为此操作的持续时间（秒）
aof_last_bgrewrite_status：上次 AOF 重写操作的状态
aof_last_write_status：上次写入 AOF 操作的状态
aof_last_cow_size：上次 AOF 重写操作期间写时复制内存的大小（字节）
module_fork_in_progress：标志，表示模块 fork 操作正在进行
module_fork_last_cow_size：上次模块 fork 操作期间写时复制内存的大小（字节）
aof_rewrites：自启动以来执行的 AOF 重写次数
rdb_saves：自启动以来执行的 RDB 快照次数

## 如果 AOF 已激活，将添加以下额外字段
aof_current_size：AOF 当前文件大小
aof_base_size：上次启动或重写时 AOF 文件大小
aof_pending_rewrite：标志，表示一旦当前 RDB 保存完成，将安排一个 AOF 重写操作。
aof_buffer_length：AOF 缓冲区大小
aof_rewrite_buffer_length：AOF 重写缓冲区大小。注意：此字段在 Redis 7.0 中已移除
aof_pending_bio_fsync：后台 I/O 队列中待处理的 fsync 任务数量
aof_delayed_fsync：延迟 fsync 计数器

## 如果加载操作正在进行，将添加以下额外字段
loading_start_time：加载操作开始时间的基于 Epoch 的时间戳
loading_total_bytes：总文件大小
loading_rdb_used_mem：生成 RDB 文件时服务器的内存使用量
loading_loaded_bytes：已加载的字节数量
loading_loaded_perc：相同值表示为百分比
loading_eta_seconds：加载完成的预计剩余时间（秒）

# threads 
threads 部分提供 I/O 线程的统计信息。统计数据包括分配的客户端数量、处理的读取事件数量和处理的写入事件数量。在 Redis 8.0 中添加。

# stats 
total_connections_received：服务器接受的总连接数
total_commands_processed：服务器处理的总命令数
instantaneous_ops_per_sec：每秒处理的命令数
total_net_input_bytes：从网络读取的总字节数
total_net_output_bytes：写入网络的总字节数
total_net_repl_input_bytes：为复制目的从网络读取的总字节数
total_net_repl_output_bytes：为复制目的写入网络的总字节数
instantaneous_input_kbps：每秒的网络读取速率，单位 KB/秒
instantaneous_output_kbps：每秒的网络写入速率，单位 KB/秒
instantaneous_input_repl_kbps：为复制目的，每秒的网络读取速率，单位 KB/秒
instantaneous_output_repl_kbps：为复制目的，每秒的网络写入速率，单位 KB/秒
rejected_connections：因 maxclients 限制而被拒绝的连接数
sync_full：与副本进行完全同步的次数
sync_partial_ok：接受的部分同步请求次数
sync_partial_err：拒绝的部分同步请求次数
expired_subkeys：哈希字段过期事件的数量
expired_keys：键过期事件总数
expired_stale_perc：可能过期的键的百分比
expired_time_cap_reached_count：主动过期周期提前停止的次数
expire_cycle_cpu_milliseconds：主动过期周期累积花费的时间（毫秒）
evicted_keys：因 maxmemory 限制而被逐出的键数量
evicted_clients：因 maxmemory-clients 限制而被逐出的客户端数量。在 Redis 7.0 中添加。
evicted_scripts：因 LRU 策略而被逐出的 EVAL 脚本数量，参见 EVAL 以了解更多详情。在 Redis 7.4 中添加。
total_eviction_exceeded_time：自服务器启动以来，used_memory 超过 maxmemory 的总时间（毫秒）
current_eviction_exceeded_time：自 used_memory 上次超过 maxmemory 以来经过的时间（毫秒）
keyspace_hits：在主字典中成功查找键的数量
keyspace_misses：在主字典中查找键失败的数量
pubsub_channels：具有客户端订阅的发布/订阅通道总数
pubsub_patterns：具有客户端订阅的发布/订阅模式总数
pubsubshard_channels: 全局 pub/sub 分片通道数，包含客户端订阅。在 Redis 7.0.3 中添加。
latest_fork_usec: 最近一次 fork 操作的持续时间，单位为微秒。
total_forks: 服务器启动以来总共执行的 fork 操作次数。
migrate_cached_sockets: 为 MIGRATE 操作而打开的套接字数量。
slave_expires_tracked_keys: 为过期目的而跟踪的键的数量（仅适用于可写副本）。
active_defrag_hits: 活动碎片整理过程执行的值重新分配次数。
active_defrag_misses: 活动碎片整理过程启动但中止的值重新分配次数。
active_defrag_key_hits: 已被活动碎片整理的键的数量。
active_defrag_key_misses: 被活动碎片整理过程跳过的键的数量。
total_active_defrag_time: 内存碎片超出限制的总时间，单位为毫秒。
current_active_defrag_time: 自上次内存碎片超出限制以来经过的时间，单位为毫秒。
tracking_total_keys: 服务器正在跟踪的键的数量。
tracking_total_items: 正在跟踪的项的数量，即每个键的客户端数量之和。
tracking_total_prefixes: 服务器前缀表中跟踪的前缀数量（仅适用于广播模式）。
unexpected_error_replies: 意外错误回复的数量，这些错误类型来自 AOF 加载或复制。
total_error_replies: 发出的错误回复总数，即被拒绝的命令数（命令执行前的错误）和失败的命令数（命令执行中的错误）之和。
dump_payload_sanitizations: 转储载荷深度完整性验证的总次数（参见 sanitize-dump-payload 配置）。
total_reads_processed: 处理的读取事件总数。
total_writes_processed: 处理的写入事件总数。
io_threaded_reads_processed: 由 I/O 线程处理的读取事件数量。
io_threaded_writes_processed: 由 I/O 线程处理的写入事件数量。
client_query_buffer_limit_disconnections: 由于客户端达到查询缓冲区限制而断开的总连接数。
client_output_buffer_limit_disconnections: 由于客户端达到输出缓冲区限制而断开的总连接数。
reply_buffer_shrinks: 输出缓冲区缩小的总次数。
reply_buffer_expands: 输出缓冲区扩展的总次数。
eventloop_cycles: 事件循环的总周期数。
eventloop_duration_sum: 在事件循环中花费的总时间，单位为微秒（包括 I/O 和命令处理）。
eventloop_duration_cmd_sum: 执行命令花费的总时间，单位为微秒。
instantaneous_eventloop_cycles_per_sec: 每秒事件循环周期数。
instantaneous_eventloop_duration_usec: 单个事件循环周期平均花费的时间，单位为微秒。
acl_access_denied_auth: 认证失败次数。
acl_access_denied_cmd: 由于拒绝访问命令而被拒绝的命令数量。
acl_access_denied_key: 由于拒绝访问键而被拒绝的命令数量。
acl_access_denied_channel: 由于拒绝访问通道而被拒绝的命令数量。

# replication 
role: 如果实例不是任何其他实例的副本，则值为 "master"；如果实例是某个主实例的副本，则值为 "slave"。请注意，副本可以是另一个副本的主实例（链式复制）。
master_failover_state: 正在进行中的故障转移的状态（如果有）。
master_replid: Redis 服务器的复制 ID。
master_replid2: 第二复制 ID，用于故障转移后的 PSYNC。
master_repl_offset: 服务器当前的复制偏移量。
second_repl_offset: 接受复制 ID 的最大偏移量。
repl_backlog_active: 指示复制积压缓冲区是否活动的标志。
repl_backlog_size: 复制积压缓冲区总大小，单位为字节。
repl_backlog_first_byte_offset: 复制积压缓冲区的起始主偏移量。
repl_backlog_histlen: 复制积压缓冲区中数据的字节大小。

## 如果实例是副本，则提供以下附加字段：
master_host: 主实例的主机名或 IP 地址。
master_port: 主实例监听的 TCP 端口。
master_link_status: 链接状态 (up/down)。
master_last_io_seconds_ago: 自上次与主实例交互以来经过的秒数。
master_sync_in_progress: 指示主实例正在同步到副本。
slave_read_repl_offset: 副本实例的读取复制偏移量。
slave_repl_offset: 副本实例的复制偏移量。
slave_priority: 作为故障转移候选实例的优先级。
slave_read_only: 指示副本是否为只读的标志。
replica_announced: 指示副本是否由 Sentinel 宣布的标志。

## 如果正在进行 SYNC 操作，则提供以下附加字段：
master_sync_total_bytes: 需要传输的总字节数。当大小未知时（例如，使用 repl-diskless-sync 配置指令时），此值可能为 0。
master_sync_read_bytes: 已传输的字节数。
master_sync_left_bytes: 同步完成前剩余的字节数（当 master_sync_total_bytes 为 0 时可能为负）。
master_sync_perc: master_sync_read_bytes 占 master_sync_total_bytes 的百分比，当 master_sync_total_bytes 为 0 时，使用 loading_rdb_used_mem 进行近似计算。
master_sync_last_io_seconds_ago: 在 SYNC 操作期间，自上次传输 I/O 以来经过的秒数。

master_link_down_since_seconds: 链接断开以来经过的秒数。
connected_slaves: 连接的副本数量。
min_slaves_good_slaves: 当前被认为“良好”的副本数量。
slaveXXX: id, IP 地址, 端口, 状态, 偏移量, 延迟

# cpu 
used_cpu_sys: Redis 服务器消耗的系统 CPU，是服务器进程所有线程（主线程和后台线程）消耗的系统 CPU 之和。
used_cpu_user: Redis 服务器消耗的用户 CPU，是服务器进程所有线程（主线程和后台线程）消耗的用户 CPU 之和。
used_cpu_sys_children: 后台进程消耗的系统 CPU。
used_cpu_user_children: 后台进程消耗的用户 CPU。
used_cpu_sys_main_thread: Redis 服务器主线程消耗的系统 CPU。
used_cpu_user_main_thread: Redis 服务器主线程消耗的用户 CPU。

# sentinel 部分仅在 Redis Sentinel 实例中可用
sentinel_masters: 此 Sentinel 实例监控的 Redis 主实例数量。
sentinel_tilt: 值为 1 表示此 Sentinel 处于 TILT 模式。
sentinel_tilt_since_seconds: 当前 TILT 的持续时间，单位为秒；如果未处于 TILT 模式，则为 -1。在 Redis 7.0.0 中添加。
sentinel_running_scripts: 此 Sentinel 当前正在执行的脚本数量。
sentinel_scripts_queue_length: 等待执行的用户脚本队列长度。
sentinel_simulate_failure_flags: SENTINEL SIMULATE-FAILURE 命令的标志。

# cluster 部分目前只包含一个唯一的字段
cluster_enabled: 指示 Redis 集群是否已启用。

# keyspace 部分提供了每个数据库主字典的统计信息。统计信息包括键的数量和带有过期时间的键的数量。
dbXXX: keys=XXX,expires=XXX,avg_ttl=XXX,subexpiry=XXX

# debug 部分包含实验性指标，这些指标在未来版本中可能会更改或移除。调用 INFO 或 INFO ALL 时不会包含此部分，仅在使用 INFO DEBUG 时返回。
eventloop_duration_aof_sum: 在事件循环中刷新 AOF 花费的总时间，单位为微秒。
eventloop_duration_cron_sum: cron 函数（包括 serverCron 和 beforeSleep，但不包括 IO 和 AOF 刷新）消耗的总时间，单位为微秒。
eventloop_duration_max: 单个事件循环周期花费的最大时间，单位为微秒。
eventloop_cmd_per_cycle_max: 单个事件循环周期处理的最大命令数。
allocator_allocated_lua: 分配器专门为 Lua 分配的总字节数，包括内部碎片。
allocator_active_lua: 分配器专门为 Lua 活动页面分配的总字节数，包括外部碎片。
allocator_resident_lua: 分配器专门为 Lua 驻留 (RSS) 的总字节数。这包括可以释放给 OS 的页面（通过 MEMORY PURGE 或仅等待释放的页面）。
allocator_frag_bytes_lua: allocator_active_lua 和 allocator_allocated_lua 之间的差值。
`

const INFO_HELP = {}

const arr = INFO_HELP_STRING.split('\n')
arr.forEach(line => {
  if (line.startsWith('#')) return
  const index = line.indexOf('：')
  if (index > 0) {
    const key = line.substring(0, index)
    const value = line.substring(index + 1, line.length)
    INFO_HELP[key] = value
  }
})

export default INFO_HELP