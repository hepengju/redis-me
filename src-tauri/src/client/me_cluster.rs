use crate::client::me_client::*;
use crate::client::ops::acl::build_acl_setuser_cmd;
use crate::client::ops::exp::{export_cmd_0_thread, export_csv_0_thread};
use crate::client::ops::imp::{import_cmd_0_thread, import_csv_0_thread};
use crate::client::ops::info::{parse_client_info, redis_value_to_log};
use crate::client::ops::key_scan::{batch_key0, scan_0_batch_count, scan_0_exact, scan_1_cmd};
use crate::client::ops::notify::{build_notify_patterns, notify_subscribe_node0};
use crate::client::ops::pubsub::{monitor0, subscribe0};
use crate::client::ops::search::SearchCmd;
use crate::client::state::MeBase;
use crate::me_client_forwards;
use crate::model::*;
use crate::net::conn::{
    get_client_cluster, get_client_single, init_cluster_connection, init_single_connection,
    set_client_name_unless_minimal,
};
use crate::support::capabilities::detect_server_capabilities;
use crate::support::command_log::LoggingClusterConnection;
use crate::support::convert::{tuple_to_key_size, ui_key_list};
use crate::support::error::AppError;
use crate::support::format::parse_command;
use crate::support::tty::redis_value_to_cli_display;
use crate::support::util::*;
use Ordering::Relaxed;
use anyhow::bail;
use chrono::Utc;
use log::{debug, info, warn};
use parking_lot::{Mutex, MutexGuard};
use redis::cluster::{ClusterClient, ClusterConfig, ClusterConnection, ClusterPipeline};
use redis::cluster_routing::RoutingInfo::SingleNode;
use redis::cluster_routing::SingleNodeRoutingInfo::ByAddress;
use redis::cluster_routing::{
    MultipleNodeRoutingInfo, ResponsePolicy, RoutingInfo, SingleNodeRoutingInfo,
};
use redis::{Commands, ConnectionLike, FromRedisValue, Value};
use std::collections::HashMap;
use std::ops::Deref;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

pub struct MeCluster {
    base: MeBase,
    client: ClusterClient,
    conn: Mutex<LoggingClusterConnection>,
    node_list: Vec<RedisNode>,
}

impl Deref for MeCluster {
    type Target = MeBase;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

impl Drop for MeCluster {
    fn drop(&mut self) {
        // 未订阅不要 get_conn：空闲超过检查间隔会探活，过久或已关闭会直接重连，关闭时白开一条连接。
        if self.subscribe_running.load(Relaxed) {
            self.subscribe_stop().unwrap_or(());
        }
        if self.notify_running.load(Relaxed) {
            self.notify_subscribe_stop().unwrap_or(());
        }
        self.monitor_stop().unwrap_or(());
        self.export_import_running.store(false, Relaxed);
    }
}

impl SearchCmd for LoggingClusterConnection {
    fn search_cmd(&mut self, cmd: &redis::Cmd) -> redis::RedisResult<Value> {
        // 没有键，query() 会按参数算槽。打到任意主节点，由 Redis 8 协调器处理。
        let route = RoutingInfo::SingleNode(SingleNodeRoutingInfo::RandomPrimary);
        self.route_command(cmd, route)
    }
}

impl MeClient for MeCluster {
    fn base(&self) -> &MeBase {
        &self.base
    }

    fn db_list(&self) -> AnyResult<Vec<RedisDB>> {
        Ok(vec![])
    }

    fn select_db(&self, db: u16) -> AnyResult<()> {
        if self.db.load(Relaxed) == db {
            return Ok(());
        }
        bail!(AppError::ClusterDbSwitchNotSupported);
    }

    fn info(&self, node: Option<String>) -> AnyResult<RedisInfo> {
        let mut conn = self.get_conn()?;
        let (route, exec_node) = self.get_node_route(node)?;
        let value = conn.route_command(&redis::cmd("info"), route)?;
        let info: String = FromRedisValue::from_redis_value(value)?;
        Ok(RedisInfo {
            node: exec_node,
            info,
        })
    }

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
                let hit = if filter.contains(':') {
                    redis_node.node == filter
                } else {
                    redis_node.flags.contains(filter)
                };
                if !hit {
                    continue;
                }
            }
            let node = redis_node.node.clone();
            let (route, _) = self.get_node_route(Some(node.clone()))?;
            let value = conn.route_command(&redis::cmd("info"), route)?;
            let info: String = FromRedisValue::from_redis_value(value)?;
            infos.push(RedisInfo { node, info })
        }
        Ok(infos)
    }

    fn node_list(&self) -> AnyResult<Vec<RedisNode>> {
        Ok(self.node_list.clone())
    }

    fn scan(&self, param: ScanParam) -> AnyResult<ScanResult> {
        let mut conn = self.get_conn()?;

        // exact=true → EXISTS；否则 SCAN
        if let Some(result) = scan_0_exact(&mut conn, &param.pattern, param.exact)? {
            return Ok(result);
        }

        // RedisCluster目前不能直接扫描SCAN, 参考Issue进行多个节点处理
        // 参考: https://github.com/redis-rs/redis-rs/pull/1233/commits/997df1834d1bfccdbd56827d39fc4cf08874efec
        // Error: This command cannot be safely routed in cluster mode- ClientError
        // let keys: Vec<String> = conn.scan_options(opts)?.collect();
        let mut cc = param.cursor.unwrap_or_default();
        let batch_count = scan_0_batch_count(param.count);

        let mut keys: Vec<Vec<u8>> = vec![];

        // 遍历集群节点: 仅扫描主节点
        let nodes: Vec<String> = self.get_node_list_master();
        let node_count = nodes.len();

        for node in nodes {
            if cc.ready_nodes.contains(&node) {
                continue; // 扫描过的予以跳过
            }
            cc.now_node = node.clone();

            let (route, _) = self.get_node_route(Some(node.clone()))?;

            // 正在扫描的节点则重置上次游标
            let cursor = if cc.now_node == node {
                cc.now_cursor
            } else {
                0
            };

            let cmd = scan_1_cmd(cursor, &param.pattern, batch_count, param.scan_type.clone());
            let value = conn.route_command(&cmd, route.clone())?;
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                FromRedisValue::from_redis_value(value)?;
            keys.extend(new_keys);

            cc.now_cursor = next_cursor;
            if next_cursor == 0 {
                cc.ready_nodes.push(node.clone());
            }
            break;
        }

        // 判断是否扫描完毕
        if cc.ready_nodes.len() == node_count {
            cc.finished = true;
            cc.now_node = "".to_string();
            cc.now_cursor = 0;
        }

        Ok(ScanResult {
            cursor: cc,
            key_list: ui_key_list(keys),
        })
    }

    fn rename(&self, key: RedisKey, new_key: RedisKey) -> AnyResult<RedisKey> {
        // https://redis.ac.cn/docs/latest/commands/rename/
        // Redis Cluster 原生 RENAME 要求 key/newkey 在同一 hash slot。
        // 为了支持跨 slot 的“无感重命名”，这里改用 DUMP + RESTORE + DEL 方案。

        // 防止同名重命名导致 restore 后又 del 自己
        if key.to_bytes() == new_key.to_bytes() {
            return Ok(new_key.to_normal());
        }

        let mut conn = self.get_conn()?;
        // 保留毫秒级 TTL（-1 永久键、-2 不存在键）
        let ttl_ms: i64 = conn.pttl(&key)?;
        let restore_ttl = if ttl_ms > 0 { ttl_ms } else { 0 };

        // 优先使用连接封装；DUMP/RESTORE 在当前库中通过命令执行
        let dump_value: Vec<u8> = redis::cmd("dump").arg(&key).query(&mut *conn)?;
        let _: () = redis::cmd("restore")
            .arg(&new_key)
            .arg(restore_ttl)
            .arg(dump_value)
            .arg("replace")
            .query(&mut *conn)?;

        // 删除旧键，实现“重命名”效果
        let _: () = conn.del(&key)?;
        Ok(new_key.to_normal())
    }

    fn copy(&self, param: RedisCopyParam) -> AnyResult<RedisKey> {
        // https://redis.io/docs/latest/commands/copy/
        // Cluster 原生 COPY 要求 source/destination 同一 hash slot。
        // 跨 slot 时用 DUMP + RESTORE 实现（保留源键，目标已存在时由 exists 前置拦截，不用 REPLACE）。

        let dest = &param.destination;
        let mut conn = self.get_conn()?;

        if conn.exists(dest)? {
            bail!(AppError::KeyAlreadyExists {
                key: vec8_to_display_string(dest.to_bytes())
            });
        }

        let ttl_ms: i64 = conn.pttl(&param.source)?;
        let restore_ttl = if ttl_ms > 0 { ttl_ms } else { 0 };

        let dump_value: Vec<u8> = redis::cmd("dump").arg(&param.source).query(&mut *conn)?;
        let _: () = redis::cmd("restore")
            .arg(dest)
            .arg(restore_ttl)
            .arg(dump_value)
            .query(&mut *conn)?;

        Ok(param.destination.to_normal())
    }

    fn execute_command(&self, param: RedisCommand) -> AnyResult<String> {
        let (cmd_name, args) = parse_command(param.command.as_str())?;
        if cmd_name.is_empty() {
            return Ok("".into());
        };

        let mut conn = self.get_conn()?;

        let mut cmd = redis::cmd(cmd_name.as_str());
        cmd.arg(&args);

        let value = if param.node.as_deref().unwrap_or("").is_empty()
            && param.auto_broadcast.unwrap_or(false)
        {
            conn.req_command(&cmd)?
        } else {
            let (route, _) = self.get_node_route(param.node)?;
            conn.route_command(&cmd, route)?
        };
        Ok(redis_value_to_cli_display(
            value,
            param.output_mode,
            &cmd_name,
            &args,
        ))
    }

    fn config_get(
        &self,
        pattern: &str,
        node: Option<String>,
    ) -> AnyResult<HashMap<String, String>> {
        let cmd = resolve_command_name(&self.conf, "config");
        let mut conn = self.get_conn()?;
        let (route, _) = self.get_node_route(node)?;
        let mut cfg = redis::cmd(&cmd);
        let cfg_cmd = cfg.arg("get").arg(pattern);
        let value = conn.route_command(cfg_cmd, route)?;
        let result: HashMap<String, String> = FromRedisValue::from_redis_value(value)?;
        Ok(result)
    }

    fn config_set(&self, key: &str, value: &str, node: Option<String>) -> AnyResult<()> {
        let cmd = resolve_command_name(&self.conf, "config");
        let mut conn = self.get_conn()?;
        if "*" == node.clone().unwrap_or_default() {
            let route = RoutingInfo::MultiNode((
                MultipleNodeRoutingInfo::AllNodes,
                Some(ResponsePolicy::AllSucceeded),
            ));
            let mut cfg = redis::cmd(&cmd);
            let cfg_cmd = cfg.arg("set").arg(key).arg(value);
            let _ = conn.route_command(cfg_cmd, route)?;
        } else {
            let (route, _) = self.get_node_route(node)?;
            let mut cfg = redis::cmd(&cmd);
            let cfg_cmd = cfg.arg("set").arg(key).arg(value);
            let _ = conn.route_command(cfg_cmd, route)?;
        }
        Ok(())
    }

    fn slow_log(&self, count: Option<u64>, node: Option<String>) -> AnyResult<Vec<RedisSlowLog>> {
        let mut conn = self.get_conn()?;
        let mut logs = vec![];
        for redis_node in &self.node_list {
            // 如果参数中包含节点参数，则只返回指定节点的慢日志
            if let Some(ref n) = node
                && !n.is_empty()
                && n != &redis_node.node
            {
                continue;
            }

            let node = redis_node.node.clone();
            let (route, _) = self.get_node_route(Some(node.clone()))?;
            let mut slow = redis::cmd("slowlog");
            let slow_cmd = slow.arg("get").arg(count.unwrap_or(128));
            let value_total = conn.route_command(slow_cmd, route)?;
            let value_list: Vec<Value> = FromRedisValue::from_redis_value(value_total)?;
            for value in value_list {
                let log = redis_value_to_log(value, &node)?;
                logs.push(log);
            }
        }
        Ok(logs)
    }

    fn memory_usage_keys(
        &self,
        keys: &[RedisKey],
        size_limit: u64,
        need_key_type: bool,
    ) -> AnyResult<Vec<RedisKeySize>> {
        if keys.is_empty() {
            return Ok(vec![]);
        }
        let mut conn = self.get_conn()?;
        let mut pipe = ClusterPipeline::with_capacity(keys.len());
        for key in keys {
            pipe.cmd("memory").arg("usage").arg(key.to_bytes());
        }
        // Option：键可能已删除或过期
        let sizes: Vec<Option<u64>> = conn.cluster_pipe_query(&pipe, keys.len())?;
        let mut out: Vec<(Vec<u8>, u64, String)> = vec![];
        for (index, size) in sizes.into_iter().enumerate() {
            if let Some(size) = size
                && size >= size_limit
            {
                out.push((keys[index].to_bytes().to_vec(), size, "unknown".into()));
            }
        }
        if need_key_type && !out.is_empty() {
            let mut pipe = ClusterPipeline::with_capacity(out.len());
            for key in out.iter() {
                pipe.cmd("type").arg(&key.0);
            }
            let types: Vec<Option<String>> = conn.cluster_pipe_query(&pipe, out.len())?;
            for (index, key_type) in types.into_iter().enumerate() {
                out[index].2 = key_type.unwrap_or("deleted".into());
            }
        }
        Ok(tuple_to_key_size(out))
    }

    /// 列表右侧内存列。ClusterPipeline 按槽拆开；默认 SAMPLES，不扫完整集合。
    fn key_memory(&self, keys: Vec<RedisKey>) -> AnyResult<Vec<Option<u64>>> {
        if !self.base().capabilities.memory_usage_supported {
            bail!("MEMORY USAGE is not supported");
        }
        if keys.is_empty() {
            return Ok(vec![]);
        }
        let mut conn = self.get_conn()?;
        let mut pipe = ClusterPipeline::with_capacity(keys.len());
        for key in &keys {
            pipe.cmd("memory").arg("usage").arg(key.to_bytes());
        }
        let sizes: Vec<Option<u64>> = conn.cluster_pipe_query(&pipe, keys.len())?;
        Ok(sizes)
    }

    fn client_list(
        &self,
        node: Option<String>,
        client_type: Option<String>,
    ) -> AnyResult<Vec<RedisClientInfo>> {
        let mut conn = self.get_conn()?;

        let mut clients = vec![];
        for redis_node in &self.node_list {
            // 如果参数中包含节点参数，则只返回指定节点的慢日志
            if let Some(ref node_limit) = node
                && !node_limit.is_empty()
                && *node_limit != redis_node.node
            {
                continue;
            }
            let node = redis_node.node.clone();
            let (route, _) = self.get_node_route(Some(node.clone()))?;

            let mut cmd = redis::cmd("client");
            cmd.arg("list");
            if let Some(ref client_type_val) = client_type
                && !client_type_val.is_empty()
            {
                cmd.arg("type").arg(client_type_val);
            }
            let value = conn.route_command(&cmd, route)?;
            let client: String = FromRedisValue::from_redis_value(value)?;
            for client_info in client.lines() {
                let client: RedisClientInfo = parse_client_info(client_info)?;
                clients.push(client);
            }
        }
        Ok(clients)
    }

    fn subscribe(&self, channel: Option<String>) -> AnyResult<()> {
        let (client, _) = get_client_single(
            &self.conf,
            self.connection_timeout,
            false,
            // 复用集群 Client 上的 SSH 会话，不要再 SshDialer::connect
            self.client.dialer(),
        )?;
        let conn = init_single_connection(
            &client,
            self.conf.db,
            self.connection_timeout,
            self.command_timeout,
            &self.conf,
        )?;
        // 订阅长连接：建连后去掉读写超时，否则空闲超过读写超时会断流
        conn.set_read_timeout(None)?;
        conn.set_write_timeout(None)?;
        let running = self.subscribe_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        subscribe0(conn, running, app_handle, channel, self.id.clone(), logger)
    }

    fn monitor(&self, node: &str) -> AnyResult<()> {
        // 集群中的monitor命令是针对单个节点的，所以需要获取该节点的连接
        let mut conf = self.conf.clone();
        if let Some((host, port)) = node.split_once(":") {
            conf.host = host.to_string();
            conf.port = port.parse::<u16>()?;
        }
        let (client, _) =
            // 复用集群上的 SSH 会话
            get_client_single(&conf, self.connection_timeout, false, self.client.dialer())?;
        let conn = init_single_connection(
            &client,
            conf.db,
            self.connection_timeout,
            self.command_timeout,
            &conf,
        )?;
        conn.set_read_timeout(None)?;
        conn.set_write_timeout(None)?;
        let running = self.monitor_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        monitor0(conn, running, app_handle, self.id.clone(), logger)
    }

    fn notify_subscribe(&self, param: NotifySubscribeParam) -> AnyResult<()> {
        // 集群：通知按节点本地产生，对每个 master 各开一条专用连接、各起一个线程，共用 notify_running
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        let patterns =
            build_notify_patterns(&param.perspective, param.db, param.pattern.as_deref());
        for node in self.get_node_list_master() {
            let mut conf = self.conf.clone();
            if let Some((host, port)) = node.split_once(":") {
                conf.host = host.to_string();
                conf.port = port.parse::<u16>()?;
            }
            let (client, _) =
                // 复用集群上的 SSH 会话
                get_client_single(&conf, self.connection_timeout, false, self.client.dialer())?;
            let conn = init_single_connection(
                &client,
                conf.db,
                self.connection_timeout,
                self.command_timeout,
                &conf,
            )?;
            // 订阅长连接：建连后去掉读写超时，否则空闲超过读写超时会断流
            conn.set_read_timeout(None)?;
            conn.set_write_timeout(None)?;
            notify_subscribe_node0(
                conn,
                self.notify_running.clone(),
                app_handle.clone(),
                patterns.clone(),
                self.id.clone(),
                node.clone(),
                logger.clone(),
            )?;
        }
        Ok(())
    }

    fn batch_del(&self, param: RedisBatchKey) -> AnyResult<()> {
        let key_list = batch_key0(self, param, false)?;
        if key_list.is_empty() {
            return Ok(());
        }

        let size = key_list.len();
        let mut pipe = ClusterPipeline::with_capacity(size);
        for key in key_list {
            pipe.del(&key).ignore();
        }
        let mut conn = self.get_conn()?;
        let _: () = conn.cluster_pipe_query(&pipe, size)?;
        info!("batch delete finished: {}", size);
        Ok(())
    }

    fn batch_ttl(&self, param: RedisBatchTtl) -> AnyResult<()> {
        if param.key_list.is_empty() {
            return Ok(());
        }

        let size = param.key_list.len();
        let mut pipe = ClusterPipeline::with_capacity(size);
        for key in param.key_list {
            if param.ttl > 0 {
                pipe.expire(&key, param.ttl).ignore();
            } else {
                pipe.persist(&key).ignore();
            }
        }
        let mut conn = self.get_conn()?;
        let _: () = conn.cluster_pipe_query(&pipe, size)?;
        info!("batch ttl finished: {}", size);
        Ok(())
    }

    fn export_csv(&self, param: RedisExportCsv) -> AnyResult<()> {
        let key_list = batch_key0(self, param.clone().into(), true)?;
        let conn = self.get_new_conn()?;
        let logger = self.base().command_logger.clone();
        let db_index = self.db.load(Relaxed);
        let mut logging_conn = LoggingClusterConnection::new(conn, logger, db_index);
        let running = self.export_import_check_running()?;
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        let export_format = param.export_format.clone();
        let file = param.file.clone();
        let with_ttl = param.with_ttl;
        thread::spawn(move || {
            if export_format == "cmd" {
                export_cmd_0_thread(
                    &mut logging_conn,
                    key_list,
                    file,
                    with_ttl,
                    running,
                    app_handle,
                    id,
                );
            } else {
                export_csv_0_thread(
                    &mut logging_conn,
                    key_list,
                    file,
                    with_ttl,
                    running,
                    app_handle,
                    id,
                );
            }
        });
        Ok(())
    }

    fn import_csv(&self, param: RedisImportCsv) -> AnyResult<()> {
        let conn = self.get_new_conn()?;
        let logger = self.base().command_logger.clone();
        let db_index = self.db.load(Relaxed);
        let mut logging_conn = LoggingClusterConnection::new(conn, logger, db_index);
        let running = self.export_import_check_running()?;
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        thread::spawn(move || {
            import_csv_0_thread(&mut logging_conn, param, running, app_handle, id)
        });
        Ok(())
    }

    fn import_cmd(&self, file: String) -> AnyResult<()> {
        let conn = self.get_new_conn()?;
        let logger = self.base().command_logger.clone();
        let db_index = self.db.load(Relaxed);
        let mut logging_conn = LoggingClusterConnection::new(conn, logger, db_index);
        let running = self.export_import_check_running()?;
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        thread::spawn(move || {
            import_cmd_0_thread(&mut logging_conn, file, running, app_handle, id)
        });
        Ok(())
    }

    fn key_slot(&self, key: RedisKey) -> AnyResult<u64> {
        let mut conn = self.get_conn()?;
        let slot: u64 = redis::cmd("CLUSTER")
            .arg("KEYSLOT")
            .arg(&key)
            .query(&mut conn)?;
        Ok(slot)
    }

    fn key_node(&self, key: RedisKey) -> AnyResult<Vec<RedisNode>> {
        // 1. 获取键的槽位
        let slot = self.key_slot(key.clone())?;

        // 2. 获取槽位分配信息
        // CLUSTER SLOTS 返回格式:
        // [[start_slot, end_slot, [master_host, master_port, master_id], [replica_host, replica_port, replica_id], ...], ...]
        let mut conn = self.get_conn()?;
        let slots_info: Vec<Value> = redis::cmd("CLUSTER").arg("SLOTS").query(&mut conn)?;

        // 3. 匹配槽位范围
        for slot_entry in slots_info {
            if let Value::Array(ref slot_data) = slot_entry
                && slot_data.len() >= 3
                && let (Value::Int(start), Value::Int(end)) = (&slot_data[0], &slot_data[1])
                && (*start as u64) <= slot
                && slot <= (*end as u64)
            {
                // 找到了！解析所有节点（主 + 从）
                let mut nodes = Vec::new();

                // 从索引2开始是节点信息，索引2是主节点，之后是从节点
                for (i, node_entry) in slot_data.iter().enumerate().skip(2) {
                    if let Value::Array(node_info) = node_entry
                        && node_info.len() >= 3
                    {
                        let host = redis_value_to_string(node_info[0].clone(), "");
                        let port = match &node_info[1] {
                            Value::Int(p) => *p as u16,
                            _ => continue,
                        };
                        let id = redis_value_to_string(node_info[2].clone(), "");
                        let node_addr = format!("{}:{}", host, port);
                        let is_master = i == 2;
                        let flags = if is_master {
                            "master".into()
                        } else {
                            "slave".into()
                        };

                        nodes.push(RedisNode {
                            id,
                            node: node_addr,
                            flags,
                            slots: None,
                            slave_of_node: None,
                        });
                    }
                }

                if !nodes.is_empty() {
                    return Ok(nodes);
                }
            }
        }

        // 未找到
        bail!(AppError::KeyNodeNotFound { key: key.into() })
    }

    fn acl_setuser(&self, param: AclSetuserParam) -> AnyResult<()> {
        self.acl_route_all_nodes(build_acl_setuser_cmd(&param)?)
    }

    fn acl_deluser(&self, usernames: Vec<String>) -> AnyResult<usize> {
        let mut cmd = redis::cmd("ACL");
        cmd.arg("DELUSER");
        for name in &usernames {
            cmd.arg(name);
        }
        self.acl_route_all_nodes(cmd)?;
        Ok(usernames.len())
    }

    fn acl_save(&self) -> AnyResult<()> {
        let mut cmd = redis::cmd("ACL");
        cmd.arg("SAVE");
        self.acl_route_all_nodes(cmd)
    }

    fn acl_load(&self) -> AnyResult<()> {
        let mut cmd = redis::cmd("ACL");
        cmd.arg("LOAD");
        self.acl_route_all_nodes(cmd)
    }

    fn acl_log_reset(&self) -> AnyResult<()> {
        let mut cmd = redis::cmd("ACL");
        cmd.arg("LOG").arg("RESET");
        self.acl_route_all_nodes(cmd)
    }

    fn mock_data(&self, count: u64) -> AnyResult<()> {
        let mut pipe = ClusterPipeline::with_capacity(count as usize);
        for _ in 0..count {
            let key = format!("redis-me-mock:string:{}", random_string(10));
            pipe.set(&key, random_string(10)).ignore();

            let field_count = random_range(3, 200);
            let key = format!("redis-me-mock:hash:{}", random_string(10));
            for x in 0..field_count {
                pipe.hset(&key, format!("key{x}"), random_string(10))
                    .ignore();
            }

            let key = format!("redis-me-mock:list:{}", random_string(10));
            for _ in 0..field_count {
                pipe.rpush(&key, random_string(10)).ignore();
            }

            let key = format!("redis-me-mock:set:{}", random_string(10));
            for _ in 0..field_count {
                pipe.sadd(&key, random_string(10)).ignore();
            }

            let key = format!("redis-me-mock:zset:{}", random_string(10));
            for _ in 0..field_count {
                pipe.zadd(&key, random_string(10), random_range(1, 100))
                    .ignore();
            }
        }

        let mut conn = self.get_conn()?;
        // 命令条数随 mock 字段数变化，汇总日志用估算值即可
        let _: () = conn.cluster_pipe_query(&pipe, count as usize * 50)?;
        Ok(())
    }

    me_client_forwards!();

    fn search_index_names(&self) -> AnyResult<Vec<String>> {
        use crate::client::ops::search::list_index_names;

        let mut conn = self.get_conn()?;
        list_index_names(&mut *conn)
    }

    fn search_index_list(&self) -> AnyResult<Vec<SearchIndexInfo>> {
        use crate::client::ops::search::list_indexes;

        let mut conn = self.get_conn()?;
        list_indexes(&mut *conn)
    }

    fn search_query(&self, param: SearchQueryParam) -> AnyResult<SearchQueryResult> {
        use crate::client::ops::search::run_search;

        let mut conn = self.get_conn()?;
        run_search(&mut *conn, &param)
    }

    fn search_sample_load(&self, kind: String) -> AnyResult<SearchSampleResult> {
        use crate::client::ops::search::run_sample_load;

        let mut conn = self.get_conn()?;
        run_sample_load(&mut *conn, &kind)
    }

    fn search_index_drop(&self, index: String, delete_docs: bool) -> AnyResult<()> {
        use crate::client::ops::search::run_index_drop;

        let mut conn = self.get_conn()?;
        run_index_drop(&mut *conn, &index, delete_docs)
    }

    fn search_index_create(&self, command: String) -> AnyResult<()> {
        use crate::client::ops::search::run_index_create;

        let mut conn = self.get_conn()?;
        run_index_create(&mut *conn, &command)
    }

    fn search_index_alter(&self, command: String) -> AnyResult<()> {
        use crate::client::ops::search::run_index_alter;

        let mut conn = self.get_conn()?;
        run_index_alter(&mut *conn, &command)
    }

    fn search_tag_vals(&self, index: String, field: String) -> AnyResult<Vec<String>> {
        use crate::client::ops::search::run_tag_vals;

        let mut conn = self.get_conn()?;
        run_tag_vals(&mut *conn, &index, &field)
    }

    fn search_syn_dump(&self, index: String) -> AnyResult<Vec<SearchSynGroup>> {
        use crate::client::ops::search::run_syn_dump;

        let mut conn = self.get_conn()?;
        run_syn_dump(&mut *conn, &index)
    }

    fn search_syn_update(&self, index: String, group: String, terms: Vec<String>) -> AnyResult<()> {
        use crate::client::ops::search::run_syn_update;

        let mut conn = self.get_conn()?;
        run_syn_update(&mut *conn, &index, &group, &terms)
    }
}

// 个性化方法
impl MeCluster {
    /// 建连并完成客户端名和能力探测，返回可给前端用的集群客户端。
    pub fn init(
        redis_conn: &ConnConfig,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<Box<dyn MeClient>> {
        let client = get_client_cluster(redis_conn, connect_timeout, false)?;
        let mut base = MeBase::from(redis_conn);
        base.connection_timeout = connect_timeout;
        base.command_timeout = command_timeout;
        let logger = base.command_logger.clone();
        let db = redis_conn.db;
        // 阶段 1 建连验证 + 阶段 2 正式命令超时；验证通过后复用同一条 TCP（#155）
        let mut conn = LoggingClusterConnection::new(
            init_cluster_connection(&client, connect_timeout, command_timeout, redis_conn)?,
            logger,
            db,
        );
        set_client_name_unless_minimal(&mut conn, redis_conn);
        detect_server_capabilities(&mut conn, &mut base, true);
        base.capabilities.redis_search_supported = Self::ft_list_on_primary(&mut conn);
        base.capabilities.memory_usage_supported = Self::memory_usage_on_primary(&mut conn);
        info!("服务能力: {:?}", base.capabilities);
        let cluster_nodes: String = redis::cmd("cluster").arg("nodes").query(&mut conn)?;
        let node_list = Self::parse_node_list(cluster_nodes)?;
        info!("Redis集群连接初始化成功: {}", redis_conn.name);

        Ok(Box::new(MeCluster {
            base,
            client,
            conn: Mutex::new(conn),
            node_list,
        }))
    }

    /// 重连或辅助连接：按建连超时建一条 TCP，建好后再切到正式命令超时。
    fn new_raw_conn(
        client: &ClusterClient,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<ClusterConnection> {
        let cc = ClusterConfig::new()
            .set_connection_timeout(connect_timeout)
            .set_response_timeout(connect_timeout);
        let conn = client.get_connection_with_config(cc)?;
        conn.set_read_timeout(Some(command_timeout))?;
        conn.set_write_timeout(Some(command_timeout))?;
        Ok(conn)
    }

    /// 丢掉当前连接，重新建连并写回客户端名。
    /// 成功后刷新 `last_check_time`，下一轮取连接在检查间隔内直接复用。
    fn reconnect(&self) -> AnyResult<()> {
        let raw_conn =
            Self::new_raw_conn(&self.client, self.connection_timeout, self.command_timeout)?;
        let mut conn_guard = self.conn.lock();
        *conn_guard = LoggingClusterConnection::new(
            raw_conn,
            self.command_logger.clone(),
            self.db.load(Relaxed),
        );
        set_client_name_unless_minimal(&mut *conn_guard, &self.conf);
        self.last_check_time.store(Utc::now().timestamp(), Relaxed);
        info!("Redis集群连接重连成功: {}", self.conf.name);
        Ok(())
    }

    /// 拿当前连接。策略见 `conn_reuse`：短间隔直接用，中间档 PING，过久或已关闭则直接重连。
    fn get_conn(&'_ self) -> AnyResult<MutexGuard<'_, LoggingClusterConnection>> {
        get_checked_conn(
            || self.conn.try_lock_for(CONNECTION_LOCK_TIMEOUT),
            &self.last_check_time,
            |conn| self.check_connection_timeout(conn),
            || self.reconnect(),
        )
    }

    /// ACL 写操作：显式广播到集群所有节点（ACL 不会自动同步）
    fn acl_route_all_nodes(&self, cmd: redis::Cmd) -> AnyResult<()> {
        let mut conn = self.get_conn()?;
        let route = RoutingInfo::MultiNode((
            MultipleNodeRoutingInfo::AllNodes,
            Some(ResponsePolicy::AllSucceeded),
        ));
        let _: Value = conn.route_command(&cmd, route)?;
        Ok(())
    }

    /// 用较短超时做一次存活探测，通过后把读写超时改回正式命令超时。
    fn check_connection_timeout(&self, conn: &mut LoggingClusterConnection) -> AnyResult<bool> {
        conn.set_read_timeout(Some(CONNECTION_CHECK_TIMEOUT))?;
        conn.set_write_timeout(Some(CONNECTION_CHECK_TIMEOUT))?;
        if conn.check_connection() {
            conn.set_read_timeout(Some(self.command_timeout))?;
            conn.set_write_timeout(Some(self.command_timeout))?;
            debug!("检查Redis集群连接正常: {}", self.conf.name);
            Ok(true)
        } else {
            warn!("检查Redis集群连接异常: {}", self.conf.name);
            Ok(false)
        }
    }

    /// 另建一条连接，给导入导出这类后台线程用，不经过命令日志包装。
    fn get_new_conn(&self) -> AnyResult<ClusterConnection> {
        let mut conn =
            Self::new_raw_conn(&self.client, self.connection_timeout, self.command_timeout)?;
        set_client_name_unless_minimal(&mut conn, &self.conf);
        Ok(conn)
    }

    // 获取节点路由
    fn get_node_route(&self, node: Option<String>) -> AnyResult<(RoutingInfo, String)> {
        if let Some(node) = node.filter(|n| !n.is_empty()) {
            if let Some((host, port)) = node.split_once(":") {
                let route = SingleNode(ByAddress {
                    host: host.into(),
                    port: port.parse::<u16>()?,
                });
                return Ok((route, node));
            }
            bail!(AppError::InvalidNodeFormat { node });
        }

        if self.node_list.is_empty() {
            return Ok((
                RoutingInfo::SingleNode(SingleNodeRoutingInfo::RandomPrimary),
                String::new(),
            ));
        }

        let node = random_item(&self.node_list).node.clone();

        if let Some((host, port)) = node.split_once(":") {
            let route = SingleNode(ByAddress {
                host: host.into(),
                port: port.parse::<u16>()?,
            });
            Ok((route, node))
        } else {
            bail!(AppError::InvalidNodeFormat { node })
        }
    }

    // 获取主节点列表
    fn get_node_list_master(&self) -> Vec<String> {
        self.node_list
            .iter()
            .filter(|node| node.flags.contains("master"))
            .map(|node| node.node.clone())
            .collect::<Vec<String>>()
    }

    /// MEMORY USAGE 的键不在第一个参数，query() 会按错误的槽路由。打到任意 master 探测。
    fn memory_usage_on_primary(conn: &mut LoggingClusterConnection) -> bool {
        let route = RoutingInfo::SingleNode(SingleNodeRoutingInfo::RandomPrimary);
        let mut cmd = redis::cmd("memory");
        cmd.arg("usage").arg(b"__redis_me_memory_probe__");
        match conn.route_command(&cmd, route) {
            Ok(_) => true,
            Err(e) => {
                info!("MEMORY USAGE 不可用: {e}");
                false
            }
        }
    }

    /// FT._LIST 没有键。建连时尚无节点表，打到任意 master，能执行才算装了 RedisSearch。
    fn ft_list_on_primary(conn: &mut LoggingClusterConnection) -> bool {
        let route = RoutingInfo::SingleNode(SingleNodeRoutingInfo::RandomPrimary);
        match conn.route_command(&redis::cmd("FT._LIST"), route) {
            Ok(_) => true,
            Err(e) => {
                info!("FT._LIST 不可用，搜索页不展示: {e}");
                false
            }
        }
    }

    // 解析 cluster_nodes (静态方法)
    fn parse_node_list(cluster_nodes: String) -> AnyResult<Vec<RedisNode>> {
        // 结构 https://redis.ac.cn/docs/latest/commands/cluster-nodes/
        // <id> <ip:port@cport[,hostname]> <flags> <master> <ping-sent> <pong-recv> <config-epoch> <link-state> <slot> <slot> ... <slot>

        // 示例
        // 0                                        1                          2            3                                        4            5             6               7             8
        // <id>                                     <ip:port@cport[,hostname]> <flags>      <master>                                 <ping-sent>  <pong-recv>   <config-epoch>  <link-state>  <slot> <slot> ... <slot>
        // 01b6af43bd8fe6471097f5b9e5f6e4ff0945d145 192.168.1.11:7004@17004    myself,slave 08914f4493d93b198c1dfe15ab9c14a488ada09d 0            0             2               connected
        // 86ab8ccdddac8e3bd2d114d51a21f13d186ec178 192.168.1.11:7005@17005    slave        e82b9f07782a16fe8e42aef8553ea473ddb130ef 0            1758958605000 3               connected
        // e82b9f07782a16fe8e42aef8553ea473ddb130ef 192.168.1.11:7003@17003    master       -                                        0            1758958606000 3               connected     10923-16383
        // c1a786767e6a9574e8116bb771a96f2ddf001148 192.168.1.11:7006@17006    slave        993bffbf44adde4eeabf9b75f26f999177f23412 0            1758958608265 1               connected
        // 08914f4493d93b198c1dfe15ab9c14a488ada09d 192.168.1.11:7002@17002    master       -                                        0            1758958607260 2               connected     5461-10922
        // 993bffbf44adde4eeabf9b75f26f999177f23412 192.168.1.11:7001@17001    master       -                                        0            1758958607000 1               connected     0-5460

        let cluster_nodes = cluster_nodes.split("\n");
        let mut nodes = vec![];

        // 解析master节点
        for line in cluster_nodes.clone() {
            let parts: Vec<_> = line.split_whitespace().collect();
            if parts.len() < 9 {
                continue;
            }

            if parts[2].contains("master") {
                let id = parts[0];
                let node = parts[1].split("@").next().unwrap();
                let slots = parts[8..].join(" ");
                nodes.push(RedisNode {
                    id: id.into(),
                    node: node.into(),
                    flags: parts[2].into(),
                    slots: Some(slots),
                    slave_of_node: None,
                })
            }
        }

        // 解析slave节点和其他节点
        for line in cluster_nodes {
            let parts: Vec<_> = line.split_whitespace().collect();
            if parts.len() < 4 {
                continue;
            }

            if !parts[2].contains("master") {
                let id = parts[0];
                let node = parts[1].split("@").next().unwrap();
                let master_id = parts[3];

                let master_node = nodes.iter().find(|node| node.id == master_id);

                nodes.push(RedisNode {
                    id: id.into(),
                    node: node.into(),
                    flags: parts[2].into(),
                    slots: None,
                    slave_of_node: master_node.map(|node| node.node.clone()),
                })
            }
        }
        Ok(nodes)
    }
}

#[cfg(test)]
mod parse_node_list_tests {
    use super::*;

    /// master 保留槽位，副本指向对应 master 的地址，残行跳过。
    #[test]
    fn masters_keep_slots_and_replicas_point_at_master() {
        let raw = "\
e82b 10.0.0.3:7003@17003 master - 0 1 3 connected 10923-16383
0891 10.0.0.2:7002@17002 master - 0 1 2 connected 5461-10922
993b 10.0.0.1:7001@17001 master - 0 1 1 connected 0-5460
01b6 10.0.0.4:7004@17004,replica.local myself,slave 0891 0 0 2 connected
junk
";
        let nodes = MeCluster::parse_node_list(raw.into()).unwrap();
        let node = |addr: &str| nodes.iter().find(|n| n.node == addr).unwrap();

        assert_eq!(nodes.len(), 4);
        assert_eq!(node("10.0.0.1:7001").slots.as_deref(), Some("0-5460"));
        assert_eq!(node("10.0.0.2:7002").slots.as_deref(), Some("5461-10922"));
        assert_eq!(node("10.0.0.3:7003").slots.as_deref(), Some("10923-16383"));
        assert!(node("10.0.0.1:7001").flags.contains("master"));

        let replica = node("10.0.0.4:7004");
        assert!(replica.slots.is_none());
        assert_eq!(replica.slave_of_node.as_deref(), Some("10.0.0.2:7002"));
        assert!(replica.flags.contains("slave"));
    }

    /// 副本指向的 master id 不在列表里时，slave_of_node 留空，不编一个地址。
    #[test]
    fn replica_without_known_master_has_no_address() {
        let raw = "\
aaaa 10.0.0.1:7001@17001 master - 0 1 1 connected 0-100
bbbb 10.0.0.2:7002@17002 slave missing 0 0 1 connected
";
        let nodes = MeCluster::parse_node_list(raw.into()).unwrap();
        let replica = nodes.iter().find(|n| n.node == "10.0.0.2:7002").unwrap();
        assert!(replica.slave_of_node.is_none());
        assert!(replica.slots.is_none());
    }
}
