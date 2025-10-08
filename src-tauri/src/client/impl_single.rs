use crate::client::client::RedisMeClient;
use crate::implement_common_commands;
use crate::utils::conn::get_pool_single;
use crate::utils::model::*;
use crate::utils::util::*;
use anyhow::bail;
use log::info;
use r2d2::Pool;
use redis::{Client, Commands, FromRedisValue, Pipeline, SetExpiry, SetOptions, Value, ValueType};
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::thread::{spawn, JoinHandle};
use std::time::{Duration, Instant};
use chrono::Local;

pub struct RedisMeSingle {
    id: String,
    pool: Pool<Client>,

    subscribe_running: Arc<AtomicBool>,
    monitor_running: Arc<AtomicBool>,
}

// 个性化方法
impl RedisMeSingle {
    pub fn new(id: &str) -> AnyResult<Box<dyn RedisMeClient>> {
        let pool = get_pool_single(id)?;
        let mut conn = pool.get()?;
        let _: String = conn.ping()?;
        info!("Redis单机连接初始化成功: {id}");
        Ok(Box::new(RedisMeSingle {
            id: id.to_string(),
            pool,
            subscribe_running: Arc::new(AtomicBool::new( false)),
            monitor_running: Arc::new(AtomicBool::new( false))
        }))
    }
}

impl RedisMeClient for RedisMeSingle {
    fn info(&self, _node: Option<String>) -> AnyResult<RedisInfo> {
        let mut conn = self.pool.get()?;
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
        let mut conn = self.pool.get()?;

        let mut cc = param.cursor;
        let batch_count = if param.pattern.replace("*", "").chars().count() <= 1 {
            1000
        } else {
            10000
        };

        let mut keys: Vec<Vec<u8>> = vec![];

        loop {
            let mut cmd = redis::cmd("scan");
            cmd.arg(cc.now_cursor)
                .arg("match")
                .arg(param.pattern.clone())
                .arg("count")
                .arg(batch_count);

            if let Some(ref scan_type) = param.scan_type {
                cmd.arg("type").arg(scan_type);
            }

            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) = cmd.query(&mut conn)?;
            keys.extend(new_keys);

            cc.now_cursor = next_cursor;
            if !param.load_all && keys.len() >= param.count as usize {
                break;
            }

            if next_cursor == 0 {
                break;
            }
        }

        // 映射为返回值
        let key_list = keys
            .into_iter()
            .map(|key| RedisKey {
                key: vec8_to_display_string(&key),
                bytes: key,
            })
            .collect();

        Ok(ScanResult {
            cursor: cc,
            key_list,
        })
    }

    fn execute_command(&self, param: RedisCommand) -> AnyResult<String> {
        let (cmd, args) = parse_command(param.command.as_str())?;
        if cmd == "" {
            return Ok("".into());
        };

        let mut conn = self.pool.get()?;
        let value = redis::cmd(cmd.as_str()).arg(args).query(&mut conn)?;
        Ok(redis_value_to_string(value, "\n"))
    }

    fn config_get(
        &self,
        pattern: &str,
        _node: Option<String>,
    ) -> AnyResult<HashMap<String, String>> {
        let mut conn = self.pool.get()?;
        let result: HashMap<String, String> = redis::cmd("config")
            .arg("get")
            .arg(pattern)
            .query(&mut conn)?;
        Ok(result)
    }

    fn config_set(&self, key: &str, value: &str, _node: Option<String>) -> AnyResult<()> {
        let mut conn = self.pool.get()?;
        let _: () = redis::cmd("config")
            .arg("set")
            .arg(key)
            .arg(value)
            .query(&mut conn)?;
        Ok(())
    }

    fn slow_log(&self, count: Option<u64>, _node: Option<String>) -> AnyResult<Vec<RedisSlowLog>> {
        let mut conn = self.pool.get()?;
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

    fn memory_usage(&self, param: RedisMemoryParam) -> AnyResult<Vec<RedisKeySize>> {
        let mut conn = self.pool.get()?;
        let mut keys: Vec<(Vec<u8>, u64, String)> = vec![];

        let mut scan_times = 0;
        let mut cursor = 0;
        loop {
            let mut cmd = redis::cmd("scan");
            cmd.arg(cursor)
                .arg("match")
                .arg(param.pattern.clone().unwrap_or("*".into()))
                .arg("count")
                .arg(param.scan_count);
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) = cmd.query(&mut conn)?;
            cursor = next_cursor;

            // 计算键大小
            let mut pipe = Pipeline::with_capacity(new_keys.len());
            for key in new_keys.iter() {
                pipe.cmd("memory").arg("usage").arg(key);
            }

            let sizes: Vec<Option<u64>> = pipe.query(&mut conn)?;
            for (index, size) in sizes.into_iter().enumerate() {
                if let Some(size) = size {
                    if size >= param.size_limit {
                        keys.push((new_keys[index].clone(), size, "unknown".into()));
                    }
                }
            }

            scan_times += 1;

            if keys.len() >= param.count_limit as usize {
                info!("扫描结果>={}个, 返回", param.count_limit);
                break;
            }

            if param.scan_total > 0 && scan_times * param.scan_count >= param.scan_total {
                info!("已扫描键>={}个, 返回", param.scan_total);
                break;
            }

            thread::sleep(Duration::from_millis(param.sleep_millis));

            if cursor == 0 {
                break;
            }
        }

        // 计算键类型
        let mut pipe = Pipeline::with_capacity(keys.len());
        for key in keys.iter() {
            pipe.cmd("type").arg(&key.0);
        }
        let types: Vec<Option<String>> = pipe.query(&mut conn)?;
        for (index, key_type) in types.into_iter().enumerate() {
            keys[index].2 = key_type.unwrap_or("deleted".into());
        }

        // 映射为返回值
        let key_list = keys.into_iter().map(RedisKeySize::from).collect();
        Ok(key_list)
    }

    fn client_list(
        &self,
        _node: Option<String>,
        client_type: Option<String>,
    ) -> AnyResult<Vec<RedisClientInfo>> {
        let mut conn = self.pool.get()?;
        let mut cmd = redis::cmd("client");
        cmd.arg("list");
        if let Some(ref client_type_val) = client_type {
            cmd.arg("type").arg(client_type_val);
        }
        let value_list: Vec<String> = cmd.query(&mut conn)?;

        let mut clients = vec![];
        for client_info in value_list.into_iter() {
            let client: RedisClientInfo = parse_client_info(&client_info)?;
            clients.push(client);
        }
        Ok(clients)
    }

    fn monitor(&self, node: &str, seconds: Option<i64>) -> AnyResult<()> {

        todo!()
    }

    fn subscribe(&self, channel: Option<String>, seconds: Option<i64>) -> AnyResult<()> {
        let mut conn = self.pool.get()?;
        let mut pubsub = conn.as_pubsub();

        let channel = channel.unwrap_or("*".into());
        pubsub.psubscribe(&channel)?;

        self.subscribe_running.store( true, Ordering::Relaxed);
        let r = self.subscribe_running.clone();

        let _: JoinHandle<AnyResult<()>> = spawn(move || {
            info!("subscribe start: {}", &channel);
            while r.load(Ordering::Relaxed) {
                let msg = pubsub.get_message()?;
                let payload: String = msg.get_payload()?;
                info!("subscribe channel '{}': {}", msg.get_channel_name(), payload);
            }
            info!("subscribe end: {}", & channel);
            Ok(())
        });
        Ok(())
    }

    implement_common_commands!(Pipeline);
}
