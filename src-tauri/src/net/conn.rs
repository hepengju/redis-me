use crate::model::{ConnConfig, SslOption};
use crate::net::proxy::build_proxy_dialer;
use crate::net::ssh::SshDialer;
use crate::net::tls;
use crate::support::error::AppError;
use crate::support::util::{AnyResult, CLUSTER_COMMAND_RETRIES, parse_path};
use anyhow::{Context, bail};
use log::{info, warn};
use redis::cluster::{ClusterClient, ClusterConfig, ClusterConnection};
use redis::{
    Client, ClientTlsConfig, Commands, Connection, ConnectionAddr, ConnectionDialer,
    ConnectionLike, ErrorKind, ProtocolVersion, RedisError, TlsCertificates, TlsMode,
};
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use url::Url;

/// 按连接配置试连一次。集群走集群客户端，其余走单机客户端。
pub fn test_conn(conf: &ConnConfig, connect_timeout: Duration) -> AnyResult<()> {
    if conf.cluster {
        get_client_cluster(conf, connect_timeout, true)?;
    } else {
        get_client_single(conf, connect_timeout, true, None)?;
    }
    Ok(())
}

/// 向哨兵查询 master 列表。查询前关掉 sentinel 标志，避免拨号层再走哨兵解析。
pub fn sentinel_masters(
    conf: &ConnConfig,
    connect_timeout: Duration,
    command_timeout: Duration,
) -> AnyResult<Vec<HashMap<String, String>>> {
    let mut conf = conf.clone();
    conf.sentinel = false;
    let (client, _) = get_client_single(&conf, connect_timeout, false, None)?;
    let mut conn =
        init_single_connection(&client, conf.db, connect_timeout, command_timeout, &conf)?;
    let masters: Vec<HashMap<String, String>> =
        redis::cmd("sentinel").arg("masters").query(&mut conn)?;
    Ok(masters)
}

// 获取单机 Client；verify 为 true 时按 connect_timeout ping 验证（测试连接），为 false 时仅构建 Client（init 复用 TCP）
// existing：集群 subscribe/monitor 旁路传入 ClusterClient 上的同一 SSH Dialer，避免新开会话
pub fn get_client_single(
    conf: &ConnConfig,
    connect_timeout: Duration,
    verify: bool,
    existing: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<(Client, Option<Arc<dyn ConnectionDialer>>)> {
    if conf.sentinel && conf.sentinel_option.master_name.is_empty() {
        bail!(AppError::SentinelMasterNotFound {
            name: conf.sentinel_option.master_name.clone()
        });
    }
    let dialer = resolve_dialer(conf, connect_timeout, existing)?;
    if conf.ssl {
        reject_if_plaintext_redis(conf, connect_timeout, dialer.clone())?;
    }

    let client = if conf.sentinel {
        get_client_sentinel(conf, connect_timeout, dialer.clone())?
    } else {
        build_single_client(conf, dialer.clone())?
    };
    // verify=true：仅测试连接（ConnConfig::test），按建连超时 ping 后丢弃，不再 init；verify=false：由 init_*_connection 验证并复用 TCP
    if verify {
        let _conn = verify_single_connection(&client, connect_timeout, conf)?;
    }
    Ok((client, dialer))
}

/// 正式初始化：阶段 1 验证通过后复用同一条 TCP，再进入阶段 2（避免二次建连导致外网 RST，#155）。
pub fn init_single_connection(
    client: &Client,
    db: u16,
    connect_timeout: Duration,
    command_timeout: Duration,
    conf: &ConnConfig,
) -> AnyResult<Connection> {
    let conn = verify_single_connection(client, connect_timeout, conf)?;
    apply_single_command_timeout(conn, db, command_timeout)
}

// 获取集群 Client；verify 为 true 时按建连超时 ping 验证（测试连接），为 false 时仅构建 Client（init 复用 TCP）
pub fn get_client_cluster(
    conf: &ConnConfig,
    connect_timeout: Duration,
    verify: bool,
) -> AnyResult<ClusterClient> {
    let dialer = resolve_dialer(conf, connect_timeout, None)?;
    if conf.ssl {
        reject_if_plaintext_redis(conf, connect_timeout, dialer.clone())?;
    }
    let url = redis_url(conf)?;
    log_redis_url(conf, &url);

    let mut builder =
        ClusterClient::builder(vec![url.to_string()]).retries(CLUSTER_COMMAND_RETRIES);
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
    if let Some(d) = dialer {
        builder = builder.dialer(d);
    }
    let client = builder.build()?;
    if verify {
        let _conn = verify_cluster_connection(&client, connect_timeout, conf)?;
    }
    Ok(client)
}

/// 正式初始化：阶段 1 验证通过后复用同一条 TCP，再进入阶段 2（#155）。
pub fn init_cluster_connection(
    client: &ClusterClient,
    connect_timeout: Duration,
    command_timeout: Duration,
    conf: &ConnConfig,
) -> AnyResult<ClusterConnection> {
    let conn = verify_cluster_connection(client, connect_timeout, conf)?;
    apply_cluster_command_timeout(conn, command_timeout)
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

// ------------------------------ 仅本文件使用 ------------------------------

/// 无 `existing` 时：SSH 优先；否则代理（系统模式检不到则直连）。SSH 与代理互斥。
fn resolve_dialer(
    conf: &ConnConfig,
    connect_timeout: Duration,
    existing: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<Option<Arc<dyn ConnectionDialer>>> {
    if let Some(d) = existing {
        return Ok(Some(d));
    }
    if conf.ssh && conf.proxy {
        bail!(AppError::SshAndProxyMutuallyExclusive);
    }
    if conf.ssh {
        Ok(Some(SshDialer::connect(&conf.ssh_option, connect_timeout)?))
    } else if conf.proxy {
        build_proxy_dialer(conf, connect_timeout)
    } else {
        Ok(None)
    }
}

/// 拼 redis-rs 用的连接 URL。裸 IPv6 加方括号；SSL 带 `#insecure`；RESP3 写在 query 里。
fn redis_url(conf: &ConnConfig) -> AnyResult<Url> {
    // 与前端 buildRedisUrl 一致：裸 IPv6 必须加 []，否则 Url 解析失败；哨兵发现的 master 常是无括号地址
    let host = if conf.host.contains(':') && !conf.host.starts_with('[') {
        format!("[{}]", conf.host)
    } else {
        conf.host.clone()
    };
    let mut url = Url::parse(&format!(
        "{}://{}:{}",
        if conf.ssl { "rediss" } else { "redis" },
        host,
        conf.port
    ))?;
    url.set_username(&conf.username).unwrap_or(());
    url.set_password(Some(&conf.password)).unwrap_or(());
    if conf.ssl {
        url.set_fragment(Some("insecure"));
    }
    if conf.is_resp3() {
        url.query_pairs_mut().append_pair("protocol", "resp3");
    }
    Ok(url)
}

/// 打连接 URL 日志。密码固定打成 `******`。
fn log_redis_url(conf: &ConnConfig, url: &Url) {
    info!(
        "redis_url: {}://{}:******@{}:{}{}{}",
        url.scheme(),
        conf.username,
        conf.host,
        conf.port,
        url.query().map(|q| format!("?{}", q)).unwrap_or_default(),
        url.fragment()
            .map(|f| format!("#{}", f))
            .unwrap_or_default()
    );
}

/// 有 SSH 或代理 Dialer 时挂到 Client 上，否则保持直连。
fn apply_dialer(client: Client, dialer: Option<Arc<dyn ConnectionDialer>>) -> Client {
    match dialer {
        Some(d) => client.set_dialer(d),
        None => client,
    }
}

/// 按 conf 的 host/port/ssl/账号构建 Client（不发起 I/O）。
fn build_single_client(
    conf: &ConnConfig,
    dialer: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<Client> {
    let url = redis_url(conf)?;
    log_redis_url(conf, &url);
    let certs = get_tls_certs(conf.ssl_option.clone())?;
    let client = if conf.ssl
        && let Some(tls) = certs
    {
        Client::build_with_tls(url.to_string(), tls)?
    } else {
        Client::open(url.to_string())?
    };
    Ok(apply_dialer(client, dialer))
}

/// 对端是否回了 RESP（NOAUTH/WRONGPASS/ERR 等）。Parse/IO/超时视为未确认明文。
fn server_spoke_redis_protocol(err: &RedisError) -> bool {
    err.code().is_some() || matches!(err.kind(), ErrorKind::AuthenticationFailed)
}

/// 明文探测超时：对端若是 Redis 会立刻回 PONG/NOAUTH；过长会拖慢真正的 TLS 建连。
fn plaintext_probe_timeout(connect_timeout: Duration) -> Duration {
    connect_timeout.min(Duration::from_secs(3))
}

/// 勾了 SSL 时先用不加密 PING 探一下：明文 Redis 立刻拒绝，避免 TLS ClientHello 空等到超时。
fn reject_if_plaintext_redis(
    conf: &ConnConfig,
    connect_timeout: Duration,
    dialer: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<()> {
    if plaintext_redis_reachable(conf, connect_timeout, dialer)? {
        warn!(
            "对端 {}:{} 为明文 Redis，但已勾选 SSL",
            conf.host, conf.port
        );
        bail!(AppError::TlsNotEnabled);
    }
    Ok(())
}

/// 关掉 SSL 后短超时 PING。对端回 PONG 或 Redis 错误（如 NOAUTH）视为明文 Redis。
fn plaintext_redis_reachable(
    conf: &ConnConfig,
    connect_timeout: Duration,
    dialer: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<bool> {
    let probe_timeout = plaintext_probe_timeout(connect_timeout);
    let mut probe = conf.clone();
    probe.ssl = false;
    probe.sentinel = false;
    probe.cluster = false;
    probe.db = 0;
    probe.ssl_option = SslOption::default();
    probe.meta.remove("protocol");

    let Ok(client) = build_single_client(&probe, dialer) else {
        return Ok(false);
    };
    match client.get_connection_with_timeout(probe_timeout) {
        Ok(mut conn) => {
            let _ = conn.set_read_timeout(Some(probe_timeout));
            let _ = conn.set_write_timeout(Some(probe_timeout));
            match conn.ping() {
                Ok(()) => Ok(true),
                Err(e) => Ok(server_spoke_redis_protocol(&e)),
            }
        }
        Err(e) => Ok(server_spoke_redis_protocol(&e)),
    }
}

/// 把 anyhow 错误和它的 source 链拼成一段文本，供 RST/parse 特征匹配。
fn error_chain_text(err: &anyhow::Error) -> String {
    let mut s = err.to_string();
    let mut src = err.source();
    while let Some(e) = src {
        s.push('\n');
        s.push_str(&e.to_string());
        src = e.source();
    }
    s
}

/// 明文连 TLS 口时常见：Windows RST / parse。超时、拒连、Redis 业务错误不走 TLS 探测。
fn looks_like_reset_or_parse(text: &str) -> bool {
    let t = text.to_lowercase();
    if t.contains("timed out")
        || t.contains("timeout")
        || t.contains("refused")
        || t.contains("拒绝")
    {
        return false;
    }
    t.contains("强迫关闭")
        || t.contains("forcibly closed")
        || t.contains("connection reset")
        || t.contains("connection aborted")
        || t.contains("broken pipe")
        || t.contains("unexpected eof")
        || t.contains("connection closed")
        || t.contains("10054")
        || t.contains("econnreset")
        || t.contains("parse")
        || t.contains("invalid byte")
}

/// 对端说了 TLS：握手成功后的 RESP，或 TLS alert / 要求客户端证书。不含明文 Redis 回的非法 TLS record。
fn looks_like_tls_peer_error(err: &RedisError) -> bool {
    if server_spoke_redis_protocol(err) {
        return true;
    }
    let t = err.to_string().to_lowercase();
    t.contains("received fatal alert")
        || t.contains("alertreceived")
        || t.contains("certificate required")
        || t.contains("certificaterequired")
        || t.contains("unknown ca")
        || t.contains("unknown_ca")
        || t.contains("bad certificate")
}

/// 从 Client 取出 TCP 对端地址。Unix socket 等非 TCP 返回 `None`。
fn client_tcp_peer(client: &Client) -> Option<(String, u16)> {
    match client.get_connection_info().addr() {
        ConnectionAddr::Tcp(host, port) => Some((host.clone(), *port)),
        _ => None,
    }
}

/// 未勾 SSL 且明文失败像 RST/parse 时，短探 TLS；确认对端是 TLS 再提示勾选。
fn hint_if_ssl_required(
    conf: &ConnConfig,
    connect_timeout: Duration,
    dialer: Option<Arc<dyn ConnectionDialer>>,
    peer: Option<(String, u16)>,
    err: anyhow::Error,
) -> anyhow::Error {
    if conf.ssl || !looks_like_reset_or_parse(&error_chain_text(&err)) {
        return err;
    }
    let (host, port) = peer.unwrap_or_else(|| (conf.host.clone(), conf.port));
    if tls_server_reachable(conf, &host, port, connect_timeout, dialer) {
        warn!("对端 {host}:{port} 为 TLS，但未勾选 SSL");
        return AppError::SslRequired.into();
    }
    err
}

/// 短超时按 TLS 连一次。握手成功或收到 TLS alert 视为对端开了 SSL。
fn tls_server_reachable(
    conf: &ConnConfig,
    host: &str,
    port: u16,
    connect_timeout: Duration,
    dialer: Option<Arc<dyn ConnectionDialer>>,
) -> bool {
    let probe_timeout = plaintext_probe_timeout(connect_timeout);
    let mut probe = conf.clone();
    probe.ssl = true;
    probe.sentinel = false;
    probe.cluster = false;
    probe.db = 0;
    probe.host = host.to_string();
    probe.port = port;
    probe.meta.remove("protocol");

    let Ok(client) = build_single_client(&probe, dialer) else {
        return false;
    };
    match client.get_connection_with_timeout(probe_timeout) {
        Ok(_) => true,
        Err(e) => looks_like_tls_peer_error(&e),
    }
}

/// 阶段 1：按建连超时建连并 ping，连不上时失败。
fn verify_single_connection(
    client: &Client,
    connect_timeout: Duration,
    conf: &ConnConfig,
) -> AnyResult<Connection> {
    info!("Redis单机连接验证，建连超时 {}s", connect_timeout.as_secs());
    let result: AnyResult<Connection> = (|| {
        let mut conn = client.get_connection_with_timeout(connect_timeout)?;
        // redis-rs 握手结束后会清掉 socket 超时，PING 需再套上，避免对端只收 TCP 不回协议时挂死
        conn.set_read_timeout(Some(connect_timeout))?;
        conn.set_write_timeout(Some(connect_timeout))?;
        let _: () = conn.ping()?;
        Ok(conn)
    })();
    match result {
        Ok(conn) => {
            info!("Redis单机连接验证通过");
            Ok(conn)
        }
        Err(e) => {
            warn!("Redis单机连接验证失败: {e}");
            Err(hint_if_ssl_required(
                conf,
                connect_timeout,
                client.dialer(),
                client_tcp_peer(client),
                e,
            ))
        }
    }
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

/// 带建连超时连哨兵并 `GET-MASTER-ADDR-BY-NAME`，再返回指向 master 的 Client。
/// 不用 redis-rs `SentinelClient::get_client()`：其内部 `get_connection()` 无超时，TLS 握手会挂死。
fn get_client_sentinel(
    conf: &ConnConfig,
    connect_timeout: Duration,
    dialer: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<Client> {
    let master_name = conf.sentinel_option.master_name.clone();
    if master_name.is_empty() {
        bail!(AppError::SentinelMasterNotFound { name: master_name });
    }

    let mut sent_conf = conf.clone();
    sent_conf.sentinel = false;
    sent_conf.db = 0;
    sent_conf.meta.remove("protocol");

    let sent_client = build_single_client(&sent_conf, dialer.clone())?;
    info!(
        "哨兵 {}:{} 发现主节点 {master_name}，建连超时 {}s",
        sent_conf.host,
        sent_conf.port,
        connect_timeout.as_secs()
    );
    let mut sent_conn = match sent_client.get_connection_with_timeout(connect_timeout) {
        Ok(c) => c,
        Err(e) => {
            return Err(hint_if_ssl_required(
                conf,
                connect_timeout,
                dialer,
                Some((sent_conf.host.clone(), sent_conf.port)),
                e.into(),
            ));
        }
    };
    sent_conn.set_read_timeout(Some(connect_timeout))?;
    sent_conn.set_write_timeout(Some(connect_timeout))?;
    let pair: Option<(String, String)> = match redis::cmd("SENTINEL")
        .arg("GET-MASTER-ADDR-BY-NAME")
        .arg(&master_name)
        .query(&mut sent_conn)
    {
        Ok(p) => p,
        Err(e) => {
            return Err(hint_if_ssl_required(
                conf,
                connect_timeout,
                dialer,
                Some((sent_conf.host.clone(), sent_conf.port)),
                e.into(),
            ));
        }
    };
    let Some((ip, port_str)) = pair else {
        bail!(AppError::SentinelMasterNotFound { name: master_name });
    };
    let port: u16 = port_str
        .parse()
        .with_context(|| format!("哨兵返回的主节点端口无效: {port_str}"))?;
    info!("哨兵发现主节点 {ip}:{port}");

    let mut master_conf = conf.clone();
    master_conf.sentinel = false;
    master_conf.host = ip;
    master_conf.port = port;
    master_conf.username = conf.sentinel_option.master_username.clone();
    master_conf.password = conf.sentinel_option.master_password.clone();
    if master_conf.ssl {
        reject_if_plaintext_redis(&master_conf, connect_timeout, dialer.clone())?;
    }
    build_single_client(&master_conf, dialer)
}

/// 阶段 1：按建连超时建连并 ping（集群入口节点）。
///
/// 与单机一致，整个「建连 + ping」以配置的建连超时为墙钟上限：放到后台线程执行，主线程
/// `recv_timeout(connect_timeout)` 等结果，到点仍无结果就直接报错。这样能兜住 redis-rs 同步
/// 集群客户端在拓扑通告地址不可达时（如 cluster-announce-ip 配成 127.0.0.1，外网连到客户端
/// 本机）反复「重连种子 + 刷新拓扑」导致的长时间卡死——单次 socket 超时只约束一次连接/一条
/// 命令，没有全局上限。超时后后台线程不会被强行取消（同步 connect 无法中断），但受
/// `CLUSTER_COMMAND_RETRIES` 约束会在有限时间内自行结束并释放，不影响本次返回的错误。
///
/// 注意：集群发现阶段会顺序连接拓扑里的每个节点，节点很多或链路很慢时，健康集群也可能
/// 需要接近甚至超过建连超时；此时应调大设置里的建连超时（单机同理，只是单机只有一次连接）。
fn verify_cluster_connection(
    client: &ClusterClient,
    connect_timeout: Duration,
    conf: &ConnConfig,
) -> AnyResult<ClusterConnection> {
    info!("Redis集群连接验证，建连超时 {}s", connect_timeout.as_secs());

    let verify_client = client.clone();
    let (tx, rx) = mpsc::channel::<redis::RedisResult<ClusterConnection>>();
    thread::spawn(move || {
        let result = (|| {
            let cc = ClusterConfig::new()
                .set_connection_timeout(connect_timeout)
                .set_response_timeout(connect_timeout);
            let mut conn = verify_client.get_connection_with_config(cc)?;
            conn.set_read_timeout(Some(connect_timeout))?;
            conn.set_write_timeout(Some(connect_timeout))?;
            let _: () = conn.ping()?;
            Ok(conn)
        })();
        let _ = tx.send(result);
    });

    let peer = Some((conf.host.clone(), conf.port));
    match rx.recv_timeout(connect_timeout) {
        Ok(Ok(conn)) => {
            info!("Redis集群连接验证通过");
            Ok(conn)
        }
        Ok(Err(e)) => {
            warn!("Redis集群连接验证失败: {e}");
            Err(hint_if_ssl_required(
                conf,
                connect_timeout,
                client.dialer(),
                peer,
                e.into(),
            ))
        }
        Err(_) => {
            // 到点仍无结果：多为拓扑通告地址客户端不可达（如 cluster-announce-ip=127.0.0.1）
            warn!(
                "Redis集群连接验证超过建连超时 {}s，疑似 cluster-announce-ip 不可达",
                connect_timeout.as_secs()
            );
            bail!(AppError::ClusterNodesUnreachable {
                timeout_secs: connect_timeout.as_secs()
            });
        }
    }
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
        if tls::is_x509_v1_pem(&ca_bytes) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ProxyOption;

    /// 超时还没收到 RESP，不能当成明文 Redis 已经开口。
    #[test]
    fn io_timeout_is_not_redis_protocol() {
        let err = RedisError::from(std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            "connection timed out",
        ));
        assert!(!server_spoke_redis_protocol(&err));
    }

    /// 解析失败同样不算对端回了 Redis 协议。
    #[test]
    fn parse_error_is_not_redis_protocol() {
        let err = RedisError::from((ErrorKind::Parse, "invalid byte"));
        assert!(!server_spoke_redis_protocol(&err));
    }

    /// NOAUTH 说明对端是 Redis，只是还没认证。
    #[test]
    fn auth_failed_counts_as_redis_protocol() {
        let err = RedisError::from((ErrorKind::AuthenticationFailed, "NOAUTH"));
        assert!(server_spoke_redis_protocol(&err));
    }

    /// SSH 和代理同时打开，在发起连接前就拒绝。
    #[test]
    fn ssh_and_proxy_rejected_before_io() {
        let conf = ConnConfig {
            ssh: true,
            proxy: true,
            ..ConnConfig::default()
        };
        let err = match get_client_single(&conf, Duration::from_secs(1), false, None) {
            Ok(_) => panic!("expected ssh+proxy to fail"),
            Err(e) => e,
        };
        assert!(
            err.to_string().contains("ssh_and_proxy_mutually_exclusive"),
            "unexpected error: {err}"
        );
    }

    /// 手工代理没填主机，在发起连接前就拒绝。
    #[test]
    fn manual_proxy_empty_host_fails_before_io() {
        let conf = ConnConfig {
            proxy: true,
            proxy_option: ProxyOption {
                proxy_mode: "manual".into(),
                proxy_type: "http".into(),
                host: String::new(),
                port: 8080,
                username: String::new(),
                password: String::new(),
            },
            ..ConnConfig::default()
        };
        let err = match get_client_single(&conf, Duration::from_secs(1), false, None) {
            Ok(_) => panic!("expected empty proxy host to fail"),
            Err(e) => e,
        };
        assert!(
            err.to_string().contains("proxy_host_required"),
            "unexpected error: {err}"
        );
    }

    /// 哨兵没填 master 名，在发起连接前就拒绝。
    #[test]
    fn sentinel_empty_master_name_fails_before_io() {
        let conf = ConnConfig {
            host: "127.0.0.1".into(),
            port: 1,
            sentinel: true,
            ..ConnConfig::default()
        };
        let err = match get_client_single(&conf, Duration::from_secs(1), false, None) {
            Ok(_) => panic!("expected empty master name to fail"),
            Err(e) => e,
        };
        let msg = err.to_string();
        assert!(
            msg.contains("sentinel_master_not_found"),
            "unexpected error: {msg}"
        );
    }

    /// 明文探测最多等 3 秒，更短的连接超时保持原值。
    #[test]
    fn plaintext_probe_timeout_capped_at_3s() {
        assert_eq!(
            plaintext_probe_timeout(Duration::from_secs(10)),
            Duration::from_secs(3)
        );
        assert_eq!(
            plaintext_probe_timeout(Duration::from_secs(1)),
            Duration::from_secs(1)
        );
    }

    /// 裸 IPv6 主机会补上方括号，否则 URL 解析失败。
    #[test]
    fn redis_url_brackets_ipv6() {
        let conf = ConnConfig {
            host: "::1".into(),
            port: 6379,
            ..ConnConfig::default()
        };
        let url = redis_url(&conf).unwrap();
        assert!(
            url.as_str().contains("[::1]:6379"),
            "unexpected url: {}",
            url.as_str()
        );
    }

    /// 已经带方括号的 IPv6 不再套一层。
    #[test]
    fn redis_url_keeps_bracketed_ipv6() {
        let conf = ConnConfig {
            host: "[::1]".into(),
            port: 6379,
            ..ConnConfig::default()
        };
        let url = redis_url(&conf).unwrap();
        assert!(
            url.as_str().contains("[::1]:6379"),
            "unexpected url: {}",
            url.as_str()
        );
    }

    /// 连接被对端重置像是协议不匹配；超时和拒连不是。
    #[test]
    fn windows_rst_looks_like_tls_mismatch() {
        assert!(looks_like_reset_or_parse(
            "远程主机强迫关闭了一个现有的连接。"
        ));
        assert!(looks_like_reset_or_parse(
            "An existing connection was forcibly closed by the remote host."
        ));
        assert!(looks_like_reset_or_parse("Connection reset by peer"));
        assert!(!looks_like_reset_or_parse("connection timed out"));
        assert!(!looks_like_reset_or_parse("Connection refused"));
    }

    /// TLS alert 说明对端在做 TLS；非法握手记录不是。
    #[test]
    fn rustls_alert_looks_like_tls_peer() {
        let err = RedisError::from((ErrorKind::Io, "received fatal alert: HandshakeFailure"));
        assert!(looks_like_tls_peer_error(&err));
        let plaintext = RedisError::from((ErrorKind::Io, "invalid peer handshake message"));
        assert!(!looks_like_tls_peer_error(&plaintext));
    }

    /// 勾了 SSL 时用 rediss 并带 insecure；resp3 写进查询参数。
    #[test]
    fn redis_url_ssl_and_resp3() {
        let mut conf = ConnConfig {
            host: "127.0.0.1".into(),
            port: 6379,
            username: "u".into(),
            password: "p".into(),
            ssl: true,
            ..ConnConfig::default()
        };
        conf.meta.insert(
            "protocol".into(),
            crate::model::ConnMetaValue::String("resp3".into()),
        );
        let url = redis_url(&conf).unwrap();
        assert_eq!(url.scheme(), "rediss");
        assert_eq!(url.username(), "u");
        assert_eq!(url.fragment(), Some("insecure"));
        assert!(url.query().unwrap_or("").contains("protocol=resp3"));
    }
}
