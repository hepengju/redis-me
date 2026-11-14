/** CONFIG 项说明（英文） */
export const enConfigTip = {
  include:
    'Include one or more other configuration files, support wildcards, included files are loaded in alphabetical order, no error is reported when no files match the wildcard',
  loadmodule:
    'Load modules at startup, multiple modules can be specified, the server will abort if module loading fails, and parameters can be passed to modules',
  bind: "Specify the network interface IP addresses that Redis listens to, the prefix '-' indicates that the server will not fail to start if the address is unavailable, and the default listens to the loopback addresses 127.0.0.1 and ::1",
  'bind-source-addr':
    'Configure the local address bound to outgoing connections, affecting the connection routing method',
  'protected-mode':
    'Security protection mode. When enabled and the default user has no password, only local connections (127.0.0.1, ::1 or Unix domain sockets) are allowed, enabled by default',
  'enable-protected-configs':
    'Control the modifiable permissions of sensitive configuration directives, optional values: no (default, disable modification for all connections), yes (allow modification for all connections), local (allow modification only for local connections)',
  'enable-debug-command':
    'Control the enablement permissions of debug commands, optional values same as enable-protected-configs, default no',
  'enable-module-command':
    'Control the enablement permissions of module commands, optional values same as enable-protected-configs, default no',
  port: 'The TCP port to listen on, default 6379, setting to 0 means not listening on a TCP socket',
  'tcp-backlog':
    'The length of the TCP listen queue, the actual value is limited by the system /proc/sys/net/core/somaxconn, default 511',
  unixsocket:
    'The path of the Unix domain socket, if not specified, Redis will not listen on a Unix domain socket',
  unixsocketperm:
    'Octal permission bits for the Unix socket file (e.g. 700); 0 may mean use the build/platform default',
  timeout:
    'Client idle timeout (seconds), 0 means disabling timeout to close connections, default 0',
  'tcp-keepalive':
    'TCP keepalive time (seconds), a non-zero value enables the SO_KEEPALIVE option, used to detect dead connections and maintain network connections, default 300',
  'socket-mark-id':
    'Mark the listening socket with an ID to support advanced routing and filtering. On Linux, it corresponds to a connection mark; on FreeBSD, it corresponds to a socket cookie ID; on OpenBSD, it corresponds to a route table ID, default 0',
  'tls-port':
    'TLS listening port, TLS needs to be configured with this parameter to enable, TLS is disabled by default',
  'tls-cert-file':
    'Path to the server-side X.509 certificate file (PEM format), used to authenticate to clients, master nodes or cluster nodes',
  'tls-key-file': 'Path to the server-side private key file (PEM format)',
  'tls-key-file-pass': 'Password for the encrypted private key file',
  'tls-client-cert-file':
    'Path to the client-side (used for replication, cluster connections, etc.) X.509 certificate file (PEM format)',
  'tls-client-key-file': 'Path to the client-side private key file (PEM format)',
  'tls-client-key-file-pass': 'Password for the client-side encrypted private key file',
  'tls-dh-params-file':
    'Path to the DH parameters file, used to support Diffie-Hellman key exchange for older versions of OpenSSL (<3.0), not recommended for new versions',
  'tls-ca-cert-file':
    'Path to the CA certificate file, used to authenticate TLS clients and nodes, Redis does not use the system CA configuration by default',
  'tls-ca-cert-dir': 'Path to the CA certificate directory, same function as tls-ca-cert-file',
  'tls-auth-clients':
    'TLS client cert policy: no, optional (must be valid if sent), or yes; default is often yes when TLS is enabled',
  'tls-replication': 'Whether to enable TLS for replication links, default no',
  'tls-cluster': 'Whether to enable TLS for the cluster bus, default no',
  'tls-protocols':
    'Supported TLS versions, optional TLSv1, TLSv1.1, TLSv1.2, TLSv1.3 (OpenSSL ≥ 1.1.1), TLSv1.2 and TLSv1.3 are enabled by default',
  'tls-ciphers':
    'Cipher suites supported for TLSv1.2 and below, syntax refers to the ciphers(1ssl) manual, default DEFAULT:!MEDIUM',
  'tls-ciphersuites':
    'Cipher suites supported for TLSv1.3, syntax refers to the ciphers(1ssl) manual',
  'tls-prefer-server-ciphers':
    'Whether to prefer the server-side cipher suite preference, default no (follow client preference)',
  'tls-session-caching':
    'Whether to enable TLS session caching, default yes, used to speed up client reconnections',
  'tls-session-cache-size':
    'Maximum number of TLS sessions cached, 0 means unlimited, default 20480',
  'tls-session-cache-timeout': 'Timeout of cached TLS sessions (seconds), default 300',
  daemonize:
    'Whether to run in daemon mode, default no, a pid file will be generated in daemon mode',
  supervised:
    'Specify the supervision system interaction method, optional no (default, no interaction), upstart, systemd, auto (automatic detection)',
  pidfile:
    'Path to the pid file, no pid file is generated if not specified in non-daemon mode, default /var/run/redis.pid in daemon mode, /run/redis.pid is recommended for modern Linux systems',
  loglevel:
    'Log verbosity level, optional debug, verbose, notice (default, recommended for production environments), warning, nothing',
  logfile:
    'Path to the log file, an empty string means output to standard output, log output to standard output will be directed to /dev/null in daemon mode',
  'syslog-enabled': 'Whether to enable system logging, default no',
  'syslog-ident': 'System log identity, default redis',
  'syslog-facility': 'System log facility, must be USER or LOCAL0-LOCAL7, default local0',
  'crash-log-enabled':
    'Whether to enable crash logging, enabled by default, disabling can generate cleaner core dumps',
  'crash-memcheck-enabled':
    'Whether to enable the fast memory check of crash logs, enabled by default, disabling can make Redis terminate faster',
  databases:
    'Number of databases, 16 by default (numbered 0-15), can be switched using the SELECT command',
  'always-show-logo':
    'Whether to always display the ASCII art logo in startup logs, default no, only displayed by default in interactive sessions',
  'hide-user-data-from-log':
    'Whether to prohibit logging personally identifiable information (PII), disabled by default',
  'set-proc-title':
    'Whether to modify the process title to display runtime information, default yes',
  'proc-title-template':
    'Process title template, supporting variables {title}, {listen-addr}, {server-mode}, {port}, {tls-port}, {unixsocket}, {config-file}, default "{title} {listen-addr} {server-mode}"',
  'locale-collate':
    'Local environment used for string comparison operations, an empty string means obtained from environment variables, affecting Lua script performance',
  save: 'RDB persistence trigger conditions, format "<seconds> <changes>", multiple conditions can be configured, default 3600 seconds with 1 change, 300 seconds with 100 changes, 60 seconds with 10000 changes, set to "" to disable RDB persistence',
  'stop-writes-on-bgsave-error':
    'Whether to stop accepting writes if background saving fails when RDB snapshots are enabled, default yes, ensuring normal data persistence',
  rdbcompression:
    'Whether to compress string objects in RDB files using LZF, default yes, disabling can save CPU but increase file size',
  rdbchecksum:
    'Whether to add a CRC64 checksum at the end of the RDB file, default yes, disabling can improve read and write performance but reduce file integrity check capability',
  'sanitize-dump-payload':
    'Whether to perform full verification when loading RDB or RESTORE data, optional no (default), yes, clients, used to reduce the risk of assertions or crashes during subsequent command execution',
  dbfilename: 'Name of the RDB file, default dump.rdb',
  'rdb-del-sync-files':
    'Whether to delete RDB files generated during replication when no persistence is enabled, default no, only effective when both AOF and RDB are disabled',
  dir: 'Working directory, RDB files and AOF files are stored in this directory, default ./',
  replicaof:
    'Configure the current instance as a replica node, specifying the IP and port of the master node',
  masterauth: 'Password of the master node, required when the master node has a password enabled',
  masteruser:
    'Username of the master node used for replication, used when Redis 6 and above support ACL, for executing commands required for replication such as PSYNC',
  'replica-serve-stale-data':
    'Whether to return stale data when the replica node is disconnected from the master node or during replication, default yes, setting to no will reject data access commands except for some commands',
  'replica-read-only':
    'Whether the replica node is read-only, default yes, read-only by default since Redis 2.6',
  'repl-diskless-sync':
    'Synchronization strategy used for full replication, yes means diskless synchronization (transfer RDB directly through the socket), no means disk-based synchronization, default yes',
  'repl-diskless-sync-delay':
    'Delay time (seconds) for waiting for more replica nodes to connect during diskless synchronization, default 5, setting to 0 starts transmission immediately',
  'repl-diskless-sync-max-replicas':
    'During the diskless full-sync wait, start the transfer once this many replicas are connected. Default 0 means there is no such count, so Redis waits the full repl-diskless-sync-delay',
  'repl-diskless-load':
    'The way the replica node loads RDB data from the master node, optional disabled (default, store to disk first then load), swapdb (load in parallel in memory, requiring sufficient memory), on-empty-db (diskless load only when the database is empty)',
  'repl-ping-replica-period':
    'Interval time (seconds) for the master node to send PING to the replica node, default 10',
  'repl-timeout':
    'Replication timeout time (seconds), covering scenarios such as SYNC bulk transfer, master-replica node communication, default 60, which needs to be greater than repl-ping-replica-period',
  'repl-disable-tcp-nodelay':
    'Whether to disable the TCP_NODELAY option of the replica node socket after full synchronization, default no (prioritizing low latency), yes can reduce bandwidth usage but increase data latency',
  'repl-backlog-size':
    'Size of the replication backlog buffer, used for partial synchronization after the replica node reconnects, default 1mb, only allocated when there are replica nodes connected',
  'repl-backlog-ttl':
    'Release time (seconds) of the replication backlog buffer after the last replica node disconnects, default 3600, 0 means never release',
  'replica-full-sync-buffer-limit':
    "Maximum size of replication data stream that the replica node can accumulate during full synchronization, 0 means inheriting the hard limit of the master node's client-output-buffer-limit replica, default 0",
  'replica-priority':
    'Replica node priority, used by Redis Sentinel to select a master node during failover, the smaller the value, the higher the priority, 0 means cannot be promoted to master node, default 100',
  'propagation-error-behavior':
    'Behavior for handling command execution errors in the replication stream or AOF file, optional ignore (default), panic, panic-on-replicas',
  'replica-ignore-disk-write-errors':
    'Whether the replica node ignores errors when writing to disk fails, default no (crash), yes only logs a warning and executes the command',
  'replica-announced':
    'Whether Sentinel may announce this replica (sentinel replicas and clients). Default yes. no still allows promotion; set replica-priority 0 to prevent that. Addressing uses replica-announce-ip/port',
  'min-replicas-to-write':
    'Minimum number of online replica nodes required for the master node to accept writes, default 0 (disabled), need to be used with min-replicas-max-lag',
  'min-replicas-max-lag':
    'Maximum latency time (seconds) of replica nodes when the master node accepts writes, default 10',
  'replica-announce-ip':
    'IP address reported by the replica node to the master node, used in NAT or port forwarding scenarios',
  'replica-announce-port':
    'Port reported by the replica node to the master node, used in NAT or port forwarding scenarios',
  'tracking-table-max-keys':
    'Maximum number of keys in the invalidation table for client-side cache key tracking, default 1000000, 0 means no limit, this configuration is invalid in broadcast mode',
  'acllog-max-len':
    'Maximum number of entries in the ACL log, used to record failed commands and authentication events related to ACL, default 128',
  aclfile:
    'Path to the external ACL user configuration file, cannot be used simultaneously with user configuration in the current configuration file',
  requirepass:
    'Password of the default user, a compatibility layer of the ACL system in Redis 6 and above, incompatible with the aclfile and ACL LOAD commands',
  'acl-pubsub-default':
    'Default Pub/Sub channel permissions for new users, optional allchannels (allow all channels), resetchannels (forbid all channels), resetchannels is default in Redis 7.0',
  'rename-command':
    'Rename or disable commands (deprecated), it is recommended to use ACL to control command permissions, format "rename-command original-command new-command", setting the new command to an empty string disables the command',
  maxclients:
    'Maximum number of simultaneous connected clients, default 10000, actually limited by the system file descriptor limit, cluster bus connection resources need to be reserved in Redis Cluster mode',
  maxmemory:
    'Maximum memory limit used by Redis, when the limit is reached, key eviction is performed according to maxmemory-policy, no limit by default',
  'maxmemory-policy':
    'Key eviction policy when memory reaches maxmemory, optional volatile-lru, allkeys-lru, volatile-lfu, allkeys-lfu, volatile-random, allkeys-random, volatile-ttl, noeviction (default)',
  'maxmemory-samples':
    'Sampling number of LRU/LFU/TTL eviction algorithms, default 5, the larger the value, the closer to the real result but the higher the CPU consumption, maximum 64',
  'maxmemory-eviction-tenacity':
    'How aggressively to reclaim memory during eviction: 0 favors lower latency, 10 default, 100 favors freeing memory sooner (may add latency spikes), default 10',
  'replica-ignore-maxmemory':
    'Whether the replica node ignores its own maxmemory configuration, default yes (eviction is handled by the master node), modify only when the replica node is writable or needs an independent memory limit',
  'active-expire-effort':
    'Intensity of active expired key cleaning, default 1, value range 1-10, the larger the value, the more thorough the cleaning but the higher the CPU consumption',
  'lazyfree-lazy-eviction':
    'Whether to use lazy deletion (non-blocking) during memory eviction, default no',
  'lazyfree-lazy-expire': 'Whether to use lazy deletion when keys expire, default no',
  'lazyfree-lazy-server-del':
    'Whether to use lazy deletion when the server internally deletes keys (such as RENAME overwriting), default no',
  'replica-lazy-flush':
    'Whether the replica node lazily clears the database during full synchronization, default no',
  'lazyfree-lazy-user-del':
    'Whether the user uses lazy deletion when executing the DEL command, default no',
  'lazyfree-lazy-user-flush':
    'Whether to delete asynchronously by default when the user executes FLUSHDB/FLUSHALL/SCRIPT FLUSH/FUNCTION FLUSH without specifying the sync/async flag, default no',
  'io-threads':
    'Number of I/O threads, used to handle reading/writing of client sockets and protocol parsing, disabled by default (1 means only the main thread), it is recommended to enable on servers with 4 or more cores, leaving 1 idle core',
  'oom-score-adj':
    'Whether to control the process priority of the kernel OOM killer, optional no (default), yes (equivalent to relative), absolute, relative, used to prioritize evicting background child processes and replica nodes',
  'oom-score-adj-values':
    'OOM priority adjustment values, in order of master node, replica node, background child process, value range -2000 to 2000, default 0 200 800',
  'disable-thp':
    'Whether to disable Transparent Huge Pages (THP) for the Redis process, default yes, avoiding latency issues caused by fork and Copy-on-Write (CoW)',
  appendonly:
    'Whether to enable AOF persistence, default no, AOF and RDB can be enabled simultaneously, AOF is loaded first at startup',
  appendfilename:
    'Base name of the AOF file, Redis 7 and above use a multi-file format (base file, incremental file, manifest file), default "appendonly.aof"',
  appenddirname: 'Storage directory of AOF files, default "appendonlydir"',
  appendfsync:
    'fsync policy of AOF files, optional always (sync after every write, safest), everysec (sync every second, default), no (controlled by the system, fastest)',
  'no-appendfsync-on-rewrite':
    "Whether to suspend AOF's fsync when BGSAVE or BGREWRITEAOF is executed, default no (prioritizing data security), yes can alleviate I/O blocking but reduce durability",
  'auto-aof-rewrite-percentage':
    'Trigger percentage of automatic AOF rewrite, based on the file size after the last rewrite, default 100 (grows by 100%), 0 disables automatic rewrite',
  'auto-aof-rewrite-min-size': 'Minimum file size for automatic AOF rewrite, default 64mb',
  'aof-load-truncated':
    'Whether to continue loading when a truncated AOF file is found at startup, default yes (load available parts and log a prompt), no will directly report an error',
  'aof-load-corrupt-tail-max-size':
    'Maximum number of corrupted bytes at the end of the AOF file that Redis can automatically recover at startup, default 0 (disable automatic recovery), manual processing is required if exceeded',
  'aof-use-rdb-preamble':
    'Whether the AOF base file uses the RDB format, default yes, RDB format is faster and more efficient',
  'aof-timestamp-enabled':
    'Whether to record timestamp annotations in AOF to support point-in-time recovery, default no, enabling may be incompatible with some AOF parsers',
  'shutdown-timeout':
    'Seconds to wait for replicas to catch up on shutdown; only applies when replicas exist. Default 10. 0 disables the wait. Shutdown continues after the timeout',
  'shutdown-on-sigint':
    'Shutdown behavior when receiving the SIGINT signal, optional default, save, nosave, now, force, can be combined (save and nosave cannot be used simultaneously)',
  'shutdown-on-sigterm':
    'Shutdown behavior when receiving the SIGTERM signal, optional values same as shutdown-on-sigint, default default',
  'lua-time-limit':
    'Maximum execution time (milliseconds) of EVAL scripts, functions and some module commands, default 5000, 0 or negative value means no limit, Redis only allows some commands to be executed after timeout',
  'busy-reply-threshold':
    'Same function as lua-time-limit, an alias for compatible with old configurations, default 5000',
  'cluster-enabled':
    'Whether to enable Redis Cluster mode, default no, instances can join the cluster only after enabling',
  'cluster-config-file':
    'Cluster node state file, created and updated by Redis; do not edit it by hand. Unset value is nodes.conf. The sample config uses nodes-6379.conf so instances on one host do not share a file',
  'cluster-node-timeout':
    'Cluster node timeout time (milliseconds), a node is marked as faulty if unreachable for more than this time, default 15000',
  'cluster-port':
    'Cluster bus listening port, default 0 (command port + 10000), need to specify the cluster bus port in the cluster meet command after manual configuration',
  'cluster-replica-validity-factor':
    'Validity factor for replica node failover, used to determine if the replica node data is too old, default 10, 0 means ignoring data age',
  'cluster-migration-barrier':
    'Migration barrier for replica nodes to migrate to master nodes without replica nodes, default 1 (migrate only if the original master node retains at least 1 replica node), 0 is only for debugging, large values disable migration',
  'cluster-allow-replica-migration':
    'Whether to allow automatic migration of replica nodes, default yes, disabling makes cluster-migration-barrier invalid',
  'cluster-require-full-coverage':
    'Whether the cluster needs all hash slots to be covered to accept queries, default yes, no allows queries for the corresponding key space when some slots are available',
  'cluster-replica-no-failover':
    'Whether to prohibit replica nodes from automatic failover, default no, yes only allows manual failover',
  'cluster-allow-reads-when-down':
    'Whether nodes still provide read services for the slots they are responsible for when the cluster fails, default no, yes is suitable for scenarios that do not require strong consistency (such as caches)',
  'cluster-allow-pubsubshard-when-down':
    'Whether nodes still provide Pub/Sub services for the slots they are responsible for when the cluster fails, default yes',
  'cluster-link-sendbuf-limit':
    'Per cluster-bus connection outbound buffer cap (bytes); non-zero limits memory if a peer is slow, 0 means no explicit cap',
  'cluster-announce-hostname':
    'Hostname announced by cluster nodes to the outside, used for SNI or DNS routing, default empty string',
  'cluster-announce-human-nodename':
    'Human-readable name of cluster nodes, used for debugging and management, default empty string',
  'cluster-preferred-endpoint-type':
    'Preferred connection endpoint type provided by the cluster to the outside, optional ip (default), hostname, unknown-endpoint',
  'cluster-compatibility-sample-ratio':
    'Sampling ratio (0-100) for command compatibility checks in cluster mode, default 0 (no sampling), 100 means full check, high ratio may affect performance',
  'cluster-slot-stats-enabled':
    'Whether to enable hash slot resource statistics, default no, enabling allows obtaining detailed statistics (such as memory usage) through CLUSTER SLOT-STATS',
  'cluster-slot-migration-write-pause-timeout':
    'Timeout time (milliseconds) for the source node to pause writes during the slot migration handoff phase, default 10000, preventing long-term write blocking',
  'cluster-slot-migration-handoff-max-lag-bytes':
    'Max replication lag (bytes) allowed before finishing slot handoff; the source pauses writes only once lag is small enough, default about 1mb',
  'cluster-announce-ip':
    'IP address announced by cluster nodes to the outside, used in NAT or container environments',
  'cluster-announce-tls-port':
    'TLS port announced by cluster nodes to the outside, effective when tls-cluster is enabled',
  'cluster-announce-bus-port': 'Bus port announced by cluster nodes to the outside',
  'slowlog-log-slower-than':
    'Threshold (microseconds) for slow query logs, commands exceeding this time will be recorded, 1000000 microseconds = 1 second, negative value disables, 0 records all commands, default 10000',
  'slowlog-max-len':
    'Maximum number of entries in the slow query log, the oldest entry is deleted when exceeded, default 128',
  'latency-monitor-threshold':
    'Threshold (milliseconds) for latency monitoring, operations exceeding this time will be sampled, 0 disables monitoring, default 0',
  'latency-tracking':
    'Whether to enable extended latency monitoring (tracking the latency distribution of each command), default yes',
  'latency-tracking-info-percentiles':
    'Percentiles output by extended latency monitoring through INFO latencystats, default 50, 99, 99.9',
  'notify-keyspace-events':
    'Keyspace event notification configuration, composed of characters to indicate enabled event types (such as K, E, g, $, etc.), empty string disables notifications, default ""',
  'hash-max-listpack-entries':
    'Maximum number of entries for hash objects to use compact encoding, converted to hash table when exceeded, default 512',
  'hash-max-listpack-value':
    'Maximum value size (bytes) for hash objects to use compact encoding, converted to hash table when exceeded, default 64',
  'list-max-listpack-size':
    'List compact-encoding node size: negative means max bytes per node (-1≈4KB, -2≈8KB, etc.), positive means max elements per node, default -2',
  'list-compress-depth':
    'Compression depth of list objects, 0 disables compression, positive values indicate the number of nodes not compressed at both ends, default 0',
  'set-max-intset-entries':
    'Maximum number of entries for set objects to use integer set encoding, converted to hash table when exceeded, default 512',
  'set-max-listpack-entries':
    'Maximum number of entries for non-integer sets to use compact encoding, converted to hash table when exceeded, default 128',
  'set-max-listpack-value':
    'Maximum value size (bytes) for non-integer sets to use compact encoding, converted to hash table when exceeded, default 64',
  'zset-max-listpack-entries':
    'Maximum number of entries for sorted sets to use compact encoding, converted to skip list when exceeded, default 128',
  'zset-max-listpack-value':
    'Maximum value size (bytes) for sorted sets to use compact encoding, converted to skip list when exceeded, default 64',
  'hll-sparse-max-bytes':
    'Maximum bytes for the sparse representation of HyperLogLog (including 16-byte header), converted to dense representation when exceeded, default 3000, maximum 16000',
  'stream-node-max-bytes': 'Maximum bytes of stream object nodes, 0 means no limit, default 4096',
  'stream-node-max-entries':
    'Maximum number of entries of stream object nodes, 0 means no limit, default 100',
  activerehashing:
    'Whether to enable active rehashing, default yes, used to release free memory of hash tables, can be disabled for latency-sensitive scenarios',
  'client-output-buffer-limit normal':
    'Output buffer limit for normal clients (including MONITOR), format "hard limit soft limit soft limit duration", default 0 0 0 (no limit)',
  'client-output-buffer-limit replica':
    'Output buffer limit for replica node clients, default 256mb 64mb 60',
  'client-output-buffer-limit pubsub':
    'Output buffer limit for Pub/Sub clients, default 32mb 8mb 60',
  'client-query-buffer-limit':
    'Maximum size of the client query buffer, default 1gb, used to limit memory usage caused by protocol desynchronization',
  lookahead: 'Number of commands to decode and prefetch in each client pipeline, default 16',
  'maxmemory-clients':
    'Maximum memory limit occupied by all client connections, 0 disables client eviction, supports absolute values (such as 1g) or percentages (such as 5%), default 0',
  'proto-max-bulk-len': 'Maximum size of bulk requests in the protocol, default 512mb, minimum 1mb',
  hz: 'Execution frequency (Hz) of Redis background tasks, value range 1-500, default 10, higher values improve responsiveness but increase CPU consumption, values over 100 are not recommended',
  'dynamic-hz':
    'Whether to enable dynamic HZ adjustment, default yes, automatically increase HZ when there are many client connections and decrease when idle',
  'aof-rewrite-incremental-fsync':
    'Whether to execute fsync every 4MB of data generated during AOF rewrite, default yes, used to reduce latency spikes',
  'rdb-save-incremental-fsync':
    'Whether to execute fsync every 4MB of data generated during RDB saving, default yes, used to reduce latency spikes',
  'lfu-log-factor':
    'Counter logarithm factor of the LFU eviction algorithm, default 10, affecting the growth speed of the counter',
  'lfu-decay-time': 'Decay time (minutes) of the LFU counter, default 1, 0 means never decay',
  'max-new-connections-per-cycle':
    'Maximum number of new connections that can be accepted per event loop cycle (non-TLS), default 10',
  'max-new-tls-connections-per-cycle':
    'Maximum number of new TLS connections that can be accepted per event loop cycle, default 1',
  activedefrag:
    'Whether to enable active memory defragmentation, default no, only supports the Jemalloc allocator built into Redis',
  'active-defrag-ignore-bytes':
    'Minimum fragmented waste bytes for active defragmentation, default 100mb',
  'active-defrag-threshold-lower':
    'Minimum fragmentation rate threshold (percentage) for active defragmentation, default 10',
  'active-defrag-threshold-upper':
    'Maximum fragmentation rate threshold (percentage) for active defragmentation, default 100',
  'active-defrag-cycle-min':
    'CPU usage percentage (percentage) when the fragmentation rate reaches the lower threshold, default 1',
  'active-defrag-cycle-max':
    'CPU usage percentage (percentage) when the fragmentation rate reaches the upper threshold, default 25',
  'active-defrag-max-scan-fields':
    'Number of set/hash/sorted set/list fields processed per main dictionary scan, default 1000',
  'jemalloc-bg-thread': "Whether to enable Jemalloc's background cleaning thread, default yes",
  'server-cpulist': 'CPU affinity of Redis server/IO threads, format same as the taskset command',
  'bio-cpulist': 'CPU affinity of background I/O threads, format same as the taskset command',
  'aof-rewrite-cpulist':
    'CPU affinity of the AOF rewrite child process, format same as the taskset command',
  'bgsave-cpulist': 'CPU affinity of the BGSAVE child process, format same as the taskset command',
  'ignore-warnings':
    'List of Redis startup warnings to suppress, separated by spaces, such as ARM64-COW-BUG',
  'repl-ping-slave-period':
    'Interval (seconds) for the master to PING replicas, same as repl-ping-replica-period (legacy name)',
  'min-slaves-to-write':
    'Min good replicas before the master accepts writes, same as min-replicas-to-write (legacy name)',
  'min-slaves-max-lag':
    'Max replica lag (seconds) for the master write quorum, same as min-replicas-max-lag (legacy name)',
  slaveof:
    'Host and port of the master to replicate, same as replicaof (legacy name), empty disables replication',
  'slave-read-only': 'Whether the replica is read-only, same as replica-read-only (legacy name)',
  'slave-serve-stale-data':
    'Serve possibly stale data while disconnected, same as replica-serve-stale-data (legacy name)',
  'slave-priority':
    'Replica priority for Sentinel failover, same as replica-priority (legacy name)',
  'slave-announce-ip': 'Announced replica IP, same as replica-announce-ip (legacy name)',
  'slave-announce-port': 'Announced replica port, same as replica-announce-port (legacy name)',
  'slave-ignore-maxmemory':
    'Whether the replica ignores maxmemory, same as replica-ignore-maxmemory (legacy name)',
  'slave-lazy-flush': 'Lazy flush DB during full sync, same as replica-lazy-flush (legacy name)',
  'cluster-slave-no-failover':
    'Disable automatic replica failover, same as cluster-replica-no-failover (legacy name)',
  'cluster-slave-validity-factor':
    'Replica validity factor for failover, same as cluster-replica-validity-factor (legacy name)',
  server_cpulist:
    'CPU affinity for server and I/O threads, same as server-cpulist (underscore key)',
  bio_cpulist: 'CPU affinity for BIO threads, same as bio-cpulist (underscore key)',
  bgsave_cpulist: 'CPU affinity for BGSAVE child, same as bgsave-cpulist (underscore key)',
  aof_rewrite_cpulist:
    'CPU affinity for AOF rewrite child, same as aof-rewrite-cpulist (underscore key)',
  'cluster-announce-port':
    'Announced TCP command port (non-TLS) for clients; 0 often means same as port or unset, for NAT/containers',
  'hash-max-ziplist-entries':
    'Max hash fields in ziplist encoding before converting to a hash table (legacy; listpack is preferred)',
  'hash-max-ziplist-value':
    'Max size of one hash value in ziplist encoding before converting to a hash table (legacy)',
  'zset-max-ziplist-entries':
    'Max elements in zset ziplist encoding before converting to a skiplist (legacy)',
  'zset-max-ziplist-value':
    'Max size of one zset element in ziplist encoding before converting to a skiplist (legacy)',
  'list-max-ziplist-size':
    'List ziplist node size threshold, similar role to list-max-listpack-size (legacy encoding name)',
  'client-output-buffer-limit':
    'One-line limits for normal/replica/pubsub output buffers; equivalent to separate client-output-buffer-limit * directives',
  'key-memory-histograms':
    'Whether to collect key-size histograms for observability (e.g. INFO Keysizes), off by default to save CPU',
  'bf-initial-size': 'RedisBloom default initial capacity (estimated entry count)',
  'bf-error-rate': 'Target false-positive rate for Bloom filters (decimal 0–1)',
  'bf-expansion-factor': 'Expansion factor when a Bloom filter needs more space',
  'cf-initial-size': 'Initial number of slots for a Cuckoo filter',
  'cf-bucket-size': 'Number of entries per Cuckoo bucket',
  'cf-max-iterations': 'Max displacement iterations on insert',
  'cf-expansion-factor': 'Cuckoo filter expansion factor',
  'cf-max-expansions': 'Max number of expansions allowed',
  'stream-idmp-duration':
    'Time step or period for incremental stream key trimming; exact meaning depends on the streams module version',
  'stream-idmp-maxsize':
    'Max entries or bytes processed per incremental trim batch to cap latency per tick',
  'tls-auth-clients-user':
    'Map TLS client certificates to ACL users (e.g. off/on); ties cert identity to ACL, semantics vary by release',
  'vset-force-single-threaded-execution':
    'Force single-threaded execution in the VectorSet module (debug or special deployments)',
  'ts-encoding': 'Default encoding for time-series samples, e.g. compressed or uncompressed',
  'ts-chunk-size-bytes': 'Target size in bytes for each time-series chunk',
  'ts-retention-policy': 'Retention in milliseconds, 0 keeps samples indefinitely',
  'ts-duplicate-policy': 'Policy for duplicate timestamps, e.g. block, last, first, sum',
  'ts-ignore-max-time-diff':
    'Reject or special-case samples when time delta exceeds this (ms); 0 often disables',
  'ts-ignore-max-val-diff':
    'Reject or special-case samples when value delta exceeds this (noise filter)',
  'ts-num-threads': 'Number of computation threads for the time-series module',
  'ts-compaction-policy': 'Downsampling/compaction rules DSL; empty disables automatic compaction',
  'search-threads': 'Number of RediSearch worker threads',
  'search-workers': 'Additional worker threads; 0 lets the module pick a default',
  'search-io-threads': 'Module I/O or offload thread count',
  'search-timeout': 'Query timeout in milliseconds',
  'search-on-timeout':
    'Policy name on query timeout (module enum, e.g. return); see RediSearch docs',
  'search-on-oom': 'Policy name on search OOM (module enum, e.g. return); see RediSearch docs',
  'search-default-dialect': 'Default FT query dialect version',
  'search-default-scorer': 'Default full-text scorer name, e.g. BM25STD',
  'search-max-search-results': 'Max hits returned for one search',
  'search-max-aggregate-results': 'Cap on aggregate pipeline intermediate/final size',
  'search-max-doctablesize': 'Max rows in the internal document table',
  'search-max-prefix-expansions': 'Max prefix expansions to limit combinatorial blow-up',
  'search-min-prefix': 'Minimum prefix length for prefix queries',
  'search-min-stem-len': 'Minimum token length for stemming',
  'search-min-phonetic-term-len': 'Minimum length for phonetic matching',
  'search-multi-text-slop': 'Slop/span for multi-field phrase queries',
  'search-bm25std-tanh-factor': 'Tanh-related smoothing factor in BM25STD scoring',
  'search-union-iterator-heap': 'Heap size related threshold for union iterators',
  'search-cursor-max-idle': 'Cursor idle time in ms before it is reclaimed',
  'search-cursor-reply-threshold': 'Batch threshold for cursor replies',
  'search-index-cursor-limit': 'Indexer cursor concurrency or queue limit',
  'search-indexer-yield-every-ops': 'Indexer yields after this many operations',
  'search-workers-priority-bias-threshold': 'Worker scheduling priority bias threshold',
  'search-min-operation-workers': 'Minimum workers required for certain operations',
  'search-conn-per-shard': 'Connections per shard; 0 uses default',
  'search-gc-scan-size': 'Batch size for index garbage collection scans',
  'search-fork-gc-run-interval': 'Interval in seconds between forked GC runs',
  'search-fork-gc-retry-interval': 'Retry interval in seconds if fork GC fails',
  'search-fork-gc-clean-threshold': 'Threshold of garbage docs/bytes to trigger cleanup',
  'search-fork-gc-sleep-before-exit': 'Sleep in ms before fork GC child exits to smooth IO',
  'search-no-gc': 'Disable search index garbage collection',
  'search-no-mem-pools': 'Disable module memory pools (mostly for debugging)',
  'search-partial-indexed-docs': 'Allow partially indexed docs in some queries (version-specific)',
  'search-raw-docid-encoding': 'Use raw doc ID encoding optimization',
  'search-enable-unstable-features': 'Enable experimental or unstable RediSearch features',
  'search-topology-validation-timeout': 'Cluster topology validation timeout in milliseconds',
  'search-tiered-hnsw-buffer-limit': 'Buffer limit for tiered HNSW vector indexes',
  'search-vss-max-resize': 'Max vector index resize; 0 often means no extra cap',
  'search-friso-ini': 'Path to Friso Chinese tokenizer ini file',
  'search-ext-load': 'Path to load RediSearch extensions/plugins',
  'search-bg-index-sleep-gap': 'Throttle gap in ms for background indexing',
  'search-_bg-index-mem-pct-thr': 'Background indexer system-RSS percentage threshold (internal)',
  'search-_bg-index-oom-pause-time': 'Pause time when background indexer hits OOM (internal)',
  'search-_min-trim-delay-ms': 'Minimum trim delay in ms (internal)',
  'search-_max-trim-delay-ms': 'Maximum trim delay in ms (internal)',
  'search-_trimming-state-check-delay-ms': 'Trimming state poll interval in ms (internal)',
  'search-_numeric-ranges-parents': 'Numeric range index parent structure toggle (internal)',
  'search-_numeric-compress': 'Compress numeric range indexes (internal)',
  'search-_prioritize-intersect-union-children':
    'Intersect/union child iterator scheduling (internal)',
  'search-_simulate-in-flex': 'Simulate flexible query path (internal/debug)',
  'search-_free-resource-on-thread': 'Free some resources on the thread (internal)',
  'search-_print-profile-clock': 'Print profiling clock (internal/debug)',
  // Redis 8.8+ Array / Slowlog / Search / TimeSeries
  'array-slice-size':
    'Capacity of each Array slice, default 4096; CONFIG SET only affects new arrays, existing ones keep their slice size',
  'array-sparse-kmax':
    'Promote a sparse slice to dense when entry count exceeds this; 0 disables sparse encoding, default 10',
  'array-sparse-kmin':
    'Demote a dense slice back to sparse below this count when it saves memory; 0 disables demotion, default 5',
  'slowlog-entry-max-argc':
    'Max argv kept in a slowlog entry; excess args are trimmed with a note; minimum 2 (command name), default 32',
  'slowlog-entry-max-string-len':
    'Max bytes of each argument string in the slowlog before truncation, default 128',
  'ts-libmr-protocol':
    'RedisTimeSeries cluster messaging protocol mode (e.g. INTERNAL); usually leave default',
  'ts-topology-events':
    'Whether to react to cluster topology events to sync time-series module state, default yes',
  'search-bg-index-sleep-duration-us':
    'Background indexer sleep duration in microseconds for throttling, default 1',
  'search-disk-buffer-percentage':
    'Disk-index buffer as a percentage of available resources, default 20',
  'search-monitor-expiration':
    'Whether to monitor index/document expiration and trigger cleanup, default yes',
  'search-_fallback-to-main-thread-when-block-client-unavailable':
    'Fall back to the main thread when a blocking client is unavailable (internal), default yes',
  'search-_info-on-zero-indexes':
    'Emit search INFO fields even with zero indexes (internal), default no',
  'search-_max-foreground-timeout-limit':
    'Upper bound for foreground search timeout in ms (internal), default 60000',
  'search-disk-drop-read-cache':
    'Drop page cache on disk-index reads to reduce cache pollution, default no',
  'search-disk-max-open-files': 'Max open files for disk indexes, default 1024',
  'search-disk-use-direct-reads': 'Use direct I/O for disk-index reads, default no',
  'search-max-aggregate-groups': 'Max GROUPBY groups allowed in aggregation, default 1000000',
  // Redis 8.10
  backupdirname:
    'BACKUP output directory name relative to dir (not an absolute/nested path); startup-only, not CONFIG SET-able, default backupdir',
  'backup-sealed-ttl':
    'Seconds to keep a sealed BACKUP before auto cleanup; 0 keeps it until BACKUP CLEANUP, default 0',
  'preload-file':
    'Load only this file at startup as rdb:path or aof:path/manifest; skips normal RDB/AOF dir loading and aborts if load fails',
  'tls-expected-peer-name':
    'Require peer cert SAN/CN to match this name for server-to-server TLS (space-separated list allowed); empty disables peer-name check; does not affect normal client TLS',
  'hash-min-template-entries':
    'Auto-convert hashes to template encoding on write at this field count to share field names; 0 disables; hashes with field expiry are never converted, default 0',
  'hash-max-template-entries':
    'Upper bound on field count for automatic template conversion; 0 means no upper bound, default 0',
  'hash-rdb-load-min-template-entries':
    'When loading an RDB without templates, convert hashes at this field count; 0 disables, default 0',
  'hash-rdb-load-max-template-entries':
    'Max field count for RDB-load template conversion; 0 means no max (and with min 0 disables), default 0',
  'hash-rdb-load-template-disassembly-threshold':
    'After RDB load, break templates used by fewer keys than this back into plain hashes; 0 disables, default 0',
} as const
