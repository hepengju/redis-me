#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::api::MeResult;
use crate::model::RedisNode;
use anyhow::bail;
use log::info;
use redis::{FromRedisValue, TlsMode};
use redis::cluster::{ClusterClient, ClusterConnection};
use redis::cluster_routing::{RoutingInfo, SingleNodeRoutingInfo};
use std::time::Duration;

// 信息
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    let mut conn = get_conn(id)?;
    let routing_info = get_node_routing_info(node)?;
    let value = conn.route_command(&redis::cmd("info"), routing_info)?;
    let info: String = FromRedisValue::from_redis_value(&value)?;
    Ok(info)
}

// 节点列表
pub fn node_list(id: &str) -> MeResult<Vec<RedisNode>> {
    let mut conn = get_conn(id)?;
    let cluster_nodes: String = redis::cmd("cluster").arg("nodes").query(&mut conn)?;
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

fn get_node_routing_info(node: Option<&str>) -> MeResult<RoutingInfo> {
    match node {
        None => Ok(RoutingInfo::SingleNode(SingleNodeRoutingInfo::Random)),
        Some(node) => {
            let arr: Vec<&str> = node.split(":").collect();
            if arr.len() != 2 {
                bail!("node格式错误: {}", node);
            }

            Ok(RoutingInfo::SingleNode(SingleNodeRoutingInfo::ByAddress {
                host: arr[0].into(),
                port: match arr[1].parse::<u16>() {
                    Ok(port) => port,
                    Err(_) => bail!("node端口解析错误: {}", node),
                },
            }))
        }
    }
}

#[allow(warnings)]
#[warn(unused_variables, unused_imports)]
#[cfg(test)]
mod tests {
    use crate::service::{info, node_list};
    use log::LevelFilter;

    #[ctor::ctor]
    fn init() {
        let _ = env_logger::builder()
            .filter_level(LevelFilter::Info)
            .is_test(true)
            .try_init();
    }

    #[test]
    fn test_info() {
        let info = info("test", None).unwrap();
        println!("{:#?}", info);
    }

    #[test]
    fn test_node_list() {
        let vec = node_list("1").unwrap();
        info!("vec: {vec:#?}")
    }
}

// 获取连接
fn get_conn(id: &str) -> MeResult<ClusterConnection> {
    get_conn_home(id)
}

// 家环境
fn get_conn_home(id: &str) -> MeResult<ClusterConnection> {
    let nodes = vec!["rediss://192.168.1.11:7001"];
    let client = ClusterClient::builder(nodes)
        .connection_timeout(Duration::from_secs(5))
        .tls(TlsMode::Insecure)
        .password("hepengju".into())
        .build()?;
    let conn = client.get_connection()?;
    info!("{id} 创建连接成功");
    Ok(conn)
}

// 公司环境
fn get_conn_company(id: &str) -> MeResult<ClusterConnection> {
    let nodes = vec!["rediss://10.106.0.167:7001"];
    let client = ClusterClient::builder(nodes)
        .connection_timeout(Duration::from_secs(5))
        .tls(TlsMode::Insecure)
        .password("Jiyu1212".into())
        .build()?;
    let conn = client.get_connection()?;
    info!("{id} 创建连接成功");
    Ok(conn)
}
