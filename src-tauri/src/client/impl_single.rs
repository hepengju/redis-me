use crate::client::client::RedisMeClient;
use crate::helper::model::{RedisClientInfo, RedisCommand, RedisFieldAdd, RedisFieldDel, RedisFieldSet, RedisInfo, RedisKeySize, RedisMemoryParam, RedisNode, RedisSlowLog, RedisValue, ScanParam, ScanResult};
use crate::helper::util::AnyResult;
use r2d2::Pool;
use redis::Client;
use std::collections::HashMap;

pub struct RedisMeSingle {
    id: String,
    pool: Pool<Client>,
}

impl RedisMeClient for RedisMeSingle {
    fn info(&self, node: Option<String>) -> AnyResult<RedisInfo> {
        todo!()
    }

    fn info_list(&self) -> AnyResult<Vec<RedisInfo>> {
        todo!()
    }

    fn node_list(&self) -> AnyResult<Vec<RedisNode>> {
        todo!()
    }

    fn scan(&self, param: ScanParam) -> AnyResult<ScanResult> {
        todo!()
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

    fn config_get(&self, pattern: &str, node: Option<String>) -> AnyResult<HashMap<String, String>> {
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

    fn client_list(&self, node: Option<String>, client_type: Option<String>) -> AnyResult<Vec<RedisClientInfo>> {
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