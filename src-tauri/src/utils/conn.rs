use crate::utils::error::AppError;
use crate::utils::model::{ConnConfig, SslOption};
use crate::utils::ssh_tunnel::SshTunnel;
use crate::utils::tls_cert;
use crate::utils::util::{AnyResult, parse_path};
use anyhow::{Context, bail};
use log::{info, warn};
use redis::cluster::{ClusterClient, ClusterConfig, ClusterConnection};
use redis::sentinel::{SentinelClientBuilder, SentinelServerType};
use redis::{
    Client, ClientTlsConfig, Commands, Connection, ConnectionAddr, ConnectionLike,
    ProtocolVersion, TlsCertificates, TlsMode,
};
use std::fs;
use std::time::Duration;
use url::Url;

// 获取单机 Client；verify 为 true 时按 connect_timeout ping 验证（测试连接），为 false 时仅构建 Client（init 复用 TCP）
pub fn get_client_single(
    conf: &ConnConfig,
    connect_timeout: Duration,
    verify: bool,
) -> AnyResult<(Client, Option<SshTunnel>)> {
    // SSH 隧道不支持哨兵模式
    if conf.ssh && conf.sentinel {
        bail!(AppError::SentinelNotSupported);
    }

    // 如果启用 SSH 隧道，先建立隧道（TCP+认证使用同一建连超时）
    let ssh_tunnel = if conf.ssh {
        let tunnel = SshTunnel::start(&conf.ssh_option, &conf.host, conf.port, connect_timeout)?;
        info!("SSH 隧道已建立，本地端口: {}", tunnel.local_port);
        Some(tunnel)
    } else {
        None
    };

    // 决定连接目标
    let (target_host, target_port) = if conf.ssh {
        ("127.0.0.1", ssh_tunnel.as_ref().unwrap().local_port)
    } else {
        (conf.host.as_str(), conf.port)
    };

    // 使用 url crate 构建 URL，自动处理密码中的特殊字符（如 &、@、: 等）
    let mut url = Url::parse(&format!(
        "{}://{}:{}",
        if conf.ssl { "rediss" } else { "redis" },
        target_host,
        target_port
    ))?;
    url.set_username(&conf.username).unwrap_or(());
    url.set_password(Some(&conf.password)).unwrap_or(());
    if conf.ssl {
        url.set_fragment(Some("insecure"));
    }
    // RESP3 协议：redis-rs 约定通过 URL 查询参数启用（?protocol=resp3），默认 RESP2 不加
    if conf.is_resp3() {
        url.query_pairs_mut().append_pair("protocol", "resp3");
    }

    // 日志脱敏：密码固定显示为 ******；查询串仅 protocol 一项，无敏感信息
    let redis_url_log = format!(
        "{}://{}:******@{}:{}{}{}",
        url.scheme(),
        conf.username,
        target_host,
        target_port,
        url.query()
            .map(|q| format!("?{}", q))
            .unwrap_or_default(),
        url.fragment()
            .map(|f| format!("#{}", f))
            .unwrap_or_default()
    );
    info!("redis_url: {redis_url_log}");

    let certs = get_tls_certs(conf.ssl_option.clone())?;
    let client = if conf.ssl
        && let Some(tls) = certs
    {
        Client::build_with_tls(url.to_string(), tls)?
    } else {
        Client::open(url.to_string())?
    };

    // 哨兵模式：在哨兵 Client 上建连，避免直连地址与主节点不一致
    let client = if conf.sentinel {
        get_client_sentinel(conf)?
    } else {
        client
    };
    // verify=true：仅测试连接（ConnConfig::test），按建连超时 ping 后丢弃，不再 init；verify=false：由 init_*_connection 验证并复用 TCP
    if verify {
        let _conn = verify_single_connection(&client, connect_timeout)?;
    }
    Ok((client, ssh_tunnel))
}

/// 阶段 1：按建连超时建连并 ping，连不上时失败。
fn verify_single_connection(client: &Client, connect_timeout: Duration) -> AnyResult<Connection> {
    info!("Redis单机连接验证，建连超时 {}s", connect_timeout.as_secs());
    let result: AnyResult<Connection> = (|| {
        let mut conn = client.get_connection_with_timeout(connect_timeout)?;
        // redis-rs 握手结束后会清掉 socket 超时，PING 需再套上，避免对端只收 TCP 不回协议时挂死
        conn.set_read_timeout(Some(connect_timeout))?;
        conn.set_write_timeout(Some(connect_timeout))?;
        let _: () = conn.ping()?;
        Ok(conn)
    })();
    match &result {
        Ok(_) => info!("Redis单机连接验证通过"),
        Err(e) => warn!("Redis单机连接验证失败: {e}"),
    }
    result
}

/// 阶段 2：将已验证连接切换为正式命令超时（读写超时来自应用设置，可配置）。
fn apply_single_command_timeout(
    mut conn: Connection,
    db: u16,
    command_timeout: Duration,
) -> AnyResult<Connection> {
    conn.set_read_timeout(Some(command_timeout))?;
    conn.set_write_timeout(Some(command_timeout))?;
    if db != 0 {
        info!("select {db}");
        let _: () = redis::cmd("select")
            .arg(db)
            .query(&mut conn)
            .unwrap_or_else(|_| warn!("select {db} 失败，使用默认数据库0"));
    }
    Ok(conn)
}

/// 正式初始化：阶段 1 验证通过后复用同一条 TCP，再进入阶段 2（避免二次建连导致外网 RST，#155）。
pub fn init_single_connection(
    client: &Client,
    db: u16,
    connect_timeout: Duration,
    command_timeout: Duration,
) -> AnyResult<Connection> {
    let conn = verify_single_connection(client, connect_timeout)?;
    apply_single_command_timeout(conn, db, command_timeout)
}

fn get_client_sentinel(conf: &ConnConfig) -> AnyResult<Client> {
    let certs = get_tls_certs(conf.ssl_option.clone())?;
    let conf = conf.clone();
    // builder 会移走 conf 的字符串字段，协议标记提前取出
    let resp3 = conf.is_resp3();
    let sentinel_option = conf.sentinel_option.clone();
    let client = if conf.ssl
        && let Some(tls) = certs
    {
        let addr = ConnectionAddr::TcpTls {
            host: conf.host,
            port: conf.port,
            insecure: true,
            tls_params: None,
        };
        let mut builder = SentinelClientBuilder::new(
            vec![addr],
            sentinel_option.master_name,
            SentinelServerType::Master,
        )?
        .set_client_to_redis_db(conf.db as i64)
        .set_client_to_redis_tls_mode(TlsMode::Insecure)
        .set_client_to_redis_certificates(tls.clone())
        .set_client_to_sentinel_tls_mode(TlsMode::Insecure)
        .set_client_to_sentinel_certificates(tls);
        // 同上：Insecure 才跳过服务端 webpki（含 v1 证）

        if !conf.username.is_empty() {
            builder = builder.set_client_to_sentinel_username(conf.username);
        };
        if !conf.password.is_empty() {
            builder = builder.set_client_to_sentinel_password(conf.password);
        };
        if !sentinel_option.master_username.is_empty() {
            builder = builder.set_client_to_redis_username(sentinel_option.master_username);
        }
        if !sentinel_option.master_password.is_empty() {
            builder = builder.set_client_to_redis_password(sentinel_option.master_password);
        }
        if resp3 {
            builder = builder.set_client_to_redis_protocol(ProtocolVersion::RESP3);
        }
        builder.build()?.get_client()?
    } else {
        let addr = ConnectionAddr::Tcp(conf.host, conf.port);
        let mut builder = SentinelClientBuilder::new(
            vec![addr],
            sentinel_option.master_name,
            SentinelServerType::Master,
        )?
        .set_client_to_redis_db(conf.db as i64);
        if !conf.username.is_empty() {
            builder = builder.set_client_to_sentinel_username(conf.username);
        };
        if !conf.password.is_empty() {
            builder = builder.set_client_to_sentinel_password(conf.password);
        };
        if !sentinel_option.master_username.is_empty() {
            builder = builder.set_client_to_redis_username(sentinel_option.master_username);
        }
        if !sentinel_option.master_password.is_empty() {
            builder = builder.set_client_to_redis_password(sentinel_option.master_password);
        }
        if resp3 {
            builder = builder.set_client_to_redis_protocol(ProtocolVersion::RESP3);
        }
        builder.build()?.get_client()?
    };
    Ok(client)
}

// 获取集群 Client；verify 为 Some 时按该超时 ping 验证（测试连接），为 None 时仅构建 Client（init 复用 TCP）
pub fn get_client_cluster(conf: &ConnConfig, verify: Option<Duration>) -> AnyResult<ClusterClient> {
    // SSH 隧道不支持集群模式
    if conf.ssh {
        bail!(AppError::ClusterNotSupported);
    }

    // 使用 url crate 构建 URL，自动处理密码中的特殊字符
    let mut url = Url::parse(&format!(
        "{}://{}:{}",
        if conf.ssl { "rediss" } else { "redis" },
        conf.host,
        conf.port
    ))?;
    url.set_username(&conf.username).unwrap_or(());
    url.set_password(Some(&conf.password)).unwrap_or(());
    if conf.ssl {
        url.set_fragment(Some("insecure"));
    }

    // 日志脱敏与单机一致：密码固定 ******；RESP3 经 use_protocol 生效，附加标记便于排查
    info!(
        "redis_url: {}://{}:******@{}:{}{}{}",
        url.scheme(),
        conf.username,
        conf.host,
        conf.port,
        if conf.is_resp3() { "?protocol=resp3" } else { "" },
        url.fragment()
            .map(|f| format!("#{}", f))
            .unwrap_or_default()
    );

    let mut builder = ClusterClient::builder(vec![url.to_string()]);
    if conf.is_resp3() {
        builder = builder.use_protocol(ProtocolVersion::RESP3);
    }
    if !conf.username.is_empty() {
        builder = builder.username(conf.username.clone());
    }
    if !conf.password.is_empty() {
        builder = builder.password(conf.password.clone());
    }
    if conf.ssl {
        // 须 Insecure：Secure + danger_accept_invalid_hostnames 仍会 webpki 验服务端证，v1 报 UnsupportedCertVersion
        builder = builder.tls(TlsMode::Insecure);
        let certs = get_tls_certs(conf.ssl_option.clone())?;
        if let Some(certs) = certs {
            builder = builder.certs(certs);
        };
    }
    builder = builder.database_id(conf.db as i64);
    let client = builder.build()?;
    // verify=Some：仅测试连接（ConnConfig::test），按建连超时 ping 后丢弃，不再 init；verify=None：由 init_*_connection 验证并复用 TCP
    if let Some(timeout) = verify {
        let _conn = verify_cluster_connection(&client, timeout)?;
    }
    Ok(client)
}

/// 阶段 1：按建连超时建连并 ping（集群入口节点）。
fn verify_cluster_connection(
    client: &ClusterClient,
    connect_timeout: Duration,
) -> AnyResult<ClusterConnection> {
    info!("Redis集群连接验证，建连超时 {}s", connect_timeout.as_secs());
    let result: AnyResult<ClusterConnection> = (|| {
        let cc = ClusterConfig::new()
            .set_connection_timeout(connect_timeout)
            .set_response_timeout(connect_timeout);
        let mut conn = client.get_connection_with_config(cc)?;
        conn.set_read_timeout(Some(connect_timeout))?;
        conn.set_write_timeout(Some(connect_timeout))?;
        let _: () = conn.ping()?;
        Ok(conn)
    })();
    match &result {
        Ok(_) => info!("Redis集群连接验证通过"),
        Err(e) => warn!("Redis集群连接验证失败: {e}"),
    }
    result
}

/// 阶段 2：将已验证连接切换为正式命令超时。
fn apply_cluster_command_timeout(
    conn: ClusterConnection,
    command_timeout: Duration,
) -> AnyResult<ClusterConnection> {
    conn.set_read_timeout(Some(command_timeout))?;
    conn.set_write_timeout(Some(command_timeout))?;
    Ok(conn)
}

/// 正式初始化：阶段 1 验证通过后复用同一条 TCP，再进入阶段 2（#155）。
pub fn init_cluster_connection(
    client: &ClusterClient,
    connect_timeout: Duration,
    command_timeout: Duration,
) -> AnyResult<ClusterConnection> {
    let conn = verify_cluster_connection(client, connect_timeout)?;
    apply_cluster_command_timeout(conn, command_timeout)
}

// 获取证书；v1 CA 不装入 trust store（已 #insecure，见 22_tls-x509-v1-compat.md）
fn get_tls_certs(ssl_option: SslOption) -> AnyResult<Option<TlsCertificates>> {
    if ssl_option.key.is_empty() && ssl_option.cert.is_empty() && ssl_option.ca.is_empty() {
        return Ok(None);
    };
    let cert_vec8 = fs::read(parse_path(&ssl_option.cert)).context("公钥文件读取失败")?;
    let key_vec8 = fs::read(parse_path(&ssl_option.key)).context("私钥文件读取失败")?;
    let root_cert = if ssl_option.ca.is_empty() {
        None
    } else {
        let ca_bytes = fs::read(parse_path(&ssl_option.ca)).context("授权文件读取失败")?;
        if tls_cert::is_x509_v1_pem(&ca_bytes) {
            info!("TLS CA 为 X.509 v1，已跳过 trust store（连接已启用 insecure）");
            None
        } else {
            Some(ca_bytes)
        }
    };
    let certs = TlsCertificates {
        client_tls: Some(ClientTlsConfig {
            client_cert: cert_vec8,
            client_key: key_vec8,
        }),
        root_cert,
    };
    Ok(Some(certs))
}

/// 设置客户端名称；无 CLIENT 权限时跳过，不影响连接
pub fn set_client_name(conn: &mut dyn ConnectionLike) {
    match redis::cmd("client")
        .arg("setname")
        .arg("RedisME")
        .query::<()>(conn)
    {
        Ok(()) => info!("client setname RedisME"),
        Err(e) => warn!("client setname 不可用，跳过: {e}"),
    }
}

/// 极简模式不发 CLIENT SETNAME（仅客户端展示名，不影响能力探测）
pub fn set_client_name_unless_minimal(conn: &mut dyn ConnectionLike, conf: &ConnConfig) {
    if conf.is_minimal_mode() {
        info!("极简模式：跳过 CLIENT SETNAME");
        return;
    }
    set_client_name(conn);
}
