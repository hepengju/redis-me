use crate::utils::model::RedisConn;
use crate::utils::util::AnyResult;
use log::info;
use r2d2::Pool;
use redis::cluster::{ClusterClient, ClusterConfig};
use redis::{Client, TlsMode, TypedCommands};
use std::time::Duration;

// 获取连接池(单机)
// docker run -d --net host --name redis-6379 redis:7 --requirepass hepengju
pub fn get_pool_single(conn: &RedisConn) -> AnyResult<Pool<Client>> {
    let client = get_client_single(conn)?;
    let pool = Pool::builder()
        .min_idle(Some(0))
        .max_size(5)
        .build(client)?;
    Ok(pool)
}

pub fn get_client_single(conn: &RedisConn) -> AnyResult<Client> {
    let prefix = if conn.ssl { "rediss" } else { "redis" };
    let redis_url = format!(
        "{}://{}:{}@{}:{}",
        prefix, conn.username, conn.password, conn.host, conn.port
    );
    info!("redis_url: {redis_url}");
    // TODO 研究SSL证书如何配置
    let mut client = Client::open(redis_url)?;
    let mut conn = client.get_connection_with_timeout(Duration::from_secs(1))?;
    let _ = conn.ping()?;
    info!("测试单机连接成功");
    client.client_setname("RedisME")?;
    Ok(client)
}

// 获取连接池(集群)
pub fn get_pool_cluster(conn: &RedisConn) -> AnyResult<Pool<ClusterClient>> {
    let client = get_client_cluster(conn)?;
    let pool = Pool::builder()
        .min_idle(Some(0))
        .max_size(5)
        .build(client)?;
    Ok(pool)
}

pub fn get_client_cluster(conn: &RedisConn) -> AnyResult<ClusterClient> {
    let prefix = if conn.ssl { "rediss" } else { "redis" };
    let redis_url = format!("{}://{}:{}", prefix, conn.host, conn.port);
    info!("redis_url: {redis_url}");

    let mut builder = ClusterClient::builder(vec![redis_url])
        .tls(TlsMode::Insecure);
    if !conn.username.is_empty() {
        builder = builder.username(conn.username.clone());
    }
    if !conn.password.is_empty() {
        builder = builder.password(conn.password.clone());
    }
    let client = builder.build()?;
    let cc = ClusterConfig::new().set_connection_timeout(Duration::from_secs(1));
    let mut conn = client.get_connection_with_config(cc)?;
    let _ = conn.ping()?;
    info!("测试集群连接成功");
    Ok(client)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Context;
    use redis::Commands;
    use std::fs;
    use std::path::Path;

    #[test]
    fn test_get_pool_single() {
        let redis_conn = RedisConn {
            id: "single".to_string(),
            name: "单机".to_string(),
            host: "192.168.1.11".to_string(),
            port: 6379,
            username: "".to_string(),
            password: "hepengju".to_string(),
            cluster: false,
            ssl: false,
            ssl_option: None,
        };
        let pool = get_pool_single(&redis_conn).unwrap();
        let mut conn = pool.get().unwrap();
        let value: Vec<u8> = vec![100, 200, 255];
        let _: () = Commands::set(&mut conn, "hepengju:bytes", &value[..]).unwrap();
    }

    #[test]
    fn test_get_pool_cluster() {
        let redis_conn = RedisConn {
            id: "cluster".to_string(),
            name: "集群".to_string(),
            host: "192.168.1.11".to_string(),
            port: 7001,
            username: "".to_string(),
            password: "hepengju".to_string(),
            cluster: true,
            ssl: true,
            ssl_option: None,
        };
        let pool = get_pool_cluster(&redis_conn).unwrap();
        let mut conn = pool.get().unwrap();
        let _: () = Commands::set(&mut conn, "hepengju:name", "hepengju").unwrap();
    }

    fn get_key_cert() -> AnyResult<(Vec<u8>, Vec<u8>)> {
        let path = r"C:\Users\he_pe\jiyu\redis-ssl";
        let cert_file = "redis-server.crt";
        let key_file = "redis-server.key";
        let cert_vec8 = fs::read(Path::new(path).join(cert_file)).context("cert读取失败")?;
        let key_vec8 = fs::read(Path::new(path).join(key_file)).context("key读取失败")?;
        Ok((cert_vec8, key_vec8))
    }

    /*#[test]
    fn test_ssl_rust_ls() -> AnyResult<()> {
        // 实测此处注释掉也没影响
        // before creating a connection, ensure that you install a crypto provider
        // rustls::crypto::aws_lc_rs::default_provider()
        //     .install_default()
        //     .expect("Failed to install rustls crypto provider");

        let path = r"C:\Users\he_pe\jiyu\redis-ssl";
        let cert_file = "redis-server.crt";
        let key_file = "redis-server.key";
        let cert_vec8 = fs::read(Path::new(path).join(cert_file)).context("cert读取失败")?;
        let key_vec8= fs::read(Path::new(path).join(key_file)).context("key读取失败")?;

        let nodes = vec![ConnectionInfo {
            addr: TcpTls {
                host: "10.106.100.140".into(),
                port: 7001,
                insecure: true,
                tls_params: None,
            },
            redis: RedisConnectionInfo {
                db: 0,
                username: None,
                password: Some("Jiyu1212".into()),
                protocol: Default::default(),
            }
        }];

        let cert = TlsCertificates {
            client_tls: Some(
                ClientTlsConfig {
                    client_cert: cert_vec8,
                    client_key: key_vec8,
                }
            ),
            root_cert:None
        };

        let client = ClusterClient::builder(nodes)
            .connection_timeout(Duration::from_secs(5))
            .certs(cert)
            .tls(TlsMode::Insecure)
            .danger_accept_invalid_hostnames(true)
            .build()?;
        let mut conn = client.get_connection()?;

        // rustls 不支持x.509证书的v1版本，且后续也不会支持
        // https://github.com/rustls/rustls/issues/2364
        // Error: It failed to check startup nodes.
        // IoError: Failed to connect to each cluster node (10.106.100.140:7001:
        // Unable to build client with TLS parameters provided
        // InvalidClientConfig: invalid peer certificate: Other(OtherError(UnsupportedCertVersion)))

        let value: String = conn.get("hepengju:name")?;
        println!("value: {:?}", value);
        Ok(())
    }
    */

    /*
    #[test]
    fn test_ssl_native_ls() -> AnyResult<()>{
        let nodes = vec![ConnectionInfo {
            addr: TcpTls {
                host: "10.106.100.140".into(),
                port: 7001,
                insecure: true,
                tls_params: None,
            },
            redis: RedisConnectionInfo {
                db: 0,
                username: None,
                password: Some("Jiyu1212".into()),
                protocol: Default::default(),
            }
        }];

        let client = ClusterClient::builder(nodes)
            .connection_timeout(Duration::from_secs(5))
            .build()?;
        let mut conn = client.get_connection()?;

        let value: String = conn.get("hepengju:name")?;
        println!("value: {:?}", value);
        Ok(())
    }*/

    /*
    #[test]
    fn test_tmp_ssl() -> AnyResult<()> {
        let client = Client::open("redis://:password@your-redis-server.com:6379")?;
        let mut con = client.get_connection()?;
        Ok(())
    }*/
}
