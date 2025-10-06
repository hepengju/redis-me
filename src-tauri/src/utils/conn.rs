use crate::utils::util::AnyResult;
use r2d2::Pool;
use redis::{ConnectionAddr, ConnectionInfo, RedisConnectionInfo, TlsMode};
use redis::cluster::ClusterClient;
use std::time::Duration;

// 获取连接池(单机)
// docker run -d --net host --name redis-6379 redis:7 --requirepass hepengju
pub fn get_pool_single(id: &str) -> AnyResult<Pool<redis::Client>> {
    let is_company = false;

    let mut host = "192.168.1.11";
    let mut password = "hepengju";
    if is_company {
        host = "192.168.1.11";
        password = "Jiyu1212";
    }
    
    let conn_info = ConnectionInfo {
        addr: ConnectionAddr::Tcp(host.to_string(), 6379),
        redis: RedisConnectionInfo {
            db: 0,
            username: None,
            password: Some(password.to_string()),
            protocol: Default::default(),
        },
    };

    let client = redis::Client::open(conn_info)?;

    // 使用连接池管理
    let pool = Pool::builder()
        .min_idle(Some(0))
        .max_size(5)
        .build(client)?;
    Ok(pool)
}
// 获取连接池(集群)
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

#[cfg(test)]
mod tests {
    use redis::Commands;
    use super::*;

    #[test]
    fn test_get_pool_single() {
        let pool = get_pool_single("1").unwrap();
        let mut conn = pool.get().unwrap();
        let value: Vec<u8> = vec![100, 200, 255];
        let _: ()= conn.set("hepengju:bytes", value).unwrap();
    }
}