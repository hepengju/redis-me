#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

mod api;
mod client;
mod utils;

use api::*;
use crate::client::state::AppState;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet,
            info, info_list, node_list,
            scan, get, ttl, set, del,
            field_add, field_set, field_del,
            execute_command, slow_log, memory_usage, 
            config_get, config_set,
            client_list, monitor, publish, subscribe,
            mock_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
#[cfg(test)]
mod tests {
    use redis::cluster::ClusterClient;
    use redis::cluster_routing::RoutingInfo::MultiNode;
    use redis::cluster_routing::{MultipleNodeRoutingInfo, ResponsePolicy};
    use redis::ConnectionAddr::TcpTls;
    use redis::{
        cluster, ClientTlsConfig, Commands, ConnectionInfo, RedisConnectionInfo, RedisResult,
        ScanOptions, TlsCertificates, TlsMode,
    };
    use std::fs;
    use std::path::Path;
    use std::time::Duration;
    use MultipleNodeRoutingInfo::AllMasters;
    use ResponsePolicy::AllSucceeded;

    // 获取连接
    fn get_conn() -> RedisResult<redis::Connection> {
        let client = redis::Client::open("redis://:hepengju2025@ali.hepengju.cn:6379")?;
        // let client = redis::Client::open("redis://127.0.0.1:6379")?;
        client.get_connection()
    }

    #[test]
    fn info() -> RedisResult<()> {
        let mut conn = get_conn()?;
        let info: String = redis::cmd("info").query(&mut conn)?;
        println!("Redis Info: {}", info);
        Ok(())
    }

    #[test]
    fn get_set() -> RedisResult<()> {
        let mut conn = get_conn()?;
        // 低级别api
        let ack: String = redis::cmd("set")
            .arg("rust:low:api")
            .arg("低级别api")
            .query(&mut conn)?;
        println!("Redis Ack: {}", ack);
        let ack: String = redis::cmd("get").arg("rust:low:api").query(&mut conn)?;
        println!("Redis Ack: {}", ack);

        // 高级别api
        let ack: String = conn.set("rust:high:api", "高级别api")?;
        println!("Redis Ack: {}", ack);
        let ack: String = conn.get("rust:high:api")?;
        println!("Redis Ack: {}", ack);
        Ok(())
    }

    #[test]
    fn scan() -> RedisResult<()> {
        let mut conn = get_conn()?;
        let keys: Vec<String> = conn.scan()?.collect();
        println!("Keys: {:?}", keys);

        let opts = ScanOptions::default()
            .with_count(500)
            .with_pattern("*rust*");
        let keys: Vec<String> = conn.scan_options(opts)?.collect();
        println!("Keys: {:?}", keys);

        Ok(())
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 获取集群连接
    fn get_cluster_conn() -> RedisResult<cluster::ClusterConnection> {
        // 集群连接默认只传入1个节点即可
        // let nodes = vec!["rediss://:hepengju@ali.hepengju.cn:7001"];

        // 实测此处注释掉也没影响
        // before creating a connection, ensure that you install a crypto provider
        // rustls::crypto::aws_lc_rs::default_provider()
        //     .install_default()
        //     .expect("Failed to install rustls crypto provider");

        let path = r"C:\Users\he_pe\jiyu\redis-ssl\aliyun";
        let cert_file = "redis-server.crt";
        let key_file = "redis-server.key";
        let cert_vec8 = fs::read(Path::new(path).join(cert_file)).expect("cert读取失败");
        let key_vec8 = fs::read(Path::new(path).join(key_file)).expect("key读取失败");

        let nodes = vec![ConnectionInfo {
            addr: TcpTls {
                host: "ali.hepengju.cn".into(),
                port: 7001,
                insecure: true,
                tls_params: None,
            },
            redis: RedisConnectionInfo {
                db: 0,
                username: None,
                password: Some("hepengju".into()),
                protocol: Default::default(),
            },
        }];

        let cert = TlsCertificates {
            client_tls: Some(ClientTlsConfig {
                client_cert: cert_vec8,
                client_key: key_vec8,
            }),
            root_cert: None,
        };

        let client = ClusterClient::builder(nodes)
            .connection_timeout(Duration::from_secs(5))
            .certs(cert)
            .tls(TlsMode::Insecure)
            .danger_accept_invalid_hostnames(true)
            .build()?;
        client.get_connection()
    }

    #[test]
    fn get_set_cluster() -> RedisResult<()> {
        let mut conn = get_cluster_conn()?;
        let ack: String = conn.set("rust:cluster:api", "集群连接")?;
        println!("Redis Ack: {}", ack);
        let ack: String = conn.get("rust:cluster:api")?;
        println!("Redis Ack: {}", ack);
        Ok(())
    }

    #[test]
    fn scan_cluster() -> RedisResult<()> {
        let mut conn = get_cluster_conn()?;
        let keys: Vec<String> = conn.scan()?.collect();
        println!("Keys: {:?}", keys);

        //let opts = ScanOptions::default().with_count(500).with_pattern("*rust*");

        // RedisCluster目前不能直接扫描SCAN, 参考Issue进行多个节点处理
        // 参考: https://github.com/redis-rs/redis-rs/pull/1233/commits/997df1834d1bfccdbd56827d39fc4cf08874efec
        // Error: This command cannot be safely routed in cluster mode- ClientError
        // let keys: Vec<String> = conn.scan_options(opts)?.collect();

        let routing_info = MultiNode((AllMasters, Some(AllSucceeded)));
        // TODO conn.route_command()
        // println!("Keys: {:?}", keys);
        Ok(())
    }
}
