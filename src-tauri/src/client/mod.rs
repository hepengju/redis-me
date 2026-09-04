pub mod client_trait;
pub mod impl_cluster;
pub mod impl_single;
pub mod state;

// ~~~~~~~~~~~~~~~~~~~~~模块测试~~~~~~~~~~~~~~~~~~~~~
#[cfg(test)]
mod tests {
    use crate::client::client_trait::MeClient;
    use crate::client::impl_cluster::MeCluster;
    use crate::client::impl_single::MeSingle;
    use crate::utils::conn::{get_client_cluster, get_client_single, init_cluster_connection, init_single_connection};
    use crate::utils::model::*;
    use crate::utils::util::{AnyResult, CONNECTION_CONNECT_TIMEOUT, CONNECTION_NORMAL_TIMEOUT};
    use redis::TlsMode;
    use redis::cluster::{ClusterClient, ClusterPipeline};
    use std::time::Duration;

    fn default_connect_timeout() -> Duration {
        AppSettings::default().connection_timeout()
    }

    fn default_command_timeout() -> Duration {
        AppSettings::default().command_timeout()
    }

    fn client() -> Box<dyn MeClient> {
        // default_provider().install_default()
        //     .expect("Failed to install rustls crypto provider");
        // client_single()
        client_cluster()
    }

    fn get_redis_password() -> String {
        std::env::var("REDIS_PASSWORD").expect("REDIS_PASSWORD environment variable not set")
    }

    #[allow(unused)]
    fn conf_single() -> ConnConfig {
        ConnConfig {
            id: "test".into(),
            name: "test".into(),
            host: "ali.hepengju.com".into(),
            port: 6379,
            username: "".into(),
            password: get_redis_password(),
            ..ConnConfig::default()
        }
    }

    #[allow(unused)]
    fn conf_cluster() -> ConnConfig {
        ConnConfig {
            id: "test".into(),
            name: "test".into(),
            host: "ali.hepengju.com".into(),
            port: 7001,
            username: "".into(),
            password: get_redis_password(),
            db: 0,
            ..ConnConfig::default()
        }
    }

    #[allow(unused)]
    fn client_single() -> Box<dyn MeClient> {
        let conf = conf_single();
        MeSingle::init(&conf, default_connect_timeout(), default_command_timeout()).unwrap()
    }

    #[allow(unused)]
    fn client_cluster() -> Box<dyn MeClient> {
        let conf = conf_cluster();
        MeCluster::init(&conf, default_connect_timeout(), default_command_timeout()).unwrap()
    }

    #[allow(unused)]
    fn client_single_ssl() -> Box<dyn MeClient> {
        let mut conf = conf_single();
        conf.port = 6380;
        conf.ssl = true;
        conf.ssl_option.key = r"C:\Users\he_pe\redis\redis.key".into();
        //conf.ssl_option.cert= r"C:\Users\he_pe\redis\redis.crt".into();
        conf.ssl_option.key = r"~/redis/redis.key".into();
        conf.ssl_option.cert = r"~\redis\redis.crt".into();
        MeSingle::init(&conf, default_connect_timeout(), default_command_timeout()).unwrap()
    }

    #[allow(unused)]
    fn client_single_ssh() -> Box<dyn MeClient> {
        let mut conf = conf_single();
        conf.ssh = true;
        conf.ssh_option.host = "ali.hepengju.com".into();
        conf.ssh_option.login_type = "pwd".into();
        conf.ssh_option.port = 22;
        conf.ssh_option.username = "root".into();
        // 从环境变量获取SSH密码，避免硬编码安全风险
        conf.ssh_option.password =
            std::env::var("SSH_PASSWORD").expect("SSH_PASSWORD environment variable not set");

        // 秘钥方式登录
        conf.ssh_option.login_type = "pkfile".into();
        //conf.ssh_option.pkfile = r"C:\Users\he_pe\.ssh\id_rsa".into();
        //conf.ssh_option.pkfile = r"C:\Users\he_pe\.ssh\id_ed25519".into();
        conf.ssh_option.pkfile = "~/.ssh/id_rsa".into();
        conf.ssh_option.pkfile = "~/.ssh/id_ed25519".into();
        conf.ssh_option.passphrase = "".into();
        MeSingle::init(&conf, default_connect_timeout(), default_command_timeout()).unwrap()
    }

    #[test]
    fn test_info() {
        let client = client_single_ssl();
        let result = client.info(None).unwrap();
        println!("{result:#?}");
        let result = client.info(None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_node() {
        let result = client().info(Some("ali.hepengju.com:7006".into())).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_list() {
        let vec = client().info_list().unwrap();
        println!("vec: {vec:#?}")
    }

    #[test]
    fn test_node_list() {
        let vec = client().node_list().unwrap();
        println!("vec: {vec:#?}")
    }

    #[test]
    fn test_scan() {
        let param = ScanParam {
            pattern: "*".into(),
            scan_type: None,
            cursor: Some(ScanCursor::default()),
            exact: false,
            count: 1000,
        };
        let result1 = client().scan(param).unwrap();
        println!("{result1:#?}");

        let param2 = ScanParam {
            pattern: "*".into(),
            scan_type: None,
            cursor: Some(result1.cursor),
            exact: false,
            count: 1000,
        };
        let result2 = client().scan(param2).unwrap();
        println!("{result2:#?}");
    }

    #[test]
    fn test_field_scan_mock() -> AnyResult<()> {
        let conn_single = conf_single();
        let (client, _) = get_client_single(&conn_single, CONNECTION_CONNECT_TIMEOUT, false)?;
        let mut conn = init_single_connection(
            &client,
            conn_single.db,
            CONNECTION_CONNECT_TIMEOUT,
            CONNECTION_NORMAL_TIMEOUT,
        )?;

        let mut pipe = redis::pipe();
        pipe.del("field-scan:string").ignore();
        pipe.del("field-scan:hash").ignore();
        pipe.del("field-scan:list").ignore();
        pipe.del("field-scan:set").ignore();
        pipe.del("field-scan:zset").ignore();

        pipe.set("field-scan:string", "字段扫描字符串类型 😄")
            .ignore();
        for i in 0..9999 {
            // 大于512个
            pipe.hset("field-scan:hash", format!("k{i}"), format!("v{i}"))
                .ignore();
            pipe.rpush("field-scan:list", format!("v{i}")).ignore();
            pipe.sadd("field-scan:set", format!("v{i}")).ignore();
            pipe.zadd("field-scan:zset", format!("v{i}"), i).ignore();
        }
        let _: () = pipe.query(&mut conn)?;

        let conn_cluster = conf_cluster();
        let client = get_client_cluster(&conn_cluster, None)?;
        let mut conn = init_cluster_connection(&client, CONNECTION_CONNECT_TIMEOUT, CONNECTION_NORMAL_TIMEOUT)?;

        let mut pipe = ClusterPipeline::new();
        pipe.del("field-scan:string").ignore();
        pipe.del("field-scan:hash").ignore();
        pipe.del("field-scan:list").ignore();
        pipe.del("field-scan:set").ignore();
        pipe.del("field-scan:zset").ignore();

        pipe.set("field-scan:string", "字段扫描字符串类型 😄")
            .ignore();
        for i in 0..9999 {
            // 大于512个
            pipe.hset("field-scan:hash", format!("k{i}"), format!("v{i}"))
                .ignore();
            pipe.rpush("field-scan:list", format!("v{i}")).ignore();
            pipe.sadd("field-scan:set", format!("v{i}")).ignore();
            pipe.zadd("field-scan:zset", format!("v{i}"), i).ignore();
        }
        let _: () = pipe.query(&mut conn)?;

        Ok(())
    }

    fn test_field_scan_param(key: &str) -> FieldScanParam {
        FieldScanParam {
            key: RedisKey {
                key: key.to_string(),
                bytes: vec![],
            },
            count: 150,
            cursor: None,
            pattern: "*".into(),
            exact: false,
            meta: None,
            bytes_format: Some(BytesFormat::Base64),
            include_meta: None,
            key_type: None,
            include_field_ttl: None,
        }
    }

    #[test]
    fn test_field_scan() {
        // let mut param = test_field_scan_param("field-scan:string");
        // let mut param = test_field_scan_param("field-scan:hash");
        // param.hash_key = Some("k0".into());
        // let mut param = test_field_scan_param("field-scan:list");
        // let mut param = test_field_scan_param("field-scan:set");
        let mut param = test_field_scan_param("field-scan:hash");
        let result = client().field_scan(param.clone()).unwrap();
        println!("{}", serde_json::to_string_pretty(&result).unwrap());

        if !result.cursor.finished {
            param.cursor = Some(result.cursor.clone());
            let result = client().field_scan(param).unwrap();
            println!("{}", serde_json::to_string_pretty(&result).unwrap());
        }
    }

    #[test]
    fn test_field_add() {
        client().del("redis-me:unitest:string".into()).unwrap();

        client()
            .field_add(RedisFieldAdd {
                key: "redis-me:unitest:string".into(),
                mode: "key".into(),
                key_type: "string".into(),
                ttl: -1,
                value: "字符串值".into(),
                list_push_method: "".into(),
                array_write_method: "".into(),
                vector: vec![],
                attrs: "".into(),
                field_value_list: vec![],
                stream_id: "".to_string(),
                key_fmt: None,
                val_fmt: None,
            })
            .unwrap();

        client()
            .field_add(RedisFieldAdd {
                key: "redis-me:unitest:hash".into(),
                mode: "key".into(),
                key_type: "hash".into(),
                ttl: -1,
                value: "".into(),
                list_push_method: "".into(),
                array_write_method: "".into(),
                vector: vec![],
                attrs: "".into(),
                field_value_list: vec![
                    RedisFieldValue {
                        field_key: "hash_key1".into(),
                        field_value: "value1".into(),
                        field_score: 0.0,
                        field_ttl: 3600,
                        field_attrs: "".into(),
                    },
                    RedisFieldValue {
                        field_key: "hash_key2".into(),
                        field_value: "value2".into(),
                        field_score: 0.0,
                        field_ttl: 3600,
                        field_attrs: "".into(),
                    },
                ],
                stream_id: "".to_string(),
                key_fmt: None,
                val_fmt: None,
            })
            .unwrap();
    }

    #[test]
    fn test_mock_data() {
        client().mock_data(10).unwrap();
    }

    #[test]
    fn test_execute_command() {
        mock_command("ping");
        mock_command("cluster info");
        mock_command("cluster slots");
        mock_command("config get save");
        mock_command("config get *");
        mock_command(r#"config set save "3600 1 300 100 60 10000" "#);
    }

    fn mock_command(command: &str) {
        let result = client().execute_command(RedisCommand {
            command: command.into(),
            node: None,
            auto_broadcast: Some(true),
            output_mode: None,
        });
        println!("{result:#?}");
    }

    #[test]
    fn test_config_get() {
        let result = client().config_get("*", None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_config_set() {
        let result = client()
            .config_set("save", "3600 2 300 100 60 10000", None)
            .unwrap();
        println!("{result:#?}");
        let result = client()
            .config_set(
                "save",
                "3600 2 300 100 60 10000",
                Some("10.106.0.167:7005".into()),
            )
            .unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_slow_log() {
        let result = client()
            .slow_log(Some(3), Some("10.106.0.167:7005".into()))
            .unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_memory_usage() {
        let mut cursor = None;
        loop {
            let result = client()
                .memory_usage(RedisMemoryParam {
                    pattern: None,
                    size_limit: 1,
                    scan_count: 1000,
                    cursor,
                    need_key_type: Some(true),
                })
                .unwrap();
            println!("{result:#?}");
            if result.cursor.finished {
                break;
            }
            cursor = Some(result.cursor);
        }
    }

    // https://github.com/redis-rs/redis-rs/issues/1814
    #[test]
    fn test_cluster_pipeline_reproduce() -> anyhow::Result<()> {
        // redis cluster: 7001 ~ 7006, with ssl and password
        let nodes = vec!["rediss://192.168.1.11:7001"];
        let client = ClusterClient::builder(nodes)
            .tls(TlsMode::Insecure)
            .password("hepengju")
            .build()?;
        let mut conn = client.get_connection()?;

        // get
        let mut pipe = ClusterPipeline::new();
        pipe.cmd("get").arg("hepengju:string1");
        pipe.cmd("get").arg("hepengju:string2");
        pipe.cmd("get").arg("hepengju:string3");
        let results: Vec<Option<String>> = pipe.query(&mut conn)?;
        println!("{results:?}");
        // ["string1value", "string2value", "string3value"]

        // memory usage
        pipe = ClusterPipeline::new();
        pipe.cmd("memory").arg("usage").arg("hepengju:string1");
        pipe.cmd("memory").arg("usage").arg("hepengju:string2");
        pipe.cmd("memory").arg("usage").arg("hepengju:string3");
        let sizes: Vec<Option<u64>> = pipe.query(&mut conn)?;
        // Error: An error was signalled by the server - Moved: 14021 192.168.1.11:7005
        println!("{sizes:?}");

        Ok(())
    }

    #[test]
    fn test_client_list() {
        let result = client().client_list(None, None).unwrap();
        println!("{result:?}");
    }

    // #[test]
    // fn test_monitor() {
    //     let result = client().monitor("192.168.1.11:7001").unwrap();
    //     println!("{result:?}");
    // }

    #[test]
    fn test_publish() {
        let result = client()
            .publish("channel", "message", None)
            .unwrap();
        println!("{result:?}");
    }

    // #[test]
    // fn test_subscribe() {
    //     let result = client().subscribe(None).unwrap();
    //     println!("{result:?}");
    // }

    #[test]
    fn test_key_node() {
        // 修改为你要测试的键名
        let key = "test:key_node";
        let result = client().key_node(key.into()).unwrap();
        println!("所在节点: {:?}", result);
    }
}
