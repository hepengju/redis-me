export const mockConnList = [
  {
    id: 'hs',
    name: '家-单机',
    host: '192.168.1.11',
    port: 6379,
    username: '',
    password: 'hepengju',
    cluster: false,
    readonly: false,

    ssl: false,
    sslOption: {
      key: '',
      cert: '',
      ca: '',
    },
    order: 1,
    color: '#409EFF',
  },
  {
    id: 'hc',
    name: '家-集群',
    host: '192.168.1.11',
    port: 7001,
    username: '',
    password: 'hepengju',
    cluster: true,
    readonly: false,

    ssl: true,
    sslOption: {
      key: '',
      cert: '',
      ca: '',
    },
    order: 2,
    color: '#67C23A',
  },
  {
    id: 'cs',
    name: '公司-单机',
    host: '10.105.100.63',
    port: 6379,
    username: '',
    password: 'Jiyu1212',
    cluster: false,
    readonly: false,
    ssl: false,
    sslOption: {
      key: '',
      cert: '',
      ca: '',
    },
    order: 3,
    color: '#8da2b7',
  },
  {
    id: 'cc-dev',
    name: '公司-集群-开发',
    host: '10.106.100.140',
    port: 7001,
    username: '',
    password: 'Jiyu1212',
    cluster: true,
    readonly: false,
    ssl: true,
    sslOption: {
      key: '',
      cert: '',
      ca: '',
    },
    order: 4,
    color: '#980e0e',
  },
  {
    id: 'cc-test',
    name: '公司-集群-测试',
    host: '10.106.0.167',
    port: 7001,
    username: '',
    password: 'Jiyu1212',
    cluster: true,
    readonly: false,
    ssl: true,
    sslOption: {
      key: '',
      cert: '',
      ca: '',
    },
    order: 4,
    color: '#980e0e',
  },
]

export const mockDbList = [
  {
    index: 0,
    label: 'DB0',
    name: '',
  },
  {
    index: 1,
    label: 'DB1',
    name: '',
  },
  {
    index: 2,
    label: 'DB16',
    name: '',
  },
]

export const mockInfo = `
# Server
redis_version:7.4.1
redis_git_sha1:00000000
redis_git_dirty:0
redis_build_id:9ce9f16f947e6690
redis_mode:cluster
os:Linux 3.10.0-1160.el7.x86_64 x86_64
arch_bits:64
monotonic_clock:POSIX clock_gettime
multiplexing_api:epoll
atomicvar_api:c11-builtin
gcc_version:12.2.0
process_id:1
process_supervised:no
run_id:a86669b9982fc4d38140d1b8d8d0eb88dcc393b8
tcp_port:7006
server_time_usec:1750994310829410
uptime_in_seconds:11066791
uptime_in_days:128
hz:20
configured_hz:10
lru_clock:6163846
executable:/data/redis-server
config_file:/etc/redis/conf/redis.conf
io_threads_active:0
listener2:name=tls,bind=0.0.0.0,port=7006

# Clients
connected_clients:3170
cluster_connections:10
maxclients:10000
client_recent_max_input_buffer:20480
client_recent_max_output_buffer:0
blocked_clients:0
tracking_clients:0
pubsub_clients:1
watching_clients:0
clients_in_timeout_table:0
total_watched_keys:0
total_blocking_keys:0
total_blocking_keys_on_nokey:0

# Memory
used_memory:61071672
used_memory_human:58.24M
used_memory_rss:281948160
used_memory_rss_human:268.89M
used_memory_peak:83145128
used_memory_peak_human:79.29M
used_memory_peak_perc:73.45%
used_memory_overhead:535573732
used_memory_startup:2292896
used_memory_dataset:18446744073235049556
used_memory_dataset_perc:31383340711936.00%
allocator_allocated:62062160
allocator_active:64778240
allocator_resident:69120000
allocator_muzzy:0
total_system_memory:8181821440
total_system_memory_human:7.62G
used_memory_lua:31744
used_memory_vm_eval:31744
used_memory_lua_human:31.00K
used_memory_scripts_eval:0
number_of_cached_scripts:0
number_of_functions:0
number_of_libraries:0
used_memory_vm_functions:32768
used_memory_vm_total:64512
used_memory_vm_total_human:63.00K
used_memory_functions:296
used_memory_scripts:296
used_memory_scripts_human:296B
maxmemory:0
maxmemory_human:0B
maxmemory_policy:noeviction
allocator_frag_ratio:1.04
allocator_frag_bytes:2610224
allocator_rss_ratio:1.07
allocator_rss_bytes:4341760
rss_overhead_ratio:4.08
rss_overhead_bytes:212828160
mem_fragmentation_ratio:4.61
mem_fragmentation_bytes:220776016
mem_not_counted_for_evict:30192
mem_replication_backlog:1082164
mem_total_replication_buffers:1082160
mem_clients_slaves:0
mem_clients_normal:6540256
mem_cluster_links:10720
mem_aof_buffer:768
mem_allocator:jemalloc-5.3.0
mem_overhead_db_hashtable_rehashing:0
active_defrag_running:0
lazyfree_pending_objects:0
lazyfreed_objects:0

# Persistence
loading:0
async_loading:0
current_cow_peak:0
current_cow_size:0
current_cow_size_age:0
current_fork_perc:0.00
current_save_keys_processed:0
current_save_keys_total:0
rdb_changes_since_last_save:3606
rdb_bgsave_in_progress:0
rdb_last_save_time:1750994026
rdb_last_bgsave_status:ok
rdb_last_bgsave_time_sec:0
rdb_current_bgsave_time_sec:-1
rdb_saves:36987
rdb_last_cow_size:6643712
rdb_last_load_keys_expired:0
rdb_last_load_keys_loaded:3
aof_enabled:1
aof_rewrite_in_progress:0
aof_rewrite_scheduled:0
aof_last_rewrite_time_sec:0
aof_current_rewrite_time_sec:-1
aof_last_bgrewrite_status:ok
aof_rewrites:680
aof_rewrites_consecutive_failures:0
aof_last_write_status:ok
aof_last_cow_size:6008832
module_fork_in_progress:0
module_fork_last_cow_size:0
aof_current_size:34391464
aof_base_size:10940121
aof_pending_rewrite:0
aof_buffer_length:0
aof_pending_bio_fsync:0
aof_delayed_fsync:11

# Stats
total_connections_received:14773864
total_commands_processed:225722218
instantaneous_ops_per_sec:458
total_net_input_bytes:44146195364
total_net_output_bytes:5526065013
total_net_repl_input_bytes:40205634513
total_net_repl_output_bytes:0
instantaneous_input_kbps:24.20
instantaneous_output_kbps:5.97
instantaneous_input_repl_kbps:21.30
instantaneous_output_repl_kbps:0.00
rejected_connections:0
sync_full:0
sync_partial_ok:0
sync_partial_err:0
expired_subkeys:0
expired_keys:0
expired_stale_perc:0.00
expired_time_cap_reached_count:0
expire_cycle_cpu_milliseconds:0
evicted_keys:0
evicted_clients:0
evicted_scripts:0
total_eviction_exceeded_time:0
current_eviction_exceeded_time:0
keyspace_hits:1632519
keyspace_misses:4576
pubsub_channels:2
pubsub_patterns:1
pubsubshard_channels:0
latest_fork_usec:4753
total_forks:37667
migrate_cached_sockets:0
slave_expires_tracked_keys:0
active_defrag_hits:0
active_defrag_misses:0
active_defrag_key_hits:0
active_defrag_key_misses:0
total_active_defrag_time:0
current_active_defrag_time:0
tracking_total_keys:0
tracking_total_items:0
tracking_total_prefixes:0
unexpected_error_replies:0
total_error_replies:22
dump_payload_sanitizations:0
total_reads_processed:208930854
total_writes_processed:162058074
io_threaded_reads_processed:0
io_threaded_writes_processed:0
client_query_buffer_limit_disconnections:0
client_output_buffer_limit_disconnections:0
reply_buffer_shrinks:14757282
reply_buffer_expands:118
eventloop_cycles:455010615
eventloop_duration_sum:78212552188
eventloop_duration_cmd_sum:673769193
instantaneous_eventloop_cycles_per_sec:195
instantaneous_eventloop_duration_usec:103
acl_access_denied_auth:3
acl_access_denied_cmd:0
acl_access_denied_key:0
acl_access_denied_channel:0

# Replication
role:slave
master_host:10.106.100.140
master_port:7003
master_link_status:up
master_last_io_seconds_ago:0
master_sync_in_progress:0
slave_read_repl_offset:40205634009
slave_repl_offset:40205634009
slave_priority:100
slave_read_only:1
replica_announced:1
connected_slaves:0
master_failover_state:no-failover
master_replid:d5788c886b943ec52577bca322e9dfaa16df038f
master_replid2:0000000000000000000000000000000000000000
master_repl_offset:40205634009
second_repl_offset:-1
repl_backlog_active:1
repl_backlog_size:1048576
repl_backlog_first_byte_offset:40204571383
repl_backlog_histlen:1062627

# CPU
used_cpu_sys:20504.157285
used_cpu_user:67048.416464
used_cpu_sys_children:940.391423
used_cpu_user_children:3163.236791
used_cpu_sys_main_thread:19627.485043
used_cpu_user_main_thread:66871.260288

# Modules

# Errorstats
errorstat_ERR:count=4
errorstat_NOAUTH:count=15
errorstat_WRONGPASS:count=3

# Cluster
cluster_enabled:1

# Keyspace
db0:keys=4522,expires=2061,avg_ttl=0,subexpiry=0
`.trim()

export const mockScan =
  [
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:004',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjAwNA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:040',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjA0MA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:044',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjA0NA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:048',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjA0OA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:132',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjEzMg==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:136',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjEzNg==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:242',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjI0Mg==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:246',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjI0Ng==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:334',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjMzNA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:392',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjM5Mg==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:520',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjUyMA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:524',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjUyNA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:528',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjUyOA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:586',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjU4Ng==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:654',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjY1NA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:762',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjc2Mg==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:780',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjc4MA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:784',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjc4NA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:788',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjc4OA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:833',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjgzMw==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_NUMBER_CODE:860',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX05VTUJFUl9DT0RFOjg2MA==',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:BR',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkJS',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:BV',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkJW',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:BZ',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkJa',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:CD',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkNE',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:CH',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkNI',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:CL',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkNM',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:FK',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkZL',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:FO',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkZP',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:FR',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkZS',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:GH',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkdI',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:GQ',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkdR',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:GU',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkdV',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:GY',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkdZ',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:HT',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkhU',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:IN',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOklO',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:IS',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOklT',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:LA',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkxB',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:LI',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOkxJ',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:MS',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOk1T',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:MW',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOk1X',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:RO',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOlJP',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_COUNTRY_TWO_CODE:SY',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9DT1VOVFJZX1RXT19DT0RFOlNZ',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_PROVINCE_CODE',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9QUk9WSU5DRV9DT0RF',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_VOCATION_CODE:1',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9WT0NBVElPTl9DT0RFOjE=',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_VOCATION_CODE:14',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9WT0NBVElPTl9DT0RFOjE0',
    },
    {
      'key': 'BUS:ACCOUNT:CORE:CACHE_VOCATION_CODE:5',
      'bytes': 'QlVTOkFDQ09VTlQ6Q09SRTpDQUNIRV9WT0NBVElPTl9DT0RFOjU=',
    },
    {
      'key': 'Dictionary:1021',
      'bytes': 'RGljdGlvbmFyeToxMDIx',
    },
    {
      'key': 'Dictionary:1025',
      'bytes': 'RGljdGlvbmFyeToxMDI1',
    },
    {
      'key': 'Dictionary:1029',
      'bytes': 'RGljdGlvbmFyeToxMDI5',
    },
    {
      'key': 'Dictionary:1069',
      'bytes': 'RGljdGlvbmFyeToxMDY5',
    },
    {
      'key': 'Dictionary:1072',
      'bytes': 'RGljdGlvbmFyeToxMDcy',
    },
    {
      'key': 'Dictionary:1076',
      'bytes': 'RGljdGlvbmFyeToxMDc2',
    },
    {
      'key': 'Dictionary:1087',
      'bytes': 'RGljdGlvbmFyeToxMDg3',
    },
    {
      'key': 'Dictionary:1100',
      'bytes': 'RGljdGlvbmFyeToxMTAw',
    },
    {
      'key': 'Dictionary:1104',
      'bytes': 'RGljdGlvbmFyeToxMTA0',
    },
    {
      'key': 'Dictionary:1108',
      'bytes': 'RGljdGlvbmFyeToxMTA4',
    },
    {
      'key': 'Dictionary:1113',
      'bytes': 'RGljdGlvbmFyeToxMTEz',
    },
    {
      'key': 'Dictionary:1223',
      'bytes': 'RGljdGlvbmFyeToxMjIz',
    },
    {
      'key': 'Dictionary:1267',
      'bytes': 'RGljdGlvbmFyeToxMjY3',
    },
    {
      'key': 'Dictionary:1270',
      'bytes': 'RGljdGlvbmFyeToxMjcw',
    },
    {
      'key': 'Dictionary:1274',
      'bytes': 'RGljdGlvbmFyeToxMjc0',
    },
    {
      'key': 'Dictionary:1351',
      'bytes': 'RGljdGlvbmFyeToxMzUx',
    },
    {
      'key': 'Dictionary:1355',
      'bytes': 'RGljdGlvbmFyeToxMzU1',
    },
    {
      'key': 'Dictionary:1359',
      'bytes': 'RGljdGlvbmFyeToxMzU5',
    },
    {
      'key': 'Dictionary:1460',
      'bytes': 'RGljdGlvbmFyeToxNDYw',
    },
    {
      'key': 'Dictionary:1464',
      'bytes': 'RGljdGlvbmFyeToxNDY0',
    },
    {
      'key': 'Dictionary:1491',
      'bytes': 'RGljdGlvbmFyeToxNDkx',
    },
    {
      'key': 'Dictionary:2011',
      'bytes': 'RGljdGlvbmFyeToyMDEx',
    },
    {
      'key': 'Dictionary:2019',
      'bytes': 'RGljdGlvbmFyeToyMDE5',
    },
    {
      'key': 'Dictionary:2042',
      'bytes': 'RGljdGlvbmFyeToyMDQy',
    },
    {
      'key': 'Dictionary:2051',
      'bytes': 'RGljdGlvbmFyeToyMDUx',
    },
    {
      'key': 'FOFUND_RESEARCH_MANAGER_DETAIL_KEY_20250627_JR152B55C',
      'bytes': 'Rk9GVU5EX1JFU0VBUkNIX01BTkFHRVJfREVUQUlMX0tFWV8yMDI1MDYyN19KUjE1MkI1NUM=',
    },
    {
      'key': 'FOFUND_RESEARCH_MANAGER_INVESTTYPE_20250627_00816',
      'bytes': 'Rk9GVU5EX1JFU0VBUkNIX01BTkFHRVJfSU5WRVNUVFlQRV8yMDI1MDYyN18wMDgxNg==',
    },
    {
      'key': 'FOFUND_RESEARCH_MANAGER_INVESTTYPE_20250627_JR152B55C',
      'bytes': 'Rk9GVU5EX1JFU0VBUkNIX01BTkFHRVJfSU5WRVNUVFlQRV8yMDI1MDYyN19KUjE1MkI1NUM=',
    },
    {
      'key': 'MicroService:ac.operator.logout-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmFjLm9wZXJhdG9yLmxvZ291dC0xLjAuMA==',
    },
    {
      'key': 'MicroService:ac.operator.modifyPwd-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmFjLm9wZXJhdG9yLm1vZGlmeVB3ZC0xLjAuMA==',
    },
    {
      'key': 'MicroService:account.addAuthIp-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmFjY291bnQuYWRkQXV0aElwLTEuMC4w',
    },
    {
      'key': 'MicroService:account.getOperator-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmFjY291bnQuZ2V0T3BlcmF0b3ItMS4wLjA=',
    },
    {
      'key': 'MicroService:account.valid.idnoAndOrgId-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmFjY291bnQudmFsaWQuaWRub0FuZE9yZ0lkLTEuMC4w',
    },
    {
      'key': 'MicroService:common.again.sendemail-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNvbW1vbi5hZ2Fpbi5zZW5kZW1haWwtMS4wLjA=',
    },
    {
      'key': 'MicroService:common.authCode-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNvbW1vbi5hdXRoQ29kZS0xLjAuMA==',
    },
    {
      'key': 'MicroService:common.dicttypeid-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNvbW1vbi5kaWN0dHlwZWlkLTEuMC4w',
    },
    {
      'key': 'MicroService:common.etsparameter-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNvbW1vbi5ldHNwYXJhbWV0ZXItMS4wLjA=',
    },
    {
      'key': 'MicroService:common.message-1.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNvbW1vbi5tZXNzYWdlLTEuMA==',
    },
    {
      'key': 'MicroService:common.send.compensateStatement-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNvbW1vbi5zZW5kLmNvbXBlbnNhdGVTdGF0ZW1lbnQtMS4wLjA=',
    },
    {
      'key': 'MicroService:crm.compbill.export.detail-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5jb21wYmlsbC5leHBvcnQuZGV0YWlsLTEuMC4w',
    },
    {
      'key': 'MicroService:crm.dividerule.calcvalue-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5kaXZpZGVydWxlLmNhbGN2YWx1ZS0xLjAuMA==',
    },
    {
      'key': 'MicroService:crm.inventory.calc.info.get-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5pbnZlbnRvcnkuY2FsYy5pbmZvLmdldC0xLjAuMA==',
    },
    {
      'key': 'MicroService:crm.inventory.calc.lasttime.get-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5pbnZlbnRvcnkuY2FsYy5sYXN0dGltZS5nZXQtMS4wLjA=',
    },
    {
      'key': 'MicroService:crm.milepost.run-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5taWxlcG9zdC5ydW4tMS4wLjA=',
    },
    {
      'key': 'MicroService:crm.salesservicebrokerage.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5zYWxlc3NlcnZpY2Vicm9rZXJhZ2UubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:crm.system.log.write-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS5zeXN0ZW0ubG9nLndyaXRlLTEuMC4w',
    },
    {
      'key': 'MicroService:crm.userbill.export.check-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmNybS51c2VyYmlsbC5leHBvcnQuY2hlY2stMS4wLjA=',
    },
    {
      'key': 'MicroService:dc.company.funds.style.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLmNvbXBhbnkuZnVuZHMuc3R5bGUubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:dc.crm.counter.status.get-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLmNybS5jb3VudGVyLnN0YXR1cy5nZXQtMS4wLjA=',
    },
    {
      'key': 'MicroService:dc.fund.invPortfolio.info-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLmZ1bmQuaW52UG9ydGZvbGlvLmluZm8tMS4wLjE=',
    },
    {
      'key': 'MicroService:dc.fund.reveal.init.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLmZ1bmQucmV2ZWFsLmluaXQubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:dc.market.curfund.newest.get-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLm1hcmtldC5jdXJmdW5kLm5ld2VzdC5nZXQtMS4wLjA=',
    },
    {
      'key': 'MicroService:dc.market.fund.newest.get-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLm1hcmtldC5mdW5kLm5ld2VzdC5nZXQtMS4wLjA=',
    },
    {
      'key': 'MicroService:dc.market.shortbondfundavgyield.get-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLm1hcmtldC5zaG9ydGJvbmRmdW5kYXZneWllbGQuZ2V0LTEuMC4w',
    },
    {
      'key': 'MicroService:dc.mgr.fund.tm.save-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLm1nci5mdW5kLnRtLnNhdmUtMS4wLjA=',
    },
    {
      'key': 'MicroService:dc.mgr.fundscore.export-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmRjLm1nci5mdW5kc2NvcmUuZXhwb3J0LTEuMC4w',
    },
    {
      'key': 'MicroService:fisp.afterSync-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmZpc3AuYWZ0ZXJTeW5jLTEuMC4w',
    },
    {
      'key': 'MicroService:fisp.export.JXQsFile.notice-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmZpc3AuZXhwb3J0LkpYUXNGaWxlLm5vdGljZS0xLjAuMA==',
    },
    {
      'key': 'MicroService:fisp.process.marketImport-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmZpc3AucHJvY2Vzcy5tYXJrZXRJbXBvcnQtMS4wLjA=',
    },
    {
      'key': 'MicroService:fisp.queue.query.all-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmZpc3AucXVldWUucXVlcnkuYWxsLTEuMC4w',
    },
    {
      'key': 'MicroService:ia.QueryTradeHis-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOmlhLlF1ZXJ5VHJhZGVIaXMtMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.approvalConfig.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5hcHByb3ZhbENvbmZpZy5saXN0LTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.auth.addManager-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5hdXRoLmFkZE1hbmFnZXItMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.auth.checkOperatorCanBeDisable-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5hdXRoLmNoZWNrT3BlcmF0b3JDYW5CZURpc2FibGUtMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.auth.manager.tradeShareList-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5hdXRoLm1hbmFnZXIudHJhZGVTaGFyZUxpc3QtMS4wLjE=',
    },
    {
      'key': 'MicroService:mgr.auth.managerTradeacco-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5hdXRoLm1hbmFnZXJUcmFkZWFjY28tMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.auth.queryOperatorTradeAcco-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5hdXRoLnF1ZXJ5T3BlcmF0b3JUcmFkZUFjY28tMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.bob.filedownload-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5ib2IuZmlsZWRvd25sb2FkLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.broker.employee.info-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5icm9rZXIuZW1wbG95ZWUuaW5mby0xLjAuMA==',
    },
    {
      'key': 'MicroService:mgr.broker.tradeDivide.list.count-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5icm9rZXIudHJhZGVEaXZpZGUubGlzdC5jb3VudC0xLjAuMA==',
    },
    {
      'key': 'MicroService:mgr.cusName.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5jdXNOYW1lLmxpc3QtMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.ets.countFundListWithRedeemToPurchaseStatus-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5ldHMuY291bnRGdW5kTGlzdFdpdGhSZWRlZW1Ub1B1cmNoYXNlU3RhdHVzLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.export.supervise.excel-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5leHBvcnQuc3VwZXJ2aXNlLmV4Y2VsLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.fundstatus.log.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5mdW5kc3RhdHVzLmxvZy5saXN0LTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.overrun.batching-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5vdmVycnVuLmJhdGNoaW5nLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.preapp.invest.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5wcmVhcHAuaW52ZXN0Lmxpc3QtMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.preapp.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5wcmVhcHAubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:mgr.preapp.valuationFileModel.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5wcmVhcHAudmFsdWF0aW9uRmlsZU1vZGVsLmxpc3QtMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.query.dividend.config.record-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5xdWVyeS5kaXZpZGVuZC5jb25maWcucmVjb3JkLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.research.editEtsReport-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5yZXNlYXJjaC5lZGl0RXRzUmVwb3J0LTEuMC4x',
    },
    {
      'key': 'MicroService:mgr.researchback.edit-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5yZXNlYXJjaGJhY2suZWRpdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:mgr.saverecord.batch-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5zYXZlcmVjb3JkLmJhdGNoLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.sendfile.tradeAccoMailAdd-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5zZW5kZmlsZS50cmFkZUFjY29NYWlsQWRkLTEuMC4w',
    },
    {
      'key': 'MicroService:mgr.shareLimit.queryListForShareAllocationCfg-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5zaGFyZUxpbWl0LnF1ZXJ5TGlzdEZvclNoYXJlQWxsb2NhdGlvbkNmZy0xLjAuMA==',
    },
    {
      'key': 'MicroService:mgr.superTransfer.exOrderDetail-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5zdXBlclRyYW5zZmVyLmV4T3JkZXJEZXRhaWwtMS4wLjA=',
    },
    {
      'key': 'MicroService:mgr.supertransfer.limitcloseupdate-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm1nci5zdXBlcnRyYW5zZmVyLmxpbWl0Y2xvc2V1cGRhdGUtMS4wLjA=',
    },
    {
      'key': 'MicroService:o32.query.fundMarket-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOm8zMi5xdWVyeS5mdW5kTWFya2V0LTEuMC4w',
    },
    {
      'key': 'MicroService:query.QDIIFund.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LlFESUlGdW5kLmxpc3QtMS4wLjA=',
    },
    {
      'key': 'MicroService:query.accoRequest.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmFjY29SZXF1ZXN0Lmxpc3QtMS4wLjA=',
    },
    {
      'key': 'MicroService:query.assetManager.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmFzc2V0TWFuYWdlci5saXN0LTEuMC4w',
    },
    {
      'key': 'MicroService:query.cmbc.accoPair-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmNtYmMuYWNjb1BhaXItMS4wLjA=',
    },
    {
      'key': 'MicroService:query.companyfundass-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmNvbXBhbnlmdW5kYXNzLTEuMC4w',
    },
    {
      'key': 'MicroService:query.curfund.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmN1cmZ1bmQubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.document.rulemodel-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmRvY3VtZW50LnJ1bGVtb2RlbC0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.fund.to.account-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmZ1bmQudG8uYWNjb3VudC0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.fundAssetportfolio-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmZ1bmRBc3NldHBvcnRmb2xpby0xLjAuMQ==',
    },
    {
      'key': 'MicroService:query.fundCredit-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmZ1bmRDcmVkaXQtMS4wLjA=',
    },
    {
      'key': 'MicroService:query.fundRate-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmZ1bmRSYXRlLTEuMC4w',
    },
    {
      'key': 'MicroService:query.investment.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LmludmVzdG1lbnQubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.listBillPageForMgr-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5Lmxpc3RCaWxsUGFnZUZvck1nci0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.position.earningsRatio.list-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnBvc2l0aW9uLmVhcm5pbmdzUmF0aW8ubGlzdC0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.qszgInfoItem-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnFzemdJbmZvSXRlbS0xLjAuMQ==',
    },
    {
      'key': 'MicroService:query.rapidreqstate-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnJhcGlkcmVxc3RhdGUtMS4wLjA=',
    },
    {
      'key': 'MicroService:query.research.fundReport-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnJlc2VhcmNoLmZ1bmRSZXBvcnQtMS4wLjA=',
    },
    {
      'key': 'MicroService:query.stmtHasData-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnN0bXRIYXNEYXRhLTEuMC4w',
    },
    {
      'key': 'MicroService:query.superTransferConfirmDate-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnN1cGVyVHJhbnNmZXJDb25maXJtRGF0ZS0xLjAuMA==',
    },
    {
      'key': 'MicroService:query.tradeAcco.train-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnF1ZXJ5LnRyYWRlQWNjby50cmFpbi0xLjAuMA==',
    },
    {
      'key': 'MicroService:trade.cancel-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLmNhbmNlbC0xLjAuMA==',
    },
    {
      'key': 'MicroService:trade.cmbc.capitalautoDeposit-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLmNtYmMuY2FwaXRhbGF1dG9EZXBvc2l0LTEuMC4x',
    },
    {
      'key': 'MicroService:trade.multitrade.compensation-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLm11bHRpdHJhZGUuY29tcGVuc2F0aW9uLTEuMC4w',
    },
    {
      'key': 'MicroService:trade.redeem-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLnJlZGVlbS0xLjAuMQ==',
    },
    {
      'key': 'MicroService:trade.redeemtopurchase-1.0.1',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLnJlZGVlbXRvcHVyY2hhc2UtMS4wLjE=',
    },
    {
      'key': 'MicroService:trade.reviewOrderOK-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLnJldmlld09yZGVyT0stMS4wLjA=',
    },
    {
      'key': 'MicroService:trade.testpurchase-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnRyYWRlLnRlc3RwdXJjaGFzZS0xLjAuMA==',
    },
    {
      'key': 'MicroService:yss.position.send-1.0.0',
      'bytes': 'TWljcm9TZXJ2aWNlOnlzcy5wb3NpdGlvbi5zZW5kLTEuMC4w',
    },
    {
      'key': 'PrivatelyFundListCache:01A117',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTowMUExMTc=',
    },
    {
      'key': 'PrivatelyFundListCache:059234',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTowNTkyMzQ=',
    },
    {
      'key': 'PrivatelyFundListCache:059238',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTowNTkyMzg=',
    },
    {
      'key': 'PrivatelyFundListCache:0A9002',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTowQTkwMDI=',
    },
    {
      'key': 'PrivatelyFundListCache:0W8049',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTowVzgwNDk=',
    },
    {
      'key': 'PrivatelyFundListCache:0W8124',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTowVzgxMjQ=',
    },
    {
      'key': 'PrivatelyFundListCache:119090',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxMTkwOTA=',
    },
    {
      'key': 'PrivatelyFundListCache:119100',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxMTkxMDA=',
    },
    {
      'key': 'PrivatelyFundListCache:119157',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxMTkxNTc=',
    },
    {
      'key': 'PrivatelyFundListCache:130194',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxMzAxOTQ=',
    },
    {
      'key': 'PrivatelyFundListCache:17E495',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxN0U0OTU=',
    },
    {
      'key': 'PrivatelyFundListCache:17M135',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxN00xMzU=',
    },
    {
      'key': 'PrivatelyFundListCache:190463',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxOTA0NjM=',
    },
    {
      'key': 'PrivatelyFundListCache:1M0005',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToxTTAwMDU=',
    },
    {
      'key': 'PrivatelyFundListCache:206496',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToyMDY0OTY=',
    },
    {
      'key': 'PrivatelyFundListCache:206542',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToyMDY1NDI=',
    },
    {
      'key': 'PrivatelyFundListCache:268303',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToyNjgzMDM=',
    },
    {
      'key': 'PrivatelyFundListCache:275999',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToyNzU5OTk=',
    },
    {
      'key': 'PrivatelyFundListCache:276055',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZToyNzYwNTU=',
    },
    {
      'key': 'PrivatelyFundListCache:301160',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTozMDExNjA=',
    },
    {
      'key': 'PrivatelyFundListCache:389092',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTozODkwOTI=',
    },
    {
      'key': 'PrivatelyFundListCache:389096',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTozODkwOTY=',
    },
    {
      'key': 'PrivatelyFundListCache:476130',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo0NzYxMzA=',
    },
    {
      'key': 'PrivatelyFundListCache:536539',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo1MzY1Mzk=',
    },
    {
      'key': 'PrivatelyFundListCache:5D1039',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo1RDEwMzk=',
    },
    {
      'key': 'PrivatelyFundListCache:600500',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo2MDA1MDA=',
    },
    {
      'key': 'PrivatelyFundListCache:649049',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo2NDkwNDk=',
    },
    {
      'key': 'PrivatelyFundListCache:650963',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo2NTA5NjM=',
    },
    {
      'key': 'PrivatelyFundListCache:76C104',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo3NkMxMDQ=',
    },
    {
      'key': 'PrivatelyFundListCache:861331',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo4NjEzMzE=',
    },
    {
      'key': 'PrivatelyFundListCache:861366',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo4NjEzNjY=',
    },
    {
      'key': 'PrivatelyFundListCache:865300',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo4NjUzMDA=',
    },
    {
      'key': 'PrivatelyFundListCache:865304',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo4NjUzMDQ=',
    },
    {
      'key': 'PrivatelyFundListCache:865633',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo4NjU2MzM=',
    },
    {
      'key': 'PrivatelyFundListCache:865712',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo4NjU3MTI=',
    },
    {
      'key': 'PrivatelyFundListCache:9099GN',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo5MDk5R04=',
    },
    {
      'key': 'PrivatelyFundListCache:9099H8',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo5MDk5SDg=',
    },
    {
      'key': 'PrivatelyFundListCache:918044',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo5MTgwNDQ=',
    },
    {
      'key': 'PrivatelyFundListCache:941894',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTo5NDE4OTQ=',
    },
    {
      'key': 'PrivatelyFundListCache:A41475',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpBNDE0NzU=',
    },
    {
      'key': 'PrivatelyFundListCache:A41479',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpBNDE0Nzk=',
    },
    {
      'key': 'PrivatelyFundListCache:A41480',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpBNDE0ODA=',
    },
    {
      'key': 'PrivatelyFundListCache:B22017',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpCMjIwMTc=',
    },
    {
      'key': 'PrivatelyFundListCache:B5Z482',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpCNVo0ODI=',
    },
    {
      'key': 'PrivatelyFundListCache:BB2005',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpCQjIwMDU=',
    },
    {
      'key': 'PrivatelyFundListCache:C06088',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpDMDYwODg=',
    },
    {
      'key': 'PrivatelyFundListCache:C06158',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpDMDYxNTg=',
    },
    {
      'key': 'PrivatelyFundListCache:C43570',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpDNDM1NzA=',
    },
    {
      'key': 'PrivatelyFundListCache:C65128',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpDNjUxMjg=',
    },
    {
      'key': 'PrivatelyFundListCache:CBW003',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpDQlcwMDM=',
    },
    {
      'key': 'PrivatelyFundListCache:CS003',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpDUzAwMw==',
    },
    {
      'key': 'PrivatelyFundListCache:DB3068',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpEQjMwNjg=',
    },
    {
      'key': 'PrivatelyFundListCache:DE0078',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpERTAwNzg=',
    },
    {
      'key': 'PrivatelyFundListCache:E50452',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpFNTA0NTI=',
    },
    {
      'key': 'PrivatelyFundListCache:JJZG01',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpKSlpHMDE=',
    },
    {
      'key': 'PrivatelyFundListCache:SACC34',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTQUNDMzQ=',
    },
    {
      'key': 'PrivatelyFundListCache:SB6039',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTQjYwMzk=',
    },
    {
      'key': 'PrivatelyFundListCache:SLE792',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTEU3OTI=',
    },
    {
      'key': 'PrivatelyFundListCache:SLR749',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTFI3NDk=',
    },
    {
      'key': 'PrivatelyFundListCache:SLR752',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTFI3NTI=',
    },
    {
      'key': 'PrivatelyFundListCache:SLU698',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTFU2OTg=',
    },
    {
      'key': 'PrivatelyFundListCache:SLX648',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTFg2NDg=',
    },
    {
      'key': 'PrivatelyFundListCache:SNT117',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTlQxMTc=',
    },
    {
      'key': 'PrivatelyFundListCache:SNZ682',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTTlo2ODI=',
    },
    {
      'key': 'PrivatelyFundListCache:SQJ724',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTUUo3MjQ=',
    },
    {
      'key': 'PrivatelyFundListCache:SSH341',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTU0gzNDE=',
    },
    {
      'key': 'PrivatelyFundListCache:SSJ082',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTU0owODI=',
    },
    {
      'key': 'PrivatelyFundListCache:SSZ787',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTU1o3ODc=',
    },
    {
      'key': 'PrivatelyFundListCache:STA124',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVEExMjQ=',
    },
    {
      'key': 'PrivatelyFundListCache:STA829',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVEE4Mjk=',
    },
    {
      'key': 'PrivatelyFundListCache:STH447',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVEg0NDc=',
    },
    {
      'key': 'PrivatelyFundListCache:STH454',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVEg0NTQ=',
    },
    {
      'key': 'PrivatelyFundListCache:SVA939',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVkE5Mzk=',
    },
    {
      'key': 'PrivatelyFundListCache:SVH307',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVkgzMDc=',
    },
    {
      'key': 'PrivatelyFundListCache:SVM294',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVk0yOTQ=',
    },
    {
      'key': 'PrivatelyFundListCache:SVX337',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTVlgzMzc=',
    },
    {
      'key': 'PrivatelyFundListCache:SXC153',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTWEMxNTM=',
    },
    {
      'key': 'PrivatelyFundListCache:SXS773',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTWFM3NzM=',
    },
    {
      'key': 'PrivatelyFundListCache:SZA258',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTWkEyNTg=',
    },
    {
      'key': 'PrivatelyFundListCache:SZF591',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTWkY1OTE=',
    },
    {
      'key': 'PrivatelyFundListCache:SZF599',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTWkY1OTk=',
    },
    {
      'key': 'PrivatelyFundListCache:SZS663',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpTWlM2NjM=',
    },
    {
      'key': 'PrivatelyFundListCache:VU697A',
      'bytes': 'UHJpdmF0ZWx5RnVuZExpc3RDYWNoZTpWVTY5N0E=',
    },
    {
      'key': 'QszgManager:970022',
      'bytes': 'UXN6Z01hbmFnZXI6OTcwMDIy',
    },
    {
      'key': 'QszgManager:970035',
      'bytes': 'UXN6Z01hbmFnZXI6OTcwMDM1',
    },
    {
      'key': 'QszgManager:970066',
      'bytes': 'UXN6Z01hbmFnZXI6OTcwMDY2',
    },
    {
      'key': 'QszgManager:970071',
      'bytes': 'UXN6Z01hbmFnZXI6OTcwMDcx',
    },
    {
      'key': 'QszgManager:970075',
      'bytes': 'UXN6Z01hbmFnZXI6OTcwMDc1',
    },
    {
      'key': 'QszgMarketToday:001577',
      'bytes': 'UXN6Z01hcmtldFRvZGF5OjAwMTU3Nw==',
    },
    {
      'key': 'QszgMarketToday:881013',
      'bytes': 'UXN6Z01hcmtldFRvZGF5Ojg4MTAxMw==',
    },
    {
      'key': 'QszgMarketToday:970027',
      'bytes': 'UXN6Z01hcmtldFRvZGF5Ojk3MDAyNw==',
    },
    {
      'key': 'QszgMarketToday:970034',
      'bytes': 'UXN6Z01hcmtldFRvZGF5Ojk3MDAzNA==',
    },
    {
      'key': 'QszgMarketToday:970063',
      'bytes': 'UXN6Z01hcmtldFRvZGF5Ojk3MDA2Mw==',
    },
    {
      'key': 'QszgMarketToday:970115',
      'bytes': 'UXN6Z01hcmtldFRvZGF5Ojk3MDExNQ==',
    },
    {
      'key': 'QszgMarketToday:970146',
      'bytes': 'UXN6Z01hcmtldFRvZGF5Ojk3MDE0Ng==',
    },
    {
      'key': 'QszgMarketToday:SNT112',
      'bytes': 'UXN6Z01hcmtldFRvZGF5OlNOVDExMg==',
    },
    {
      'key': 'Risk:881007',
      'bytes': 'Umlzazo4ODEwMDc=',
    },
    {
      'key': 'Risk:970086',
      'bytes': 'Umlzazo5NzAwODY=',
    },
    {
      'key': 'Risk:970145',
      'bytes': 'Umlzazo5NzAxNDU=',
    },
    {
      'key': 'Risk:AB5407',
      'bytes': 'UmlzazpBQjU0MDc=',
    },
    {
      'key': 'Risk:F90024',
      'bytes': 'UmlzazpGOTAwMjQ=',
    },
    {
      'key': 'Search:3',
      'bytes': 'U2VhcmNoOjM=',
    },
    {
      'key': 'Search:7',
      'bytes': 'U2VhcmNoOjc=',
    },
    {
      'key': 'Search:ALL_COMPNAME_FULLPINYIN',
      'bytes': 'U2VhcmNoOkFMTF9DT01QTkFNRV9GVUxMUElOWUlO',
    },
    {
      'key': 'Search:ALL_PRODNAME',
      'bytes': 'U2VhcmNoOkFMTF9QUk9ETkFNRQ==',
    },
    {
      'key': 'Search:D',
      'bytes': 'U2VhcmNoOkQ=',
    },
    {
      'key': 'Search:H',
      'bytes': 'U2VhcmNoOkg=',
    },
    {
      'key': 'Search:L',
      'bytes': 'U2VhcmNoOkw=',
    },
    {
      'key': 'Search:L_E',
      'bytes': 'U2VhcmNoOkxfRQ==',
    },
    {
      'key': 'Search:Q_E',
      'bytes': 'U2VhcmNoOlFfRQ==',
    },
    {
      'key': 'activity:1915206875356332837:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkxNTIwNjg3NTM1NjMzMjgzNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372510434919828:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxMDQzNDkxOTgyODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372511609324967:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxMTYwOTMyNDk2Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372511726765484:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxMTcyNjc2NTQ4NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372514088158662:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxNDA4ODE1ODY2Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372514746664395:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxNDc0NjY2NDM5NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372518311822846:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxODMxMTgyMjg0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372518353765889:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxODM1Mzc2NTg4OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372518550898182:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxODU1MDg5ODE4Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372518769001997:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxODc2OTAwMTk5Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372518890636818:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxODg5MDYzNjgxODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372519683360286:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUxOTY4MzM2MDI4Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372520610301478:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyMDYxMDMwMTQ3ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372520614495784:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyMDYxNDQ5NTc4NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372521163949622:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyMTE2Mzk0OTYyMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372523391125081:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyMzM5MTEyNTA4MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372525148538502:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyNTE0ODUzODUwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372525161121420:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyNTE2MTEyMTQyMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372528222963345:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyODIyMjk2MzM0NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372528545924763:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyODU0NTkyNDc2Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372528843720349:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyODg0MzcyMDM0OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372529867130532:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUyOTg2NzEzMDUzMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372531364497088:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzMTM2NDQ5NzA4ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372531515492034:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzMTUxNTQ5MjAzNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372531528074952:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzMTUyODA3NDk1Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372532241106646:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzMjI0MTEwNjY0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372532291438302:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzMjI5MTQzODMwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372534858352395:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNDg1ODM1MjM5NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372535047096088:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNTA0NzA5NjA4ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372535198091040:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNTE5ODA5MTA0MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372536334747443:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNjMzNDc0NzQ0Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372536338941752:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNjMzODk0MTc1Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372536468965181:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNjQ2ODk2NTE4MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372537324603218:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNzMyNDYwMzIxODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372537819531095:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzNzgxOTUzMTA5NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372538939410284:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjUzODkzOTQxMDI4NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372540159952773:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MDE1OTk1Mjc3Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372540180924297:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MDE4MDkyNDI5Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372540185118603:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MDE4NTExODYwMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372540604549007:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MDYwNDU0OTAwNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372541095282586:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MTA5NTI4MjU4Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372542265493439:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MjI2NTQ5MzQzOTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372542680729536:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MjY4MDcyOTUzNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372542806558666:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MjgwNjU1ODY2Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372543322458061:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MzMyMjQ1ODA2MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372543322458062:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0MzMyMjQ1ODA2Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372543792220117:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0Mzc5MjIyMDExNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372544538806249:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0NDUzODgwNjI0OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372544777881580:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU0NDc3Nzg4MTU4MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372582702778349:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4MjcwMjc3ODM0OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372582715361265:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4MjcxNTM2MTI2NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372582715361266:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4MjcxNTM2MTI2Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372582727944186:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4MjcyNzk0NDE4Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372584380497941:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NDM4MDQ5Nzk0MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372584380497942:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NDM4MDQ5Nzk0Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372584384692248:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NDM4NDY5MjI0ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372584929951786:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NDkyOTk1MTc4Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372585521348691:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NTUyMTM0ODY5MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372586737696875:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NjczNzY5Njg3NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372587140350071:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NzE0MDM1MDA3MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372587853381755:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4Nzg1MzM4MTc1NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372587933073546:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4NzkzMzA3MzU0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372588650299560:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4ODY1MDI5OTU2MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372589287833797:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4OTI4NzgzMzc5Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372589296222413:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU4OTI5NjIyMjQxMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372591351431435:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5MTM1MTQzMTQzNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372592173515030:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5MjE3MzUxNTAzMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372592186097953:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5MjE4NjA5Nzk1Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372592618111274:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5MjYxODExMTI3NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372592630694192:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5MjYzMDY5NDE5Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372592643277110:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5MjY0MzI3NzExMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372593981260098:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5Mzk4MTI2MDA5ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372593998037326:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5Mzk5ODAzNzMyNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372594270667103:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NDI3MDY2NzEwMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372594409079152:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NDQwOTA3OTE1Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372595117916552:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NTExNzkxNjU1Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372595742867859:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NTc0Mjg2Nzg1OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372595956777379:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NTk1Njc3NzM3OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372595965165992:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NTk2NTE2NTk5Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372595973554602:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NTk3MzU1NDYwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372596380402097:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NjM4MDQwMjA5Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372596388790707:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NjM4ODc5MDcwNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372596409762237:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NjQwOTc2MjIzNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372597248623067:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5NzI0ODYyMzA2Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372598058123754:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5ODA1ODEyMzc1NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372598074900984:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5ODA3NDkwMDk4NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372598485942801:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5ODQ4NTk0MjgwMTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372598490137106:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5ODQ5MDEzNzEwNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372598506914329:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5ODUwNjkxNDMyOTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372599706485278:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5OTcwNjQ4NTI3ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372599723262506:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5OTcyMzI2MjUwNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372599731651120:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5OTczMTY1MTEyMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372599740039737:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5OTc0MDAzOTczNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372599849091650:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjU5OTg0OTA5MTY1MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372600566317641:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMDU2NjMxNzY0MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372600566317642:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMDU2NjMxNzY0Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372600578900562:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMDU3ODkwMDU2Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372601438732938:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMTQzODczMjkzODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372601447121552:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMTQ0NzEyMTU1Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372601866551958:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMTg2NjU1MTk1ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372601874940574:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMTg3NDk0MDU3NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372601883329185:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMTg4MzMyOTE4NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372601883329186:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMTg4MzMyOTE4Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372602428588711:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMjQyODU4ODcxMTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372602428588712:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMjQyODU4ODcxMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372602671858352:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMjY3MTg1ODM1Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372602680246969:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMjY4MDI0Njk2OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372602692829887:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMjY5MjgyOTg4Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372603523302103:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMzUyMzMwMjEwMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372603930149607:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwMzkzMDE0OTYwNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372604332802799:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNDMzMjgwMjc5OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372604353774326:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNDM1Mzc3NDMyNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372604810953490:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNDgxMDk1MzQ5MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372605230383908:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNTIzMDM4MzkwODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372605238772517:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNTIzODc3MjUxNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372605607871278:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNTYwNzg3MTI3ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372606035690302:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNjAzNTY5MDMwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372606048273223:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNjA0ODI3MzIyMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372606857773914:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNjg1Nzc3MzkxNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372606874551143:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNjg3NDU1MTE0Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372607688246138:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNzY4ODI0NjEzODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372607692440444:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNzY5MjQ0MDQ0NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372607696634749:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwNzY5NjYzNDc0OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372608262865817:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwODI2Mjg2NTgxNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372608267060125:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwODI2NzA2MDEyNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372608267060126:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwODI2NzA2MDEyNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372608527106981:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwODUyNzEwNjk4MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372608967508913:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwODk2NzUwODkxMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372608984286145:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwODk4NDI4NjE0NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372609810564063:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwOTgxMDU2NDA2Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372609986724837:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwOTk4NjcyNDgzNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372609990919142:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYwOTk5MDkxOTE0Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372610209022953:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMDIwOTAyMjk1Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372610229994483:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMDIyOTk5NDQ4Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372610733310984:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMDczMzMxMDk4NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372611052078093:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMTA1MjA3ODA5Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372612306175048:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMjMwNjE3NTA0ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372612314563660:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMjMxNDU2MzY2MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372612402644058:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMjQwMjY0NDA1ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372612733994080:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMjczMzk5NDA4MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372613572854910:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxMzU3Mjg1NDkxMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372614457853094:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNDQ1Nzg1MzA5NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372614856311992:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNDg1NjMxMTk5Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372615271548100:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNTI3MTU0ODEwMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372615657424081:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNTY1NzQyNDA4MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372615779058900:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNTc3OTA1ODkwMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372616102020334:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNjEwMjAyMDMzNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372616114603250:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNjExNDYwMzI1MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924372616928298246:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDM3MjYxNjkyODI5ODI0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404170366910916:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3MDM2NjkxMDkxNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404170383688135:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3MDM4MzY4ODEzNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404171365155287:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3MTM2NTE1NTI4Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404171428069850:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3MTQyODA2OTg1MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404171973329393:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3MTk3MzMyOTM5Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404172690555409:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3MjY5MDU1NTQwOTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404174754153028:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NDc1NDE1MzAyODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404175278441046:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NTI3ODQ0MTA0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404175513322073:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NTUxMzMyMjA3Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404176138273388:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NjEzODI3MzM4ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404177476256400:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NzQ3NjI1NjQwMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404177815995028:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NzgxNTk5NTAyODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404177820189336:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NzgyMDE4OTMzNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404177824383645:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3NzgyNDM4MzY0NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404177841160865:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3Nzg0MTE2MDg2NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404177841160866:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3Nzg0MTE2MDg2Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179153978039:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTE1Mzk3ODAzOTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179401441990:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTQwMTQ0MTk5MDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179401441993:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTQwMTQ0MTk5Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179506299605:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTUwNjI5OTYwNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179514688214:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTUxNDY4ODIxNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179518882520:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTUxODg4MjUyMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179560825569:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTU2MDgyNTU2OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404179577602786:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE3OTU3NzYwMjc4Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404180357743349:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MDM1Nzc0MzM0OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404180491961088:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MDQ5MTk2MTA4ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404182341649166:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MjM0MTY0OTE2Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404182509421345:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MjUwOTQyMTM0NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404182509421346:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MjUwOTQyMTM0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404183247618871:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MzI0NzYxODg3MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404183268590392:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4MzI2ODU5MDM5Mjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404183763518269:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4Mzc2MzUxODI2OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404184547853127:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4NDU0Nzg1MzEyNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404185369936714:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4NTM2OTkzNjcxNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404186896663402:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4Njg5NjY2MzQwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404187022492533:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4NzAyMjQ5MjUzMzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404187488060283:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4NzQ4ODA2MDI4Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404187773272976:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4Nzc3MzI3Mjk3Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188071068565:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODA3MTA2ODU2NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188159148957:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODE1OTE0ODk1Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188175926175:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODE3NTkyNjE3NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188175926176:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODE3NTkyNjE3Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188280783793:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODI4MDc4Mzc5Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188440167369:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODQ0MDE2NzM2OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404188473721802:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE4ODQ3MzcyMTgwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404190210163728:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MDIxMDE2MzcyODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404190872863784:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MDg3Mjg2Mzc4NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404190952555564:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MDk1MjU1NTU2NDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404191262934067:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MTI2MjkzNDA2Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404191405540408:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MTQwNTU0MDQwODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404192307315785:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MjMwNzMxNTc4NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404192705774678:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MjcwNTc3NDY3ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404192831603815:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MjgzMTYwMzgxNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404192911295598:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MjkxMTI5NTU5ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404192919684209:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MjkxOTY4NDIwOTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404193502692483:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MzUwMjY5MjQ4Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404193657881745:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MzY1Nzg4MTc0NTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404193657881746:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5MzY1Nzg4MTc0Njpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404194324776104:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NDMyNDc3NjEwNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404194916172969:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NDkxNjE3Mjk2OTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404194928755883:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NDkyODc1NTg4Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404195021030583:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NTAyMTAzMDU4Mzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404195042002105:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NTA0MjAwMjEwNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404195130082502:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NTEzMDA4MjUwMjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404196187047130:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NjE4NzA0NzEzMDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404197415978241:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NzQxNTk3ODI0MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404197474698501:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NzQ3NDY5ODUwMTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404197483087111:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NzQ4MzA4NzExMTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404197487281416:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5NzQ4NzI4MTQxNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404198858818878:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5ODg1ODgxODg3ODpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404198858818881:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDE5ODg1ODgxODg4MTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404201824191917:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDIwMTgyNDE5MTkxNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404202243622325:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDIwMjI0MzYyMjMyNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404202243622326:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDIwMjI0MzYyMjMyNjpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1924404202310731204:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNDQwNDIwMjMxMDczMTIwNDpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1925481774880655007:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkyNTQ4MTc3NDg4MDY1NTAwNzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1932345612620058625:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkzMjM0NTYxMjYyMDA1ODYyNTpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'activity:1934858993595842587:prize_remain',
      'bytes': 'YWN0aXZpdHk6MTkzNDg1ODk5MzU5NTg0MjU4Nzpwcml6ZV9yZW1haW4=',
    },
    {
      'key': 'all:prod:org_code_prd_rel_version',
      'bytes': 'YWxsOnByb2Q6b3JnX2NvZGVfcHJkX3JlbF92ZXJzaW9u',
    },
    {
      'key': 'bus-account-core:account:request:no202504281027',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDQyODEwMjc=',
    },
    {
      'key': 'bus-account-core:account:request:no202505141033',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDUxNDEwMzM=',
    },
    {
      'key': 'bus-account-core:account:request:no202505211851',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDUyMTE4NTE=',
    },
    {
      'key': 'bus-account-core:account:request:no202506041805',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDYwNDE4MDU=',
    },
    {
      'key': 'bus-account-core:account:request:no202506060938',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDYwNjA5Mzg=',
    },
    {
      'key': 'bus-account-core:account:request:no202506111606',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDYxMTE2MDY=',
    },
    {
      'key': 'bus-account-core:account:request:no202506161743',
      'bytes': 'YnVzLWFjY291bnQtY29yZTphY2NvdW50OnJlcXVlc3Q6bm8yMDI1MDYxNjE3NDM=',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1455822903796633601:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTQ1NTgyMjkwMzc5NjYzMzYwMTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1717514669985366029:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcxNzUxNDY2OTk4NTM2NjAyOTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1721801513560449034:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcyMTgwMTUxMzU2MDQ0OTAzNDpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1721801513594003467:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcyMTgwMTUxMzU5NDAwMzQ2NzpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1721801513862438932:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcyMTgwMTUxMzg2MjQzODkzMjpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1721911244467740829:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcyMTkxMTI0NDQ2Nzc0MDgyOTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1721911244702621863:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcyMTkxMTI0NDcwMjYyMTg2MzpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1721911244769730730:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTcyMTkxMTI0NDc2OTczMDczMDpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125835540602931:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTgzNTU0MDYwMjkzMTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125850115809340:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg1MDExNTgwOTM0MDpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125857099325508:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg1NzA5OTMyNTUwODpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125868499443795:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg2ODQ5OTQ0Mzc5NTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125874727985248:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg3NDcyNzk4NTI0ODpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125887344451689:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg4NzM0NDQ1MTY4OTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125890880249962:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg5MDg4MDI0OTk2MjpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125899877032051:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTg5OTg3NzAzMjA1MTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-1735125901080797301:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtMTczNTEyNTkwMTA4MDc5NzMwMTpkYXRhU2NvcGUtMA==',
    },
    {
      'key': 'bus-frp-aat:domain:everbright-wealth-chart:groupId-429189087187063308:dataScope-0',
      'bytes': 'YnVzLWZycC1hYXQ6ZG9tYWluOmV2ZXJicmlnaHQtd2VhbHRoLWNoYXJ0Omdyb3VwSWQtNDI5MTg5MDg3MTg3MDYzMzA4OmRhdGFTY29wZS0w',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund-detail:0031339779',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kLWRldGFpbDowMDMxMzM5Nzc5',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund-detail:0056848694',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kLWRldGFpbDowMDU2ODQ4Njk0',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund-detail:2032230721',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kLWRldGFpbDoyMDMyMjMwNzIx',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250401:0000030144',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNDAxOjAwMDAwMzAxNDQ=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250408:0800722147',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNDA4OjA4MDA3MjIxNDc=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250503:1057081918',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTAzOjEwNTcwODE5MTg=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250519:2029609113',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTE5OjIwMjk2MDkxMTM=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250521:2031485946',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIxOjIwMzE0ODU5NDY=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250522:0031339779',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIyOjAwMzEzMzk3Nzk=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250522:0056848694',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIyOjAwNTY4NDg2OTQ=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250522:1549213508',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIyOjE1NDkyMTM1MDg=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250522:2032230721',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIyOjIwMzIyMzA3MjE=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250523:0084285430',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIzOjAwODQyODU0MzA=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250523:0174129216',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIzOjAxNzQxMjkyMTY=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250523:1590247386',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIzOjE1OTAyNDczODY=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250523:1720220892',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTIzOjE3MjAyMjA4OTI=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250526:1590247386',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTI2OjE1OTAyNDczODY=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250527:0056848694',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTI3OjAwNTY4NDg2OTQ=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250527:2032230721',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTI3OjIwMzIyMzA3MjE=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250530:1325829571',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNTMwOjEzMjU4Mjk1NzE=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250616:2032230721',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNjE2OjIwMzIyMzA3MjE=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-fund:20250617:0056848694',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1mdW5kOjIwMjUwNjE3OjAwNTY4NDg2OTQ=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager-detail:7AF567',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyLWRldGFpbDo3QUY1Njc=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager-detail:JR151FD71',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyLWRldGFpbDpKUjE1MUZENzE=',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250513:JR150C59C',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNTEzOkpSMTUwQzU5Qw==',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250516:JR151FD71',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNTE2OkpSMTUxRkQ3MQ==',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250610:JR152B55C',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNjEwOkpSMTUyQjU1Qw==',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250613:JR150C59C',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNjEzOkpSMTUwQzU5Qw==',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250619:7AEFFD',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNjE5OjdBRUZGRA==',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250619:JR14FCBBB',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNjE5OkpSMTRGQ0JCQg==',
    },
    {
      'key': 'bus-frp-agg:visit-history:visit-manager:20250626:7B2ECB',
      'bytes': 'YnVzLWZycC1hZ2c6dmlzaXQtaGlzdG9yeTp2aXNpdC1tYW5hZ2VyOjIwMjUwNjI2OjdCMkVDQg==',
    },
    {
      'key': 'bus-frp-auth:account_login:402776330183131138-v2',
      'bytes': 'YnVzLWZycC1hdXRoOmFjY291bnRfbG9naW46NDAyNzc2MzMwMTgzMTMxMTM4LXYy',
    },
    {
      'key': 'bus-frp-auth:account_login:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxNzkwMTk5ODUyODE1MzI3MjQ3IiwiaWF0IjoxNzUwOTg3MDg5LCJleHAiOjE3NTEwOTUwODl9.Bkk16Pquum8yTaSGerC5osgyInih21SARjLiTF6zQp4-v2',
      'bytes': 'YnVzLWZycC1hdXRoOmFjY291bnRfbG9naW46ZXlKaGJHY2lPaUpJVXpJMU5pSjkuZXlKemRXSWlPaUl4Tnprd01UazVPRFV5T0RFMU16STNNalEzSWl3aWFXRjBJam94TnpVd09UZzNNRGc1TENKbGVIQWlPakUzTlRFd09UVXdPRGw5LkJrazE2UHF1dW04eVRhU0dlckM1b3NneUluaWgyMVNBUmpMaVRGNnpRcDQtdjI=',
    },
    {
      'key': 'bus-frp-auth:frp_user_platform_menu:00020006_2',
      'bytes': 'YnVzLWZycC1hdXRoOmZycF91c2VyX3BsYXRmb3JtX21lbnU6MDAwMjAwMDZfMg==',
    },
    {
      'key': 'bus-frp-auth:frp_user_platform_menu:10014074_2',
      'bytes': 'YnVzLWZycC1hdXRoOmZycF91c2VyX3BsYXRmb3JtX21lbnU6MTAwMTQwNzRfMg==',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:1790259365308248130:1',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjoxNzkwMjU5MzY1MzA4MjQ4MTMwOjE=',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:402778335567953923',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjo0MDI3NzgzMzU1Njc5NTM5MjM=',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MDI3NzgzMzU1Njc5NTM5MjMiLCJpYXQiOjE3NDY5NTA1MTcsImV4cCI6MTc0ODAzMDUxN30.xkGOTv7EXD-voyjK-0NZ4cwhQrpg9AT8OwBa1WB0oIE',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjpleUpoYkdjaU9pSklVekkxTmlKOS5leUp6ZFdJaU9pSTBNREkzTnpnek16VTFOamM1TlRNNU1qTWlMQ0pwWVhRaU9qRTNORFk1TlRBMU1UY3NJbVY0Y0NJNk1UYzBPREF6TURVeE4zMC54a0dPVHY3RVhELXZveWpLLTBOWjRjd2hRcnBnOUFUOE93QmExV0Iwb0lF',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxODk4OTkzMTI3MzIzMTM2MTMwIiwiaWF0IjoxNzQ5NjA5NTE3LCJleHAiOjE3NDk5MzM1MTd9.V1v5tRNOcFsYTbd1O9QmGmSPSyq_99UQy5w8eS7iwDk',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjpleUpoYkdjaU9pSklVekkxTmlKOS5leUp6ZFdJaU9pSXhPRGs0T1Rrek1USTNNekl6TVRNMk1UTXdJaXdpYVdGMElqb3hOelE1TmpBNU5URTNMQ0psZUhBaU9qRTNORGs1TXpNMU1UZDkuVjF2NXRSTk9jRnNZVGJkMU85UW1HbVNQU3lxXzk5VVF5NXc4ZVM3aXdEaw==',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxOTA0MzQ5MDk5MDMzOTY1MDY1IiwiaWF0IjoxNzQ3MjE2NzMwLCJleHAiOjE3NDc1NDA3MzB9.DkAXCA3w5bRZliYYBDH7QefSiR44_3oW-bzw9CnQzG4',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjpleUpoYkdjaU9pSklVekkxTmlKOS5leUp6ZFdJaU9pSXhPVEEwTXpRNU1EazVNRE16T1RZMU1EWTFJaXdpYVdGMElqb3hOelEzTWpFMk56TXdMQ0psZUhBaU9qRTNORGMxTkRBM016QjkuRGtBWENBM3c1YlJabGlZWUJESDdRZWZTaVI0NF8zb1ctYnp3OUNuUXpHNA==',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxOTEwMjU0MzkxNzM1MTcwNjI4IiwiaWF0IjoxNzQ3MzY0NTg1LCJleHAiOjE3NDc2ODg1ODV9.S3fqujd9lEMvhTYaGXJuW075ykoueQlWUanKTHp_ajk',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjpleUpoYkdjaU9pSklVekkxTmlKOS5leUp6ZFdJaU9pSXhPVEV3TWpVME16a3hOek0xTVRjd05qSTRJaXdpYVdGMElqb3hOelEzTXpZME5UZzFMQ0psZUhBaU9qRTNORGMyT0RnMU9EVjkuUzNmcXVqZDlsRU12aFRZYUdYSnVXMDc1eWtvdWVRbFdVYW5LVEhwX2Fqaw==',
    },
    {
      'key': 'bus-frp-auth:wechat_mini_account_login:refresh_token:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxOTIyMjE3NzI0MjMxMDI4NzM3IiwiaWF0IjoxNzQ3MTI3NDI4LCJleHAiOjE3NDc0NTE0Mjh9.G_QzLnbVHrMlH30VnZDPMKru5fNi3kh7KA4msoIpK7s',
      'bytes': 'YnVzLWZycC1hdXRoOndlY2hhdF9taW5pX2FjY291bnRfbG9naW46cmVmcmVzaF90b2tlbjpleUpoYkdjaU9pSklVekkxTmlKOS5leUp6ZFdJaU9pSXhPVEl5TWpFM056STBNak14TURJNE56TTNJaXdpYVdGMElqb3hOelEzTVRJM05ESTRMQ0psZUhBaU9qRTNORGMwTlRFME1qaDkuR19RekxuYlZIck1sSDMwVm5aRFBNS3J1NWZOaTNraDdLQTRtc29JcEs3cw==',
    },
    {
      'key': 'bus-frp-rdf:company_return:0417DA60A7',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MDQxN0RBNjBBNw==',
    },
    {
      'key': 'bus-frp-rdf:company_return:04C5FCCFBE',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MDRDNUZDQ0ZCRQ==',
    },
    {
      'key': 'bus-frp-rdf:company_return:04R45ECBE2',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MDRSNDVFQ0JFMg==',
    },
    {
      'key': 'bus-frp-rdf:company_return:10026403',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MTAwMjY0MDM=',
    },
    {
      'key': 'bus-frp-rdf:company_return:15203',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MTUyMDM=',
    },
    {
      'key': 'bus-frp-rdf:company_return:170205',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MTcwMjA1',
    },
    {
      'key': 'bus-frp-rdf:company_return:170209',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MTcwMjA5',
    },
    {
      'key': 'bus-frp-rdf:company_return:184128',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MTg0MTI4',
    },
    {
      'key': 'bus-frp-rdf:company_return:2002149',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MjAwMjE0OQ==',
    },
    {
      'key': 'bus-frp-rdf:company_return:2002152',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MjAwMjE1Mg==',
    },
    {
      'key': 'bus-frp-rdf:company_return:2024551',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MjAyNDU1MQ==',
    },
    {
      'key': 'bus-frp-rdf:company_return:20I4DD31A2',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MjBJNEREMzFBMg==',
    },
    {
      'key': 'bus-frp-rdf:company_return:221149',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MjIxMTQ5',
    },
    {
      'key': 'bus-frp-rdf:company_return:267506',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MjY3NTA2',
    },
    {
      'key': 'bus-frp-rdf:company_return:30086',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46MzAwODY=',
    },
    {
      'key': 'bus-frp-rdf:company_return:4QD4D0F395',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46NFFENEQwRjM5NQ==',
    },
    {
      'key': 'bus-frp-rdf:company_return:602406',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46NjAyNDA2',
    },
    {
      'key': 'bus-frp-rdf:company_return:CE8A08',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46Q0U4QTA4',
    },
    {
      'key': 'bus-frp-rdf:company_return:EO5aCnuFvI',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46RU81YUNudUZ2SQ==',
    },
    {
      'key': 'bus-frp-rdf:company_return:GYqV7QyRGV',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46R1lxVjdReVJHVg==',
    },
    {
      'key': 'bus-frp-rdf:company_return:d3Qq1y6Aof',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46ZDNRcTF5NkFvZg==',
    },
    {
      'key': 'bus-frp-rdf:company_return:kL5noyTpfA',
      'bytes': 'YnVzLWZycC1yZGY6Y29tcGFueV9yZXR1cm46a0w1bm95VHBmQQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00174',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDE3NA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00200',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDIwMA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00410',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDQxMA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00418',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDQxOA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00458',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDQ1OA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00656',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDY1Ng==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00733',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDczMw==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00791',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDc5MQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00871',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDg3MQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00888',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDg4OA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00907',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDkwNw==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00910',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDkxMA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:00950',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMDk1MA==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:01081',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMTA4MQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:01089',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMTA4OQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:01102',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMTEwMg==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:01106',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMTEwNg==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:01115',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMTExNQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:01151',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDowMTE1MQ==',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101014873',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTQ4NzM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101015144',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTUxNDQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101018048',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTgwNDg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101018941',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTg5NDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019032',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTkwMzI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019292',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTkyOTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019420',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0MjA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019424',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0MjQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019428',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0Mjg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019433',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0MzM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019477',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0Nzc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019482',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0ODI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019486',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0ODY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019491',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk0OTE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019509',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk1MDk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019549',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk1NDk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019552',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk1NTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019556',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk1NTY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019622',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2MjI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019626',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2MjY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019671',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2NzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019675',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2NzU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019680',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2ODA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019684',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2ODQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019688',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk2ODg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019703',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk3MDM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019707',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk3MDc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019710',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk3MTA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019750',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk3NTA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019754',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk3NTQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019812',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk4MTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019841',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk4NDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019845',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk4NDU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019849',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk4NDk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019852',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk4NTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019933',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5MzM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019937',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5Mzc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019960',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5NjA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019964',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5NjQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019968',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5Njg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019991',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5OTE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101019999',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMTk5OTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020024',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAwMjQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020068',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAwNjg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020073',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAwNzM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020077',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAwNzc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020082',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAwODI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020099',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAwOTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020101',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAxMDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:101020109',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMDEwMjAxMDk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:11B2C1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMUIyQzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:12734FC',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMjczNEZD',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1287FA4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMjg3RkE0',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:136B3F5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMzZCM0Y1',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1373C3E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxMzczQzNF',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13BFC3A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0JGQzNB',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13C1586',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0MxNTg2',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13C27C8',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0MyN0M4',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13C95F4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0M5NUY0',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13D26F2',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0QyNkYy',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13D5394',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0Q1Mzk0',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13E3217',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0UzMjE3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:13E34B5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxM0UzNEI1',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:140434F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDA0MzRG',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:14068B2',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDA2OEIy',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:140A5B3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDBBNUIz',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1415E20',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDE1RTIw',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1416EB1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDE2RUIx',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1418597',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDE4NTk3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:141997F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDE5OTdG',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1421567',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDIxNTY3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:14301DB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDMwMURC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:143448D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDM0NDhE',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1436BBB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDM2QkJC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1437F6D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDM3RjZE',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:143D6DB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDNENkRC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:143EFD7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDNFRkQ3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1440EDD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDQwRURE',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1443BAF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDQzQkFG',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1444EFB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDQ0RUZC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1446F39',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDQ2RjM5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:144D59B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDRENTlC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:144DD3F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDRERDNG',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1451993',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDUxOTkz',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1452AC7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDUyQUM3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:145A357',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDVBMzU3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:145C67B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDVDNjdC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1474786',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDc0Nzg2',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:14757C4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDc1N0M0',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1477AAA',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDc3QUFB',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1477B0C',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDc3QjBD',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1478A4C',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDc4QTRD',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:147AE06',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDdBRTA2',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:147EC70',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDdFQzcw',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:147FFD2',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDdGRkQy',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1480C4C',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDgwQzRD',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1482562',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDgyNTYy',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1493946',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDkzOTQ2',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:14946BD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNDk0NkJE',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:14EA8F4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNEVBOEY0',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:14FF0D3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNEZGMEQz',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1550C20',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTUwQzIw',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1563C4B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTYzQzRC',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:156A57C',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTZBNTdD',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1596158',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTk2MTU4',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15983B9',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTk4M0I5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:159B040',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTlCMDQw',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:159C1C5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTlDMUM1',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:159C505',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTlDNTA1',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:159EC09',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTlFQzA5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:159EF29',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNTlFRjI5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15A131A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUExMzFB',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15A4E79',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUE0RTc5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15A6C67',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUE2QzY3',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15AD66A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUFENjZB',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15B02F1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUIwMkYx',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15BFC29',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUJGQzI5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15C28B1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUMyOEIx',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15C4A49',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUM0QTQ5',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15C76D1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUM3NkQx',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15F4F1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUY0RjE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:15FD60',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNUZENjA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:161785',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNjE3ODU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:163CB5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNjNDQjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:165439',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNjU0Mzk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:16BB4D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNkJCNEQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:16DE05',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNkRFMDU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:16F20E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNkYyMEU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:16F7AD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNkY3QUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:16FC5D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNkZDNUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:170176',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzAxNzY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:170202',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzAyMDI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:170363',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzAzNjM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:170564',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzA1NjQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1705A9',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzA1QTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:170B8D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzBCOEQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:170FA9',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzBGQTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:171087',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzEwODc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:171157',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzExNTc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:17130A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzEzMEE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:171986',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxNzE5ODY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:180A39',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxODBBMzk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1857F3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxODU3RjM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:189854',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxODk4NTQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:18E6E9',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOEU2RTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:18F125',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOEYxMjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:190330',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTAzMzA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:190610',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTA2MTA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:191148',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTExNDg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:191285',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTEyODU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1920CD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTIwQ0Q=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:192244',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTIyNDQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:1948CD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTQ4Q0Q=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:195A1A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOTVBMUE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:19A4D6',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOUE0RDY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:19A4E9',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOUE0RTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:19B321',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOUIzMjE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:19E78D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoxOUU3OEQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:231386',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoyMzEzODY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:24192A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDoyNDE5MkE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:36A7B7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDozNkE3Qjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:36B0C5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDozNkIwQzU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:3C33CC',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDozQzMzQ0M=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:3D88D1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDozRDg4RDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:3E4221',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDozRTQyMjE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:3E97DA',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDozRTk3REE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:4E6139',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo0RTYxMzk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:4ECD9D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo0RUNEOUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:4EFFDF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo0RUZGREY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:4F755D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo0Rjc1NUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:5D2EAF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo1RDJFQUY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:5D57CF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo1RDU3Q0Y=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:5DCACF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo1RENBQ0Y=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:78DCB4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3OERDQjQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:78F3D1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3OEYzRDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7A168F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QTE2OEY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7A808B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QTgwOEI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7A94F1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QTk0RjE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AC48B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUM0OEI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7ACA9F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUNBOUY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7ACD5D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUNENUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7ACED3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUNFRDM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7ACF5F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUNGNUY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AD15B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUQxNUI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AD3CF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUQzQ0Y=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AD673',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUQ2NzM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AD7B7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUQ3Qjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AD8BB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUQ4QkI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AD939',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUQ5Mzk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7ADCDB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QURDREI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7ADDF7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QURERjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE167',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUUxNjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE1D9',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUUxRDk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE3DD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUUzREQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE40D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUU0MEQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE5A7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUU1QTc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE6B3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUU2QjM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AE871',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUU4NzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AEACB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUVBQ0I=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AF087',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUYwODc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AF285',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUYyODU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7AF4A5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QUY0QTU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B2BA1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjJCQTE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B34D3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjM0RDM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B3FC5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjNGQzU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B4359',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjQzNTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B4491',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjQ0OTE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B4545',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjQ1NDU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B56FF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjU2RkY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B6847',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjY4NDc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B6B5B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjZCNUI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B7127',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjcxMjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B8495',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Qjg0OTU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7B9D3B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QjlEM0I=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BA039',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkEwMzk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BA071',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkEwNzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BA2EB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkEyRUI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BB56B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkI1NkI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BBD85',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkJEODU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BC755',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkM3NTU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BDC65',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkRDNjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BDF4F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkRGNEY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7BDFBD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QkRGQkQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C035D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzAzNUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C0547',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzA1NDc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C29A5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzI5QTU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C2BC1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzJCQzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C404F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzQwNEY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C51F3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzUxRjM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C6B79',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzZCNzk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C6FDF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzZGREY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7C80F7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3QzgwRjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7CA127',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Q0ExMjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7CAB67',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Q0FCNjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7CB15D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Q0IxNUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7CD2B1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Q0QyQjE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7CE46F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Q0U0NkY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7CFABD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3Q0ZBQkQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D020F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDAyMEY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D0E1D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDBFMUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D14D5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDE0RDU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D1C7F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDFDN0Y=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D2DD1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDJERDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D3141',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDMxNDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D36D1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDM2RDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D53DF',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDUzREY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D5DE3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDVERTM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:7D6B51',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDo3RDZCNTE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:BC28A6',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpCQzI4QTY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:E0C570',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpFMEM1NzA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:E13FB5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpFMTNGQjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:F24627',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpGMjQ2Mjc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:F69D01',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpGNjlEMDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:F6E69B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpGNkU2OUI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14AB1D2',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QUIxRDI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14AB730',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QUI3MzA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14B00C4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QjAwQzQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14B26B6',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QjI2QjY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14B4B0A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QjRCMEE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14B4C30',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QjRDMzA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14BD078',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0QkQwNzg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14C9632',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Qzk2MzI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14CA385',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Q0EzODU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14CA88A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Q0E4OEE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14CAE1C',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Q0FFMUM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14CD12E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Q0QxMkU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14CE03B',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Q0UwM0I=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14D1CAB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RDFDQUI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14D2320',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RDIzMjA=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14D335E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RDMzNUU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DA2E3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REEyRTM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DB8DB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REI4REI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DB942',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REI5NDI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DC625',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REM2MjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DD4D4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REQ0RDQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DE2FA',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REUyRkE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DF087',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REYwODc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DF3B4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REYzQjQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14DF852',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0REY4NTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E0AAE',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTBBQUU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E141A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTE0MUE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E1ECA',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTFFQ0E=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E3BAE',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTNCQUU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E41D4',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTQxRDQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E4FEE',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTRGRUU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E55C7',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTU1Qzc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E632A',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTYzMkE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E64F2',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTY0RjI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E6F3E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTZGM0U=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E7C37',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTdDMzc=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E7DF8',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RTdERjg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14E8B31',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RThCMzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14ECE52',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RUNFNTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14EE1B5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RUUxQjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F00D1',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjAwRDE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F179F',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjE3OUY=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F3A4E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjNBNEU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F4012',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjQwMTI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F4045',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjQwNDU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F41AB',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjQxQUI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F421C',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjQyMUM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F4243',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjQyNDM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F441D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjQ0MUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F7D1D',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RjdEMUQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14F88D3',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0Rjg4RDM=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14FA728',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RkE3Mjg=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14FB5FD',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RkI1RkQ=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR14FCA59',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE0RkNBNTk=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR15038B5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MDM4QjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR150512E',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MDUxMkU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR15065BE',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MDY1QkU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR150D672',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MEQ2NzI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR150EEB2',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MEVFQjI=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR151A2F5',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MUEyRjU=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR151FD71',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MUZENzE=',
    },
    {
      'key': 'bus-frp-rdf:fund_manager_business_prefix:JR152C413',
      'bytes': 'YnVzLWZycC1yZGY6ZnVuZF9tYW5hZ2VyX2J1c2luZXNzX3ByZWZpeDpKUjE1MkM0MTM=',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:169501850686288281814112-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTgxNDExMi12Mg==',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:169501850686288281814136-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTgxNDEzNi12Mg==',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:169501850686288281814212-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTgxNDIxMi12Mg==',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:169501850686288281814236-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTgxNDIzNi12Mg==',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:1695018506862882818223-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTgyMjMtdjI=',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:16950185068628828184124-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTg0MTI0LXYy',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:16950185068628828184224-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTg0MjI0LXYy',
    },
    {
      'key': 'bus-frp-rdf:sector-rotation:1695018506862882818423-v2',
      'bytes': 'YnVzLWZycC1yZGY6c2VjdG9yLXJvdGF0aW9uOjE2OTUwMTg1MDY4NjI4ODI4MTg0MjMtdjI=',
    },
    {
      'key': 'bus-zgt-core:cache:city:list::province,city,county',
      'bytes': 'YnVzLXpndC1jb3JlOmNhY2hlOmNpdHk6bGlzdDo6cHJvdmluY2UsY2l0eSxjb3VudHk=',
    },
    {
      'key': 'bus-zgt-core:cache:config:value::SimpleKey [auth, null, null, null]',
      'bytes': 'YnVzLXpndC1jb3JlOmNhY2hlOmNvbmZpZzp2YWx1ZTo6U2ltcGxlS2V5IFthdXRoLCBudWxsLCBudWxsLCBudWxsXQ==',
    },
    {
      'key': 'bus-zgt-core:cache:token:294152780b6e4319ad4d1fd63ebc1976',
      'bytes': 'YnVzLXpndC1jb3JlOmNhY2hlOnRva2VuOjI5NDE1Mjc4MGI2ZTQzMTlhZDRkMWZkNjNlYmMxOTc2',
    },
    {
      'key': 'bus-zgt-core:cache:token:ec04be82713442e28e04f352eed42a9c',
      'bytes': 'YnVzLXpndC1jb3JlOmNhY2hlOnRva2VuOmVjMDRiZTgyNzEzNDQyZTI4ZTA0ZjM1MmVlZDQyYTlj',
    },
    {
      'key': 'bus:report:ai:trade:order:check193268355936625869020250611',
      'bytes': 'YnVzOnJlcG9ydDphaTp0cmFkZTpvcmRlcjpjaGVjazE5MzI2ODM1NTkzNjYyNTg2OTAyMDI1MDYxMQ==',
    },
    {
      'key': 'cosid:{bus-account-core}:adder',
      'bytes': 'Y29zaWQ6e2J1cy1hY2NvdW50LWNvcmV9OmFkZGVy',
    },
    {
      'key': 'cosid:{bus-account-core}:itc_idx',
      'bytes': 'Y29zaWQ6e2J1cy1hY2NvdW50LWNvcmV9Oml0Y19pZHg=',
    },
    {
      'key': 'cosid:{bus-account-core}:revert',
      'bytes': 'Y29zaWQ6e2J1cy1hY2NvdW50LWNvcmV9OnJldmVydA==',
    },
    {
      'key': 'cosid:{bus-cms}:adder',
      'bytes': 'Y29zaWQ6e2J1cy1jbXN9OmFkZGVy',
    },
    {
      'key': 'cosid:{bus-cms}:revert',
      'bytes': 'Y29zaWQ6e2J1cy1jbXN9OnJldmVydA==',
    },
    {
      'key': 'cosid:{bus-frp-fmi-web-cosid-dev}:adder',
      'bytes': 'Y29zaWQ6e2J1cy1mcnAtZm1pLXdlYi1jb3NpZC1kZXZ9OmFkZGVy',
    },
    {
      'key': 'cosid:{bus-frp-fmi-web-cosid-dev}:itc_idx',
      'bytes': 'Y29zaWQ6e2J1cy1mcnAtZm1pLXdlYi1jb3NpZC1kZXZ9Oml0Y19pZHg=',
    },
    {
      'key': 'cosid:{bus-frp-fmi-web-cosid-dev}:revert',
      'bytes': 'Y29zaWQ6e2J1cy1mcnAtZm1pLXdlYi1jb3NpZC1kZXZ9OnJldmVydA==',
    },
    {
      'key': 'cosid:{bus-frp-fpm-web-cosid-dev}:adder',
      'bytes': 'Y29zaWQ6e2J1cy1mcnAtZnBtLXdlYi1jb3NpZC1kZXZ9OmFkZGVy',
    },
    {
      'key': 'cosid:{bus-frp-fpm-web-cosid-dev}:itc_idx',
      'bytes': 'Y29zaWQ6e2J1cy1mcnAtZnBtLXdlYi1jb3NpZC1kZXZ9Oml0Y19pZHg=',
    },
    {
      'key': 'cosid:{bus-trade-task}:adder',
      'bytes': 'Y29zaWQ6e2J1cy10cmFkZS10YXNrfTphZGRlcg==',
    },
    {
      'key': 'cosid:{bus-trade-task}:revert',
      'bytes': 'Y29zaWQ6e2J1cy10cmFkZS10YXNrfTpyZXZlcnQ=',
    },
    {
      'key': 'cosid:{bus-zgt-core}:adder',
      'bytes': 'Y29zaWQ6e2J1cy16Z3QtY29yZX06YWRkZXI=',
    },
    {
      'key': 'cosid:{bus-zgt-core}:itc_idx',
      'bytes': 'Y29zaWQ6e2J1cy16Z3QtY29yZX06aXRjX2lkeA==',
    },
    {
      'key': 'cosid:{bus-zgt-core}:revert',
      'bytes': 'Y29zaWQ6e2J1cy16Z3QtY29yZX06cmV2ZXJ0',
    },
    {
      'key': 'cosid:{fofund-app-router}:adder',
      'bytes': 'Y29zaWQ6e2ZvZnVuZC1hcHAtcm91dGVyfTphZGRlcg==',
    },
    {
      'key': 'cosid:{fofund-app-router}:revert',
      'bytes': 'Y29zaWQ6e2ZvZnVuZC1hcHAtcm91dGVyfTpyZXZlcnQ=',
    },
    {
      'key': 'fofund-ipmc:login_resource:hefawen45c69f4f6bef198bcb9900bd44ab0e01',
      'bytes': 'Zm9mdW5kLWlwbWM6bG9naW5fcmVzb3VyY2U6aGVmYXdlbjQ1YzY5ZjRmNmJlZjE5OGJjYjk5MDBiZDQ0YWIwZTAx',
    },
    {
      'key': 'fofund-ipmc:login_token:jjc77a72770583534b8ffb597b5c38d9a2',
      'bytes': 'Zm9mdW5kLWlwbWM6bG9naW5fdG9rZW46ampjNzdhNzI3NzA1ODM1MzRiOGZmYjU5N2I1YzM4ZDlhMg==',
    },
    {
      'key': 'fofund-storage-server:access_info::SimpleKey [bd1bf82c11f54417aa50a1e95c23986b, templatefile, READ]',
      'bytes': 'Zm9mdW5kLXN0b3JhZ2Utc2VydmVyOmFjY2Vzc19pbmZvOjpTaW1wbGVLZXkgW2JkMWJmODJjMTFmNTQ0MTdhYTUwYTFlOTVjMjM5ODZiLCB0ZW1wbGF0ZWZpbGUsIFJFQURd',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupChart:395589643522830498-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBDaGFydDozOTU1ODk2NDM1MjI4MzA0OTgtdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupChart:418769652886360564-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBDaGFydDo0MTg3Njk2NTI4ODYzNjA1NjQtdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupChart:418769654979318292-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBDaGFydDo0MTg3Njk2NTQ5NzkzMTgyOTItdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupTable:1574578423615520770-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBUYWJsZToxNTc0NTc4NDIzNjE1NTIwNzcwLXYy',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupTable:418769650776625622-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBUYWJsZTo0MTg3Njk2NTA3NzY2MjU2MjItdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupTable:418769651225416156-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBUYWJsZTo0MTg3Njk2NTEyMjU0MTYxNTYtdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupTable:418769653704249855-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBUYWJsZTo0MTg3Njk2NTM3MDQyNDk4NTUtdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorGroupTable:418769654136263176-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yR3JvdXBUYWJsZTo0MTg3Njk2NTQxMzYyNjMxNzYtdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CGSIGN0013-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNHU0lHTjAwMTMtdjI=',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CSIGN0014-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNTSUdOMDAxNC12Mg==',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CSIGN0018-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNTSUdOMDAxOC12Mg==',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CSIGN0030-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNTSUdOMDAzMC12Mg==',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CSIGN0046-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNTSUdOMDA0Ni12Mg==',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CSIGN0106-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNTSUdOMDEwNi12Mg==',
    },
    {
      'key': 'fofund:frp:aat:quantitativeIndicatorSignalHistoryValue:CSIGN0110-v2',
      'bytes': 'Zm9mdW5kOmZycDphYXQ6cXVhbnRpdGF0aXZlSW5kaWNhdG9yU2lnbmFsSGlzdG9yeVZhbHVlOkNTSUdOMDExMC12Mg==',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:000001.SH-v2',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6MDAwMDAxLlNILXYy',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:801180.SI-v2',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6ODAxMTgwLlNJLXYy',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:801710.SI-v2',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6ODAxNzEwLlNJLXYy',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:801730.SI-v2',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6ODAxNzMwLlNJLXYy',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:930950.CSI-v2',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6OTMwOTUwLkNTSS12Mg==',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:CI005004.CI',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6Q0kwMDUwMDQuQ0k=',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:CI005008.CI',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6Q0kwMDUwMDguQ0k=',
    },
    {
      'key': 'fofund:frp:rdf:detailPage:baseIndexPctChange:CI005020.CI',
      'bytes': 'Zm9mdW5kOmZycDpyZGY6ZGV0YWlsUGFnZTpiYXNlSW5kZXhQY3RDaGFuZ2U6Q0kwMDUwMjAuQ0k=',
    },
    {
      'key': 'frp:aat:quantitativeIndicatorGroup:1574578423762321409-v2',
      'bytes': 'ZnJwOmFhdDpxdWFudGl0YXRpdmVJbmRpY2F0b3JHcm91cDoxNTc0NTc4NDIzNzYyMzIxNDA5LXYy',
    },
    {
      'key': 'frp:aat:quantitativeIndicatorGroup:579619164306542990-v2',
      'bytes': 'ZnJwOmFhdDpxdWFudGl0YXRpdmVJbmRpY2F0b3JHcm91cDo1Nzk2MTkxNjQzMDY1NDI5OTAtdjI=',
    },
    {
      'key': 'jiyuHome:auth:20230831:refresh_auth:460e144f-fedc-41fe-b8da-379db1005034',
      'bytes': 'aml5dUhvbWU6YXV0aDoyMDIzMDgzMTpyZWZyZXNoX2F1dGg6NDYwZTE0NGYtZmVkYy00MWZlLWI4ZGEtMzc5ZGIxMDA1MDM0',
    },
    {
      'key': 'jiyuLimit:limiter:bus-frp-agg:com.fofund.frp.agg.domain.service.impl.MarketingPageServiceImpl.sharePageDetail:I77Jba',
      'bytes': 'aml5dUxpbWl0OmxpbWl0ZXI6YnVzLWZycC1hZ2c6Y29tLmZvZnVuZC5mcnAuYWdnLmRvbWFpbi5zZXJ2aWNlLmltcGwuTWFya2V0aW5nUGFnZVNlcnZpY2VJbXBsLnNoYXJlUGFnZURldGFpbDpJNzdKYmE=',
    },
    {
      'key': 'jiyuLimit:limiter:bus-frp-agg:com.fofund.frp.agg.domain.service.impl.MarketingPageServiceImpl.sharePageDetail:mAfMVv',
      'bytes': 'aml5dUxpbWl0OmxpbWl0ZXI6YnVzLWZycC1hZ2c6Y29tLmZvZnVuZC5mcnAuYWdnLmRvbWFpbi5zZXJ2aWNlLmltcGwuTWFya2V0aW5nUGFnZVNlcnZpY2VJbXBsLnNoYXJlUGFnZURldGFpbDptQWZNVnY=',
    },
    {
      'key': 'jiyuLimit:semaphore:fofund-boot-zztest:com.fofund.boot.jdk8.controller.AlarmController.limiterObj:傻狗',
      'bytes': 'aml5dUxpbWl0OnNlbWFwaG9yZTpmb2Z1bmQtYm9vdC16enRlc3Q6Y29tLmZvZnVuZC5ib290LmpkazguY29udHJvbGxlci5BbGFybUNvbnRyb2xsZXIubGltaXRlck9iajrlgrvni5c=',
    },
    {
      'key': 'staticResourceVersion:sysVersion',
      'bytes': 'c3RhdGljUmVzb3VyY2VWZXJzaW9uOnN5c1ZlcnNpb24=',
    },
    {
      'key': 'trigger:20250627:142:347',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzoxNDI6MzQ3',
    },
    {
      'key': 'trigger:20250627:144:13990',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzoxNDQ6MTM5OTA=',
    },
    {
      'key': 'trigger:20250627:15:215',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzoxNToyMTU=',
    },
    {
      'key': 'trigger:20250627:209:1111111391',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzoyMDk6MTExMTExMTM5MQ==',
    },
    {
      'key': 'trigger:20250627:24:266',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzoyNDoyNjY=',
    },
    {
      'key': 'trigger:20250627:37:573',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzozNzo1NzM=',
    },
    {
      'key': 'trigger:20250627:4:45',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzo0OjQ1',
    },
    {
      'key': 'trigger:20250627:4:49',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzo0OjQ5',
    },
    {
      'key': 'trigger:20250627:58:3440',
      'bytes': 'dHJpZ2dlcjoyMDI1MDYyNzo1ODozNDQw',
    },
    {
      'key': '{jiyuLimit:limiter:bus-frp-agg:com.fofund.frp.agg.domain.service.impl.MarketingPageServiceImpl.sharePageDetail:I77Jba}:permits',
      'bytes': 'e2ppeXVMaW1pdDpsaW1pdGVyOmJ1cy1mcnAtYWdnOmNvbS5mb2Z1bmQuZnJwLmFnZy5kb21haW4uc2VydmljZS5pbXBsLk1hcmtldGluZ1BhZ2VTZXJ2aWNlSW1wbC5zaGFyZVBhZ2VEZXRhaWw6STc3SmJhfTpwZXJtaXRz',
    },
    {
      'key': '{jiyuLimit:limiter:bus-frp-agg:com.fofund.frp.agg.domain.service.impl.MarketingPageServiceImpl.sharePageDetail:I77Jba}:value',
      'bytes': 'e2ppeXVMaW1pdDpsaW1pdGVyOmJ1cy1mcnAtYWdnOmNvbS5mb2Z1bmQuZnJwLmFnZy5kb21haW4uc2VydmljZS5pbXBsLk1hcmtldGluZ1BhZ2VTZXJ2aWNlSW1wbC5zaGFyZVBhZ2VEZXRhaWw6STc3SmJhfTp2YWx1ZQ==',
    },
    {
      'key': '{jiyuLimit:limiter:bus-frp-agg:com.fofund.frp.agg.domain.service.impl.MarketingPageServiceImpl.sharePageDetail:mAfMVv}:permits',
      'bytes': 'e2ppeXVMaW1pdDpsaW1pdGVyOmJ1cy1mcnAtYWdnOmNvbS5mb2Z1bmQuZnJwLmFnZy5kb21haW4uc2VydmljZS5pbXBsLk1hcmtldGluZ1BhZ2VTZXJ2aWNlSW1wbC5zaGFyZVBhZ2VEZXRhaWw6bUFmTVZ2fTpwZXJtaXRz',
    },
    {
      'key': '{jiyuLimit:limiter:bus-frp-agg:com.fofund.frp.agg.domain.service.impl.MarketingPageServiceImpl.sharePageDetail:mAfMVv}:value',
      'bytes': 'e2ppeXVMaW1pdDpsaW1pdGVyOmJ1cy1mcnAtYWdnOmNvbS5mb2Z1bmQuZnJwLmFnZy5kb21haW4uc2VydmljZS5pbXBsLk1hcmtldGluZ1BhZ2VTZXJ2aWNlSW1wbC5zaGFyZVBhZ2VEZXRhaWw6bUFmTVZ2fTp2YWx1ZQ==',
    },
  ]

export const mockGet = [
  {
    'type': 'string',
    'ttl': -1,
    'value': '"巴林"',
    'rawValue': 'IuW3tOaelyI=',
  },
  {
    'type': 'string',
    'ttl': -1,
    'value': '{"Id":"1138313809878695936","ServiceName":"dc.market.shortbondfundavgyield.get","ServiceVersion":"1.0.0","ServiceClass":"com.fofund.ms.dc.handler.basis.market.ShortFundAvgYieldGetHandler","Status":1,"Verify":1,"Name":"获取短债基金近3/6月平均年化收益","ServiceUrl":"http://172.16.113.159:10086/rest","Params":null}',
    'rawValue': 'eyJJZCI6IjExMzgzMTM4MDk4Nzg2OTU5MzYiLCJTZXJ2aWNlTmFtZSI6ImRjLm1hcmtldC5zaG9ydGJvbmRmdW5kYXZneWllbGQuZ2V0IiwiU2VydmljZVZlcnNpb24iOiIxLjAuMCIsIlNlcnZpY2VDbGFzcyI6ImNvbS5mb2Z1bmQubXMuZGMuaGFuZGxlci5iYXNpcy5tYXJrZXQuU2hvcnRGdW5kQXZnWWllbGRHZXRIYW5kbGVyIiwiU3RhdHVzIjoxLCJWZXJpZnkiOjEsIk5hbWUiOiLojrflj5bnn63lgLrln7rph5Hov5EzLzbmnIjlubPlnYflubTljJbmlLbnm4oiLCJTZXJ2aWNlVXJsIjoiaHR0cDovLzE3Mi4xNi4xMTMuMTU5OjEwMDg2L3Jlc3QiLCJQYXJhbXMiOm51bGx9',
  },
  {
    "type": "hash",
    "ttl": -1,
    "value": {
      "10.105.17.19:97744": "1|1749777334036",
      "10.105.17.19:82960": "0|1751021566888"
    },
    "rawValue": {
      "MTAuMTA1LjE3LjE5OjgyOTYw": "MHwxNzUxMDIxNTY2ODg4",
      "MTAuMTA1LjE3LjE5Ojk3NzQ0": "MXwxNzQ5Nzc3MzM0MDM2"
    }
  },
  {
    "type": "hash",
    "ttl": -1,
    "value": {
      "rate": "100",
      "interval": "1000",
      "type": "0"
    },
    "rawValue": {
      "aW50ZXJ2YWw=": "MTAwMA==",
      "cmF0ZQ==": "MTAw",
      "dHlwZQ==": "MA=="
    }
  },
  {
    "type": "list",
    "ttl": -1,
    "value": [
      "Ark-New-List"
    ],
    "rawValue": [
      "QXJrLU5ldy1MaXN0"
    ]
  },
  {
    "type": "set",
    "ttl": -1,
    "value": [
      "Ark-New-Set"
    ],
    "rawValue": [
      "QXJrLU5ldy1TZXQ="
    ]
  },
  {
    "type": "zset",
    "ttl": -1,
    "value": [
      {score: 1, value: "Ark-New-Zset1"},
      {score: 5, value: "Ark-New-Zset5"},
    ],
    "rawValue": [
      "QXJrLU5ldy1ac2V0"
    ]
  }
]

export const mockSlowlog = [
    {time: '2025-07-17 15:31:17', client: '10.106.100.99:57080', command: 'EXISTS bus_jgt_prd_bench_gr_list~lock', cost:  16}
  , {time: '2025-07-17 15:31:17', client: '10.106.100.99:57080', command: 'EXISTS bus_jgt_prd_bench_gr_list~lock', cost:  1600}
  , {time: '2025-07-17 15:31:17', client: '10.106.100.99:57080', command: 'EXISTS bus_jgt_prd_bench_gr_list~lock', cost:  1200}
  , {time: '2025-07-17 15:31:17', client: '10.106.100.99:57080', command: 'EXISTS bus_jgt_prd_bench_gr_list~lock', cost:  160}
  , {time: '2025-07-17 15:31:17', client: '10.106.100.99:57080', command: 'EXISTS bus_jgt_prd_bench_gr_list~lock', cost:  159}
  , {time: '2025-07-17 15:31:17', client: '10.106.100.99:57080', command: 'EXISTS bus_jgt_prd_bench_gr_list~lock', cost:  16}
  , {time: '2025-07-17 14:42:04', client: '10.106.100.99:57080', command: 'HGET pc_fund_mkt_latest 1021130001', cost:  19}
  , {time: '2025-07-17 14:42:04', client: '10.106.100.99:57080', command: 'HGET pc_fund_mkt_latest 1021130001', cost:  19}
  , {time: '2025-07-17 14:42:04', client: '10.106.100.99:57080', command: 'HGET pc_fund_mkt_latest 1021130001', cost:  19}
  , {time: '2025-07-17 14:42:04', client: '10.106.100.99:57080', command: 'HGET pc_fund_mkt_latest 1021130001', cost:  19}
  , {time: '2025-07-17 14:42:04', client: '10.106.100.99:57080', command: 'HGET pc_fund_mkt_latest 1021130001', cost:  19}
  , {time: '2025-07-17 14:42:04', client: '10.106.100.99:57080', command: 'HGET pc_fund_mkt_latest 1021130001', cost:  19}
  , {time: '2025-07-17 14:39:32', client: '10.106.100.94:33182', command: 'CLUSTER NODES', cost:  10}
  , {time: '2025-07-17 14:39:32', client: '10.106.100.94:33182', command: 'CLUSTER NODES', cost:  10}
  , {time: '2025-07-17 14:39:32', client: '10.106.100.94:33182', command: 'CLUSTER NODES', cost:  10}
  , {time: '2025-07-17 14:39:32', client: '10.106.100.94:33182', command: 'CLUSTER NODES', cost:  10}
  , {time: '2025-07-17 14:39:32', client: '10.106.100.94:33182', command: 'CLUSTER NODES', cost:  10}
  , {time: '2025-07-17 14:39:32', client: '10.106.100.94:33182', command: 'CLUSTER NODES', cost:  10}
  , {time: '2025-07-17 14:38:55', client: '10.106.100.99:57080', command: 'HSET pc_fund_mkt_latest 1012324001 ["com.fofund.ocean.domain.bo.PcFundMktLatestLiteBO",{"mktDate":"20250704","derivednMktDate":"20250704"}]', cost:  23000}
  , {time: '2025-07-17 14:38:55', client: '10.106.100.99:57080', command: 'HSET pc_fund_mkt_latest 1012324001 ["com.fofund.ocean.domain.bo.PcFundMktLatestLiteBO",{"mktDate":"20250704","derivednMktDate":"20250704"}]', cost:  2199}
  , {time: '2025-07-17 14:38:55', client: '10.106.100.99:57080', command: 'HSET pc_fund_mkt_latest 1012324001 ["com.fofund.ocean.domain.bo.PcFundMktLatestLiteBO",{"mktDate":"20250704","derivednMktDate":"20250704"}]', cost:  1788}
  , {time: '2025-07-17 14:38:55', client: '10.106.100.99:57080', command: 'HSET pc_fund_mkt_latest 1012324001 ["com.fofund.ocean.domain.bo.PcFundMktLatestLiteBO",{"mktDate":"20250704","derivednMktDate":"20250704"}]', cost:  23}
  , {time: '2025-07-17 14:38:55', client: '10.106.100.99:57080', command: 'HSET pc_fund_mkt_latest 1012324001 ["com.fofund.ocean.domain.bo.PcFundMktLatestLiteBO",{"mktDate":"20250704","derivednMktDate":"20250704"}]', cost:  23}
  , {time: '2025-07-17 14:38:55', client: '10.106.100.99:57080', command: 'HSET pc_fund_mkt_latest 1012324001 ["com.fofund.ocean.domain.bo.PcFundMktLatestLiteBO",{"mktDate":"20250704","derivednMktDate":"20250704"}]', cost:  2300}
]

export const mockApiCommands = [
  {
    command: 'connect',
    param: {
      id: 'test'
    }
  },
  {
    command: 'disconnect',
    param: {
      id: 'test'
    }
  },
  {
    command: 'info',
    param: {
      id: 'test',
      node: null
    }
  },
  {
    command: 'info_list',
    param: {
      id: 'test'
    }
  },
  {
    command: 'node_list',
    param: {
      id: 'test'
    }
  },
  {
    command: 'scan',
    param: {
      id: 'test',
      param: {
        pattern: '*',
        count: 1000,
        scanType: null,
        cursor: {
          readyNodes: [],
          nowNode: '',
          nowCursor: 0,
          finished: false
        },
        loadAll: false
      }
    }
  },
  {
    command: 'get',
    param: {
      id: 'test',
      key: {
        "key": "hepengju:key",
        "bytes": "aGVwZW5nanU6a2V5"
      },
      hash_key: null
    }
  },
  {
    command: 'ttl',
    param: {
      id: 'test',
      key: {
        key: 'hepengju:string',
        bytes: []
      },
      ttl: 10000
    }
  },
  {
    command: 'set',
    param: {
      id: 'test',
      key: {
        key: 'hepengju:string1',
        bytes: []
      },
      value: 'hepengju:string1value1',
      ttl: 10000
    }
  },
  {
    command: 'del',
    param: {
      id: 'test',
      key: {
        key: 'hepengju:string1',
        bytes: []
      },
    }
  },
  {
    command: 'field_add',
    param: {
      id: 'test',
      param: {
        key: {
          key: 'hepengju:key',
          bytes: []
        },
        bytes: [],
        mode: 'key',
        type: 'hash',
        ttl: -1,
        value: '',
        listPushMethod: 'lpush',
        fieldValueList: [
          {
            fieldKey: 'k01',
            fieldValue: 'v01',
            fieldScore: 0.1
          },
          {
            fieldKey: 'k02',
            fieldValue: 'v02',
            fieldScore: 0.2
          }
        ],
      }
    }
  },
  {
    command: 'field_set',
    param: {
      id: 'test',
      param: {
        key: {
          key: 'hepengju:key',
          bytes: []
        },
        srcFieldKey: 'k01',
        srcFieldValue: 'v01',

        fieldIndex: 0,
        fieldKey: 'k011',
        fieldValue: 'v011',
        fieldScore: 0.1
      }
    }
  },
  {
    command: 'field_del',
    param: {
      id: 'test',
      param: {
        key: {
          key: 'hepengju:key',
          bytes: []
        },
        fieldIndex: 0,
        fieldKey: 'k011',
        fieldValue: 'v011',
      }
    }
  },
  {
    command: 'execute_command',
    param: {
      id: 'test',
      param: {
        command: 'cluster nodes',
        node: null,
        autoBroadcast: true
      }
    }
  },
  {
    command: 'config_get',
    param: {
      id: 'test',
      pattern: 'save',
      node: null,
    }
  },
  {
    command: 'config_set',
    param: {
      id: 'test',
      key: 'save',
      value: '3600 3 300 100 60 10000',
      node: null,
    }
  },
  {
    command: 'slow_log',
    param: {
      id: 'test',
      count: 10,
      node: null,
    }
  },
  {
    command: 'memory_usage',
    param: {
      id: 'test',
      param: {
        pattern: '*',
        sizeLimit: 1,
        countLimit: 100,
        scanCount: 1000,
        scanTotal: 10000,
        sleepMillis: 0
      }
    }
  },
  {
    command: 'client_list',
    param: {
      id: 'test',
      node: null,
      clientType: null
    }
  },

  {
    command: 'publish',
    param: {
      id: 'test',
      channel: 'channel',
      message: 'message'
    }
  },
  {
    command: 'subscribe',
    param: {
      id: 'test',
      channel: '',
    }
  },
  {
    command: 'subscribe_stop',
    param: {
      id: 'test',
    }
  },
  {
    command: 'monitor',
    param: {
      id: 'test',
      node: null,
    }
  },
  {
    command: 'monitor_stop',
    param: {
      id: 'test',
      node: null,
    }
  },
  {
    command: 'mock_data',
    param: {
      id: 'test',
      count: 10
    }
  },
]