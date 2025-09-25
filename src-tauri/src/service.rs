use crate::api::MeResult;
use redis::cluster::{ClusterClient, ClusterConnection};
use redis::ConnectionAddr::TcpTls;
use redis::{ClientTlsConfig, ConnectionInfo, ConnectionLike, RedisConnectionInfo, TlsCertificates, TlsMode};
use std::fs;
use std::path::Path;
use std::time::Duration;

// 信息
pub fn info(id: &str, node: Option<&str>) -> MeResult<String> {
    let mut conn = get_conn(id)?;
    Ok("info".into())
}

// 节点列表
pub fn nodeList(id: &str, node: Option<&str>) -> MeResult<Vec<String>> {
    todo!()
}

#[cfg(test)]
mod tests {
    use crate::service::info;

    #[test]
    fn test_info() {
        let info = info("test", None).unwrap();
        println!("{}", info);
    }
}

// 获取连接
pub fn get_conn(id: &str) -> MeResult<ClusterConnection> {
    println!("{id}");

    // 先写死，后期考虑优化
    let path = r"C:\Users\he_pe\jiyu\redis-ssl";
    let cert_file = "redis-server.crt";
    let key_file = "redis-server.key";
    let cert_vec8 = fs::read(Path::new(path).join(cert_file))?;
    let key_vec8= fs::read(Path::new(path).join(key_file))?;

    let nodes = vec![ConnectionInfo {
        addr: TcpTls {
            host: "10.106.0.167".into(),
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

    // let cert = TlsCertificates {
    //     client_tls: Some(
    //         ClientTlsConfig {
    //             client_cert: cert_vec8,
    //             client_key: key_vec8,
    //         }
    //     ),
    //     root_cert:None
    // };

    let client = ClusterClient::builder(nodes)
        .connection_timeout(Duration::from_secs(5))
        //.certs(cert)
        .tls(TlsMode::Insecure)
        .danger_accept_invalid_hostnames(true)
        .build()?;
    Ok(client.get_connection()?)
}
