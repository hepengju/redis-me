use crate::client::client_trait::*;
use crate::implement_pipeline_commands;
use crate::utils::capabilities::detect_server_capabilities;
use crate::utils::command_log::LoggingConnection;
use crate::utils::conn::{
    get_client_single, init_single_connection, set_client_name_unless_minimal,
};
use crate::utils::error::AppError;
use crate::utils::model::*;
use crate::utils::ssh_tunnel::SshTunnel;
use crate::utils::util::*;
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
    // SSH 隧道，在 Drop 时自动关闭
    #[allow(dead_code)]
    ssh_tunnel: Option<SshTunnel>,
}

impl Deref for MeSingle {
    type Target = MeBase;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

impl Drop for MeSingle {
    fn drop(&mut self) {
        // Drop 时静默忽略错误（连接可能已关闭）
        let _ = self.subscribe_stop();
        let _ = self.monitor_stop();
        self.export_import_running.store(false, Relaxed);
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

    fn info_list(&self) -> AnyResult<Vec<RedisInfo>> {
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

    fn publish(&self, channel: &str, message: &str, msg_fmt: Option<BytesFormat>) -> AnyResult<()> {
        let fmt = msg_fmt.unwrap_or_default();
        publish0(self.get_conn()?, channel, message, &fmt)
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

    fn subscribe_stop(&self) -> AnyResult<()> {
        subscribe_stop0(self.get_conn()?, self.subscribe_running.clone())
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

    fn monitor_stop(&self) -> AnyResult<()> {
        monitor_stop0(self.monitor_running.clone())
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
        let db_index = self.db.load(Relaxed) as u16;
        let mut logging_conn = LoggingConnection::new(conn, logger, db_index);
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
        let mut logging_conn = LoggingConnection::new(conn, logger, db_index);
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
        let mut logging_conn = LoggingConnection::new(conn, logger, db_index);
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
        let rules = acl_build_rules(&param)?;
        let _: () = self
            .get_conn()?
            .acl_setuser_rules(&param.username, &rules)?;
        Ok(())
    }

    fn acl_deluser(&self, usernames: Vec<String>) -> AnyResult<usize> {
        Ok(self.get_conn()?.acl_deluser(&usernames)?)
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
        let _: () = self.get_conn()?.acl_save()?;
        Ok(())
    }

    fn acl_load(&self) -> AnyResult<()> {
        let _: () = self.get_conn()?.acl_load()?;
        Ok(())
    }

    fn acl_log(&self, count: Option<u64>) -> AnyResult<Vec<AclLogEntry>> {
        acl_log0(self.get_conn()?, count)
    }

    fn acl_log_reset(&self) -> AnyResult<()> {
        let _: () = self.get_conn()?.acl_log_reset()?;
        Ok(())
    }

    fn acl_dryrun(&self, username: String, command: String) -> AnyResult<String> {
        acl_dryrun0(self.get_conn()?, username, command)
    }

    implement_pipeline_commands!(Pipeline);
}

// 个性化方法
impl MeSingle {
    pub fn init(
        redis_conn: &ConnConfig,
        connect_timeout: Duration,
        command_timeout: Duration,
    ) -> AnyResult<Box<dyn MeClient>> {
        let (client, ssh_tunnel) = get_client_single(redis_conn, connect_timeout, false)?;
        let mut base = MeBase::from(redis_conn);
        base.connection_timeout = connect_timeout;
        base.command_timeout = command_timeout;
        let logger = base.command_logger.clone();
        // 阶段 1 建连验证 + 阶段 2 正式命令超时；验证通过后复用同一条 TCP（#155）
        let raw_conn =
            init_single_connection(&client, redis_conn.db, connect_timeout, command_timeout)?;
        let mut conn = LoggingConnection::new(raw_conn, logger, redis_conn.db);
        set_client_name_unless_minimal(&mut conn, redis_conn);
        detect_server_capabilities(&mut conn, &mut base, false);

        info!("Redis单机连接初始化成功: {}", redis_conn.name);

        Ok(Box::new(MeSingle {
            base,
            client,
            conn: Mutex::new(conn),
            ssh_tunnel,
        }))
    }

    // 重连/辅助连接：旧连接已失效，按建连超时建一条 TCP，再切正式命令超时
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

    // 重新连接
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

    // 获取已经建立的连接
    fn get_conn(&'_ self) -> AnyResult<MutexGuard<'_, LoggingConnection>> {
        // match self.conn.lock() {
        //     Ok(conn) => Ok(conn),
        //     Err(_) => {
        //         bail!("获取连接加锁失败");
        //     }
        // }
        // 标准库的Mutex不支持重入及超时时间设置，因此引入parking_lot解决此问题
        // 备注: parking_lot的 ReentrantMutexGuard 不支持 deref_mut 所以暂不支持重入
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

    // 获取一个新的连接（导出/导入等独立线程，不记命令日志）
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
