pub mod client;
pub mod impl_cluster;
pub mod impl_single;
pub mod state;

// ~~~~~~~~~~~~~~~~~~~~~模块测试~~~~~~~~~~~~~~~~~~~~~
#[cfg(test)]
mod tests {
    use crate::client::client::RedisMeClient;
    use crate::client::impl_cluster::RedisMeCluster;
    use crate::utils::model::{
        RedisCommand, RedisFieldAdd, RedisFieldValue, RedisKey, RedisMemoryParam, ScanCursor,
        ScanParam,
    };
    use redis::TlsMode;
    use redis::cluster::{ClusterClient, ClusterPipeline};

    fn client() -> Box<dyn RedisMeClient> {
        RedisMeCluster::new("test").unwrap()
    }

    #[test]
    fn test_info() {
        let result = client().info(None).unwrap();
        println!("{result:#?}");
    }

    #[test]
    fn test_info_node() {
        let result = client().info(Some("192.168.1.11:7006".into())).unwrap();
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
            count: 10,
            scan_type: None,

            cursor: ScanCursor {
                ready_nodes: vec![],
                now_node: "".into(),
                now_cursor: 0,
                finished: false,
            },
            load_all: false,
        };
        let result1 = client().scan(param).unwrap();
        println!("{result1:#?}");

        let param2 = ScanParam {
            pattern: "*".into(),
            count: 10,
            scan_type: None,
            cursor: result1.cursor,
            load_all: false,
        };
        let result2 = client().scan(param2).unwrap();
        println!("{result2:#?}");
    }

    #[test]
    fn test_get() {
        let value = client().get("hepengju:list".into(), None).unwrap();
        println!("{value:#?}");
        println!("{}", serde_json::to_string(&value).unwrap());

        let value = client().get("hepengju:string".into(), None).unwrap();
        println!("{}", serde_json::to_string(&value).unwrap());
    }

    #[test]
    fn test_field_add() {
        client().del("redis_me:string".into()).unwrap();

        client()
            .field_add(RedisFieldAdd {
                key: "redis_me:string".into(),
                mode: "key".into(),
                key_type: "string".into(),
                ttl: -1,
                value: "字符串值".into(),
                list_push_method: "".into(),
                field_value_list: vec![],
            })
            .unwrap();

        client()
            .field_add(RedisFieldAdd {
                key: "redis_me:hash".into(),
                mode: "field".into(),
                key_type: "hash".into(),
                ttl: -1,
                value: "".into(),
                list_push_method: "".into(),
                field_value_list: vec![
                    RedisFieldValue {
                        field_key: "hash_key1".into(),
                        field_value: "value1".into(),
                        field_score: 0.0,
                    },
                    RedisFieldValue {
                        field_key: "hash_key2".into(),
                        field_value: "value2".into(),
                        field_score: 0.0,
                    },
                ],
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
            auto_broadcast: true,
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
        let result = client()
            .memory_usage(RedisMemoryParam {
                pattern: None,
                size_limit: 1,
                count_limit: 100,
                scan_count: 1000,
                scan_total: 10000,
                sleep_millis: 0,
            })
            .unwrap();
        println!("{result:#?}");
    }

    // https://github.com/redis-rs/redis-rs/issues/1814
    #[test]
    fn test_cluster_pipeline_reproduce() -> anyhow::Result<()> {
        // redis cluster: 7001 ~ 7006, with ssl and password
        let nodes = vec!["rediss://192.168.1.11:7001"];
        let client = ClusterClient::builder(nodes)
            .tls(TlsMode::Insecure)
            .password("hepengju".into())
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

    #[test]
    fn test_monitor() {
        let result = client().monitor("192.168.1.11:7001", None).unwrap();
        println!("{result:?}");
    }

    #[test]
    fn test_publish() {
        let result = client().publish("channel", "message").unwrap();
        println!("{result:?}");
    }

    #[test]
    fn test_subscribe() {
        let result = client().subscribe("channel", None).unwrap();
        println!("{result:?}");
    }
}
