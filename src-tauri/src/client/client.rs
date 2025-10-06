use crate::utils::model::*;
use crate::utils::util::AnyResult;
use std::collections::HashMap;

/// RedisME服务接口
pub trait RedisMeClient: Send + Sync {
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

    fn config_get(&self, pattern: &str, node: Option<String>)
    -> AnyResult<HashMap<String, String>>;

    fn config_set(&self, key: &str, value: &str, node: Option<String>) -> AnyResult<()>;

    fn slow_log(&self, count: Option<u64>, node: Option<String>) -> AnyResult<Vec<RedisSlowLog>>;

    fn memory_usage(&self, param: RedisMemoryParam) -> AnyResult<Vec<RedisKeySize>>;

    fn client_list(
        &self,
        node: Option<String>,
        client_type: Option<String>,
    ) -> AnyResult<Vec<RedisClientInfo>>;

    fn monitor(&self, node: &str, seconds: Option<u32>) -> AnyResult<()>;

    fn publish(&self, channel: &str, message: &str) -> AnyResult<()>;

    fn subscribe(&self, channel: &str, seconds: Option<u32>) -> AnyResult<()>;

    fn mock_data(&self, count: u64) -> AnyResult<()>;
}

// 集群和单机共享的方法, 由于Commands不是dyn 兼容的, 无法直接写在父类中(也许有其他办法?)
#[macro_export]
macro_rules! implement_common_commands {
    ($struct_name:ident) => {

fn get(&self, key: Vec<u8>, hash_key: Option<String>) -> AnyResult<RedisValue> {
        let mut conn = self.pool.get()?;
        let ttl: i64 = conn.ttl(&key)?;
        let key_type: ValueType = conn.key_type(&key)?;

        let value: serde_json::Value = match key_type {
            ValueType::Unknown(other) => {
                if "none" == other {
                    bail!("键不存在: {}", vec8_to_string(key))
                } else {
                    bail!("未知类型: {other}")
                }
            }
            ValueType::String => {
                let value: String = conn.get(&key)?;
                serde_json::to_value(value)
            }
            ValueType::List => {
                let value: Vec<String> = conn.lrange(&key, 0, -1)?;
                serde_json::to_value(value)
            }
            ValueType::Set => {
                let value: HashSet<String> = conn.smembers(&key)?;
                serde_json::to_value(value)
            }
            ValueType::ZSet => {
                let value: Vec<(String, f64)> = conn.zrange_withscores(&key, 0, -1)?;
                let list: Vec<RedisZetItem> = value
                    .into_iter()
                    .map(|(value, score)| RedisZetItem { value, score })
                    .collect();
                serde_json::to_value(list)
            }
            ValueType::Hash => {
                if let Some(hash_key) = hash_key {
                    let value: String = conn.hget(&key, hash_key)?;
                    serde_json::to_value(value)
                } else {
                    let value: HashMap<String, String> = conn.hgetall(&key)?;
                    serde_json::to_value(value)
                }
            }
            ValueType::Stream => bail!("stream类型暂不支持获取值"),
        }?;

        Ok(RedisValue {
            key_type: key_type.into(),
            ttl,
            value,
        })
    }

fn ttl(&self, key: Vec<u8>, ttl: i64) -> AnyResult<()> {
    let mut conn = self.pool.get()?;
    if ttl < 0 {
        // 移除 key 上已有的过期时间，将键从易失（设置了过期时间的键）变为变为持久
        // 整型回复: 如果 key 不存在或没有关联的过期时间，则返回 0。
        // 整型回复: 如果已移除过期时间，则返回 1。
        let _: () = conn.persist(&key)?;
    } else {
        // 为 key 设置超时时间。超时时间到期后，该 key 将被自动删除。
        // 请注意，调用 EXPIRE/`PEXPIRE` 时使用非正数超时，或调用 `EXPIREAT`/`PEXPIREAT` 时使用过去的时间，
        // 将导致 key 被 删除 而非过期（相应地，发出的 key 事件 将是 del，而不是 expired）。
        // 整数回复：如果未设置超时时间则返回 0；例如，key 不存在，或者由于提供的参数而跳过了操作。
        // 整数回复：如果已设置超时时间则返回 1。
        let _: () = conn.expire(&key, ttl)?;
    };
    Ok(())
}

fn set(&self, key: Vec<u8>, value: String, ttl: i64) -> AnyResult<()> {
    let mut conn = self.pool.get()?;
    if ttl < 0 {
        let _: () = conn.set(&key, value)?;
    } else {
        let options = SetOptions::default().with_expiration(SetExpiry::EX(ttl as u64));
        let _: () = conn.set_options(&key, value, options)?;
    };
    Ok(())
}

fn del(&self, key: Vec<u8>) -> AnyResult<()> {
    let mut conn = self.pool.get()?;
    let _: () = conn.del(&key)?;
    Ok(())
}

fn field_add(&self, param: RedisFieldAdd) -> AnyResult<()> {
    let mut conn = self.pool.get()?;

    let mode = param.mode;
    let mut key: Vec<u8> = param.key.into();
    let mut key_type = ValueType::from(param.key_type);

    if "key" == mode {
        // 新增键
        let exists: bool = conn.exists(&key)?;
        assert_is_true(
            !exists,
            format!("键已存在: {}", vec8_to_string(key.clone())),
        )?
    } else if "field" == mode {
        // 新增字段
        key = param.bytes.into();
        key_type = conn.key_type(&key)?
    } else {
        bail!("模式: {} 暂不支持", mode)
    }

    let fv_list = param.field_value_list;

    match key_type {
        ValueType::String => conn.set(&key, &param.value)?,
        ValueType::Hash => fv_list
            .into_iter()
            .try_for_each(|f| conn.hset(&key, f.field_key, f.field_value))?,
        ValueType::List => {
            if "lpush" == param.list_push_method {
                // 插入头部时保持原有顺序
                fv_list
                    .into_iter()
                    .rev()
                    .try_for_each(|fv| conn.lpush(&key, fv.field_value))?;
            } else {
                fv_list
                    .into_iter()
                    .try_for_each(|f| conn.rpush(&key, f.field_value))?;
            }
        }
        ValueType::Set => fv_list
            .into_iter()
            .try_for_each(|f| conn.sadd(&key, f.field_value))?,
        ValueType::ZSet => fv_list
            .into_iter()
            .try_for_each(|f| conn.zadd(&key, f.field_value, f.field_score))?,
        ValueType::Stream => bail!("stream类型暂不支持新增字段值"),
        ValueType::Unknown(other) => {
            if "none" == other {
                bail!("键不存在: {}", vec8_to_string(key))
            } else {
                bail!("未知类型: {other}")
            }
        }
    };

    if "key" == mode {
        if param.ttl > 0 {
            let _: () = conn.expire(&key, param.ttl)?;
        }
    }
    Ok(())
}

fn field_set(&self, param: RedisFieldSet) -> AnyResult<()> {
    let mut conn = self.pool.get()?;

    let key: Vec<u8> = param.bytes;
    let key_type: ValueType = conn.key_type(&key)?;

    match key_type {
        ValueType::Hash => {
            let _: () = conn.hset(&key, param.field_key, param.field_value)?;
        }
        ValueType::List => {
            let _: () = conn.lset(&key, param.field_index, param.field_value)?;
        }
        ValueType::Set => {
            let _: () = conn.srem(&key, param.src_field_value)?;
            let _: () = conn.sadd(&key, param.field_value)?;
        }
        ValueType::ZSet => {
            let _: () = conn.zrem(&key, param.src_field_value)?;
            let _: () = conn.zadd(&key, param.field_value, param.field_score)?;
        }
        ValueType::String => bail!("string类型暂不支持设置字段值"),
        ValueType::Stream => bail!("stream类型暂不支持设置字段值"),
        ValueType::Unknown(other) => {
            if "none" == other {
                bail!("键不存在: {}", vec8_to_string(key))
            } else {
                bail!("未知类型: {other}")
            }
        }
    };
    Ok(())
}

fn field_del(&self, param: RedisFieldDel) -> AnyResult<()> {
    let mut conn = self.pool.get()?;
    let key: Vec<u8> = param.bytes;
    let key_type: ValueType = conn.key_type(&key)?;

    match key_type {
        ValueType::Hash => {
            let _: () = conn.hdel(&key, param.field_key)?;
        }
        ValueType::List => {
            let _: () =
                conn.lset(&key, param.field_index, REDIS_ME_FIELD_TO_DELETE_TMP_VALUE)?;
            let _: () = conn.lrem(&key, 1, REDIS_ME_FIELD_TO_DELETE_TMP_VALUE)?;
        }
        ValueType::Set => {
            let _: () = conn.srem(&key, param.field_value)?;
        }
        ValueType::ZSet => {
            let _: () = conn.zrem(&key, param.field_value)?;
        }
        ValueType::String => bail!("string类型暂不支持删除字段值"),
        ValueType::Stream => bail!("stream类型暂不支持删除字段值"),
        ValueType::Unknown(other) => {
            if "none" == other {
                bail!("键不存在: {}", vec8_to_string(key))
            } else {
                bail!("未知类型: {other}")
            }
        }
    };
    Ok(())
}

fn publish(&self, channel: &str, message: &str) -> AnyResult<()> {
    let mut conn = self.pool.get()?;
    let _: () = conn.publish(channel, message)?;
    Ok(())
}

fn mock_data(&self, count: u64) -> AnyResult<()> {
    let mut conn = self.pool.get()?;
    let mut pipe = $struct_name::with_capacity(count as usize);

    for _ in 0..count {
        // string
        let key = format!("redis-me-mock:string:{}", random_string(10));
        pipe.set(&key, random_string(10)).ignore();

        // hash
        let field_count = random_range(3, 20);
        let key = format!("redis-me-mock:hash:{}", random_string(10));
        for x in 0..field_count {
            pipe.hset(&key, format!("key{x}"), random_string(10))
                .ignore();
        }

        // list
        let key = format!("redis-me-mock:list:{}", random_string(10));
        for _ in 0..field_count {
            pipe.rpush(&key, random_string(10)).ignore();
        }

        // set
        let key = format!("redis-me-mock:set:{}", random_string(10));
        for _ in 0..field_count {
            pipe.sadd(&key, random_string(10)).ignore();
        }

        // zset
        let key = format!("redis-me-mock:zset:{}", random_string(10));
        for _ in 0..field_count {
            pipe.zadd(&key, random_string(10), random_range(1, 100))
                .ignore();
        }
    }

    let _: () = pipe.query(&mut conn)?;
    Ok(())
}

    }
}