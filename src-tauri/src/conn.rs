use std::collections::HashMap;
use std::sync::{LazyLock, OnceLock, RwLock};
use crate::common::MeResult;
use log::info;
use redis::cluster::{ClusterClient};
use redis::{TlsMode};
use std::time::Duration;
use r2d2::{Pool, PooledConnection};

static CLIENT_MAP: LazyLock<RwLock<HashMap<String,Pool<ClusterClient>>>> = LazyLock::new(RwLock::new(HashMap::new));

// 获取连接
pub fn get_conn(id: &str) -> MeResult<PooledConnection<ClusterClient>> {
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

    let conn = pool.get()
        .map_err(|e| format!("{id} 获取连接失败: {e}"))?;
    info!("{id} 创建连接成功");
    Ok(conn)
}
