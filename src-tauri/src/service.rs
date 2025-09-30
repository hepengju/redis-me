#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::common::MeResult;
use crate::conn::{get_conn, get_node_list};
use crate::model::{RedisKey, RedisNode, ScanParam, ScanResult};
use RoutingInfo::SingleNode;
use SingleNodeRoutingInfo::ByAddress;
use log::info;
use r2d2::PooledConnection;
use rand::Rng;
use redis::cluster::ClusterClient;
use redis::cluster_routing::{RoutingInfo, SingleNodeRoutingInfo};
use redis::{Cmd, FromRedisValue, RedisResult, cmd};

/// 信息
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    let mut conn = get_conn(id)?;
    let (routing_info, cmd_node) = get_node_route(id, node)?;
    let value = conn
        .route_command(&redis::cmd("info"), routing_info)
        .map_err(|e| format!("命令执行异常: {e}"))?;
    let info: String =
        FromRedisValue::from_redis_value(&value).map_err(|e| format!("值转换异常: {e}"))?;
    // 记录下info是从哪个节点获取的: 原始信息里面的分割符都是\r\n
    Ok(format!("# RedisME\ncmd_node:{}\r\n\r\n{}", cmd_node, info))
}

/// 节点列表
pub fn node_list(id: &str) -> MeResult<Vec<RedisNode>> {
    let conn = get_conn(id)?;
    node_list_by_conn(conn)
}

/// 扫描集群
pub fn scan(id: &str, param: ScanParam) -> MeResult<ScanResult> {
    let mut conn = get_conn(id)?;
    let mut cc = param.cursor;

    // 空白或单字母查询，扫描1000槽位数即可；否则扫描10000个槽位数
    let batch_count = if param.pattern.replace("*", "").chars().count() <= 1 {
        1000
    } else {
        10000
    };

    let mut keys: Vec<Vec<u8>> = vec![];

    // 遍历集群节点
    'outer: for node in get_node_list(id)?
        .iter()
        .filter(|node| node.is_master) // 仅扫描主节点
        .map(|node| node.node.clone())
    {
        // 扫描过的予以跳过
        if cc.ready_nodes.contains(&node) {
            continue;
        }
        cc.now_node = node.clone();

        let (route, _) = get_node_route(id, Some(&node))?;

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
            if param.scan_type.is_some() {
                cmd.arg("type").arg(param.scan_type.clone());
            }

            let value = conn
                .route_command(&cmd, route.clone())
                .map_err(|e| format!("命令执行异常: {e}"))?;
            let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                FromRedisValue::from_redis_value(&value).map_err(|e| format!("值转换异常: {e}"))?;

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
            key: unsafe { String::from_utf8_unchecked(key.clone()) },
            bytes: key,
        })
        .collect();

    Ok(ScanResult {
        cursor: cc,
        key_list,
    })
}

// 节点列表（初始化时也使用）
pub fn node_list_by_conn(mut conn: PooledConnection<ClusterClient>) -> MeResult<Vec<RedisNode>> {
    let cluster_nodes: String = redis::cmd("cluster")
        .arg("nodes")
        .query(&mut conn)
        .map_err(|e| format!("获取集群节点列表异常: {e}"))?;
    info!("cluster_nodes: \n{cluster_nodes}");
    let node_list = parse_node_list(cluster_nodes)?;
    Ok(node_list)
}

// 解析 cluster_nodes
fn parse_node_list(cluster_nodes: String) -> MeResult<Vec<RedisNode>> {
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
fn get_node_route(id: &str, node: Option<&str>) -> MeResult<(RoutingInfo, String)> {
    let node: String = if let Some(node) = node {
        node.to_string()
    } else {
        let node_list = get_node_list(id)?;
        let random_index = rand::rng().random_range(0..node_list.len());
        node_list[random_index].node.clone()
    };

    let (host, port) = node
        .split_once(":")
        .ok_or(format!("node格式错误: {}", node))?;
    let route = SingleNode(ByAddress {
        host: host.into(),
        port: port
            .parse::<u16>()
            .map_err(|_| format!("node端口解析错误: {}", node))?,
    });
    Ok((route, node.into()))
}

// 在指定节点上执行命令
fn exec_node_command<T: FromRedisValue>(
    id: &str,
    node: &str,
    cmd: &Cmd,
) -> MeResult<RedisResult<T>> {
    let mut conn = get_conn(id)?;
    let (route, _) = get_node_route(id, Some(node))?;
    let value = conn
        .route_command(&cmd, route)
        .map_err(|e| format!("命令执行异常: {e}"))?;
    Ok(FromRedisValue::from_redis_value(&value))
}

#[cfg(test)]
mod tests {
    use crate::common::MeResult;
    use crate::service::{info, node_list, scan};
    use log::LevelFilter;
    use redis::TlsMode;
    use redis::cluster::{ClusterClient, ClusterConnection};
    use serde::de::Unexpected::Option;
    use crate::model::{ScanCursor, ScanParam};

    // 初始化日志, 避免所有测试方法都需要额外调用init方法
    #[ctor::ctor]
    fn init() {
        let _ = env_logger::builder()
            .filter_level(LevelFilter::Info)
            .is_test(true)
            .try_init();
    }

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
        info!("vec: {vec:#?}")
    }

    #[test]
    fn test_scan(){
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
}
