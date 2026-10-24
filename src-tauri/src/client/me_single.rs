use crate::client::me_client::*;
use crate::client::ops::acl::acl_build_rules;
use crate::client::ops::exp::{export_cmd_0_thread, export_csv_0_thread};
use crate::client::ops::imp::{import_cmd_0_thread, import_csv_0_thread};
use crate::client::ops::info::{parse_client_info, redis_value_to_log};
use crate::client::ops::key::copy0;
use crate::client::ops::key_scan::{batch_key0, scan_0_batch_count, scan_0_exact, scan_1_cmd};
use crate::client::ops::notify::{build_notify_patterns, notify_subscribe_node0};
use crate::client::ops::pubsub::{monitor0, subscribe0};
use crate::client::ops::search::SearchCmd;
use crate::client::state::MeBase;
use crate::me_client_forwards;
use crate::model::*;
use crate::net::conn::{get_client_single, init_single_connection, set_client_name_unless_minimal};
use crate::support::capabilities::detect_server_capabilities;
use crate::support::command_log::LoggingConnection;
use crate::support::convert::{tuple_to_key_size, ui_key_list};
use crate::support::format::parse_command;
use crate::support::tty::redis_value_to_cli_display;
use crate::support::util::*;
use anyhow::bail;
use chrono::Utc;
use log::{debug, info, warn};
use parking_lot::{Mutex, MutexGuard};
use redis::{Client, Commands, Connection, ConnectionLike, Pipeline, Value};
use std::collections::HashMap;
use std::ops::Deref;
use std::sync::atomic::Ordering::Relaxed;
use std::thread;
use std::time::Duration;

pub struct MeSingle {
    base: MeBase,
    client: Client,
    conn: Mutex<LoggingConnection>,
}

impl Deref for MeSingle {
    type Target = MeBase;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

impl Drop for MeSingle {
    fn drop(&mut self) {
        // 未订阅不要 get_conn：空闲超过检查间隔会探活，过久或已关闭会直接重连，关闭时白开一条连接。
        if self.subscribe_running.load(Relaxed) {
            let _ = self.subscribe_stop();
        }
        if self.notify_running.load(Relaxed) {
            let _ = self.notify_subscribe_stop();
        }
        let _ = self.monitor_stop();
        self.export_import_running.store(false, Relaxed);
    }
}

impl SearchCmd for LoggingConnection {
    fn search_cmd(&mut self, cmd: &redis::Cmd) -> redis::RedisResult<Value> {
        cmd.query(self)
    }
}

impl MeClient for MeSingle {
    fn base(&self) -> &MeBase {
        &self.base
    }

    fn db_list(&self) -> AnyResult<Vec<RedisDB>> {
        let map = match self.config_get("databases", None) {
            Ok(map) => map,
            Err(e) => {
                let db = self.db.load(Relaxed);
                warn!("CONFIG GET databases 不可用，退回当前库 db{db}: {e}");
                return Ok(vec![RedisDB { db, size: 0 }]);
            }
        };
        let db_count = map
            .get("databases")
            .unwrap_or(&"0".to_string())
            .parse::<u16>()?;
        info!("db_count: {}", db_count);
        let mut db_list = vec![];
        for i in 0..db_count {
            db_list.push(RedisDB { db: i, size: 0 })
        }
        Ok(db_list)
    }

    fn select_db(&self, db: u16) -> AnyResult<()> {
        if self.db.load(Relaxed) == db {
            return Ok(());
        }

        self.db.store(db, Relaxed);
        let mut conn = self.get_conn()?;
        let _: () = redis::cmd("select").arg(db).query(&mut conn)?;
        conn.set_db_index(db);
        info!("select db: {}", db);
        Ok(())
    }

    fn info(&self, _node: Option<String>) -> AnyResult<RedisInfo> {
        let mut conn = self.get_conn()?;
        let info: String = redis::cmd("info").query(&mut conn)?;
        Ok(RedisInfo {
            node: "".to_string(),
            info,
        })
    }

    fn info_list(&self, _node_filter: Option<String>) -> AnyResult<Vec<RedisInfo>> {
        let info = self.info(None)?;
        Ok(vec![info])
    }

    fn node_list(&self) -> AnyResult<Vec<RedisNode>> {
        Ok(vec![])
    }

    fn scan(&self, param: ScanParam) -> AnyResult<ScanResult> {
        let mut conn = self.get_conn()?;

        // exact=true → EXISTS；否则 SCAN
        if let Some(result) = scan_0_exact(&mut conn, &param.pattern, param.exact)? {
            return Ok(result);
        }

        let mut cc = param.cursor.unwrap_or_default();
        let batch_count = scan_0_batch_count(param.count);

        // 只执行一次 SCAN，扫描次数和数据量判断完全由前端控制
        let cmd = scan_1_cmd(
            cc.now_cursor,
            &param.pattern,
            batch_count,
            param.scan_type.clone(),
        );
        let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) = cmd.query(&mut conn)?;

        cc.now_cursor = next_cursor;
        if next_cursor == 0 {
            cc.finished = true;
        }

        Ok(ScanResult {
            cursor: cc,
            key_list: ui_key_list(new_keys),
        })
    }

    fn rename(&self, key: RedisKey, new_key: RedisKey) -> AnyResult<RedisKey> {
        // 防止同名重命名时执行无意义操作
        if key.to_bytes() == new_key.to_bytes() {
            return Ok(new_key.to_normal());
        }

        let mut conn = self.get_conn()?;
        // https://redis.ac.cn/docs/latest/commands/rename/
        let _: () = conn.rename(&key, &new_key)?;
        Ok(new_key.to_normal())
    }

    fn copy(&self, param: RedisCopyParam) -> AnyResult<RedisKey> {
        copy0(self.get_conn()?, param)
    }

    fn execute_command(&self, param: RedisCommand) -> AnyResult<String> {
        let (cmd, args) = parse_command(param.command.as_str())?;
        if cmd.is_empty() {
            return Ok("".into());
        };

        let mut conn = self.get_conn()?;
        let value = redis::cmd(cmd.as_str()).arg(&args).query(&mut conn)?;
        Ok(redis_value_to_cli_display(
            value,
            param.output_mode,
            &cmd,
            &args,
        ))
    }

    fn config_get(
        &self,
        pattern: &str,
        _node: Option<String>,
    ) -> AnyResult<HashMap<String, String>> {
        let cmd = resolve_command_name(&self.conf, "config");
        let mut conn = self.get_conn()?;
        let result: HashMap<String, String> =
            redis::cmd(&cmd).arg("get").arg(pattern).query(&mut conn)?;
        Ok(result)
    }

    fn config_set(&self, key: &str, value: &str, _node: Option<String>) -> AnyResult<()> {
        let cmd = resolve_command_name(&self.conf, "config");
        let mut conn = self.get_conn()?;
        let _: () = redis::cmd(&cmd)
            .arg("set")
            .arg(key)
            .arg(value)
            .query(&mut conn)?;
        Ok(())
    }

    fn slow_log(&self, count: Option<u64>, _node: Option<String>) -> AnyResult<Vec<RedisSlowLog>> {
        let mut conn = self.get_conn()?;
        let mut logs = vec![];
        let value_list: Vec<Value> = redis::cmd("slowlog")
            .arg("get")
            .arg(count.unwrap_or(128))
            .query(&mut conn)?;
        for value in value_list {
            let log = redis_value_to_log(value, "")?;
            logs.push(log);
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
        let mut pipe = Pipeline::with_capacity(keys.len());
        for key in keys {
            pipe.cmd("memory").arg("usage").arg(key.to_bytes());
        }
        let sizes: Vec<Option<u64>> = pipe.query(&mut conn)?;
        let mut out: Vec<(Vec<u8>, u64, String)> = vec![];
        for (index, size) in sizes.into_iter().enumerate() {
            if let Some(size) = size
                && size >= size_limit
            {
                out.push((keys[index].to_bytes().to_vec(), size, "unknown".into()));
            }
        }
        if need_key_type && !out.is_empty() {
            let mut pipe = Pipeline::with_capacity(out.len());
            for key in out.iter() {
                pipe.cmd("type").arg(&key.0);
            }
            let types: Vec<Option<String>> = pipe.query(&mut conn)?;
            for (index, key_type) in types.into_iter().enumerate() {
                out[index].2 = key_type.unwrap_or("deleted".into());
            }
        }
        Ok(tuple_to_key_size(out))
    }

    /// 列表右侧内存列：默认 SAMPLES，不扫完整集合。顺序与入参一致，缺失键为 None。
    fn key_memory(&self, keys: Vec<RedisKey>) -> AnyResult<Vec<Option<u64>>> {
        if !self.base().capabilities.memory_usage_supported {
            bail!("MEMORY USAGE is not supported");
        }
        if keys.is_empty() {
            return Ok(vec![]);
        }
        let mut conn = self.get_conn()?;
        let mut pipe = Pipeline::with_capacity(keys.len());
        for key in &keys {
            pipe.cmd("memory").arg("usage").arg(key.to_bytes());
        }
        let sizes: Vec<Option<u64>> = pipe.query(&mut conn)?;
        Ok(sizes)
    }

    fn client_list(
        &self,
        _node: Option<String>,
        client_type: Option<String>,
    ) -> AnyResult<Vec<RedisClientInfo>> {
        let mut conn = self.get_conn()?;
        let mut cmd = redis::cmd("client");
        cmd.arg("list");
        if let Some(ref client_type_val) = client_type
            && !client_type_val.is_empty()
        {
            cmd.arg("type").arg(client_type_val);
        }
        let client: String = cmd.query(&mut conn)?;

        let mut clients = vec![];
        for client_info in client.lines() {
            let client: RedisClientInfo = parse_client_info(client_info)?;
            clients.push(client);
        }
        Ok(clients)
    }

    fn subscribe(&self, channel: Option<String>) -> AnyResult<()> {
        let conn = self
            .client
            .get_connection_with_timeout(self.connection_timeout)?;
        let running = self.subscribe_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        subscribe0(conn, running, app_handle, channel, self.id.clone(), logger)
    }

    fn monitor(&self, _node: &str) -> AnyResult<()> {
        let conn = self
            .client
            .get_connection_with_timeout(self.connection_timeout)?;
        let running = self.monitor_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        monitor0(conn, running, app_handle, self.id.clone(), logger)
    }

    fn notify_subscribe(&self, param: NotifySubscribeParam) -> AnyResult<()> {
        let conn = self
            .client
            .get_connection_with_timeout(self.connection_timeout)?;
        let running = self.notify_running.clone();
        let app_handle = self.base().get_app_handle()?;
        let logger = self.base().command_logger.clone();
        let patterns =
            build_notify_patterns(&param.perspective, param.db, param.pattern.as_deref());
        // 单机：node 传空串
        notify_subscribe_node0(
            conn,
            running,
            app_handle,
            patterns,
            self.id.clone(),
            String::new(),
            logger,
        )
    }

    fn batch_del(&self, param: RedisBatchKey) -> AnyResult<()> {
        let key_list = batch_key0(self, param, false)?;
        if key_list.is_empty() {
            return Ok(());
        }

        let size = key_list.len();
        let mut pipe = Pipeline::with_capacity(size);
        for key in key_list {
            pipe.del(&key).ignore();
        }
        let mut conn = self.get_conn()?;
        let _: () = pipe.query(&mut conn)?;
        info!("batch delete finished: {}", size);
        Ok(())
    }

    fn batch_ttl(&self, param: RedisBatchTtl) -> AnyResult<()> {
        if param.key_list.is_empty() {
            return Ok(());
        }

        let size = param.key_list.len();
        let mut pipe = Pipeline::with_capacity(size);
        for key in param.key_list {
            if param.ttl > 0 {
                pipe.expire(&key, param.ttl).ignore();
            } else {
                pipe.persist(&key).ignore();
            }
        }
        let mut conn = self.get_conn()?;
        let _: () = pipe.query(&mut conn)?;
        info!("batch ttl finished: {}", size);
        Ok(())
    }

    fn export_csv(&self, param: RedisExportCsv) -> AnyResult<()> {
        let key_list = batch_key0(self, param.clone().into(), true)?;
        let conn = self.get_new_conn()?;
        let logger = self.base().command_logger.clone();
        let db_index = self.db.load(Relaxed);
        let mut logging_conn = LoggingConnection::new(conn, logger, db_index);
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
        let mut logging_conn = LoggingConnection::new(conn, logger, db_index);
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
        let mut logging_conn = LoggingConnection::new(conn, logger, db_index);
        let running = self.export_import_check_running()?;
        let id = self.id.clone();
        let app_handle = self.base().get_app_handle()?;
        thread::spawn(move || {
            import_cmd_0_thread(&mut logging_conn, file, running, app_handle, id)
        });
        Ok(())
    }

    fn key_slot(&self, _key: RedisKey) -> AnyResult<u64> {
        Ok(0)
    }

    fn key_node(&self, _key: RedisKey) -> AnyResult<Vec<RedisNode>> {
        let node = format!("{}:{}", self.conf.host, self.conf.port);
        Ok(vec![RedisNode {
            node,
            ..RedisNode::default()
        }])
    }

    fn acl_setuser(&self, param: AclSetuserParam) -> AnyResult<()> {
        let rules = acl_build_rules(&param)?;
        let _: () = self
            .get_conn()?
            .acl_setuser_rules(&param.username, &rules)?;
        Ok(())
    }

    fn acl_deluser(&self, usernames: Vec<String>) -> AnyResult<usize> {
        Ok(self.get_conn()?.acl_deluser(&usernames)?)
    }

    fn acl_save(&self) -> AnyResult<()> {
        let _: () = self.get_conn()?.acl_save()?;
        Ok(())
    }

    fn acl_load(&self) -> AnyResult<()> {
        let _: () = self.get_conn()?.acl_load()?;
        Ok(())
    }

    fn acl_log_reset(&self) -> AnyResult<()> {
        let _: () = self.get_conn()?.acl_log_reset()?;
        Ok(())
    }

    /// 用 pipeline 写入各类型随机样本，给空库看界面。
    fn mock_data(&self, count: u64) -> AnyResult<()> {
        let mut pipe = Pipeline::with_capacity(count as usize);
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
        let _: () = pipe.query(&mut conn)?;
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

    fn search_sample_load(&self, kind: String) -> AnyResult<SearchSampleResult> {
        use crate::client::ops::search::run_sample_load;

        let mut conn = self.get_conn()?;
        run_sample_load(&mut *conn, &kind)
    }
}

// 个性化方法
impl MeSingle {
    /// 建连并完成选库、客户端名和能力探测，返回可给前端用的客户端。
    pub fn init(
        redis_conn: &ConnConfig,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<Box<dyn MeClient>> {
        let (client, _) = get_client_single(redis_conn, connect_timeout, false, None)?;
        let mut base = MeBase::from(redis_conn);
        base.connection_timeout = connect_timeout;
        base.command_timeout = command_timeout;
        let logger = base.command_logger.clone();
        // 阶段 1 建连验证 + 阶段 2 正式命令超时；验证通过后复用同一条 TCP（#155）
        let raw_conn = init_single_connection(
            &client,
            redis_conn.db,
            connect_timeout,
            command_timeout,
            redis_conn,
        )?;
        let mut conn = LoggingConnection::new(raw_conn, logger, redis_conn.db);
        set_client_name_unless_minimal(&mut conn, redis_conn);
        detect_server_capabilities(&mut conn, &mut base, false);

        info!("Redis单机连接初始化成功: {}", redis_conn.name);

        Ok(Box::new(MeSingle {
            base,
            client,
            conn: Mutex::new(conn),
        }))
    }

    /// 重连或辅助连接：按建连超时建一条 TCP，建好后再切到正式命令超时。
    fn new_raw_conn(
        client: &Client,
        db: u16,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<Connection> {
        let mut conn = client.get_connection_with_timeout(connect_timeout)?;
        conn.set_read_timeout(Some(command_timeout))?;
        conn.set_write_timeout(Some(command_timeout))?;
        if db != 0 {
            info!("select {db}");
            let _: () = redis::cmd("select")
                .arg(db)
                .query(&mut conn)
                .unwrap_or_else(|_| warn!("select {db} 失败，使用默认数据库0"));
        }
        Ok(conn)
    }

    /// 丢掉当前连接，按当前库号重新建连并写回客户端名。
    /// 成功后刷新 `last_check_time`，下一轮取连接在检查间隔内直接复用。
    fn reconnect(&self) -> AnyResult<()> {
        let raw_conn = Self::new_raw_conn(
            &self.client,
            self.db.load(Relaxed),
            self.connection_timeout,
            self.command_timeout,
        )?;
        let mut conn_guard = self.conn.lock();
        *conn_guard =
            LoggingConnection::new(raw_conn, self.command_logger.clone(), self.db.load(Relaxed));
        set_client_name_unless_minimal(&mut *conn_guard, &self.conf);
        self.last_check_time.store(Utc::now().timestamp(), Relaxed);
        info!("Redis单机连接重连成功: {}", self.conf.name);
        Ok(())
    }

    /// 拿当前连接。策略见 `conn_reuse`：短间隔直接用，中间档 PING，过久或已关闭则直接重连。
    fn get_conn(&'_ self) -> AnyResult<MutexGuard<'_, LoggingConnection>> {
        get_checked_conn(
            || self.conn.try_lock_for(CONNECTION_LOCK_TIMEOUT),
            &self.last_check_time,
            |conn| self.check_connection_timeout(conn),
            || self.reconnect(),
        )
    }

    /// 用较短超时做一次存活探测，通过后把读写超时改回正式命令超时。
    fn check_connection_timeout(&self, conn: &mut LoggingConnection) -> AnyResult<bool> {
        conn.set_read_timeout(Some(CONNECTION_CHECK_TIMEOUT))?;
        conn.set_write_timeout(Some(CONNECTION_CHECK_TIMEOUT))?;
        if conn.check_connection() {
            conn.set_read_timeout(Some(self.command_timeout))?;
            conn.set_write_timeout(Some(self.command_timeout))?;
            debug!("检查Redis单机连接正常: {}", self.conf.name);
            Ok(true)
        } else {
            warn!("检查Redis单机连接异常: {}", self.conf.name);
            Ok(false)
        }
    }

    /// 另建一条连接，给导入导出这类后台线程用，不经过命令日志包装。
    fn get_new_conn(&self) -> AnyResult<Connection> {
        let mut conn = Self::new_raw_conn(
            &self.client,
            self.db.load(Relaxed),
            self.connection_timeout,
            self.command_timeout,
        )?;
        set_client_name_unless_minimal(&mut conn, &self.conf);
        Ok(conn)
    }
}
