use crate::client::client::RedisMeClient;
use crate::implement_common_commands;
use crate::utils::conn::get_pool_cluster;
use crate::utils::model::*;
use crate::utils::util::*;
use anyhow::bail;
use log::info;
use r2d2::Pool;
use redis::cluster::{ClusterClient, ClusterPipeline};
use redis::cluster_routing::RoutingInfo;
use redis::cluster_routing::RoutingInfo::SingleNode;
use redis::cluster_routing::SingleNodeRoutingInfo::ByAddress;
use redis::{Commands, FromRedisValue, SetExpiry, SetOptions, Value, ValueType};
use std::collections::{HashMap, HashSet};
use std::process::id;
use std::thread;
use std::time::Duration;

pub struct RedisMeCluster {
    id: String,
    pool: Pool<ClusterClient>,
    node_list: Vec<RedisNode>,
}

impl RedisMeClient for RedisMeCluster {
    fn info(&self, node: Option<String>) -> AnyResult<RedisInfo> {
        let mut conn = self.pool.get()?;
        let (route, exec_node) = self.get_node_route(node)?;
        let value = conn.route_command(&redis::cmd("info"), route)?;
        let info: String = FromRedisValue::from_redis_value(value)?;
        Ok(RedisInfo {
            node: exec_node,
            info,
        })
    }

    fn info_list(&self) -> AnyResult<Vec<RedisInfo>> {
        let mut conn = self.pool.get()?;
        let mut infos = vec![];
        for redis_node in &self.node_list {
            let node = redis_node.node.clone();
            let (route, _) = self.get_node_route(Some(node.clone()))?;
            let value = conn.route_command(&redis::cmd("info"), route)?;
            let info: String = FromRedisValue::from_redis_value(value)?;
            infos.push(RedisInfo { node, info })
        }
        Ok(infos)
    }

    fn node_list(&self) -> AnyResult<Vec<RedisNode>> {
        Ok(self.node_list.clone())
    }

    fn scan(&self, param: ScanParam) -> AnyResult<ScanResult> {
        // RedisCluster目前不能直接扫描SCAN, 参考Issue进行多个节点处理
        // 参考: https://github.com/redis-rs/redis-rs/pull/1233/commits/997df1834d1bfccdbd56827d39fc4cf08874efec
        // Error: This command cannot be safely routed in cluster mode- ClientError
        // let keys: Vec<String> = conn.scan_options(opts)?.collect();
        let mut conn = self.pool.get()?;
        let mut cc = param.cursor.unwrap_or_default();

        // 空白或单字母查询，扫描1000槽位数即可；否则扫描10000个槽位数
        let batch_count = if param.pattern.replace("*", "").chars().count() <= 1 {
            1000
        } else {
            10000
        };

        let mut keys: Vec<Vec<u8>> = vec![];

        // 遍历集群节点: 仅扫描主节点
        let nodes: Vec<String> = self.get_node_list_master();
        let node_size = nodes.len();

        'outer: for node in nodes {
            if cc.ready_nodes.contains(&node) {
                continue; // 扫描过的予以跳过
            }
            cc.now_node = node.clone();

            let (route, _) = self.get_node_route(Some(node.clone()))?;

            'inner: loop {
                // 正在扫描的节点则重置上次游标
                let cursor = if cc.now_node == node {
                    cc.now_cursor
                } else {
                    0
                };

                let mut cmd = redis::cmd("scan");
                cmd.arg(cursor)
                    .arg("match")
                    .arg(param.pattern.clone())
                    .arg("count")
                    .arg(batch_count);

                if let Some(ref scan_type) = param.scan_type {
                    cmd.arg("type").arg(scan_type);
                }

                let value = conn.route_command(&cmd, route.clone())?;
                let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                    FromRedisValue::from_redis_value(value)?;

                keys.extend(new_keys);
                cc.now_cursor = next_cursor;
                if !param.load_all && param.count > 0 && keys.len() >= param.count as usize {
                    break 'outer;
                }

                if next_cursor == 0 {
                    break 'inner;
                }
            }
            cc.ready_nodes.push(node.clone());
        }

        // 映射为返回值
        let key_list = keys
            .into_iter()
            .map(|key| RedisKey {
                key: vec8_to_display_string(&key),
                bytes: key,
            })
            .collect();

        // 判断是否扫描完毕
        if cc.ready_nodes.len() == node_size {
            cc.finished = true;
            cc.now_node = "".to_string();
            cc.now_cursor = 0;
        }

        Ok(ScanResult {
            cursor: cc,
            key_list,
        })
    }

    fn execute_command(&self, param: RedisCommand) -> AnyResult<String> {
        let (cmd, args) = parse_command(param.command.as_str())?;
        if cmd == "" {
            return Ok("".into());
        };

        let mut conn = self.pool.get()?;
        let (route, _) = self.get_node_route(param.node)?;
        let value = conn.route_command(redis::cmd(cmd.as_str()).arg(args), route)?;
        Ok(redis_value_to_string(value, "\n"))
    }

    fn config_get(
        &self,
        pattern: &str,
        node: Option<String>,
    ) -> AnyResult<HashMap<String, String>> {
        let mut conn = self.pool.get()?;
        let (route, _) = self.get_node_route(node)?;
        let value = conn.route_command(redis::cmd("config").arg("get").arg(pattern), route)?;
        let result: HashMap<String, String> = FromRedisValue::from_redis_value(value)?;
        Ok(result)
    }

    fn config_set(&self, key: &str, value: &str, node: Option<String>) -> AnyResult<()> {
        let mut conn = self.pool.get()?;
        let (route, _) = self.get_node_route(node)?;
        let _ = conn.route_command(redis::cmd("config").arg("set").arg(key).arg(value), route)?;
        Ok(())
    }

    fn slow_log(&self, count: Option<u64>, node: Option<String>) -> AnyResult<Vec<RedisSlowLog>> {
        let mut conn = self.pool.get()?;
        let mut logs = vec![];
        for redis_node in &self.node_list {
            // 如果参数中包含节点参数，则只返回指定节点的慢日志
            if let Some(ref n) = node {
                if n != &redis_node.node {
                    continue;
                }
            }

            let node = redis_node.node.clone();
            let (route, _) = self.get_node_route(Some(node.clone()))?;
            let value_total = conn.route_command(
                &redis::cmd("slowlog").arg("get").arg(count.unwrap_or(128)),
                route,
            )?;
            let value_list: Vec<Value> = FromRedisValue::from_redis_value(value_total)?;
            for value in value_list {
                let log = redis_value_to_log(value, &node)?;
                logs.push(log);
            }
        }
        Ok(logs)
    }

    fn memory_usage(&self, param: RedisMemoryParam) -> AnyResult<Vec<RedisKeySize>> {
        let mut conn = self.pool.get()?;
        let mut keys: Vec<(Vec<u8>, u64, String)> = vec![];

        // 遍历集群节点: 仅扫描主节点
        let nodes: Vec<String> = self.get_node_list_master();

        let mut scan_times = 0;
        'outer: for node in nodes {
            let (route, _) = self.get_node_route(Some(node.clone()))?;
            let mut cursor = 0;
            'inner: loop {
                let mut cmd = redis::cmd("scan");
                cmd.arg(cursor)
                    .arg("match")
                    .arg(param.pattern.clone().unwrap_or("*".into()))
                    .arg("count")
                    .arg(param.scan_count);

                let value = conn.route_command(&cmd, route.clone())?;
                let (next_cursor, new_keys): (u64, Vec<Vec<u8>>) =
                    FromRedisValue::from_redis_value(value)?;
                cursor = next_cursor;

                // 计算键大小
                let mut pipe = ClusterPipeline::with_capacity(new_keys.len());
                for key in new_keys.iter() {
                    pipe.cmd("memory").arg("usage").arg(key);
                }
                // 此处用Option接收,避免键被删除或过期
                let sizes: Vec<Option<u64>> = pipe.query(&mut conn)?;
                for (index, size) in sizes.into_iter().enumerate() {
                    if let Some(size) = size {
                        if size >= param.size_limit {
                            keys.push((new_keys[index].clone(), size, "unknown".into()));
                        }
                    }
                }

                scan_times += 1;

                if param.count_limit > 0 && keys.len() >= param.count_limit as usize {
                    info!("扫描结果>={}个, 返回", param.count_limit);
                    break 'outer;
                }

                if param.scan_total > 0 && scan_times * param.scan_count >= param.scan_total {
                    info!("已扫描键>={}个, 返回", param.scan_total);
                    break 'outer;
                }

                thread::sleep(Duration::from_millis(param.sleep_millis));

                if cursor == 0 {
                    break 'inner;
                }
            }
        }

        // 计算键类型
        if param.need_key_type.unwrap_or(false) {
            let mut pipe = ClusterPipeline::with_capacity(keys.len());
            for key in keys.iter() {
                pipe.cmd("type").arg(&key.0);
            }
            let types: Vec<Option<String>> = pipe.query(&mut conn)?;
            for (index, key_type) in types.into_iter().enumerate() {
                keys[index].2 = key_type.unwrap_or("deleted".into());
            }
        }

        // 映射为返回值
        Ok(tuple_to_key_size(keys))
    }

    fn client_list(
        &self,
        node: Option<String>,
        client_type: Option<String>,
    ) -> AnyResult<Vec<RedisClientInfo>> {
        let mut conn = self.pool.get()?;

        let mut clients = vec![];
        for redis_node in &self.node_list {
            // 如果参数中包含节点参数，则只返回指定节点的慢日志
            if let Some(ref node_limit) = node && !node_limit.is_empty() {
                if *node_limit != redis_node.node {
                    continue;
                }
            }
            let node = redis_node.node.clone();
            let (route, _) = self.get_node_route(Some(node.clone()))?;

            let mut cmd = redis::cmd("client");
            cmd.arg("list");
            if let Some(ref client_type_val) = client_type && !client_type_val.is_empty() {
                cmd.arg("type").arg(client_type_val);
            }
            let value = conn.route_command(&cmd, route)?;
            let client: String = FromRedisValue::from_redis_value(value)?;
            for client_info in client.lines().into_iter() {
                let client: RedisClientInfo = parse_client_info(&client_info)?;
                clients.push(client);
            }
        }
        Ok(clients)
    }

    implement_common_commands!(ClusterPipeline);

    fn subscribe(&self, channel: Option<String>) -> AnyResult<()> {
        todo!()
    }

    fn subscribe_stop(&self) -> AnyResult<()> {
        todo!()
    }

    fn monitor(&self, node: &str) -> AnyResult<()> {
        info!("TODO 监控开始");
        Ok(())
    }

    fn monitor_stop(&self) -> AnyResult<()> {
        info!("TODO 监控停止");
        Ok(())
    }
}


// 个性化方法
impl RedisMeCluster {
    pub fn new(redis_conn: &RedisConn) -> AnyResult<Box<dyn RedisMeClient>> {
        let pool = get_pool_cluster(redis_conn)?;

        // 获取一个连接, 初始化节点列表 (同时验证连接可用性)
        let mut conn = pool.get()?;
        let cluster_nodes: String = redis::cmd("cluster").arg("nodes").query(&mut conn)?;
        let node_list = Self::parse_node_list(cluster_nodes)?;
        info!("Redis集群连接初始化成功: {}", redis_conn.name);

        Ok(Box::new(RedisMeCluster {
            id: redis_conn.id.clone(),
            pool,
            node_list,
        }))
    }

    // 获取节点路由
    fn get_node_route(&self, node: Option<String>) -> AnyResult<(RoutingInfo, String)> {
        let node: String = if let Some(node) = node {
            if node == "" {
                random_item(&self.node_list).node.clone()
            } else {
                node.to_string()
            }
        } else {
            random_item(&self.node_list).node.clone()
        };

        if let Some((host, port)) = node.split_once(":") {
            let route = SingleNode(ByAddress {
                host: host.into(),
                port: port.parse::<u16>()?,
            });
            Ok((route, node.into()))
        } else {
            bail!("Invalid node format: {}", node)
        }
    }

    // 获取主节点列表
    fn get_node_list_master(&self) -> Vec<String> {
        self.node_list
            .iter()
            .filter(|node| node.is_master)
            .map(|node| node.node.clone())
            .collect::<Vec<String>>()
    }

    // 解析 cluster_nodes (静态方法)
    fn parse_node_list(cluster_nodes: String) -> AnyResult<Vec<RedisNode>> {
        // 结构
        // <id> <ip:port@cport[,hostname]> <flags> <master> <ping-sent> <pong-recv> <config-epoch> <link-state> <slot> <slot> ... <slot>

        // 示例
        // 01b6af43bd8fe6471097f5b9e5f6e4ff0945d145 192.168.1.11:7004@17004 myself,slave 08914f4493d93b198c1dfe15ab9c14a488ada09d 0 0 2 connected
        // 86ab8ccdddac8e3bd2d114d51a21f13d186ec178 192.168.1.11:7005@17005 slave e82b9f07782a16fe8e42aef8553ea473ddb130ef 0 1758958605000 3 connected
        // e82b9f07782a16fe8e42aef8553ea473ddb130ef 192.168.1.11:7003@17003 master - 0 1758958606000 3 connected 10923-16383
        // c1a786767e6a9574e8116bb771a96f2ddf001148 192.168.1.11:7006@17006 slave 993bffbf44adde4eeabf9b75f26f999177f23412 0 1758958608265 1 connected
        // 08914f4493d93b198c1dfe15ab9c14a488ada09d 192.168.1.11:7002@17002 master - 0 1758958607260 2 connected 5461-10922
        // 993bffbf44adde4eeabf9b75f26f999177f23412 192.168.1.11:7001@17001 master - 0 1758958607000 1 connected 0-5460

        let cluster_nodes = cluster_nodes.split("\n");
        let mut nodes = vec![];

        // 解析master节点
        for line in cluster_nodes.clone() {
            let parts: Vec<_> = line.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }

            if parts[2] == "master" || parts[2] == "myself,master" {
                let id = parts[0];
                let node = parts[1].split("@").next().unwrap();
                nodes.push(RedisNode {
                    id: id.into(),
                    node: node.into(),
                    is_master: true,
                    slave_of_node: None,
                })
            }
        }

        // 解析slave节点
        for line in cluster_nodes {
            let parts: Vec<_> = line.split_whitespace().collect();
            if parts.len() < 4 {
                continue;
            }

            if parts[2] == "slave" || parts[2] == "myself,slave" {
                let id = parts[0];
                let node = parts[1].split("@").next().unwrap();
                let master_id = parts[3];

                let master_node = nodes.iter().find(|node| node.id == master_id);

                nodes.push(RedisNode {
                    id: id.into(),
                    node: node.into(),
                    is_master: false,
                    slave_of_node: master_node.map(|node| node.id.clone()),
                })
            }
        }
        Ok(nodes)
    }
}