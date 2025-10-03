#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::conn::{get_conn, get_node_list, get_node_list_master};
use crate::model::{
    RedisClientInfo, RedisCommand, RedisFieldAdd, RedisFieldDel, RedisFieldSet, RedisInfo,
    RedisKey, RedisKeySize, RedisMemoryParam, RedisNode, RedisSlowLog, RedisValue, RedisZetItem,
    ScanParam, ScanResult,
};
use crate::util::{
    assert_is_true, parse_command, random_item, random_range, random_string, redis_value_to_string,
    timestamp_to_string, vec8_to_string, AnyResult,
};
use anyhow::{bail};
use log::info;
use r2d2::PooledConnection;
use redis::cluster::{ClusterClient, ClusterPipeline};
use redis::cluster_routing::{RoutingInfo, SingleNodeRoutingInfo};
use redis::{Commands, FromRedisValue, SetExpiry, SetOptions, Value, ValueType};
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use std::{thread};
use RoutingInfo::SingleNode;
use SingleNodeRoutingInfo::ByAddress;

const REDIS_ME_FIELD_TO_DELETE_TMP_VALUE: &str = "__REDIS_ME_FIELD_TO_DELETE_TMP_VALUE__";

/// 信息
pub fn info(id: &str, node: Option<String>) -> AnyResult<RedisInfo> {
    let mut conn = get_conn(id)?;
    let (route, exec_node) = get_node_route(id, node)?;
    let value = conn.route_command(&redis::cmd("info"), route)?;
    let info: String = FromRedisValue::from_redis_value(&value)?;
    Ok(RedisInfo {
        node: exec_node,
        info,
    })
}

/// 信息列表
pub fn info_list(id: &str) -> AnyResult<Vec<RedisInfo>> {
    let mut conn = get_conn(id)?;
    let mut infos = vec![];
    for node in get_node_list(id)? {
        let node = node.node;
        let (route, _) = get_node_route(id, Some(node.clone()))?;
        let value = conn.route_command(&redis::cmd("info"), route)?;
        let info: String = FromRedisValue::from_redis_value(&value)?;
        infos.push(RedisInfo { node, info })
    }
    Ok(infos)
}

/// 节点列表
pub fn node_list(id: &str) -> AnyResult<Vec<RedisNode>> {
    let conn = get_conn(id)?;
    node_list_by_conn(conn)
}

/// 扫描集群
pub fn scan(id: &str, param: ScanParam) -> AnyResult<ScanResult> {
    // RedisCluster目前不能直接扫描SCAN, 参考Issue进行多个节点处理
    // 参考: https://github.com/redis-rs/redis-rs/pull/1233/commits/997df1834d1bfccdbd56827d39fc4cf08874efec
    // Error: This command cannot be safely routed in cluster mode- ClientError
    // let keys: Vec<String> = conn.scan_options(opts)?.collect();
    let mut conn = get_conn(id)?;
    let mut cc = param.cursor;

    // 空白或单字母查询，扫描1000槽位数即可；否则扫描10000个槽位数
    let batch_count = if param.pattern.replace("*", "").chars().count() <= 1 {
        1000
    } else {
        10000
    };

    let mut keys: Vec<Vec<u8>> = vec![];

    // 遍历集群节点: 仅扫描主节点
    let nodes: Vec<String> = get_node_list_master(id)?;
    let node_size = nodes.len();

    'outer: for node in nodes {
        if cc.ready_nodes.contains(&node) {
            continue; // 扫描过的予以跳过
        }
        cc.now_node = node.clone();

        let (route, _) = get_node_route(id, Some(node.clone()))?;

        'inner: loop {
            // 正在扫描的节点则重置上次游标
            let cursor = if cc.now_node == node {
                cc.now_cursor
            } else {
                0
            };

            let mut cmd = redis::cmd("scan");
            cmd.arg(cursor)
                .arg("match")
                .arg(param.pattern.clone())
                .arg("count")
                .arg(batch_count);

            if let Some(ref scan_type) = param.scan_type {
                cmd.arg("type").arg(scan_type);
            }

            let value = conn.route_command(&cmd, route.clone())?;
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                FromRedisValue::from_redis_value(&value)?;

            keys.extend(new_keys);
            cc.now_cursor = next_cursor;
            if !param.load_all && keys.len() >= param.count as usize {
                break 'outer;
            }

            if next_cursor == 0 {
                break 'inner;
            }
        }
        cc.ready_nodes.push(node.clone());
    }

    // 映射为返回值
    let key_list = keys
        .into_iter()
        .map(|key| RedisKey {
            key: vec8_to_string(key.clone()),
            bytes: key,
        })
        .collect();

    // 判断是否扫描完毕
    if cc.ready_nodes.len() == node_size {
        cc.finished = true;
        cc.now_node = "".to_string();
        cc.now_cursor = 0;
    }

    Ok(ScanResult {
        cursor: cc,
        key_list,
    })
}

/// 获取值
pub fn get(id: &str, key: Vec<u8>, hash_key: Option<String>) -> AnyResult<RedisValue> {
    let mut conn = get_conn(id)?;
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

/// 设置TTL
pub fn ttl(id: &str, key: Vec<u8>, ttl: i64) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
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

/// 设置值
pub fn set(id: &str, key: Vec<u8>, value: String, ttl: i64) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    if ttl < 0 {
        let _: () = conn.set(&key, value)?;
    } else {
        let options = SetOptions::default().with_expiration(SetExpiry::EX(ttl as u64));
        let _: () = conn.set_options(&key, value, options)?;
    };
    Ok(())
}

/// 删除键
pub fn del(id: &str, key: Vec<u8>) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    let _: () = conn.del(&key)?;
    Ok(())
}

/// 新增字段
pub fn field_add(id: &str, param: RedisFieldAdd) -> AnyResult<()> {
    let mut conn = get_conn(id)?;

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

/// 编辑字段
pub fn field_set(id: &str, param: RedisFieldSet) -> AnyResult<()> {
    let mut conn = get_conn(id)?;

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

/// 删除字段
pub fn field_del(id: &str, param: RedisFieldDel) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    let key: Vec<u8> = param.bytes;
    let key_type: ValueType = conn.key_type(&key)?;

    match key_type {
        ValueType::Hash => {
            let _: () = conn.hdel(&key, param.field_key)?;
        }
        ValueType::List => {
            let _: () = conn.lset(&key, param.field_index, REDIS_ME_FIELD_TO_DELETE_TMP_VALUE)?;
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

/// 模拟数据
pub fn mock_data(id: &str, count: u64) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    let mut pipe = ClusterPipeline::with_capacity(count as usize);

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

/// 执行命令
pub fn execute_command(id: &str, param: RedisCommand) -> AnyResult<String> {
    let (cmd, args) = parse_command(param.command.as_str())?;
    if cmd == "" {
        return Ok("".into());
    };

    let mut conn = get_conn(id)?;
    let (route, _) = get_node_route(id, param.node)?;
    let value = conn.route_command(redis::cmd(cmd.as_str()).arg(args), route)?;
    Ok(redis_value_to_string(value, "\n"))
}

/// 获取配置
pub fn config_get(
    id: &str,
    pattern: &str,
    node: Option<String>,
) -> AnyResult<HashMap<String, String>> {
    let mut conn = get_conn(id)?;
    let (route, _) = get_node_route(id, node)?;
    let value = conn.route_command(redis::cmd("config").arg("get").arg(pattern), route)?;
    let result: HashMap<String, String> = FromRedisValue::from_redis_value(&value)?;
    Ok(result)
}

/// 设置配置
pub fn config_set(id: &str, key: &str, value: &str, node: Option<String>) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    let (route, _) = get_node_route(id, node)?;
    let _ = conn.route_command(redis::cmd("config").arg("set").arg(key).arg(value), route)?;
    Ok(())
}

/// 慢日志
pub fn slow_log(
    id: &str,
    count: Option<u64>,
    node: Option<String>,
) -> AnyResult<Vec<RedisSlowLog>> {
    let mut conn = get_conn(id)?;
    let mut logs = vec![];
    for redis_node in get_node_list(id)? {
        // 如果参数中包含节点参数，则只返回指定节点的慢日志
        if let Some(ref n) = node {
            if n != &redis_node.node {
                continue;
            }
        }

        let node = redis_node.node;
        let (route, _) = get_node_route(id, Some(node.clone()))?;
        let value_total = conn.route_command(
            &redis::cmd("slowlog").arg("get").arg(count.unwrap_or(128)),
            route,
        )?;
        let value_list: Vec<Value> = FromRedisValue::from_redis_value(&value_total)?;
        for value in value_list {
            let items = match value {
                Value::Array(arr) if arr.len() >= 4 => arr,
                Value::Array(_) => bail!("慢查询条目至少4个元素"),
                _ => bail!("应为慢查询条目的数组"),
            };

            let id: u64 = FromRedisValue::from_redis_value(&items[0])?;
            let time = timestamp_to_string(FromRedisValue::from_redis_value(&items[1])?);
            let cost: f64 = FromRedisValue::from_redis_value(&items[2])?;
            let command: String = redis_value_to_string(items[3].clone(), " ");
            let client: String = if items.len() > 5 {
                FromRedisValue::from_redis_value(&items[4])?
            } else {
                "".into()
            };

            let client_name: String = if items.len() > 6 {
                FromRedisValue::from_redis_value(&items[5])?
            } else {
                "".into()
            };

            let log = RedisSlowLog {
                node: node.clone(),
                id,
                time,
                cost: cost / 1000.0,
                command,
                client,
                client_name,
            };
            logs.push(log);
        }
    }
    Ok(logs)
}

/// 内存分析: TODO
pub fn memory_usage(id: &str, param: RedisMemoryParam) -> AnyResult<Vec<RedisKeySize>> {
    let mut conn = get_conn(id)?;
    let mut keys: Vec<(Vec<u8>, u64, String)> = vec![];

    // 遍历集群节点: 仅扫描主节点
    let nodes: Vec<String> = get_node_list_master(id)?;

    let mut scan_times = 0;
    'outer: for node in nodes {
        let (route, _) = get_node_route(id, Some(node.clone()))?;
        let mut cursor = 0;
        'inner: loop {
            let mut cmd = redis::cmd("scan");
            cmd.arg(cursor)
                .arg("match")
                .arg(param.pattern.clone().unwrap_or("*".into()))
                .arg("count")
                .arg(param.scan_count);

            let value = conn.route_command(&cmd, route.clone())?;
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                FromRedisValue::from_redis_value(&value)?;
            cursor = next_cursor;

            // 计算键大小
            let mut pipe = ClusterPipeline::with_capacity(new_keys.len());
            for key in new_keys.iter() {
                pipe.cmd("memory").arg("usage").arg(key);
            }
            let sizes: Vec<u64> = pipe.query(&mut conn)?;
            for (index, size) in sizes.into_iter().enumerate() {
                if size >= param.size_limit {
                    keys.push((new_keys[index].clone(), size, "unknown".into()));
                }
            }

            scan_times += 1;

            if keys.len() >= param.count_limit as usize {
                info!("扫描结果>={}个, 返回", param.count_limit);
                break 'outer;
            }

            if param.scan_total > 0 && scan_times * param.scan_count >= param.scan_total {
                info!("已扫描键>={}个, 返回", param.scan_total);
                break 'outer;
            }

            thread::sleep(Duration::from_millis(param.sleep_millis));

            if cursor == 0 {
                break 'inner;
            }
        }
    }

    // 计算键类型
    let mut pipe = ClusterPipeline::with_capacity(keys.len());
    for key in keys.iter() {
        pipe.cmd("type").arg(&key.0);
    }
    let types: Vec<String> = pipe.query(&mut conn)?;
    for (index, key_type) in types.into_iter().enumerate() {
        keys[index].2 = key_type;
    }

    // 映射为返回值
    let key_list = keys
        .into_iter()
        .map(|(key, size, key_type)| RedisKeySize {
            key: vec8_to_string(key.clone()),
            bytes: key,
            size,
            key_type,
        })
        .collect();
    Ok(key_list)
}

/// 客户端列表
pub fn client_list(
    id: &str,
    node: Option<String>,
    client_type: Option<String>,
) -> AnyResult<Vec<RedisClientInfo>> {
    let mut conn = get_conn(id)?;
    let node_list = get_node_list(id)?;

    let mut clients = vec![];
    for redis_node in node_list {
        // 如果参数中包含节点参数，则只返回指定节点的慢日志
        if let Some(ref n) = node {
            if n != &redis_node.node {
                continue;
            }
        }
        let node = redis_node.node;
        let (route, _) = get_node_route(id, Some(node.clone()))?;

        let mut cmd = redis::cmd("client");
        cmd.arg("list");
        if let Some(ref client_type_val) = client_type {
            cmd.arg("type").arg(client_type_val);
        }
        let value = conn.route_command(&cmd, route)?;
        let value_list: Vec<String> = FromRedisValue::from_redis_value(&value)?;
        for client_info in value_list.into_iter() {
            let client: RedisClientInfo = parse_client_info(&client_info)?;
            clients.push(client);
        }
    }
    Ok(clients)
}

/// 监控命令
pub fn monitor(id: &str, node: &str) -> AnyResult<()> {
    todo!()
}
/// 发送消息
pub fn publish(id: &str, channel: &str, message: &str) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    let _: () = conn.publish(channel, message)?;
    Ok(())
}

/// 订阅消息
pub fn subscribe(id: &str, channel: &str) -> AnyResult<()> {
    let mut conn = get_conn(id)?;
    todo!()
}
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
fn parse_client_info(client_info: &str) -> AnyResult<RedisClientInfo> {
    let mut map = HashMap::with_capacity(32);

    for key_eq_val in client_info.split_whitespace().into_iter() {
        if let Some((key, val)) = key_eq_val.split_once("=") {
            map.insert(key, val);
        }
    }

    let json = serde_json::to_string(&map)?;
    let client: RedisClientInfo = serde_json::from_str(&json)?;
    Ok(client)
}
// 节点列表（初始化时也使用）
pub fn node_list_by_conn(mut conn: PooledConnection<ClusterClient>) -> AnyResult<Vec<RedisNode>> {
    let cluster_nodes: String = redis::cmd("cluster").arg("nodes").query(&mut conn)?;
    info!("cluster_nodes: \n{cluster_nodes}");
    let node_list = parse_node_list(cluster_nodes)?;
    Ok(node_list)
}

// 解析 cluster_nodes
fn parse_node_list(cluster_nodes: String) -> AnyResult<Vec<RedisNode>> {
    // 结构
    // <id> <ip:port@cport[,hostname]> <flags> <master> <ping-sent> <pong-recv> <config-epoch> <link-state> <slot> <slot> ... <slot>

    // 示例
    // 01b6af43bd8fe6471097f5b9e5f6e4ff0945d145 192.168.1.11:7004@17004 myself,slave 08914f4493d93b198c1dfe15ab9c14a488ada09d 0 0 2 connected
    // 86ab8ccdddac8e3bd2d114d51a21f13d186ec178 192.168.1.11:7005@17005 slave e82b9f07782a16fe8e42aef8553ea473ddb130ef 0 1758958605000 3 connected
    // e82b9f07782a16fe8e42aef8553ea473ddb130ef 192.168.1.11:7003@17003 master - 0 1758958606000 3 connected 10923-16383
    // c1a786767e6a9574e8116bb771a96f2ddf001148 192.168.1.11:7006@17006 slave 993bffbf44adde4eeabf9b75f26f999177f23412 0 1758958608265 1 connected
    // 08914f4493d93b198c1dfe15ab9c14a488ada09d 192.168.1.11:7002@17002 master - 0 1758958607260 2 connected 5461-10922
    // 993bffbf44adde4eeabf9b75f26f999177f23412 192.168.1.11:7001@17001 master - 0 1758958607000 1 connected 0-5460

    let cluster_nodes = cluster_nodes.split("\n");
    let mut nodes = vec![];

    // 解析master节点
    for line in cluster_nodes.clone() {
        let parts: Vec<_> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        if parts[2] == "master" || parts[2] == "myself,master" {
            let id = parts[0];
            let node = parts[1].split("@").next().unwrap();
            nodes.push(RedisNode {
                id: id.into(),
                node: node.into(),
                is_master: true,
                slave_of_node: None,
            })
        }
    }

    // 解析slave节点
    for line in cluster_nodes {
        let parts: Vec<_> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }

        if parts[2] == "slave" || parts[2] == "myself,slave" {
            let id = parts[0];
            let node = parts[1].split("@").next().unwrap();
            let master_id = parts[3];

            let master_node = nodes.iter().find(|node| node.id == master_id);

            nodes.push(RedisNode {
                id: id.into(),
                node: node.into(),
                is_master: false,
                slave_of_node: master_node.map(|node| node.id.clone()),
            })
        }
    }
    Ok(nodes)
}

// 获取节点路由信息
fn get_node_route(id: &str, node: Option<String>) -> AnyResult<(RoutingInfo, String)> {
    let node: String = if let Some(node) = node {
        node.to_string()
    } else {
        let node_list = get_node_list(id)?;
        random_item(node_list).node
    };

    if let Some((host, port)) = node.split_once(":") {
        let route = SingleNode(ByAddress {
            host: host.into(),
            port: port.parse::<u16>()?,
        });
        Ok((route, node.into()))
    } else {
        bail!("Invalid node format: {}", node)
    }
}
