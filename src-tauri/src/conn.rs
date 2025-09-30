use std::collections::HashMap;
use std::sync::{LazyLock, RwLock};
use crate::common::MeResult;
use log::info;
use redis::cluster::{ClusterClient};
use redis::{TlsMode};
use std::time::Duration;
use r2d2::{Pool, PooledConnection};

static CONN_POOL_MAP: LazyLock<RwLock<HashMap<String,Pool<ClusterClient>>>> = LazyLock::new(|| RwLock::new(HashMap::new()));

// 获取连接
pub fn get_conn(id: &str) -> MeResult<PooledConnection<ClusterClient>> {
    // 从缓存中获取连接池
    if let Some(pool) = CONN_POOL_MAP.read().unwrap().get(id) {
        let conn = pool.get().map_err(|e| format!("{id} 获取连接失败: {e}"))?;
        return Ok(conn)
    }

    let is_company = true;

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
        .build()
        .map_err(|e| format!("{id} 集群配置失败: {e}"))?;

    // 使用连接池管理
    let pool = r2d2::Pool::builder()
        .min_idle(Some(0))
        .max_size(5)
        .build(client)
        .unwrap();

    // 获取一个连接, 确认参数没有问题, 并放入缓存中
    let conn = pool.get()
        .map_err(|e| format!("{id} 获取连接失败: {e}"))?;
    info!("{id} 连接池初始化成功");

    let mut client_map = CONN_POOL_MAP.write().unwrap();
    client_map.insert(id.to_string(), pool.clone());
    Ok(conn)
}
