use crate::helper::model::{RedisClientInfo, RedisCommand, RedisFieldAdd, RedisFieldDel, RedisFieldSet, RedisInfo, RedisKeySize, RedisMemoryParam, RedisNode, RedisSlowLog, RedisValue, ScanParam, ScanResult};
use crate::helper::util::AnyResult;
use std::collections::HashMap;

/// RedisME服务接口
pub trait RedisMeClient {

    fn info(&self, node: Option<String>) -> AnyResult<RedisInfo>;
    
    fn info_list(&self) -> AnyResult<Vec<RedisInfo>>;
    
    fn node_list(&self) -> AnyResult<Vec<RedisNode>>;

    fn scan(&self, param: ScanParam) -> AnyResult<ScanResult>;
    
    fn get(&self, key: Vec<u8>, hash_key: Option<String>) -> AnyResult<RedisValue>;
    
    fn ttl(&self, key: Vec<u8>, ttl: i64) -> AnyResult<()>;
    
    fn set(&self, key: Vec<u8>, value: String, ttl: i64) -> AnyResult<()>;
    
    fn del(&self, key: Vec<u8>) -> AnyResult<()>;
    
    fn field_add(&self, param: RedisFieldAdd) -> AnyResult<()>;

    fn field_set(&self, param: RedisFieldSet) -> AnyResult<()>;

    fn field_del(&self, param: RedisFieldDel) -> AnyResult<()>;
    
    fn execute_command(&self, param: RedisCommand) -> AnyResult<String>;
    
    fn config_get(&self, pattern: &str, node: Option<String>) -> AnyResult<HashMap<String, String>>;
    
    fn config_set(&self, key: &str, value: &str, node: Option<String>) -> AnyResult<()>;
    
    fn slow_log(&self, count: Option<u64>, node: Option<String>) -> AnyResult<Vec<RedisSlowLog>>;
    
    fn memory_usage(&self, param: RedisMemoryParam) -> AnyResult<Vec<RedisKeySize>>;
    
    fn client_list(&self, node: Option<String>, client_type: Option<String>) -> AnyResult<Vec<RedisClientInfo>>;
    
    fn monitor(&self, node: &str, seconds: Option<u32>) -> AnyResult<()>;
    
    fn publish(&self, channel: &str, message: &str) -> AnyResult<()>;
    
    fn subscribe(&self, channel: &str, seconds: Option<u32>) -> AnyResult<()>;

    fn mock_data(&self, count: u64) -> AnyResult<()>;
}