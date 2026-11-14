/** CONFIG 项说明（中文） */
export const zhConfigTip = {
  include:
    '引入一个或多个其他配置文件，支持通配符，包含的文件按字母顺序加载，未匹配到文件时无错误提示',
  loadmodule: '启动时加载模块，可指定多个，模块加载失败会导致服务中止，支持为模块传递参数',
  bind: '指定 Redis 监听的网络接口 IP 地址，前缀 “-” 表示该地址不可用时不影响服务启动，默认监听回环地址 127.0.0.1 和::1',
  'bind-source-addr': '配置出站连接绑定的本地地址，影响连接路由方式',
  'protected-mode':
    '安全保护模式，开启且默认用户无密码时，仅允许本地连接（127.0.0.1、::1 或 Unix 域套接字），默认启用',
  'enable-protected-configs':
    '控制敏感配置指令的可修改权限，可选值 no（默认，禁止所有连接修改）、yes（允许所有连接修改）、local（仅允许本地连接修改）',
  'enable-debug-command': '控制调试命令的启用权限，可选值同 enable-protected-configs，默认 no',
  'enable-module-command': '控制模块命令的启用权限，可选值同 enable-protected-configs，默认 no',
  port: '监听的 TCP 端口，默认 6379，设为 0 则不监听 TCP 套接字',
  'tcp-backlog': 'TCP 监听队列长度，实际值受系统 /proc/sys/net/core/somaxconn 限制，默认 511',
  unixsocket: 'Unix 域套接字路径，未指定则不监听 Unix 域套接字',
  unixsocketperm: 'Unix 域套接字文件权限（八进制），常见示例 700；设为 0 时由版本/平台使用内置默认',
  timeout: '客户端空闲超时时间（秒），0 表示禁用超时关闭连接，默认 0',
  'tcp-keepalive':
    'TCP 保活时间（秒），非 0 值启用 SO_KEEPALIVE 选项，用于检测死连接和维持网络连接，默认 300',
  'socket-mark-id':
    '为监听套接字标记 ID，支持高级路由和过滤，Linux 对应连接标记、FreeBSD 对应套接字 cookie ID、OpenBSD 对应路由表 ID，默认 0',
  'tls-port': 'TLS 监听端口，启用 TLS 需配置此参数，默认禁用 TLS',
  'tls-cert-file': '服务器端 X.509 证书文件路径（PEM 格式），用于向客户端、主节点或集群节点认证',
  'tls-key-file': '服务器端私钥文件路径（PEM 格式）',
  'tls-key-file-pass': '加密私钥文件的密码',
  'tls-client-cert-file': '客户端（用于复制、集群连接等）X.509 证书文件路径（PEM 格式）',
  'tls-client-key-file': '客户端私钥文件路径（PEM 格式）',
  'tls-client-key-file-pass': '客户端加密私钥文件的密码',
  'tls-dh-params-file':
    'DH 参数文件路径，用于支持旧版 OpenSSL（<3.0）的 Diffie-Hellman 密钥交换，新版不推荐配置',
  'tls-ca-cert-file': 'CA 证书文件路径，用于认证 TLS 客户端和节点，Redis 不默认使用系统 CA 配置',
  'tls-ca-cert-dir': 'CA 证书目录路径，功能同 tls-ca-cert-file',
  'tls-auth-clients':
    'TLS 客户端证书要求：no 不要求、optional 可选但必须有效、yes 必须提供，默认多为 yes（启用 TLS 时常见）',
  'tls-replication': '是否为复制链路启用 TLS，默认 no',
  'tls-cluster': '是否为集群总线启用 TLS，默认 no',
  'tls-protocols':
    '支持的 TLS 版本，可选 TLSv1、TLSv1.1、TLSv1.2、TLSv1.3（OpenSSL≥1.1.1），默认启用 TLSv1.2 和 TLSv1.3',
  'tls-ciphers': 'TLSv1.2 及以下支持的加密套件，语法参考 ciphers (1ssl) 手册，默认 DEFAULT:!MEDIUM',
  'tls-ciphersuites': 'TLSv1.3 支持的加密套件，语法参考 ciphers (1ssl) 手册',
  'tls-prefer-server-ciphers': '是否优先使用服务器端加密套件偏好，默认 no（遵循客户端偏好）',
  'tls-session-caching': '是否启用 TLS 会话缓存，默认 yes，用于加速客户端重连',
  'tls-session-cache-size': 'TLS 会话缓存最大数量，0 表示无限制，默认 20480',
  'tls-session-cache-timeout': 'TLS 会话缓存超时时间（秒），默认 300',
  daemonize: '是否以守护进程模式运行，默认 no，守护进程模式下会生成 pid 文件',
  supervised: '指定监控系统交互方式，可选 no（默认，无交互）、upstart、systemd、auto（自动检测）',
  pidfile:
    'pid 文件路径，非守护进程模式下未指定则不生成，守护进程模式默认 /var/run/redis.pid，推荐现代 Linux 系统使用 /run/redis.pid',
  loglevel: '日志详细程度，可选 debug、verbose、notice（默认，生产环境推荐）、warning、nothing',
  logfile: '日志文件路径，空字符串表示输出到标准输出，守护进程模式下标准输出日志会被导向 /dev/null',
  'syslog-enabled': '是否启用系统日志，默认 no',
  'syslog-ident': '系统日志标识，默认 redis',
  'syslog-facility': '系统日志设备，必须是 USER 或 LOCAL0-LOCAL7，默认 local0',
  'crash-log-enabled': '是否启用崩溃日志，默认启用，禁用可生成更干净的核心转储',
  'crash-memcheck-enabled': '是否启用崩溃日志的快速内存检查，默认启用，禁用可让 Redis 更快终止',
  databases: '数据库数量，默认 16 个（编号 0-15），可通过 SELECT 命令切换',
  'always-show-logo': '是否始终在启动日志中显示 ASCII 艺术 logo，默认 no，仅交互式会话默认显示',
  'hide-user-data-from-log': '是否禁止日志记录个人身份信息（PII），默认禁用',
  'set-proc-title': '是否修改进程标题以显示运行时信息，默认 yes',
  'proc-title-template':
    '进程标题模板，支持 {title}、{listen-addr}、{server-mode}、{port}、{tls-port}、{unixsocket}、{config-file} 变量，默认{title} {listen-addr} {server-mode}',
  'locale-collate': '字符串比较操作使用的本地环境，空字符串表示从环境变量获取，影响 Lua 脚本性能',
  save: "RDB 持久化触发条件，格式为 “< 秒数 > < 修改次数 >”，可配置多个条件，默认 3600 秒 1 次修改、300 秒 100 次修改、60 秒 10000 次修改，设为'' 禁用 RDB 持久化",
  'stop-writes-on-bgsave-error':
    'RDB 快照启用时，若后台保存失败是否停止接受写入，默认 yes，确保数据持久化正常',
  rdbcompression:
    '是否使用 LZF 压缩 RDB 文件中的字符串对象，默认 yes，禁用可节省 CPU 但增大文件体积',
  rdbchecksum:
    '是否在 RDB 文件末尾添加 CRC64 校验和，默认 yes，禁用可提升读写性能但降低文件完整性校验能力',
  'sanitize-dump-payload':
    '加载 RDB 或 RESTORE 数据时是否执行完整校验，可选 no（默认）、yes、clients，用于减少后续命令执行时的断言或崩溃风险',
  dbfilename: 'RDB 文件名称，默认 dump.rdb',
  'rdb-del-sync-files':
    '无持久化启用时，是否删除复制过程中生成的 RDB 文件，默认 no，仅在 AOF 和 RDB 均禁用时生效',
  dir: '工作目录，RDB 文件、AOF 文件均存储在此目录，默认./',
  replicaof: '配置当前实例为从节点，指定主节点的 IP 和端口',
  masterauth: '主节点的密码，主节点启用密码时需配置',
  masteruser:
    '复制使用的主节点用户名，Redis 6 及以上支持 ACL 时使用，用于执行 PSYNC 等复制所需命令',
  'replica-serve-stale-data':
    '从节点与主节点断开或复制中时是否返回过期数据，默认 yes，设为 no 则除部分命令外拒绝数据访问命令',
  'replica-read-only': '从节点是否只读，默认 yes，Redis 2.6 起默认只读',
  'repl-diskless-sync':
    '复制全量同步时使用的策略，yes 表示无盘同步（直接通过套接字传输 RDB），no 表示基于磁盘同步，默认 yes',
  'repl-diskless-sync-delay':
    '无盘同步时，等待更多从节点连接的延迟时间（秒），默认 5，设为 0 立即开始传输',
  'repl-diskless-sync-max-replicas':
    '无盘全量同步的等待期内，已连接副本数达到该值就提前开始传输。默认 0，表示不设这个数量，会等满 repl-diskless-sync-delay',
  'repl-diskless-load':
    '从节点加载主节点 RDB 数据的方式，可选 disabled（默认，先存储到磁盘再加载）、swapdb（内存中并行加载，需足够内存）、on-empty-db（仅空数据库时无盘加载）',
  'repl-ping-replica-period': '主节点向从节点发送 PING 的间隔时间（秒），默认 10',
  'repl-timeout':
    '复制超时时间（秒），涵盖 SYNC 批量传输、主从节点通信等场景，默认 60，需大于 repl-ping-replica-period',
  'repl-disable-tcp-nodelay':
    '全量同步后是否禁用从节点套接字的 TCP_NODELAY 选项，默认 no（低延迟优先），yes 可减少带宽占用但增加数据延迟',
  'repl-backlog-size':
    '复制积压缓冲区大小，用于从节点重连后的部分同步，默认 1mb，仅当有从节点连接时分配',
  'repl-backlog-ttl':
    '最后一个从节点断开后，复制积压缓冲区的释放时间（秒），默认 3600，0 表示永不释放',
  'replica-full-sync-buffer-limit':
    '全量同步时从节点可累积的复制数据流大小，0 表示继承主节点 client-output-buffer-limit replica 的硬限制，默认 0',
  'replica-priority':
    '从节点优先级，用于 Redis Sentinel 故障转移时选择主节点，值越小优先级越高，0 表示不可晋升为主节点，默认 100',
  'propagation-error-behavior':
    '处理复制流或 AOF 文件中命令执行错误的行为，可选 ignore（默认）、panic、panic-on-replicas',
  'replica-ignore-disk-write-errors':
    '从节点写入磁盘失败时是否忽略错误，默认 no（崩溃），yes 仅日志警告并执行命令',
  'replica-announced':
    '是否允许 Sentinel 公布这台副本（sentinel replicas 及对客户端的展示）。默认 yes。设为 no 仍可能被提升为主节点，若不希望提升请把 replica-priority 设为 0。地址宣告是 replica-announce-ip/port',
  'min-replicas-to-write':
    '主节点接受写入所需的最小在线从节点数量，默认 0（禁用），需与 min-replicas-max-lag 配合使用',
  'min-replicas-max-lag': '主节点接受写入时，从节点的最大延迟时间（秒），默认 10',
  'replica-announce-ip': '从节点向主节点报告的 IP 地址，用于 NAT 或端口转发场景',
  'replica-announce-port': '从节点向主节点报告的端口，用于 NAT 或端口转发场景',
  'tracking-table-max-keys':
    '客户端缓存键跟踪的无效表最大键数量，默认 1000000，0 表示无限制，广播模式下此配置无效',
  'acllog-max-len': 'ACL 日志的最大条目数，用于记录 ACL 相关的失败命令和认证事件，默认 128',
  aclfile: '外部 ACL 用户配置文件路径，不可与当前配置文件中的用户配置同时使用',
  requirepass:
    '默认用户的密码，Redis 6 及以上为 ACL 系统的兼容层，与 aclfile 和 ACL LOAD 命令不兼容',
  'acl-pubsub-default':
    '新用户的默认 Pub/Sub 频道权限，可选 allchannels（允许所有频道）、resetchannels（禁止所有频道），Redis 7.0 默认 resetchannels',
  'rename-command':
    '重命名或禁用命令（已废弃），建议使用 ACL 控制命令权限，格式为 “rename-command 原命令 新命令”，新命令设为空字符串则禁用该命令',
  maxclients:
    '最大同时连接客户端数，默认 10000，实际受系统文件描述符限制，Redis Cluster 模式下需预留集群总线连接资源',
  maxmemory: 'Redis 使用的最大内存限制，达到限制后按 maxmemory-policy 执行键淘汰，默认无限制',
  'maxmemory-policy':
    '内存达到 maxmemory 后的键淘汰策略，可选 volatile-lru、allkeys-lru、volatile-lfu、allkeys-lfu、volatile-random、allkeys-random、volatile-ttl、noeviction（默认）',
  'maxmemory-samples':
    'LRU/LFU/TTL 淘汰算法的采样数量，默认 5，值越大越接近真实结果但 CPU 消耗越高，最大 64',
  'maxmemory-eviction-tenacity':
    '键淘汰的激进程度，0 更偏向低延迟、10 默认、100 更偏向尽快腾出内存（可能增加延迟尖刺），默认 10',
  'replica-ignore-maxmemory':
    '从节点是否忽略自身 maxmemory 配置，默认 yes（由主节点处理淘汰），仅当从节点可写或需独立内存限制时修改',
  'active-expire-effort':
    '主动过期键清理的力度，默认 1，取值 1-10，值越大清理越彻底但 CPU 消耗越高',
  'lazyfree-lazy-eviction': '内存淘汰时是否使用惰性删除（非阻塞），默认 no',
  'lazyfree-lazy-expire': '键过期时是否使用惰性删除，默认 no',
  'lazyfree-lazy-server-del': '服务器内部删除键（如 RENAME 覆盖）时是否使用惰性删除，默认 no',
  'replica-lazy-flush': '从节点全量同步时是否惰性清空数据库，默认 no',
  'lazyfree-lazy-user-del': '用户执行 DEL 命令时是否使用惰性删除，默认 no',
  'lazyfree-lazy-user-flush':
    '用户执行 FLUSHDB/FLUSHALL/SCRIPT FLUSH/FUNCTION FLUSH 时未指定同步 / 异步标志，是否默认异步删除，默认 no',
  'io-threads':
    'I/O 线程数，用于处理客户端套接字的读写和协议解析，默认禁用（1 表示仅主线程），建议 4 核及以上服务器启用，预留 1 个空闲核心',
  'oom-score-adj':
    '是否控制内核 OOM killer 的进程优先级，可选 no（默认）、yes（等同于 relative）、absolute、relative，用于优先淘汰后台子进程和从节点',
  'oom-score-adj-values':
    'OOM 分数调整值，依次对应主实例、副本、子进程（顺序以文档为准），范围约 -2000～2000，默认 0 200 800',
  'disable-thp':
    '是否禁用 Redis 进程的透明大页（THP），默认 yes，避免 fork 和写时复制（CoW）导致的延迟问题',
  appendonly: '是否启用 AOF 持久化，默认 no，AOF 与 RDB 可同时启用，启动时优先加载 AOF',
  appendfilename:
    'AOF 文件的基础名称，Redis 7 及以上使用多文件格式（基础文件、增量文件、清单文件），默认"appendonly.aof"',
  appenddirname: 'AOF 文件存储目录，默认"appendonlydir"',
  appendfsync:
    'AOF 文件的 fsync 策略，可选 always（每次写入同步，最安全）、everysec（每秒同步，默认）、no（由系统控制，最快）',
  'no-appendfsync-on-rewrite':
    'BGSAVE 或 BGREWRITEAOF 执行时，是否暂停 AOF 的 fsync，默认 no（优先数据安全），yes 可缓解 I/O 阻塞但降低耐久性',
  'auto-aof-rewrite-percentage':
    'AOF 自动重写的触发百分比，基于上次重写后的文件大小，默认 100（增长 100%），0 禁用自动重写',
  'auto-aof-rewrite-min-size': 'AOF 自动重写的最小文件大小，默认 64mb',
  'aof-load-truncated':
    '启动时加载被截断的 AOF 文件是否继续，默认 yes（加载可用部分并日志提示），no 则直接报错',
  'aof-load-corrupt-tail-max-size':
    '启动时允许自动修复的 AOF 文件尾部损坏字节数，默认 0（禁用自动修复），超出则需手动处理',
  'aof-use-rdb-preamble': 'AOF 基础文件是否使用 RDB 格式，默认 yes，RDB 格式更快更高效',
  'aof-timestamp-enabled':
    '是否在 AOF 中记录时间戳注释，支持按时间点恢复，默认 no，启用后可能与部分 AOF 解析器不兼容',
  'shutdown-timeout':
    '关闭时等待副本追上复制的最长时间（秒），仅在有副本时生效。默认 10。0 表示不等待。超时后仍会继续关闭',
  'shutdown-on-sigint':
    '接收 SIGINT 信号时的关闭行为，可选 default（默认）、save、nosave、now、force，可组合（save 和 nosave 不可同时使用）',
  'shutdown-on-sigterm': '接收 SIGTERM 信号时的关闭行为，可选值同 shutdown-on-sigint，默认 default',
  'lua-time-limit':
    'EVAL 脚本、函数及部分模块命令的最大执行时间（毫秒），默认 5000，0 或负值表示无限制，超时后 Redis 仅允许部分命令执行',
  'busy-reply-threshold': '与 lua-time-limit 功能相同，为兼容旧配置的别名，默认 5000',
  'cluster-enabled': '是否启用 Redis Cluster 模式，默认 no，启用后实例才可加入集群',
  'cluster-config-file':
    '集群节点状态文件路径，由 Redis 自动创建和更新，不要手改。未配置时为 nodes.conf。官方示例常写成 nodes-6379.conf，避免同机多实例共用一个文件',
  'cluster-node-timeout': '集群节点超时时间（毫秒），节点不可达超过此时间则标记为故障，默认 15000',
  'cluster-port':
    '集群总线监听端口，默认 0（命令端口 + 10000），手动配置后需在 cluster meet 命令中指定',
  'cluster-replica-validity-factor':
    '从节点故障转移的有效性因子，用于判断从节点数据是否过旧，默认 10，0 表示忽略数据年龄',
  'cluster-migration-barrier':
    '从节点迁移到无从节点主节点的迁移屏障，默认 1（原主节点至少保留 1 个从节点时才迁移），0 仅用于调试，大值禁用迁移',
  'cluster-allow-replica-migration':
    '是否允许从节点自动迁移，默认 yes，禁用则 cluster-migration-barrier 失效',
  'cluster-require-full-coverage':
    '集群是否需要所有哈希槽均被覆盖才接受查询，默认 yes，no 则部分槽可用时仍可查询对应键空间',
  'cluster-replica-no-failover': '从节点是否禁止自动故障转移，默认 no，yes 仅允许手动故障转移',
  'cluster-allow-reads-when-down':
    '集群故障时，节点是否仍为自身负责的槽提供读服务，默认 no，yes 适用于无需强一致性的场景（如缓存）',
  'cluster-allow-pubsubshard-when-down':
    '集群故障时，节点是否仍为自身负责的槽提供 Pub/Sub 服务，默认 yes',
  'cluster-link-sendbuf-limit':
    '单条集群总线连接的发送缓冲上限（字节），非 0 时可限制对端过慢导致的积压内存，0 表示不单独设限',
  'cluster-announce-hostname': '集群节点对外宣布的主机名，用于 SNI 或 DNS 路由，默认空字符串',
  'cluster-announce-human-nodename': '集群节点的人性化名称，用于调试和管理，默认空字符串',
  'cluster-preferred-endpoint-type':
    '集群对外提供的首选连接端点类型，可选 ip（默认）、hostname、unknown-endpoint',
  'cluster-compatibility-sample-ratio':
    '集群模式下命令兼容性检查的采样比例（0-100），默认 0（不采样），100 表示全量检查，高比例可能影响性能',
  'cluster-slot-stats-enabled':
    '是否启用哈希槽资源统计，默认 no，启用后可通过 CLUSTER SLOT-STATS 获取详细统计信息（如内存使用）',
  'cluster-slot-migration-write-pause-timeout':
    '槽迁移过程中，源节点暂停写入的超时时间（毫秒），默认 10000，防止写入长期阻塞',
  'cluster-slot-migration-handoff-max-lag-bytes':
    '槽迁移交接阶段允许的最大复制滞后（字节），滞后足够小源节点才暂停写入并完成切换，默认约 1mb',
  'cluster-announce-ip': '集群节点对外宣布的 IP 地址，用于 NAT 或容器环境',
  'cluster-announce-tls-port': '集群节点对外宣布的 TLS 端口，tls-cluster 启用时生效',
  'cluster-announce-bus-port': '集群节点对外宣布的总线端口',
  'slowlog-log-slower-than':
    '慢查询日志的阈值（微秒），超过此时间的命令会被记录，1000000 微秒 = 1 秒，负值禁用，0 记录所有命令，默认 10000',
  'slowlog-max-len': '慢查询日志的最大条目数，超出则删除最旧条目，默认 128',
  'latency-monitor-threshold':
    '延迟监控的阈值（毫秒），超过此时间的操作会被采样，0 禁用监控，默认 0',
  'latency-tracking': '是否启用扩展延迟监控（跟踪每个命令的延迟分布），默认 yes',
  'latency-tracking-info-percentiles':
    '扩展延迟监控通过 INFO latencystats 输出的百分位数，默认 50、99、99.9',
  'notify-keyspace-events':
    '键空间事件通知配置，由字符组合表示启用的事件类型（如 K、E、g、$ 等），空字符串禁用通知，默认""',
  'hash-max-listpack-entries': '哈希对象使用紧凑编码的最大条目数，超出则转为哈希表，默认 512',
  'hash-max-listpack-value': '哈希对象使用紧凑编码的最大值大小（字节），超出则转为哈希表，默认 64',
  'list-max-listpack-size':
    '列表紧凑编码节点大小：负值为每节点字节上限（-1≈4KB、-2≈8KB 等），正值为每节点最大元素数，默认 -2',
  'list-compress-depth': '列表对象的压缩深度，0 禁用压缩，正值表示首尾不压缩的节点数，默认 0',
  'set-max-intset-entries': '集合对象使用整数集合编码的最大条目数，超出则转为哈希表，默认 512',
  'set-max-listpack-entries': '非整数集合使用紧凑编码的最大条目数，超出则转为哈希表，默认 128',
  'set-max-listpack-value': '非整数集合使用紧凑编码的最大值大小（字节），超出则转为哈希表，默认 64',
  'zset-max-listpack-entries': '有序集合使用紧凑编码的最大条目数，超出则转为跳表，默认 128',
  'zset-max-listpack-value': '有序集合使用紧凑编码的最大值大小（字节），超出则转为跳表，默认 64',
  'hll-sparse-max-bytes':
    'HyperLogLog 稀疏表示的最大字节数（含 16 字节头部），超出则转为密集表示，默认 3000，最大 16000',
  'stream-node-max-bytes': '流对象节点的最大字节数，0 表示无限制，默认 4096',
  'stream-node-max-entries': '流对象节点的最大条目数，0 表示无限制，默认 100',
  activerehashing: '是否启用主动重哈希，默认 yes，用于释放哈希表空闲内存，对延迟敏感场景可禁用',
  'client-output-buffer-limit normal':
    '普通客户端（含 MONITOR）的输出缓冲区限制，格式为 “硬限制 软限制 软限制持续时间”，默认 0 0 0（无限制）',
  'client-output-buffer-limit replica': '从节点客户端的输出缓冲区限制，默认 256mb 64mb 60',
  'client-output-buffer-limit pubsub': 'Pub/Sub 客户端的输出缓冲区限制，默认 32mb 8mb 60',
  'client-query-buffer-limit':
    '客户端查询缓冲区的最大大小，默认 1gb，用于限制协议不同步导致的内存占用',
  lookahead: '每个客户端流水线中预解码和预获取的命令数，默认 16',
  'maxmemory-clients':
    '所有客户端连接占用的最大内存限制，0 禁用客户端淘汰，支持绝对值（如 1g）或百分比（如 5%），默认 0',
  'proto-max-bulk-len': '协议中批量请求的最大大小，默认 512mb，最小 1mb',
  hz: 'Redis 后台任务的执行频率（赫兹），取值 1-500，默认 10，值越高响应性越好但 CPU 消耗越高，超过 100 不推荐',
  'dynamic-hz': '是否启用动态 Hz 调整，默认 yes，客户端连接多时自动提高 Hz，空闲时降低',
  'aof-rewrite-incremental-fsync':
    'AOF 重写时是否每生成 4MB 数据执行一次 fsync，默认 yes，用于减少延迟峰值',
  'rdb-save-incremental-fsync':
    'RDB 保存时是否每生成 4MB 数据执行一次 fsync，默认 yes，用于减少延迟峰值',
  'lfu-log-factor': 'LFU 淘汰算法的计数器对数因子，默认 10，影响计数器增长速度',
  'lfu-decay-time': 'LFU 计数器的衰减时间（分钟），默认 1，0 表示永不衰减',
  'max-new-connections-per-cycle': '每个事件循环周期可接受的最大新连接数（非 TLS），默认 10',
  'max-new-tls-connections-per-cycle': '每个事件循环周期可接受的最大新 TLS 连接数，默认 1',
  activedefrag: '是否启用主动内存碎片整理，默认 no，仅支持 Redis 内置的 Jemalloc 分配器',
  'active-defrag-ignore-bytes': '主动碎片整理的最小碎片浪费字节数，默认 100mb',
  'active-defrag-threshold-lower': '主动碎片整理的最低碎片率阈值（百分比），默认 10',
  'active-defrag-threshold-upper': '主动碎片整理的最高碎片率阈值（百分比），默认 100',
  'active-defrag-cycle-min': '碎片率达到下阈值时的 CPU 占用比例（百分比），默认 1',
  'active-defrag-cycle-max': '碎片率达到上阈值时的 CPU 占用比例（百分比），默认 25',
  'active-defrag-max-scan-fields':
    '每次主字典扫描处理的集合 / 哈希 / 有序集合 / 列表字段数，默认 1000',
  'jemalloc-bg-thread': '是否启用 Jemalloc 的后台清理线程，默认 yes',
  'server-cpulist': 'Redis 服务器 / IO 线程的 CPU 亲和性，格式同 taskset 命令',
  'bio-cpulist': '后台 I/O 线程的 CPU 亲和性，格式同 taskset 命令',
  'aof-rewrite-cpulist': 'AOF 重写子进程的 CPU 亲和性，格式同 taskset 命令',
  'bgsave-cpulist': 'BGSAVE 子进程的 CPU 亲和性，格式同 taskset 命令',
  'ignore-warnings': '需要抑制的 Redis 启动警告列表，空格分隔，如 ARM64-COW-BUG',
  'repl-ping-slave-period':
    '主库向从库发 PING 的间隔（秒），与 repl-ping-replica-period 同义（旧名）',
  'min-slaves-to-write': '主库接受写之前需达标的在线从库数，与 min-replicas-to-write 同义（旧名）',
  'min-slaves-max-lag': '主库检查从库延迟的上限（秒），与 min-replicas-max-lag 同义（旧名）',
  slaveof: '指定本实例所复制的主机与端口，与 replicaof 同义（旧名），空表示不复制',
  'slave-read-only': '从库是否只读，与 replica-read-only 同义（旧名）',
  'slave-serve-stale-data': '复制中断时是否仍返回旧数据，与 replica-serve-stale-data 同义（旧名）',
  'slave-priority': 'Sentinel 选主时的从库优先级，与 replica-priority 同义（旧名）',
  'slave-announce-ip': '从库对外声明的 IP，与 replica-announce-ip 同义（旧名）',
  'slave-announce-port': '从库对外声明的端口，与 replica-announce-port 同义（旧名）',
  'slave-ignore-maxmemory': '从库是否忽略本机 maxmemory，与 replica-ignore-maxmemory 同义（旧名）',
  'slave-lazy-flush': '全量同步时是否惰性清空库，与 replica-lazy-flush 同义（旧名）',
  'cluster-slave-no-failover':
    '是否禁止从库自动故障转移，与 cluster-replica-no-failover 同义（旧名）',
  'cluster-slave-validity-factor':
    '从库数据陈旧度因子，与 cluster-replica-validity-factor 同义（旧名）',
  server_cpulist: '主进程与 IO 线程 CPU 亲和性，与 server-cpulist 相同（下划线键名）',
  bio_cpulist: '后台 IO 线程 CPU 亲和性，与 bio-cpulist 相同（下划线键名）',
  bgsave_cpulist: 'BGSAVE 子进程 CPU 亲和性，与 bgsave-cpulist 相同（下划线键名）',
  aof_rewrite_cpulist: 'AOF 重写子进程 CPU 亲和性，与 aof-rewrite-cpulist 相同（下划线键名）',
  'cluster-announce-port':
    '对客户端宣告的命令端口（非 TLS），0 常表示跟随 port 或未单独指定，用于 NAT/容器',
  'hash-max-ziplist-entries':
    '哈希使用 ziplist 紧凑编码时的最大字段数，超出转哈希表（旧编码名，新配置多为 listpack）',
  'hash-max-ziplist-value': '哈希 ziplist 单项最大字节，超出转哈希表（旧编码名）',
  'zset-max-ziplist-entries': '有序集合 ziplist 编码最大元素数，超出转跳表（旧编码名）',
  'zset-max-ziplist-value': '有序集合 ziplist 单项最大字节（旧编码名）',
  'list-max-ziplist-size': '列表 ziplist 节点大小阈值，语义接近 list-max-listpack-size（旧编码名）',
  'client-output-buffer-limit':
    '单行配置各角色输出缓冲硬/软限制，格式含 normal、slave、pubsub 等段，与分项 client-output-buffer-limit * 等价',
  'key-memory-histograms': '是否采集键尺寸等直方图供观测（如 INFO Keysizes），默认关闭以降低开销',
  'bf-initial-size': 'RedisBloom 布隆过滤器默认初始容量（预估元素规模）',
  'bf-error-rate': '布隆过滤器目标误判率（0~1 小数）',
  'bf-expansion-factor': '布隆空间不足时扩容倍数',
  'cf-initial-size': 'RedisBloom Cuckoo 过滤器初始槽位数',
  'cf-bucket-size': 'Cuckoo 每桶可容纳条目数',
  'cf-max-iterations': '插入冲突时最大置换迭代次数',
  'cf-expansion-factor': 'Cuckoo 过滤器扩容因子',
  'cf-max-expansions': '允许的最大扩容次数',
  'stream-idmp-duration':
    '流键渐进修剪（incremental trimming）的时间步长或周期相关参数，随模块版本定义',
  'stream-idmp-maxsize': '渐进修剪每批最多处理的条目或字节数，用于控制单次 CPU/延迟',
  'tls-auth-clients-user':
    '是否将 TLS 客户端证书映射到 ACL 用户（如 off/on），用于证书身份与 ACL 联动，语义随版本扩展',
  'vset-force-single-threaded-execution': 'VectorSet 模块是否强制单线程执行（调试用或特定部署）',
  'ts-encoding': '时间序列样本默认编码，如 compressed 或 uncompressed',
  'ts-chunk-size-bytes': '每个时间序列 chunk 目标大小（字节）',
  'ts-retention-policy': '保留时长（毫秒），0 表示不按时间裁剪',
  'ts-duplicate-policy': '相同时间戳再次写入时的策略，如 block、last、first、sum 等',
  'ts-ignore-max-time-diff': '与上次样本时间差超过该阈值（毫秒）则拒绝或特殊处理，0 常表示关闭',
  'ts-ignore-max-val-diff': '与上次样本值差超过该阈值则拒绝或特殊处理，用于去噪',
  'ts-num-threads': '时间序列模块用于计算的线程数',
  'ts-compaction-policy': '降采样与压实规则 DSL，空表示不自动压实',
  'search-threads': 'RediSearch 主工作线程数',
  'search-workers': '附加 worker 线程数，0 常表示按默认推导',
  'search-io-threads': '模块侧 IO/卸载线程数',
  'search-timeout': '查询超时时间（毫秒）',
  'search-on-timeout': '查询超时策略（模块枚举，如 return），具体语义见 RediSearch 文档',
  'search-on-oom': '内存不足时策略（模块枚举，如 return），具体语义见 RediSearch 文档',
  'search-default-dialect': 'FT 查询默认方言版本',
  'search-default-scorer': '全文默认打分器名称，如 BM25STD',
  'search-max-search-results': '单次搜索允许返回的最大命中数',
  'search-max-aggregate-results': '聚合管道允许的最大中间/结果规模',
  'search-max-doctablesize': '文档表最大行数上限',
  'search-max-prefix-expansions': '前缀扩展最大分支数，防止组合爆炸',
  'search-min-prefix': '前缀查询最小长度',
  'search-min-stem-len': '词干提取最小词长',
  'search-min-phonetic-term-len': '语音匹配最小词长',
  'search-multi-text-slop': '多字段短语匹配的 slop/跨度',
  'search-bm25std-tanh-factor': 'BM25STD 打分中 tanh 相关平滑因子',
  'search-union-iterator-heap': '并集迭代器堆容量相关阈值',
  'search-cursor-max-idle': '游标最大空闲时间（毫秒）后回收',
  'search-cursor-reply-threshold': '游标批量回复条数/字节阈值',
  'search-index-cursor-limit': '索引构建游标并发或队列限制',
  'search-indexer-yield-every-ops': '索引器每处理多少操作后让出事件循环',
  'search-workers-priority-bias-threshold': 'worker 调度优先级偏置阈值',
  'search-min-operation-workers': '执行某类操作所需最少 worker 数',
  'search-conn-per-shard': '每分片连接池大小，0 为默认',
  'search-gc-scan-size': '索引 GC 每批扫描的条目规模',
  'search-fork-gc-run-interval': 'fork 子进程 GC 周期间隔（秒）',
  'search-fork-gc-retry-interval': 'fork GC 失败重试间隔（秒）',
  'search-fork-gc-clean-threshold': '触发清理的文档/垃圾计数阈值',
  'search-fork-gc-sleep-before-exit': 'fork GC 退出前休眠（毫秒），缓和突发 IO',
  'search-no-gc': '是否禁用搜索索引垃圾回收',
  'search-no-mem-pools': '是否禁用模块内存池（调试用）',
  'search-partial-indexed-docs': '是否允许尚未完全索引的文档参与部分查询（视版本语义）',
  'search-raw-docid-encoding': '是否使用原始 docid 编码优化存储',
  'search-enable-unstable-features': '是否启用实验/不稳定特性',
  'search-topology-validation-timeout': '集群拓扑校验超时（毫秒）',
  'search-tiered-hnsw-buffer-limit': '分层 HNSW 向量索引缓冲上限',
  'search-vss-max-resize': '向量索引 resize 上限，0 常表示不额外限制',
  'search-friso-ini': 'Friso 中文分词 ini 配置文件路径',
  'search-ext-load': 'RediSearch 扩展/插件加载路径',
  'search-bg-index-sleep-gap': '后台索引节流间隔（毫秒），降低与主线程争用',
  'search-_bg-index-mem-pct-thr': '后台索引占用系统内存百分比阈值（内部参数）',
  'search-_bg-index-oom-pause-time': '后台索引遇 OOM 时暂停时长（内部参数）',
  'search-_min-trim-delay-ms': '修剪任务最小延迟（毫秒，内部）',
  'search-_max-trim-delay-ms': '修剪任务最大延迟（毫秒，内部）',
  'search-_trimming-state-check-delay-ms': '修剪状态轮询间隔（毫秒，内部）',
  'search-_numeric-ranges-parents': '数值范围索引父节点结构相关开关（内部）',
  'search-_numeric-compress': '是否压缩数值范围索引（内部）',
  'search-_prioritize-intersect-union-children': '交并查询子迭代器调度策略（内部）',
  'search-_simulate-in-flex': '灵活查询路径模拟（内部/调试）',
  'search-_free-resource-on-thread': '是否在线程上释放部分资源（内部）',
  'search-_print-profile-clock': '是否打印查询剖析时钟（内部/调试）',
  // Redis 8.8+ Array / Slowlog / Search / TimeSeries 补充
  'array-slice-size':
    'Array 每个切片（slice）的容量，默认 4096；CONFIG SET 后仅影响新建 Array，已有数据保留原切片大小',
  'array-sparse-kmax': '稀疏切片条目数超过该值时提升为稠密切片；设为 0 禁用稀疏编码，默认 10',
  'array-sparse-kmin': '稠密切片元素数低于该值且可省内存时降回稀疏；设为 0 禁止降级，默认 5',
  'slowlog-entry-max-argc':
    '写入慢日志时保留的最大参数个数，超出则截断并附带提示；最小为 2（保留命令名），默认 32',
  'slowlog-entry-max-string-len': '慢日志中单个参数字符串的最大长度（字节），超出截断，默认 128',
  'ts-libmr-protocol': 'RedisTimeSeries 集群通信协议模式（如 INTERNAL），一般保持默认',
  'ts-topology-events': '是否响应集群拓扑变更事件以同步时间序列模块状态，默认 yes',
  'search-bg-index-sleep-duration-us': '后台索引每次休眠时长（微秒），用于节流，默认 1',
  'search-disk-buffer-percentage': '磁盘索引相关缓冲占可用资源的百分比阈值，默认 20',
  'search-monitor-expiration': '是否监控索引/文档过期并触发清理，默认 yes',
  'search-_fallback-to-main-thread-when-block-client-unavailable':
    '阻塞客户端不可用时是否回退到主线程执行（内部），默认 yes',
  'search-_info-on-zero-indexes': '无索引时是否仍输出搜索相关 INFO（内部），默认 no',
  'search-_max-foreground-timeout-limit': '前台搜索超时上限（毫秒，内部），默认 60000',
  'search-disk-drop-read-cache': '磁盘索引读路径是否丢弃页缓存以降低缓存污染，默认 no',
  'search-disk-max-open-files': '磁盘索引允许同时打开的最大文件数，默认 1024',
  'search-disk-use-direct-reads': '磁盘索引是否使用直接 I/O 读取，默认 no',
  'search-max-aggregate-groups': '聚合 GROUPBY 允许的最大分组数，默认 1000000',
  // Redis 8.10 新增
  backupdirname:
    'BACKUP 输出目录名（相对 dir，不可为绝对/嵌套路径），启动时生效且不可 CONFIG SET，默认 backupdir',
  'backup-sealed-ttl':
    'BACKUP SEAL 后自动清理密封备份的秒数，0 表示不自动清理直至 BACKUP CLEANUP，默认 0',
  'preload-file':
    '启动时仅加载指定文件：rdb:路径 或 aof:路径/manifest；设置后跳过常规 RDB/AOF 目录加载，失败则中止启动',
  'tls-expected-peer-name':
    '服务端到服务端 TLS 要求对端证书 SAN/CN 匹配的名称（可空格分隔多个）；空表示不校验对端名，不影响普通客户端 TLS',
  'hash-min-template-entries':
    '哈希字段数达到该值时在写路径自动转为模板编码以共享字段名；0 禁用，含字段过期的哈希不转换，默认 0',
  'hash-max-template-entries': '自动模板转换的字段数上限，超过则不转换；0 表示无上限，默认 0',
  'hash-rdb-load-min-template-entries':
    '加载不含模板的旧 RDB 时，字段数达到该值则转为模板；0 禁用，默认 0',
  'hash-rdb-load-max-template-entries':
    'RDB 加载时模板转换的字段数上限；0 表示无上限（且与最小值同为 0 时禁用），默认 0',
  'hash-rdb-load-template-disassembly-threshold':
    'RDB 加载后若某模板被引用的键数少于此值则拆回普通哈希；0 禁用拆解，默认 0',
} as const
