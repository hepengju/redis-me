use crate::client::client_trait::*;
use crate::utils::capabilities::detect_server_capabilities;
use crate::utils::command_log::LoggingClusterConnection;
use crate::utils::conn::{
    get_client_cluster, get_client_single, init_cluster_connection, init_single_connection,
    set_client_name_unless_minimal,
};
use crate::utils::error::AppError;
use crate::utils::model::*;
use crate::utils::util::*;
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
        self.subscribe_stop().unwrap_or(());
        self.monitor_stop().unwrap_or(());
        self.export_import_running.store(false, Relaxed);
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

    fn info_list(&self) -> AnyResult<Vec<RedisInfo>> {
        let mut conn = self.get_conn()?;
        let mut infos = vec![];
        for redis_node in &self.node_list {
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

    fn field_scan(&self, param: FieldScanParam) -> AnyResult<FieldScanResult> {
        let httl_supported = self.base().capabilities.httl_supported;
        field_scan0(self.get_conn()?, param, httl_supported)
    }

    fn ttl(&self, key: RedisKey, ttl: i64) -> AnyResult<()> {
        ttl0(self.get_conn()?, key, ttl)
    }

    fn set(&self, param: RedisSetParam) -> AnyResult<()> {
        set0(self.get_conn()?, param)
    }

    fn del(&self, key: RedisKey) -> AnyResult<()> {
        del0(self.get_conn()?, key)
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

    fn field_add(&self, param: RedisFieldAdd) -> AnyResult<RedisKey> {
        field_add0(
            self.get_conn()?,
            param,
            self.base().capabilities.httl_supported,
        )
    }

    fn field_set(&self, param: RedisFieldSet) -> AnyResult<()> {
        field_set0(
            self.get_conn()?,
            param,
            self.base().capabilities.httl_supported,
        )
    }

    fn field_ttl(&self, param: RedisFieldTtl) -> AnyResult<()> {
        field_ttl0(
            self.get_conn()?,
            param,
            self.base().capabilities.httl_supported,
        )
    }

    fn field_get(&self, param: RedisFieldGet) -> AnyResult<RedisFieldValue> {
        field_get0(
            self.get_conn()?,
            param,
            self.base().capabilities.httl_supported,
        )
    }

    fn hash_keys(&self, param: RedisHashKeys) -> AnyResult<Vec<String>> {
        hash_keys0(self.get_conn()?, param)
    }

    fn hash_values(&self, param: RedisHashKeys) -> AnyResult<Vec<String>> {
        hash_values0(self.get_conn()?, param)
    }

    fn field_pop(&self, param: RedisPop) -> AnyResult<String> {
        field_pop0(self.get_conn()?, param)
    }

    fn field_del(&self, param: RedisFieldDel) -> AnyResult<()> {
        field_del0(self.get_conn()?, param)
    }

    fn zset_rank(&self, param: RedisZsetRank) -> AnyResult<RedisZsetRankResult> {
        zset_rank0(self.get_conn()?, param)
    }

    fn zset_range(&self, param: RedisZsetRange) -> AnyResult<Vec<RedisZsetRangeItem>> {
        zset_range0(self.get_conn()?, param)
    }

    fn ar_last_items(&self, param: RedisArLastItems) -> AnyResult<Vec<RedisArLastItemsItem>> {
        ar_last_items0(self.get_conn()?, param)
    }

    fn ar_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>> {
        ar_info0(self.get_conn()?, key)
    }

    fn v_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>> {
        v_info0(self.get_conn()?, key)
    }

    fn v_getattr(&self, param: RedisVAttr) -> AnyResult<String> {
        v_getattr0(self.get_conn()?, param)
    }

    fn v_setattr(&self, param: RedisVAttr) -> AnyResult<()> {
        v_setattr0(self.get_conn()?, param)
    }

    fn v_sim(&self, param: RedisVSim) -> AnyResult<Vec<RedisVSimItem>> {
        v_sim0(self.get_conn()?, param)
    }

    fn object_info(&self, key: RedisKey) -> AnyResult<RedisObjectInfo> {
        object_info0(self.get_conn()?, key)
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

    fn publish(&self, channel: &str, message: &str, msg_fmt: Option<BytesFormat>) -> AnyResult<()> {
        let fmt = msg_fmt.unwrap_or_default();
        publish0(self.get_conn()?, channel, message, &fmt)
    }

    fn subscribe(&self, channel: Option<String>) -> AnyResult<()> {
        let (client, _) = get_client_single(&self.conf, self.connection_timeout, false)?;
        let conn = init_single_connection(
            &client,
            self.conf.db,
            self.connection_timeout,
            self.command_timeout,
        )?;
        // 订阅长连接：建连后去掉读写超时，否则空闲超过读写超时会断流
        conn.set_read_timeout(None)?;
        conn.set_write_timeout(None)?;
        let running = self.subscribe_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        subscribe0(conn, running, app_handle, channel, self.id.clone(), logger)
    }

    fn subscribe_stop(&self) -> AnyResult<()> {
        subscribe_stop0(self.get_conn()?, self.subscribe_running.clone())
    }

    fn monitor(&self, node: &str) -> AnyResult<()> {
        // 集群中的monitor命令是针对单个节点的，所以需要获取该节点的连接
        let mut conf = self.conf.clone();
        if let Some((host, port)) = node.split_once(":") {
            conf.host = host.to_string();
            conf.port = port.parse::<u16>()?;
        }
        let (client, _) = get_client_single(&conf, self.connection_timeout, false)?;
        let conn = init_single_connection(
            &client,
            conf.db,
            self.connection_timeout,
            self.command_timeout,
        )?;
        conn.set_read_timeout(None)?;
        conn.set_write_timeout(None)?;
        let running = self.monitor_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        monitor0(conn, running, app_handle, self.id.clone(), logger)
    }

    fn monitor_stop(&self) -> AnyResult<()> {
        monitor_stop0(self.monitor_running.clone())
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
        let db_index = self.db.load(Relaxed) as u16;
        let mut logging_conn = LoggingClusterConnection::new(conn, logger, db_index);
        let running = self.export_import_running.clone();
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        export_import_check_running(running.clone())?;
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
        let db_index = self.db.load(Relaxed) as u16;
        let mut logging_conn = LoggingClusterConnection::new(conn, logger, db_index);
        let running = self.export_import_running.clone();
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        export_import_check_running(running.clone())?;
        thread::spawn(move || {
            import_csv_0_thread(&mut logging_conn, param, running, app_handle, id)
        });
        Ok(())
    }

    fn import_cmd(&self, file: String) -> AnyResult<()> {
        let conn = self.get_new_conn()?;
        let logger = self.base().command_logger.clone();
        let db_index = self.db.load(Relaxed) as u16;
        let mut logging_conn = LoggingClusterConnection::new(conn, logger, db_index);
        let running = self.export_import_running.clone();
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        export_import_check_running(running.clone())?;
        thread::spawn(move || {
            import_cmd_0_thread(&mut logging_conn, file, running, app_handle, id)
        });
        Ok(())
    }

    fn key_type(&self, key: RedisKey) -> AnyResult<String> {
        key_type0(self.get_conn()?, key)
    }

    fn get_key_as_command(&self, key: RedisKey) -> AnyResult<String> {
        get_key_as_command0(self.get_conn()?, key)
    }

    fn get_field_as_command(&self, param: RedisFieldAsCommand) -> AnyResult<String> {
        get_field_as_command0(self.get_conn()?, param)
    }

    fn xinfo_groups(&self, key: RedisKey) -> AnyResult<Vec<XInfoGroup>> {
        xinfo_groups0(self.get_conn()?, key)
    }

    fn xinfo_consumers(&self, key: RedisKey, group: String) -> AnyResult<Vec<XInfoConsumer>> {
        xinfo_consumers0(self.get_conn()?, key, group)
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

    fn flush_db(&self) -> AnyResult<()> {
        flush_db0(self.get_conn()?)
    }

    fn flush_all(&self) -> AnyResult<()> {
        flush_all0(self.get_conn()?)
    }

    fn acl_users(&self) -> AnyResult<Vec<String>> {
        acl_users0(self.get_conn()?)
    }

    fn acl_list_users(&self) -> AnyResult<Vec<AclUserDetail>> {
        acl_list_users0(self.get_conn()?)
    }

    fn acl_getuser(&self, username: &str) -> AnyResult<AclUserDetail> {
        acl_getuser0(self.get_conn()?, username)
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

    fn acl_whoami(&self) -> AnyResult<String> {
        acl_whoami0(self.get_conn()?)
    }

    fn acl_cat(&self, category: Option<String>) -> AnyResult<Vec<String>> {
        acl_cat0(self.get_conn()?, category)
    }

    fn acl_genpass(&self, bits: Option<i64>) -> AnyResult<String> {
        acl_genpass0(self.get_conn()?, bits)
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

    fn acl_log(&self, count: Option<u64>) -> AnyResult<Vec<AclLogEntry>> {
        acl_log0(self.get_conn()?, count)
    }

    fn acl_log_reset(&self) -> AnyResult<()> {
        let mut cmd = redis::cmd("ACL");
        cmd.arg("LOG").arg("RESET");
        self.acl_route_all_nodes(cmd)
    }

    fn acl_dryrun(&self, username: String, command: String) -> AnyResult<String> {
        acl_dryrun0(self.get_conn()?, username, command)
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
}

// 个性化方法
impl MeCluster {
    pub fn init(
        redis_conn: &ConnConfig,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<Box<dyn MeClient>> {
        let client = get_client_cluster(redis_conn, None)?;
        let mut base = MeBase::from(redis_conn);
        base.connection_timeout = connect_timeout;
        base.command_timeout = command_timeout;
        let logger = base.command_logger.clone();
        let db = redis_conn.db;
        // 阶段 1 建连验证 + 阶段 2 正式命令超时；验证通过后复用同一条 TCP（#155）
        let mut conn = LoggingClusterConnection::new(
            init_cluster_connection(&client, connect_timeout, command_timeout)?,
            logger,
            db,
        );
        set_client_name_unless_minimal(&mut conn, redis_conn);
        detect_server_capabilities(&mut conn, &mut base, true);
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

    // 重连/辅助连接：旧连接已失效，按建连超时建一条 TCP，再切正式命令超时
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

    // 重新连接
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

    fn get_conn(&'_ self) -> AnyResult<MutexGuard<'_, LoggingClusterConnection>> {
        match self.conn.try_lock_for(Duration::from_secs(10)) {
            Some(mut conn) => Ok({
                let curr = Utc::now().timestamp();
                let last = self.last_check_time.load(Relaxed);
                if conn.is_open() && curr - last < CONNECTION_CHECK_SECONDS {
                    conn
                } else {
                    self.last_check_time.store(curr, Relaxed);
                    if self.check_connection_timeout(&mut conn).unwrap_or(false) {
                        conn
                    } else {
                        drop(conn); // 此处一定要释放锁
                        self.reconnect()?;
                        self.get_conn()?
                    }
                }
            }),
            None => bail!(AppError::ConnectionLockTimeout),
        }
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

    // 获取一个新的连接（导出/导入等独立线程，不记命令日志）
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
