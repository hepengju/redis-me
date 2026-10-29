/** INFO 字段提示（英文） */
export const enInfoTip = {
  monotonic_clock: 'Timer that only goes forward, never backward or jumps',

  server: 'General information about the Redis server',
  clients: 'Client connections section',
  memory:
    'Memory consumption related information (Ideally, used_memory_rss should be only slightly higher than used_memory. When rss >> used, a large difference may mean external memory fragmentation, which can be evaluated via allocator_frag_ratio and allocator_frag_bytes. When used >> rss, part of Redis memory has been swapped by the OS: expect significant latencies.)',
  persistence: 'RDB and AOF related information',
  threads: 'I/O threads information',
  stats: 'General statistics',
  replication: 'Master/replica replication information',
  cpu: 'CPU consumption statistics',
  commandstats: 'Redis command statistics',
  latencystats: 'Redis command latency percentile distribution statistics',
  sentinel: 'Redis Sentinel section (only applicable to Sentinel instances)',
  cluster: 'Redis Cluster section',
  modules: 'Modules section',
  module:
    'One-line summary of a loaded module (name, version, etc.); multiple lines may repeat this key',
  keyspace: 'Database related statistics',
  errorstats: 'Redis error statistics',
  redis_version: 'Version of the Redis server',
  redis_git_sha1: 'Git SHA1',
  redis_git_dirty: 'Git dirty flag',
  redis_build_id: 'The build id',
  redis_mode: `The server's mode ("standalone", "sentinel" or "cluster")`,
  valkey_version: 'Valkey server version (Redis-protocol-compatible fork)',
  server_mode: 'Same as redis_mode for Valkey: standalone, sentinel, or cluster',
  os: 'Operating system hosting the Redis server',
  arch_bits: 'Architecture (32 or 64 bits)',
  multiplexing_api: 'Event loop mechanism used by Redis',
  atomicvar_api: 'Atomicvar API used by Redis',
  gcc_version: 'Version of the GCC compiler used to compile the Redis server',
  process_id: 'PID of the server process',
  process_supervised: 'Supervised system ("upstart", "systemd", "unknown" or "no")',
  run_id: 'Random value identifying the Redis server (to be used by Sentinel and Cluster)',
  tcp_port: 'TCP/IP listen port',
  listener0:
    'Listen socket description (name, bind, port, etc.); additional listeners use listener1, listener2, … as separate keys',
  server_time_usec: 'Epoch-based system time with microsecond precision',
  uptime_in_seconds: 'Number of seconds since Redis server start',
  uptime_in_days: 'Same value expressed in days',
  hz: "The server's current frequency setting",
  configured_hz: "The server's configured frequency setting",
  lru_clock: 'Clock incrementing every minute, for LRU management',
  executable: "The path to the server's executable",
  config_file: 'The path to the config file',
  io_threads_active: 'Flag indicating if I/O threads are active',
  shutdown_in_milliseconds:
    'The maximum time remaining for replicas to catch up the replication before completing the shutdown sequence. This field is only present during shutdown',
  connected_clients: 'Number of client connections (excluding connections from replicas)',
  cluster_connections: "An approximation of the number of sockets used by the cluster's bus",
  maxclients:
    'The value of the maxclients configuration directive. This is the upper limit for the sum of connected_clients, connected_slaves and cluster_connections',
  client_recent_max_input_buffer: 'Biggest input buffer among current client connections',
  client_recent_max_output_buffer: 'Biggest output buffer among current client connections',
  blocked_clients:
    'Number of clients pending on a blocking call (BLPOP, BRPOP, BRPOPLPUSH, BLMOVE, BZPOPMIN, BZPOPMAX)',
  tracking_clients: 'Number of clients being tracked (CLIENT TRACKING)',
  pubsub_clients:
    'Number of clients in pubsub mode (SUBSCRIBE, PSUBSCRIBE, SSUBSCRIBE). Added in Redis 7.4',
  watching_clients: 'Number of clients in watching mode (WATCH). Added in Redis 7.4',
  clients_in_timeout_table: 'Number of clients in the clients timeout table',
  total_watched_keys: 'Number of watched keys. Added in Redis 7.4',
  total_blocking_keys: 'Number of blocking keys. Added in Redis 7.2',
  total_blocking_keys_on_nokey:
    'Number of blocking keys that one or more clients that would like to be unblocked when the key is deleted. Added in Redis 7.2',
  used_memory:
    'Total number of bytes allocated by Redis using its allocator (either standard libc, jemalloc, or an alternative allocator such as tcmalloc)',
  used_memory_human: 'Human readable representation of previous value',
  used_memory_rss:
    'Number of bytes that Redis allocated as seen by the operating system (a.k.a resident set size). This is the number reported by tools such as top(1) and ps(1)',
  used_memory_rss_human: 'Human readable representation of previous value',
  used_memory_peak: 'Peak memory consumed by Redis (in bytes)',
  used_memory_peak_human: 'Human readable representation of previous value',
  used_memory_peak_time: 'Time when peak memory was recorded',
  used_memory_peak_perc: 'The percentage of used_memory out of used_memory_peak',
  used_memory_overhead:
    'The sum in bytes of all overheads that the server allocated for managing its internal data structures',
  used_memory_startup: 'Initial amount of memory consumed by Redis at startup in bytes',
  used_memory_dataset:
    'The size in bytes of the dataset (used_memory_overhead subtracted from used_memory)',
  used_memory_dataset_perc:
    'The percentage of used_memory_dataset out of the net memory usage (used_memory minus used_memory_startup)',
  total_system_memory: 'The total amount of memory that the Redis host has',
  total_system_memory_human: 'Human readable representation of previous value',
  used_memory_lua:
    'Number of bytes used by the Lua engine for EVAL scripts. Deprecated in Redis 7.0, renamed to used_memory_vm_eval',
  used_memory_vm_eval:
    'Number of bytes used by the script VM engines for EVAL framework (not part of used_memory). Added in Redis 7.0',
  used_memory_lua_human: 'Human readable representation of previous value. Deprecated in Redis 7.0',
  used_memory_scripts_eval:
    'Byte overhead of EVAL scripts (part of used_memory). Added in Redis 7.0',
  number_of_cached_scripts: 'The number of EVAL scripts cached by the server. Added in Redis 7.0',
  number_of_functions: 'The number of functions. Added in Redis 7.0',
  number_of_libraries: 'The number of libraries. Added in Redis 7.0',
  used_memory_vm_functions:
    'Number of bytes used by the script VM engines for Functions framework (not part of used_memory). Added in Redis 7.0',
  used_memory_vm_total:
    'used_memory_vm_eval + used_memory_vm_functions (not part of used_memory). Added in Redis 7.0',
  used_memory_vm_total_human: 'Human readable representation of previous value',
  used_memory_functions:
    'Byte overhead of Function scripts (part of used_memory). Added in Redis 7.0',
  used_memory_scripts:
    'used_memory_scripts_eval + used_memory_functions (part of used_memory). Added in Redis 7.0',
  used_memory_scripts_human: 'Human readable representation of previous value',
  maxmemory: 'The value of the maxmemory configuration directive',
  maxmemory_human: 'Human readable representation of previous value',
  maxmemory_policy: 'The value of the maxmemory-policy configuration directive',
  mem_fragmentation_ratio:
    'Ratio between used_memory_rss and used_memory. It reflects not only fragmentation but also other process overheads (see allocator_* metrics), plus code, shared libraries, stack, etc',
  mem_fragmentation_bytes:
    'Delta between used_memory_rss and used_memory. Note that when the total fragmentation bytes is low (few megabytes), a high ratio (e.g. 1.5 and above) is not an indication of an issue',
  allocator_frag_ratio:
    'Ratio between allocator_active and allocator_allocated; true external fragmentation (not mem_fragmentation_ratio)',
  allocator_frag_bytes:
    'Delta between allocator_active and allocator_allocated. See notes on mem_fragmentation_bytes',
  allocator_rss_ratio:
    'Ratio between allocator_resident and allocator_active. This usually indicates pages that the allocator can and probably will soon release back to the OS',
  allocator_rss_bytes: 'Delta between allocator_resident and allocator_active',
  rss_overhead_ratio:
    'Ratio between used_memory_rss (the process RSS) and allocator_resident. This includes RSS overheads that are not allocator or heap related',
  rss_overhead_bytes: 'Delta between used_memory_rss (the process RSS) and allocator_resident',
  allocator_allocated:
    'Total bytes allocated from the allocator, including internal fragmentation. Normally the same as used_memory',
  allocator_active:
    'Total bytes in the allocator active pages, this includes external-fragmentation',
  allocator_resident:
    'Total bytes resident (RSS) in the allocator, this includes pages that can be released to the OS (by MEMORY PURGE, or just waiting)',
  allocator_muzzy:
    "Total bytes of 'muzzy' memory (RSS) in the allocator. Muzzy memory is memory that has been freed, but not yet fully returned to the operating system. It can be reused immediately when needed or reclaimed by the OS when system pressure increases",
  mem_not_counted_for_evict:
    "Used memory that's not counted for key eviction. This is basically transient replica and AOF buffers",
  mem_clients_slaves:
    "Memory used by replica clients - Starting Redis 7.0, replica buffers share memory with the replication backlog, so this field can show 0 when replicas don't trigger an increase of memory usage",
  mem_clients_normal: 'Memory used by normal clients',
  mem_cluster_links:
    'Memory used by links to peers on the cluster bus when cluster mode is enabled',
  mem_cluster_slot_migration_output_buffer:
    "Memory usage of the migration client's output buffer. Redis writes incoming changes to this buffer during the migration process",
  mem_cluster_slot_migration_input_buffer:
    'Memory usage of the accumulated replication stream buffer on the importing node',
  mem_cluster_slot_migration_input_buffer_peak:
    'Peak accumulated repl buffer size on the importing side',
  mem_aof_buffer: 'Transient memory used for AOF and AOF rewrite buffers',
  mem_replication_backlog: 'Memory used by replication backlog',
  mem_total_replication_buffers:
    'Total memory consumed for replication buffers - Added in Redis 7.0',
  mem_replica_full_sync_buffer:
    'Memory for the replica-side buffer while receiving full sync (RDB/stream)',
  mem_allocator: 'Memory allocator, chosen at compile time',
  mem_overhead_db_hashtable_rehashing:
    'Temporary memory overhead of database dictionaries currently being rehashed - Added in 7.4',
  active_defrag_running:
    'When activedefrag is enabled, this indicates whether defragmentation is currently active, and the CPU percentage it intends to utilize',
  lazyfree_pending_objects:
    'The number of objects waiting to be freed (as a result of calling UNLINK, or FLUSHDB and FLUSHALL with the ASYNC option)',
  lazyfreed_objects: 'The number of objects that have been lazy freed',
  loading: 'Flag indicating if the load of a dump file is on-going',
  async_loading:
    'Currently loading replication data-set asynchronously while serving old data. This means repl-diskless-load is enabled and set to swapdb. Added in Redis 7.0',
  current_cow_peak: 'The peak size in bytes of copy-on-write memory while a child fork is running',
  current_cow_size: 'The size in bytes of copy-on-write memory while a child fork is running',
  current_cow_size_age: 'The age, in seconds, of the current_cow_size value',
  current_fork_perc:
    'The percentage of progress of the current fork process. For AOF and RDB forks it is the percentage of current_save_keys_processed out of current_save_keys_total',
  current_save_keys_processed: 'Number of keys processed by the current save operation',
  current_save_keys_total: 'Number of keys at the beginning of the current save operation',
  rdb_changes_since_last_save: 'Number of changes since the last dump',
  rdb_bgsave_in_progress: 'Flag indicating an RDB save is on-going',
  rdb_last_save_time: 'Epoch-based timestamp of last successful RDB save',
  rdb_last_bgsave_status: 'Status of the last RDB save operation',
  rdb_last_bgsave_time_sec: 'Duration of the last RDB save operation in seconds',
  rdb_current_bgsave_time_sec: 'Duration of the on-going RDB save operation if any',
  rdb_last_cow_size: 'The size in bytes of copy-on-write memory during the last RDB save operation',
  rdb_last_load_keys_expired:
    'Number of volatile keys deleted during the last RDB loading. Added in Redis 7.0',
  rdb_last_load_keys_loaded:
    'Number of keys loaded during the last RDB loading. Added in Redis 7.0',
  aof_enabled: 'Flag indicating AOF logging is activated',
  aof_rewrite_in_progress: 'Flag indicating an AOF rewrite operation is on-going',
  aof_rewrite_scheduled:
    'Flag indicating an AOF rewrite operation will be scheduled once the on-going RDB save is complete',
  aof_last_rewrite_time_sec: 'Duration of the last AOF rewrite operation in seconds',
  aof_current_rewrite_time_sec: 'Duration of the on-going AOF rewrite operation if any',
  aof_last_bgrewrite_status: 'Status of the last AOF rewrite operation',
  aof_last_write_status: 'Status of the last write operation to the AOF',
  aof_last_cow_size:
    'The size in bytes of copy-on-write memory during the last AOF rewrite operation',
  module_fork_in_progress: 'Flag indicating a module fork is on-going',
  module_fork_last_cow_size:
    'The size in bytes of copy-on-write memory during the last module fork operation',
  aof_rewrites: 'Number of AOF rewrites performed since startup',
  aof_rewrites_consecutive_failures:
    'Count of consecutive failed AOF rewrites; sustained non-zero needs disk/permission investigation',
  rdb_saves: 'Number of RDB snapshots performed since startup',
  rdb_saves_consecutive_failures:
    'Count of consecutive failed RDB saves; sustained non-zero needs disk/fork/permission checks',
  aof_current_size: 'AOF current file size',
  aof_base_size: 'AOF file size on latest startup or rewrite',
  aof_pending_rewrite:
    'Flag indicating an AOF rewrite operation will be scheduled once the on-going RDB save is complete',
  aof_buffer_length: 'Size of the AOF buffer',
  aof_rewrite_buffer_length:
    'Size of the AOF rewrite buffer. Note this field was removed in Redis 7.0',
  aof_pending_bio_fsync: 'Number of fsync pending jobs in background I/O queue',
  aof_delayed_fsync: 'Delayed fsync counter',
  loading_start_time: 'Epoch-based timestamp of the start of the load operation',
  loading_total_bytes: 'Total file size',
  loading_rdb_used_mem:
    "The memory usage of the server that had generated the RDB file at the time of the file's creation",
  loading_loaded_bytes: 'Number of bytes already loaded',
  loading_loaded_perc: 'Same value expressed as a percentage',
  loading_eta_seconds: 'ETA in seconds for the load to be complete',
  io_thread_XXX: 'clients=XXX,reads=XXX,writes=XXX',
  total_connections_received: 'Total number of connections accepted by the server',
  total_commands_processed: 'Total number of commands processed by the server',
  instantaneous_ops_per_sec: 'Number of commands processed per second',
  total_net_input_bytes: 'The total number of bytes read from the network',
  total_net_output_bytes: 'The total number of bytes written to the network',
  total_net_repl_input_bytes:
    'The total number of bytes read from the network for replication purposes',
  total_net_repl_output_bytes:
    'The total number of bytes written to the network for replication purposes',
  instantaneous_input_kbps: "The network's read rate per second in KB/sec",
  instantaneous_output_kbps: "The network's write rate per second in KB/sec",
  instantaneous_input_repl_kbps:
    "The network's read rate per second in KB/sec for replication purposes",
  instantaneous_output_repl_kbps:
    "The network's write rate per second in KB/sec for replication purposes",
  instantaneous_other_input_kbps:
    'Instantaneous inbound KB/s outside the main client command path (e.g. cluster bus)',
  instantaneous_other_output_kbps: 'Instantaneous outbound KB/s for other internal traffic',
  instantaneous_other_packets_input:
    'Instantaneous inbound packet rate (packets/s) for other paths',
  rejected_connections: 'Number of connections rejected because of maxclients limit',
  sync_full: 'The number of full resyncs with replicas',
  sync_partial_ok: 'The number of accepted partial resync requests',
  sync_partial_err: 'The number of denied partial resync requests',
  expired_subkeys: 'The number of hash field expiration events',
  expired_subkeys_active:
    'Hash field expirations being processed in the current active expiry cycle',
  expired_keys: 'Total number of key expiration events',
  expired_keys_active: 'Key expirations being processed in the current active expiry cycle',
  expired_stale_perc: 'The percentage of keys probably expired',
  expired_time_cap_reached_count: 'The count of times that active expiry cycles have stopped early',
  expire_cycle_cpu_milliseconds: 'The cumulative amount of time spent on active expiry cycles',
  evicted_keys: 'Number of evicted keys due to maxmemory limit',
  evicted_clients: 'Number of evicted clients due to maxmemory-clients limit. Added in Redis 7.0',
  evicted_scripts:
    'Number of evicted EVAL scripts due to LRU policy, see EVAL for more details. Added in Redis 7.4',
  total_eviction_exceeded_time:
    'Total time used_memory was greater than maxmemory since server startup, in milliseconds',
  current_eviction_exceeded_time:
    'The time passed since used_memory last rose above maxmemory, in milliseconds',
  keyspace_hits: 'Number of successful lookup of keys in the main dictionary',
  keyspace_misses: 'Number of failed lookup of keys in the main dictionary',
  pubsub_channels: 'Global number of pub/sub channels with client subscriptions',
  pubsub_patterns: 'Global number of pub/sub pattern with client subscriptions',
  pubsubshard_channels:
    'Global number of pub/sub shard channels with client subscriptions. Added in Redis 7.0.3',
  latest_fork_usec: 'Duration of the latest fork operation in microseconds',
  total_forks: 'Total number of fork operations since the server start',
  migrate_cached_sockets: 'The number of sockets open for MIGRATE purposes',
  slave_expires_tracked_keys:
    'The number of keys tracked for expiry purposes (applicable only to writable replicas)',
  active_defrag_hits:
    'Number of value reallocations performed by active the defragmentation process',
  active_defrag_misses:
    'Number of aborted value reallocations started by the active defragmentation process',
  active_defrag_key_hits: 'Number of keys that were actively defragmented',
  active_defrag_key_misses:
    'Number of keys that were skipped by the active defragmentation process',
  total_active_defrag_time: 'Total time memory fragmentation was over the limit, in milliseconds',
  current_active_defrag_time:
    'The time passed since memory fragmentation last was over the limit, in milliseconds',
  tracking_total_keys: 'Number of keys being tracked by the server',
  tracking_total_items:
    'Number of items, that is the sum of clients number for each key, that are being tracked',
  tracking_total_prefixes:
    "Number of tracked prefixes in server's prefix table (only applicable for broadcast mode)",
  unexpected_error_replies:
    'Number of unexpected error replies, that are types of errors from an AOF load or replication',
  total_error_replies:
    'Total number of issued error replies, that is the sum of rejected commands (errors prior command execution) and failed commands (errors within the command execution)',
  errorstat_ERR: 'Errorstats counter for ERR-class replies (generic errors)',
  errorstat_NOAUTH: 'Errorstats counter for NOAUTH-class replies (auth required but missing)',
  errorstat_WRONGPASS: 'Errorstats counter for WRONGPASS-class replies (bad password)',
  dump_payload_sanitizations:
    'Total number of dump payload deep integrity validations (see sanitize-dump-payload config)',
  total_reads_processed: 'Total number of read events processed',
  total_writes_processed: 'Total number of write events processed',
  io_threaded_reads_processed: 'Number of read events processed by I/O threads',
  io_threaded_writes_processed: 'Number of write events processed by I/O threads',
  io_threaded_total_prefetch_batches: 'Cumulative I/O-thread prefetch batches',
  io_threaded_total_prefetch_entries: 'Cumulative I/O-thread prefetched entries',
  io_thread_0:
    'Per I/O-thread load summary (e.g. clients, reads, writes); index follows io-threads',
  client_query_buffer_limit_disconnections:
    'Total number of disconnections due to client reaching query buffer limit',
  client_output_buffer_limit_disconnections:
    'Total number of disconnections due to client reaching output buffer limit',
  reply_buffer_shrinks: 'Total number of output buffer shrinks',
  reply_buffer_expands: 'Total number of output buffer expands',
  eventloop_cycles: 'Total number of eventloop cycles',
  eventloop_duration_sum:
    'Total time spent in the eventloop in microseconds (including I/O and command processing)',
  eventloop_duration_cmd_sum: 'Total time spent on executing commands in microseconds',
  instantaneous_eventloop_cycles_per_sec: 'Number of eventloop cycles per second',
  instantaneous_eventloop_duration_usec:
    'Average time spent in a single eventloop cycle in microseconds',
  acl_access_denied_auth: 'Number of authentication failures',
  acl_access_denied_cmd: 'Number of commands rejected because of access denied to the command',
  acl_access_denied_key: 'Number of commands rejected because of access denied to a key',
  acl_access_denied_channel: 'Number of commands rejected because of access denied to a channel',
  acl_access_denied_tls_cert:
    'Commands rejected because the TLS client certificate did not satisfy ACL/config rules',
  wrong_answer_swipe_count: 'Internal test counter; safe to ignore for operations',
  role: 'Value is "master" if the instance is replica of no one, or "slave" if the instance is a replica of some master instance. Note that a replica can be master of another replica (chained replication)',
  master_failover_state: 'The state of an ongoing failover, if any',
  master_replid: 'The replication ID of the Redis server',
  master_replid2: 'The secondary replication ID, used for PSYNC after a failover',
  master_repl_offset: "The server's current replication offset",
  second_repl_offset:
    'Replication offset associated with secondary replid (master_replid2); often -1 when the second ID is unused',
  repl_backlog_active: 'Flag indicating replication backlog is active',
  repl_backlog_size: 'Total size in bytes of the replication backlog buffer',
  repl_backlog_first_byte_offset: 'The master offset of the replication backlog buffer',
  repl_backlog_histlen: 'Size in bytes of the data in the replication backlog buffer',
  master_host: 'Host or IP address of the master',
  master_port: 'Master listening TCP port',
  master_link_status: 'Status of the link (up/down)',
  master_last_io_seconds_ago: 'Number of seconds since the last interaction with master',
  master_sync_in_progress:
    'Whether this replica is currently syncing from its master (full or partial resync)',
  master_current_sync_attempts:
    'Sync attempts since the last stable master link (or replica config change); >1 while link is up often means repeated handshakes or instability',
  master_total_sync_attempts:
    'Total sync attempts under the current replica-of configuration; usually not reset on brief reconnects',
  master_link_up_since_seconds: 'Seconds since the replication link last became up',
  master_client_io_thread:
    'I/O thread id for the replica→master replication client connection (when io-threads are enabled)',
  slave_read_repl_offset: 'The read replication offset of the replica instance',
  slave_repl_offset: 'The replication offset of the replica instance',
  replica_full_sync_buffer_size: 'Current size (bytes) of the replica-side buffer during full sync',
  replica_full_sync_buffer_peak: 'Peak size (bytes) of that full-sync replica buffer',
  total_disconnect_time_sec:
    'Cumulative seconds the replication link spent in a disconnected (down) state (stability signal)',
  slave_priority: 'The priority of the instance as a candidate for failover',
  slave_read_only: 'Flag indicating if the replica is read-only',
  replica_read_only: 'Same as slave_read_only (newer INFO key name)',
  replica_announced:
    'Whether the replica announces its addressing to the master/topology (REPLCONF; replica-announce-*)',
  master_sync_total_bytes:
    'Total number of bytes that need to be transferred. May be 0 when the size is unknown (e.g. repl-diskless-sync)',
  master_sync_read_bytes: 'Number of bytes already transferred',
  master_sync_left_bytes:
    'Number of bytes left before syncing is complete (may be negative when master_sync_total_bytes is 0)',
  master_sync_perc:
    'Percentage of master_sync_read_bytes out of master_sync_total_bytes, or an approximation using loading_rdb_used_mem when master_sync_total_bytes is 0',
  master_sync_last_io_seconds_ago:
    'Number of seconds since last transfer I/O during a SYNC operation',
  master_link_down_since_seconds: 'Number of seconds since the link is down',
  connected_slaves: 'Number of connected replicas',
  connected_replicas: 'Same as connected_slaves (alternate INFO field name on some builds)',
  min_slaves_good_slaves: 'Number of replicas currently considered good',
  slaveXXX: 'id, IP address, port, state, offset, lag',
  used_cpu_sys:
    'System CPU consumed by the Redis server, which is the sum of system CPU consumed by all threads of the server process (main thread and background threads)',
  used_cpu_user:
    'User CPU consumed by the Redis server, which is the sum of user CPU consumed by all threads of the server process (main thread and background threads)',
  used_cpu_sys_children: 'System CPU consumed by the background processes',
  used_cpu_user_children: 'User CPU consumed by the background processes',
  used_cpu_sys_main_thread: 'System CPU consumed by the Redis server main thread',
  used_cpu_user_main_thread: 'User CPU consumed by the Redis server main thread',
  cmdstat_XXX: 'calls=XXX,usec=XXX,usec_per_call=XXX,rejected_calls=XXX,failed_calls=XXX',
  latency_percentiles_usec_XXX:
    'p<percentile 1>=<percentile 1 value>,p<percentile 2>=<percentile 2 value>,...',
  errorstat_XXX: 'count=XXX',
  sentinel_masters: 'Number of Redis masters monitored by this Sentinel instance',
  sentinel_tilt: 'A value of 1 means this sentinel is in TILT mode',
  sentinel_tilt_since_seconds:
    'Duration in seconds of current TILT, or -1 if not TILTed. Added in Redis 7.0.0',
  sentinel_total_tilt: 'The number of times this sentinel has been in TILT mode since running',
  sentinel_running_scripts: 'The number of scripts this Sentinel is currently executing',
  sentinel_scripts_queue_length:
    'The length of the queue of user scripts that are pending execution',
  sentinel_simulate_failure_flags: 'Flags for the SENTINEL SIMULATE-FAILURE command',
  cluster_enabled: 'Indicates whether Redis cluster is enabled',
  cluster_slot_migration_enabled:
    'Whether cluster online/atomic slot migration capability is enabled (Redis 8.x Cluster; 1=yes; semantics vary by minor version)',
  db0_distrib_strings_sizes: 'db0 string key length histogram (Keysizes section)',
  db0_distrib_lists_items: 'db0 list length (element count) histogram',
  db0_distrib_sets_items: 'db0 set cardinality histogram',
  db0_distrib_zsets_items: 'db0 sorted-set member-count histogram',
  db0_distrib_hashes_items: 'db0 hash field-count histogram',
  db0: 'Logical DB 0 summary: keys, expires, avg_ttl, subexpiry (same shape as dbN)',
  search_gc_bytes_collected:
    "The total amount of memory freed by the garbage collectors from indexes in the shard's memory in bytes",
  search_bytes_collected:
    'The total amount of memory freed by the garbage collectors from indexes in the shard memory in bytes',
  search_gc_marked_deleted_vectors:
    'The number of vectors marked as deleted in the vector indexes that have not yet been cleaned',
  search_marked_deleted_vectors:
    'The number of vectors marked as deleted in the vector indexes that have not yet been cleaned',
  search_gc_total_cycles: 'The total number of garbage collection cycles executed',
  search_total_cycles: 'The total number of garbage collection cycles executed',
  search_gc_total_docs_not_collected_by_gc:
    'The number of documents marked as deleted, whose memory has not yet been freed by the garbage collector',
  search_total_docs_not_collected_by_gc:
    'The number of documents marked as deleted whose memory has not yet been freed by the garbage collector',
  search_gc_total_ms_run:
    'The total duration of all garbage collection cycles in the shard, measured in milliseconds',
  search_total_ms_run:
    'The total duration of all garbage collection cycles in the shard, measured in milliseconds',
  search_cursors_internal_idle:
    'The total number of coordinator cursors that are currently holding pending results in the shard',
  search_cursors_user_idle:
    'The total number of cursors that were explicitly requested by users, that are currently holding pending results in the shard',
  search_global_idle:
    'The total number of user and internal cursors currently holding pending results in the shard. Deprecated in 8.0 (split into search_cursors_internal_idle and search_cursors_user_idle) but still available in older versions',
  search_cursors_internal_active:
    'The total number of coordinator cursors in the shard, either holding pending results or actively executing FT.CURSOR READ',
  search_cursors_user_active:
    'The total number of user cursors in the shard, either holding pending results or actively executing FT.CURSOR READ',
  search_global_total:
    'The total number of user and internal cursors in the shard, either holding pending results or actively executing FT.CURSOR READ. Deprecated in 8.0 (split into search_cursors_internal_active and search_cursors_user_active), but still available in older versions',
  search_number_of_indexes: 'The total number of indexes in the shard',
  search_number_of_active_indexes:
    'The total number of indexes running a background indexing and/or background query processing operation. Background indexing refers to vector ingestion process, or in-progress background indexer',
  search_number_of_active_indexes_running_queries:
    'The total count of indexes currently running a background query process',
  search_number_of_active_indexes_indexing:
    'The total count of indexes currently undergoing a background indexing process. Background indexing refers to a vector ingestion process, or an in-progress background indexer. This metric is limited by the number of WORKER threads allocated for writing operations plus the number of indexes',
  search_total_active_write_threads:
    'The total count of background write (indexing) processes currently running in the shard. Background indexing refers to a vector ingestion process, or an in-progress background indexer. This metric is limited by the number of threads allocated for writing operations',
  search_fields_text_Text: 'The total number of TEXT fields across all indexes in the shard',
  search_fields_text_Sortable:
    'The total number of SORTABLE TEXT fields across all indexes in the shard. This field appears only if its value is larger than 0',
  search_fields_text_NoIndex:
    'The total number of NOINDEX TEXT fields across all indexes in the shard, which are used for sorting only but not indexed. This field appears only if its value is larger than 0',
  search_fields_numeric_Numeric:
    'The total number of NUMERIC fields across all indexes in the shard',
  search_fields_numeric_Sortable:
    'The total number of SORTABLE NUMERIC fields across all indexes in the shard. This field appears only if its value is larger than 0',
  search_fields_numeric_NoIndex:
    'The total number of NOINDEX NUMERIC fields across all indexes in the shard; i.e., used for sorting only but not indexed. This field appears only if its value is larger than 0',
  search_fields_tag_Tag: 'The total number of TAG fields across all indexes in the shard',
  search_fields_tag_Sortable:
    'The total number of SORTABLE TAG fields across all indexes in the shard. This field appears only if its value is larger than 0',
  search_fields_tag_NoIndex:
    'The total number of NOINDEX TAG fields across all indexes in the shard; i.e., used for sorting only but not indexed. This field appears only if its value is larger than 0',
  search_fields_tag_CaseSensitive:
    'The total number of CASESENSITIVE TAG fields across all indexes in the shard. This field appears only if its value is larger than 0',
  search_fields_geo_Geo: 'The total number of GEO fields across all indexes in the shard',
  search_fields_geo_Sortable:
    'The total number of SORTABLE GEO fields across all indexes in the shard. This field appears only if its value is larger than 0',
  search_fields_geo_NoIndex:
    'The total number of NOINDEX GEO fields across all indexes in the shard; i.e., used for sorting only but not indexed. This field appears only if its value is larger than 0',
  search_fields_vector_Vector: 'The total number of VECTOR fields across all indexes in the shard',
  search_fields_vector_Flat:
    'The total number of FLAT VECTOR fields across all indexes in the shard',
  search_fields_vector_HNSW:
    'The total number of HNSW VECTOR fields across all indexes in the shard',
  search_fields_geoshape_Geoshape:
    'The total number of GEOSHAPE fields across all indexes in the shard',
  search_fields_geoshape_Sortable:
    'The total number of SORTABLE GEOSHAPE fields across all indexes in the shard. This field appears only if its value is larger than 0',
  search_fields_geoshape_NoIndex:
    'The total number of NOINDEX GEOSHAPE fields across all indexes in the shard; i.e., used for sorting only but not indexed. This field appears only if its value is larger than 0',
  'search_fields_<field>_IndexErrors':
    'The total number of indexing failures caused by attempts to index a document containing field',
  search_used_memory_vector_index: 'The total memory usage of all vector indexes in the shard',
  search_used_memory_indexes:
    'The estimated total memory allocated by all indexes in the shard in bytes (including vector indexes memory accounted in search_used_memory_vector_index)',
  search_used_memory_indexes_human:
    'The estimated total memory allocated by all indexes in the shard in MB',
  search_smallest_memory_index:
    'The estimated memory usage of the index with the smallest memory usage in the shard in bytes',
  search_smallest_memory_index_human:
    'The estimated memory usage of the index with the smallest memory usage in the shard in MB',
  search_largest_memory_index:
    'The estimated memory usage of the index with the largest memory usage in the shard in bytes',
  search_largest_memory_index_human:
    'The estimated memory usage of the index with the largest memory usage in the shard in MB',
  search_total_indexing_time:
    'The total time spent on indexing operations, excluding the background indexing of vectors in the HNSW graph',
  search_total_queries_processed:
    'The total number of successful query executions (When using cursors, not counting reading from existing cursors) in the shard',
  search_total_query_commands:
    'The total number of successful query command executions (including FT.SEARCH, FT.AGGREGATE, and FT.CURSOR READ)',
  search_total_query_execution_time_ms:
    'The cumulative execution time of all query commands, including FT.SEARCH, FT.AGGREGATE, and FT.CURSOR READ, measured in ms',
  search_total_active_queries:
    'The total number of background queries currently being executed in the shard, excluding FT.CURSOR READ',
  search_errors_indexing_failures:
    'The total number of indexing failures recorded across all indexes in the shard',
  search_errors_for_index_with_max_failures:
    'The number of indexing failures in the index with the highest count of failures',
  search_OOM_indexing_failures_indexes_count:
    'The number of indexes whose background indexing process failed due to out-of-memory (OOM) conditions',
  dbXXX: 'keys=XXX,expires=XXX,avg_ttl=XXX,subexpiry=XXX',
  eventloop_duration_aof_sum: 'Total time spent on flushing AOF in eventloop in microseconds',
  eventloop_duration_cron_sum:
    'Total time consumption of cron in microseconds (including serverCron and beforeSleep, but excluding IO and AOF flushing)',
  eventloop_duration_max: 'The maximal time spent in a single eventloop cycle in microseconds',
  eventloop_cmd_per_cycle_max:
    'The maximal number of commands processed in a single eventloop cycle',
  allocator_allocated_lua:
    'Total bytes allocated from the allocator specifically for Lua, including internal-fragmentation',
  allocator_active_lua:
    'Total bytes in the allocator active pages specifically for Lua, including external-fragmentation',
  allocator_resident_lua:
    'Total bytes resident (RSS) in the allocator specifically for Lua. This includes pages that can be released to the OS (by MEMORY PURGE, or just waiting)',
  allocator_frag_bytes_lua: 'Delta between allocator_active_lua and allocator_allocated_lua',
} as const
