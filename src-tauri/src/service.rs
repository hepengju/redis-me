#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

use crate::api::MeResult;
use crate::model::RedisNode;
use log::info;
use redis::cluster::{ClusterClient, ClusterConnection};
use redis::{Commands, TlsMode};
use std::time::Duration;

// 信息
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    let mut conn = get_conn(id)?;
    let value: String = conn.get("ark-mock:string:03WDejrO4N")?;
    println!("{}", value);
    Ok("info".into())
}

// 节点列表
pub fn node_list(id: &str) -> MeResult<Vec<RedisNode>> {
    let mut conn = get_conn(id)?;
    let cluster_nodes: String = redis::cmd("cluster").arg("nodes").query(&mut conn)?;
    info!("{cluster_nodes}");
    let node_list = parse_node_list(cluster_nodes)?;
    Ok(node_list)
}

// 解析
fn parse_node_list(cluster_nodes: String) -> MeResult<Vec<RedisNode>> {
    // <id> <ip:port@cport[,hostname]> <flags> <master> <ping-sent> <pong-recv> <config-epoch> <link-state> <slot> <slot> ... <slot>
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

#[allow(warnings)]
#[warn(unused_variables, unused_imports)]
#[cfg(test)]
mod tests {
    use crate::service::{info, node_list};
    use log::LevelFilter;

    #[ctor::ctor]
    fn init() {
        let _ = env_logger::builder().filter_level(LevelFilter::Info).is_test(true).try_init();
    }

    #[test]
    fn test_info() {
        let info = info("test", None).unwrap();
        println!("{}", info);
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
