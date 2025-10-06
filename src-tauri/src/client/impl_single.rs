use crate::client::client::RedisMeClient;
use crate::utils::conn::get_pool_single;
use crate::utils::model::*;
use crate::utils::util::{vec8_to_string, AnyResult};
use log::info;
use r2d2::{Pool};
use redis::{Client, Commands, FromRedisValue};
use std::collections::HashMap;

pub struct RedisMeSingle {
    id: String,
    pool: Pool<Client>,
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

            let value = cmd.query(&mut conn)?;
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                FromRedisValue::from_redis_value(&value)?;
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
                key: vec8_to_string(key.clone()),
                bytes: key,
            })
            .collect();

        Ok(ScanResult {
            cursor: cc,
            key_list,
        })
    }

    fn get(&self, key: Vec<u8>, hash_key: Option<String>) -> AnyResult<RedisValue> {
        todo!()
    }

    fn ttl(&self, key: Vec<u8>, ttl: i64) -> AnyResult<()> {
        todo!()
    }

    fn set(&self, key: Vec<u8>, value: String, ttl: i64) -> AnyResult<()> {
        todo!()
    }

    fn del(&self, key: Vec<u8>) -> AnyResult<()> {
        todo!()
    }

    fn field_add(&self, param: RedisFieldAdd) -> AnyResult<()> {
        todo!()
    }

    fn field_set(&self, param: RedisFieldSet) -> AnyResult<()> {
        todo!()
    }

    fn field_del(&self, param: RedisFieldDel) -> AnyResult<()> {
        todo!()
    }

    fn execute_command(&self, param: RedisCommand) -> AnyResult<String> {
        todo!()
    }

    fn config_get(
        &self,
        pattern: &str,
        node: Option<String>,
    ) -> AnyResult<HashMap<String, String>> {
        todo!()
    }

    fn config_set(&self, key: &str, value: &str, node: Option<String>) -> AnyResult<()> {
        todo!()
    }

    fn slow_log(&self, count: Option<u64>, node: Option<String>) -> AnyResult<Vec<RedisSlowLog>> {
        todo!()
    }

    fn memory_usage(&self, param: RedisMemoryParam) -> AnyResult<Vec<RedisKeySize>> {
        todo!()
    }

    fn client_list(
        &self,
        node: Option<String>,
        client_type: Option<String>,
    ) -> AnyResult<Vec<RedisClientInfo>> {
        todo!()
    }

    fn monitor(&self, node: &str, seconds: Option<u32>) -> AnyResult<()> {
        todo!()
    }

    fn publish(&self, channel: &str, message: &str) -> AnyResult<()> {
        todo!()
    }

    fn subscribe(&self, channel: &str, seconds: Option<u32>) -> AnyResult<()> {
        todo!()
    }

    fn mock_data(&self, count: u64) -> AnyResult<()> {
        todo!()
    }
}
