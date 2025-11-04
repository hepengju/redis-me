use crate::utils::model::{RedisConn, SslOption};
use crate::utils::util::AnyResult;
use anyhow::Context;
use log::info;
use redis::cluster::{ClusterClient, ClusterConfig};
use redis::{Client, ClientTlsConfig, ConnectionLike, TlsCertificates, TlsMode, TypedCommands};
use std::fs;
use std::time::Duration;

// 获取单机连接
pub fn get_client_single(conn: &RedisConn) -> AnyResult<Client> {
    let prefix = if conn.ssl { "rediss" } else { "redis" };
    let redis_url = format!(
        "{}://{}:{}@{}:{}/#insecure",
        prefix, conn.username, conn.password, conn.host, conn.port
    );
    info!("redis_url: {redis_url}");

    let client = if conn.ssl {
        let certs = get_tls_certs(conn.ssl_option.clone())?;
        if let Some(tls) = certs {
            Client::build_with_tls(redis_url, tls)?
        } else {
            Client::open(redis_url)?
        }
    } else {
        Client::open(redis_url)?
    };
    // 测试连接是否可以成功，注意超时时间比较短，用户可以快速感知到。此连接使用后丢弃即可
    let mut conn = client.get_connection_with_timeout(Duration::from_secs(1))?;
    let _ = conn.ping()?;
    info!("Redis单机连接成功");
    Ok(client)
}

// 获取集群连接
pub fn get_client_cluster(conn: &RedisConn) -> AnyResult<ClusterClient> {
    let prefix = if conn.ssl { "rediss" } else { "redis" };
    let redis_url = format!("{}://{}:{}", prefix, conn.host, conn.port);
    info!("redis_url: {redis_url}");

    let mut builder = ClusterClient::builder(vec![redis_url]);
    if !conn.username.is_empty() {
        builder = builder.username(conn.username.clone());
    }
    if !conn.password.is_empty() {
        builder = builder.password(conn.password.clone());
    }
    if conn.ssl {
        builder = builder.danger_accept_invalid_hostnames(true)
            .tls(TlsMode::Insecure);
        let certs = get_tls_certs(conn.ssl_option.clone())?;
        if let Some(certs) = certs {
            builder = builder.certs(certs);
        };
    }
    let client = builder.build()?;
    let cc = ClusterConfig::new().set_connection_timeout(Duration::from_secs(1));
    let mut conn = client.get_connection_with_config(cc)?;
    let _ = conn.ping()?;
    info!("测试集群连接成功");
    Ok(client)
}

// 获取证书
fn get_tls_certs(ssl_option: Option<SslOption>) -> AnyResult<Option<TlsCertificates>> {
    if ssl_option.is_none() {
        return Ok(None)
    }
    let ssl_option = ssl_option.unwrap();
    if ssl_option.key.is_empty() && ssl_option.cert.is_empty() && ssl_option.ca.is_empty() {
        return Ok(None)
    };
    let cert_vec8 = fs::read(ssl_option.cert).context("公钥文件读取失败")?;
    let key_vec8 = fs::read(ssl_option.key).context("私钥文件读取失败")?;
    let root_cert = if ssl_option.ca.is_empty() {
        None
    } else {
        Some(fs::read(ssl_option.ca).context("授权文件读取失败")?)
    };
    let certs = TlsCertificates {
        client_tls: Some(
            ClientTlsConfig {
                client_cert: cert_vec8,
                client_key: key_vec8,
            }
        ),
        root_cert,
    };
    Ok(Some(certs))
}

// 设置客户端名称
pub fn set_client_name(conn: &mut dyn ConnectionLike) -> AnyResult<()> {
    let _: () = redis::cmd("CLIENT").arg("SETNAME").arg("RedisME").query(conn)?;
    Ok(())
}

// 获取连接池(单机)
// docker run -d --net host --name redis-6379 redis:7 --requirepass hepengju
// pub fn get_pool_single(conn: &RedisConn) -> AnyResult<Pool<Client>> {
//     let client = get_client_single(conn)?;
//     let pool = Pool::builder()
//         .min_idle(Some(0))
//         .max_size(5)
//         .build(client)?;
//     Ok(pool)
// }
// 获取连接池(集群)
// pub fn get_pool_cluster(conn: &RedisConn) -> AnyResult<Pool<ClusterClient>> {
//     let client = get_client_cluster(conn)?;
//     let pool = Pool::builder()
//         .min_idle(Some(0))
//         .max_size(5)
//         .build(client)?;
//     Ok(pool)
// }


#[cfg(test)]
mod tests {
    use super::*;
    use redis::TypedCommands;

    fn get_ssl_option() -> SslOption {
        let path = r"C:\Users\he_pe\software\redis";
        SslOption {
            cert: format!("{path}\\redis.crt"),
            key: format!("{path}\\redis.key"),
            ca: "".to_string(),
        }
    }

    #[test]
    fn test_single() -> AnyResult<()> {
        let mut redis_conn = RedisConn {
            id: "single".to_string(),
            name: "单机".to_string(),
            host: "192.168.1.111".to_string(),
            port: 6379,
            username: "".to_string(),
            password: "hepengju".to_string(),
            cluster: false,
            ssl: false,
            ssl_option: None,
        };
        let client = get_client_single(&redis_conn)?;
        let mut conn = client.get_connection()?;
        conn.set("redis-me:single", "RedisME-单机")?;

        redis_conn.ssl = true;
        redis_conn.port = 6380;
        redis_conn.ssl_option = Some(get_ssl_option());
        let client = get_client_single(&redis_conn)?;
        let mut conn = client.get_connection()?;
        conn.set("redis-me:single-ssl", "RedisME-单机-ssl")?;
        Ok(())
    }

    #[test]
    fn test_cluster() -> AnyResult<()>{
        let mut redis_conn = RedisConn {
            id: "cluster".to_string(),
            name: "集群".to_string(),
            host: "192.168.1.111".to_string(),
            port: 7001,
            username: "".to_string(),
            password: "hepengju".to_string(),
            cluster: true,
            ssl: false,
            ssl_option: None,
        };
        let client = get_client_cluster(&redis_conn)?;
        let mut conn = client.get_connection()?;
        conn.set("redis-me:cluster", "RedisME-集群")?;

        redis_conn.ssl = true;
        redis_conn.port = 8001;
        redis_conn.ssl_option = Some(get_ssl_option());
        let client = get_client_cluster(&redis_conn)?;
        let mut conn = client.get_connection()?;
        conn.set("redis-me:cluster-ssl", "RedisME-集群-ssl")?;
        Ok(())
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
