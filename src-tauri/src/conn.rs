use crate::model::RedisNode;
use crate::util::AnyResult;
use anyhow::bail;
use log::info;
use r2d2::{Pool, PooledConnection};
use redis::cluster::ClusterClient;
use redis::TlsMode;
use std::collections::HashMap;
use std::sync::{LazyLock, RwLock};
use std::time::Duration;

// 集群缓存连接池和节点列表
struct ClusterCache {
    pool: Pool<ClusterClient>,
    node_list: Vec<RedisNode>,
}

static CONN_POOL_MAP: LazyLock<RwLock<HashMap<String, ClusterCache>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

// 获取连接
pub fn get_conn(id: &str) -> AnyResult<PooledConnection<ClusterClient>> {
    // 从缓存中获取连接池
    if let Some(cc) = CONN_POOL_MAP.read().unwrap().get(id) {
        let conn = cc.pool.get()?;
        return Ok(conn);
    }

    let is_company = false;

    let mut nodes = vec!["rediss://192.168.1.11:7001"];
    let mut password = "hepengju";
    if is_company {
        nodes = vec!["rediss://10.106.0.167:7001"];
        password = "Jiyu1212";
    }

    let client = ClusterClient::builder(nodes)
        .connection_timeout(Duration::from_secs(5))
        .tls(TlsMode::Insecure)
        .password(password.into())
        .build()?;

    // 使用连接池管理
    let pool = Pool::builder()
        .min_idle(Some(0))
        .max_size(5)
        .build(client)?;

    // 获取一个连接
    let conn = pool.get()?;
    let node_list = crate::service::node_list_by_conn(conn)?;
    info!("{id} 连接池初始化成功");

    let new_conn = pool.get()?;

    // 连接池放入缓存
    let mut client_map = CONN_POOL_MAP.write().unwrap();
    client_map.insert(id.to_string(), ClusterCache { pool, node_list });

    Ok(new_conn)
}

pub fn get_node_list(id: &str) -> AnyResult<Vec<RedisNode>> {
    if let Some(cc) = CONN_POOL_MAP.read().unwrap().get(id) {
        return Ok(cc.node_list.clone());
    }
    bail!("{id} 未找到对应的连接池")
}

pub fn get_node_list_master(id: &str) -> AnyResult<Vec<String>> {
    Ok(get_node_list(id)?
        .into_iter()
        .filter(|node| node.is_master)
        .map(|node| node.node.clone())
        .collect::<Vec<String>>())
}