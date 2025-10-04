use crate::util::AnyResult;
use r2d2::Pool;
use redis::cluster::ClusterClient;
use redis::TlsMode;
use std::time::Duration;

// 获取连接
pub fn get_pool_cluster(id: &str) -> AnyResult<Pool<ClusterClient>> {
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
    Ok(pool)
}
