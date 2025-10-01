#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::conn::{get_conn, get_node_list};
use crate::model::{RedisFieldAdd, RedisFieldValue, RedisKey, RedisNode, RedisValue, RedisZetItem, ScanParam, ScanResult};
use crate::util::{assert_is_true, vec8_to_string, AnyResult, ApiResult};
use anyhow::bail;
use log::info;
use r2d2::PooledConnection;
use rand::Rng;
use redis::cluster::ClusterClient;
use redis::cluster_routing::{RoutingInfo, SingleNodeRoutingInfo};
use redis::{Cmd, Commands, FromRedisValue, RedisResult, SetExpiry, SetOptions, ValueType};
use std::collections::{HashMap, HashSet};
use std::fs::exists;
use RoutingInfo::SingleNode;
use SingleNodeRoutingInfo::ByAddress;

/// 信息
pub fn info(id: &str, node: Option<&str>) -> AnyResult<String> {
    let mut conn = get_conn(id)?;
    let (routing_info, cmd_node) = get_node_route(id, node)?;
    let value = conn.route_command(&redis::cmd("info"), routing_info)?;
    let info: String = FromRedisValue::from_redis_value(&value)?;
    // 记录下info是从哪个节点获取的: 原始信息里面的分割符都是\r\n
    Ok(format!("# RedisME\ncmd_node:{}\r\n\r\n{}", cmd_node, info))
}

/// 节点列表
pub fn node_list(id: &str) -> AnyResult<Vec<RedisNode>> {
    let conn = get_conn(id)?;
    node_list_by_conn(conn)
}

/// 扫描集群
pub fn scan(id: &str, param: ScanParam) -> AnyResult<ScanResult> {
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
    let nodes: Vec<String> = get_node_list(id)?.into_iter()
        .filter(|node| node.is_master)
        .map(|node| node.node.clone())
        .collect();

    'outer: for node in &nodes {
        // 扫描过的予以跳过
        if cc.ready_nodes.contains(node) {
            continue;
        }
        cc.now_node = node.clone();

        let (route, _) = get_node_route(id, Some(node))?;

        'inner: loop {
            // 正在扫描的节点则重置上次游标
            let cursor = if cc.now_node == *node {
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
            if param.scan_type.is_some() {
                cmd.arg("type").arg(param.scan_type.clone());
            }

            let value = conn.route_command(&cmd, route.clone())?;
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                FromRedisValue::from_redis_value(&value)?;

            keys.extend(new_keys);
            cc.now_cursor = next_cursor;
            if !param.load_all && keys.len() >= param.count {
                break 'outer;
            }

            if next_cursor == 0 {
                break 'inner;
            }
        }
        cc.ready_nodes.push(node.clone());
    }

    let key_list = keys
        .into_iter()
        .map(|key| RedisKey {
            key: vec8_to_string(key.clone()),
            bytes: key,
        })
        .collect();

    // 判断是否扫描完毕
    if cc.ready_nodes.len() == nodes.len() {
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
        },
        ValueType::List => {
            let value: Vec<String> =conn.lrange(&key, 0, -1)?;
            serde_json::to_value(value)
        },
        ValueType::Set => {
            let value: HashSet<String> = conn.smembers(&key)?;
            serde_json::to_value(value)
        },
        ValueType::ZSet => {
            let value: Vec<(String, f64)> = conn.zrange_withscores(&key, 0, -1)?;
            let list: Vec<RedisZetItem> = value.into_iter().map(|(value, score)| RedisZetItem{value, score}).collect();
            serde_json::to_value(list)
        },
        ValueType::Hash => {
            if let Some(hash_key) = hash_key {
                let value: String = conn.hget(&key, hash_key)?;
                serde_json::to_value(value)
            } else {
                let value: HashMap<String, String> = conn.hgetall(&key)?;
                serde_json::to_value(value)
            }
        }
        ValueType::Stream => bail!("暂不支持stream类型"),
    }?;

    Ok(RedisValue {
        key_type: key_type.into(),
        ttl,
        value
    })
}

/// 设置TTL
pub fn ttl(id: &str, key: Vec<u8>, ttl: i64) -> AnyResult<i64> {
    let mut conn = get_conn(id)?;
    let value: i64 =  if ttl < 0 {
        // 移除 key 上已有的过期时间，将键从易失（设置了过期时间的键）变为变为持久
        // 整型回复: 如果 key 不存在或没有关联的过期时间，则返回 0。
        // 整型回复: 如果已移除过期时间，则返回 1。
        conn.persist(&key)?
    } else {
        // 为 key 设置超时时间。超时时间到期后，该 key 将被自动删除。
        // 请注意，调用 EXPIRE/`PEXPIRE` 时使用非正数超时，或调用 `EXPIREAT`/`PEXPIREAT` 时使用过去的时间，
        // 将导致 key 被 删除 而非过期（相应地，发出的 key 事件 将是 del，而不是 expired）。
        // 整数回复：如果未设置超时时间则返回 0；例如，key 不存在，或者由于提供的参数而跳过了操作。
        // 整数回复：如果已设置超时时间则返回 1。
        conn.expire(&key, ttl)?
    };
    Ok(value)
}

/// 设置值
pub fn set(id: &str, key: Vec<u8>, value: String, ttl: i64) -> AnyResult<String> {
    let mut conn = get_conn(id)?;
    let value = if ttl < 0 {
        conn.set(&key, value)?
    } else {
        let options = SetOptions::default().with_expiration(SetExpiry::EX(ttl as u64));
        conn.set_options(&key, value, options)?
    };
    Ok(value)
}

/// 删除键
pub fn del(id: &str, key: Vec<u8>) -> AnyResult<i64> {
    let mut conn = get_conn(id)?;
    let value: i64 = conn.del(&key)?;
    Ok(value)
}

/// 新增字段
pub fn field_add(id: &str, key: Vec<u8>, rfa: RedisFieldAdd) -> AnyResult<()> {
    let mut conn = get_conn(id)?;

    let mode = rfa.mode;
    let mut key_type = ValueType::from(rfa.key_type);

    if "key" == mode {
        let exists: bool = conn.exists(&key)?;
        assert_is_true(!exists, format!("键已存在: {}",vec8_to_string(key.clone())))?
    } else if "field" == mode {
        key_type = conn.key_type(&key)?
    } else {
        bail!("模式: {} 暂不支持", mode)
    }

    let fv_list = rfa.field_value_list;

    match key_type {
        ValueType::Unknown(other) => {
            if "none" == other {
                bail!("键不存在: {}", vec8_to_string(key))
            } else {
                bail!("未知类型: {other}")
            }
        },
        ValueType::String => conn.set(&key, &rfa.value)?,
        ValueType::Hash => fv_list.into_iter().for_each(|f| conn.hset(&key, f.field_key, f.field_value).unwrap()),
        ValueType::List => {
            if "lpush" == rfa.list_push_method {
                // 插入头部时保持原有顺序
                fv_list.into_iter().rev().for_each(|fv| conn.lpush(&key, fv.field_value).unwrap());
            } else {
                fv_list.into_iter().for_each(|f| conn.rpush(&key, f.field_value).unwrap());
            }
        },
        ValueType::Set => fv_list.into_iter().for_each(|f| conn.sadd(&key, f.field_value).unwrap()),
        ValueType::ZSet => fv_list.into_iter().for_each(|f| conn.zadd(&key, f.field_value, f.field_score).unwrap()),
        ValueType::Stream => bail!("暂不支持stream类型"),
    };

    if "key" == mode {
        if rfa.ttl > 0 {
            let _: () = conn.expire(&key, rfa.ttl)?;
        }
    }
    Ok(())
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
fn get_node_route(id: &str, node: Option<&str>) -> AnyResult<(RoutingInfo, String)> {
    let node: String = if let Some(node) = node {
        node.to_string()
    } else {
        let node_list = get_node_list(id)?;
        let random_index = rand::rng().random_range(0..node_list.len());
        node_list[random_index].node.clone()
    };

    let (host, port) = node.split_once(":").unwrap();
    let route = SingleNode(ByAddress {
        host: host.into(),
        port: port.parse::<u16>()?,
    });
    Ok((route, node.into()))
}

// 在指定节点上执行命令
fn exec_node_command<T: FromRedisValue>(
    id: &str,
    node: &str,
    cmd: &Cmd,
) -> AnyResult<RedisResult<T>> {
    let mut conn = get_conn(id)?;
    let (route, _) = get_node_route(id, Some(node))?;
    let value = conn.route_command(&cmd, route)?;
    Ok(FromRedisValue::from_redis_value(&value))
}

#[cfg(test)]
mod tests {
    use crate::model::{ScanCursor, ScanParam};
    use crate::service::*;

    // 初始化日志, 避免所有测试方法都需要额外调用init方法
    // #[ctor::ctor]
    // fn init() {
    //     let _ = env_logger::builder()
    //         .filter_level(LevelFilter::Info)
    //         .is_test(true)
    //         .try_init();
    // }

    #[test]
    fn test_info() {
        let result = info("test", None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_node() {
        let result = info("test", Some("192.168.1.11:7001")).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_node_list() {
        let vec = node_list("1").unwrap();
        println!("vec: {vec:#?}")
    }

    #[test]
    fn test_scan() {
        let param = ScanParam {
            pattern: "*".into(),
            count: 10,
            scan_type: None,

            cursor: ScanCursor {
                ready_nodes: vec![],
                now_node: "".into(),
                now_cursor: 0,
                finished: false,
            },
            load_all: false,
        };
        let result1 = scan("test", param).unwrap();
        println!("{result1:#?}");

        let param2 = ScanParam {
            pattern: "*".into(),
            count: 10,
            scan_type: None,
            cursor: result1.cursor,
            load_all: false,
        };
        let result2 = scan("test", param2).unwrap();
        println!("{result2:#?}");
    }

    #[test]
    fn test_get(){
        let value = get("test", "hepengju:list".into(), None).unwrap();
        println!("{value:#?}");
        println!("{}", serde_json::to_string(&value).unwrap());

        let value = get("test", "hepengju:string".into(), None).unwrap();
        println!("{}", serde_json::to_string(&value).unwrap());
    }
}
