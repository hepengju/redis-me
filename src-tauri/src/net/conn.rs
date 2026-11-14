use crate::model::{ConnConfig, SentinelPeer, SentinelTopology, SslOption};
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
    reject_unix_combo(conf)?;
    if conf.cluster {
        get_client_cluster(conf, connect_timeout, true)?;
    } else {
        get_client_single(conf, connect_timeout, true, None)?;
    }
    Ok(())
}

/// 向哨兵查询 master 列表。连的是配置里的哨兵进程，不是主库。
pub fn sentinel_masters(
    conf: &ConnConfig,
    connect_timeout: Duration,
    command_timeout: Duration,
) -> AnyResult<Vec<HashMap<String, String>>> {
    let mut conn = open_sentinel_session(conf, connect_timeout, command_timeout)?;
    let masters: Vec<HashMap<String, String>> =
        redis::cmd("SENTINEL").arg("MASTERS").query(&mut conn)?;
    Ok(masters)
}

/// 向哨兵查询当前连接监视的那一组：主库、副本、其他哨兵。
/// 不能走已经连上的主库会话，主库不认 `SENTINEL`。
/// `REPLICAS` 在旧版本不存在时退回 `SLAVES`。
pub fn sentinel_topology(
    conf: &ConnConfig,
    connect_timeout: Duration,
    command_timeout: Duration,
) -> AnyResult<SentinelTopology> {
    let master_name = conf.sentinel_option.master_name.clone();
    if master_name.is_empty() {
        bail!(AppError::SentinelMasterNotFound { name: master_name });
    }
    let mut conn = open_sentinel_session(conf, connect_timeout, command_timeout)?;
    let masters: Vec<HashMap<String, String>> =
        redis::cmd("SENTINEL").arg("MASTERS").query(&mut conn)?;
    let master = select_monitored_master(&masters, &master_name)?;
    let replicas = query_sentinel_replicas(&mut conn, &master_name)?;
    let sentinels: Vec<HashMap<String, String>> = redis::cmd("SENTINEL")
        .arg("SENTINELS")
        .arg(&master_name)
        .query(&mut conn)?;
    let topology = assemble_sentinel_topology(conf, &master_name, master, &replicas, &sentinels);
    info!(
        "哨兵拓扑 {}:{} master {master_name}，副本 {}，其他哨兵 {}",
        conf.host,
        conf.port,
        topology.replicas.len(),
        topology.sentinels.len()
    );
    Ok(topology)
}

/// 连上配置里的哨兵进程。关掉 sentinel 标志，避免拨号层再去解析 master。
fn open_sentinel_session(
    conf: &ConnConfig,
    connect_timeout: Duration,
    command_timeout: Duration,
) -> AnyResult<Connection> {
    reject_unix_combo(conf)?;
    let mut sent = conf.clone();
    sent.sentinel = false;
    // 配置里的 db 属于主库；哨兵不认 SELECT
    sent.db = 0;
    let (client, _) = get_client_single(&sent, connect_timeout, false, None)?;
    init_single_connection(&client, 0, connect_timeout, command_timeout, &sent)
}

fn select_monitored_master<'a>(
    masters: &'a [HashMap<String, String>],
    master_name: &str,
) -> AnyResult<&'a HashMap<String, String>> {
    masters
        .iter()
        .find(|item| map_field(item, "name") == master_name)
        .ok_or_else(|| AppError::SentinelMasterNotFound { name: master_name.into() }.into())
}

/// Redis 5 起叫 REPLICAS，更早只有 SLAVES。权限错误不退回，避免多打一枪。
fn query_sentinel_replicas(
    conn: &mut Connection,
    master_name: &str,
) -> AnyResult<Vec<HashMap<String, String>>> {
    match redis::cmd("SENTINEL")
        .arg("REPLICAS")
        .arg(master_name)
        .query(conn)
    {
        Ok(rows) => Ok(rows),
        Err(err) if unknown_sentinel_subcommand(&err) => {
            let rows = redis::cmd("SENTINEL")
                .arg("SLAVES")
                .arg(master_name)
                .query(conn)?;
            Ok(rows)
        }
        Err(err) => Err(err.into()),
    }
}

fn unknown_sentinel_subcommand(err: &RedisError) -> bool {
    let msg = err.to_string().to_ascii_lowercase();
    msg.contains("unknown subcommand") || msg.contains("unknown command")
}

fn assemble_sentinel_topology(
    conf: &ConnConfig,
    master_name: &str,
    master: &HashMap<String, String>,
    replicas: &[HashMap<String, String>],
    sentinels: &[HashMap<String, String>],
) -> SentinelTopology {
    let self_addr = sentinel_self_addr(conf);
    let mut replicas: Vec<SentinelPeer> =
        replicas.iter().map(|item| peer_from(item, true)).collect();
    replicas.sort_by(|a, b| a.addr.cmp(&b.addr));
    let mut sentinels: Vec<SentinelPeer> = sentinels
        .iter()
        .map(|item| peer_from(item, false))
        .filter(|peer| !peer.addr.eq_ignore_ascii_case(&self_addr))
        .collect();
    sentinels.sort_by(|a, b| a.addr.cmp(&b.addr));
    SentinelTopology {
        master_name: master_name.to_string(),
        self_addr,
        quorum: parse_u64(map_field(master, "quorum")),
        master: peer_from(master, false),
        replicas,
        sentinels,
    }
}

fn sentinel_self_addr(conf: &ConnConfig) -> String {
    let host = conf.host.trim().trim_matches(|c| c == '[' || c == ']');
    format!("{host}:{}", conf.port)
}

fn peer_from(map: &HashMap<String, String>, replica: bool) -> SentinelPeer {
    SentinelPeer {
        addr: peer_addr(map),
        flags: if replica {
            replica_flags(map)
        } else {
            map_field(map, "flags").trim().to_string()
        },
        link_down_ms: if replica {
            parse_u64(map_field(map, "master-link-down-time"))
        } else {
            0
        },
    }
}

fn peer_addr(map: &HashMap<String, String>) -> String {
    let ip = map_field(map, "ip").trim();
    let port = map_field(map, "port").trim();
    if ip.is_empty() {
        map_field(map, "name").trim().to_string()
    } else if port.is_empty() {
        ip.to_string()
    } else {
        format!("{ip}:{port}")
    }
}

/// 副本链路不是 ok 时，把 master-link-status 接到 flags 后面，界面只看这一列。
fn replica_flags(map: &HashMap<String, String>) -> String {
    let flags = map_field(map, "flags").trim();
    let status = map_field(map, "master-link-status").trim();
    if status.is_empty() || status.eq_ignore_ascii_case("ok") {
        flags.to_string()
    } else if flags.is_empty() {
        status.to_string()
    } else {
        format!("{flags},{status}")
    }
}

fn map_field<'a>(map: &'a HashMap<String, String>, key: &str) -> &'a str {
    map.get(key).map(String::as_str).unwrap_or("")
}

fn parse_u64(raw: &str) -> u64 {
    raw.trim().parse().unwrap_or(0)
}

// 获取单机 Client；verify 为 true 时按 connect_timeout ping 验证（测试连接），为 false 时仅构建 Client（init 复用 TCP）
// existing：集群 subscribe/monitor 旁路传入 ClusterClient 上的同一 SSH Dialer，避免新开会话
pub fn get_client_single(
    conf: &ConnConfig,
    connect_timeout: Duration,
    verify: bool,
    existing: Option<Arc<dyn ConnectionDialer>>,
) -> AnyResult<(Client, Option<Arc<dyn ConnectionDialer>>)> {
    reject_unix_combo(conf)?;
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
    reject_unix_combo(conf)?;
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
        // unix + SSH：路径留在 Dialer 上，开 channel 时走 direct-streamlocal，不经过本机套接字
        let socket_path = conf.is_unix().then(|| conf.socket_path.trim().to_string());
        Ok(Some(SshDialer::connect(
            &conf.ssh_option,
            connect_timeout,
            socket_path,
        )?))
    } else if conf.proxy {
        build_proxy_dialer(conf, connect_timeout)
    } else {
        Ok(None)
    }
}

/// Unix 套接字只支持单机直连，或经 SSH 打开远端路径。集群 / 哨兵 / SSL / 代理在拨号前拒绝。
fn reject_unix_combo(conf: &ConnConfig) -> AnyResult<()> {
    if !conf.is_unix() {
        return Ok(());
    }
    let path = conf.socket_path.trim();
    if path.is_empty() {
        bail!(AppError::UnixSocketPathRequired);
    }
    if !path.starts_with('/') {
        bail!(AppError::UnixSocketPathInvalid);
    }
    if conf.cluster || conf.sentinel || conf.ssl || conf.proxy {
        bail!(AppError::UnixSocketIncompatible);
    }
    // 本机 UnixStream 只在 unix 平台可用；Windows 要连远端套接字必须走 SSH
    if !conf.ssh && !cfg!(unix) {
        bail!(AppError::UnixSocketPlatformUnsupported);
    }
    Ok(())
}

/// 拼 redis-rs 用的连接 URL。裸 IPv6 加方括号；SSL 带 `#insecure`；RESP3 写在 query 里。
///
/// unix 且开了 SSH 时仍返回普通 `redis://` 占位地址：redis-rs 对 `unix://` 会丢掉 Dialer。
/// 真正的远端路径在 `SshDialer` 上。
fn redis_url(conf: &ConnConfig) -> AnyResult<Url> {
    if conf.is_unix() && conf.ssh {
        return redis_tcp_url(conf, "127.0.0.1", 6379);
    }
    if conf.is_unix() {
        return redis_unix_url(conf);
    }
    redis_tcp_url(conf, &conf.host, conf.port)
}

/// TCP / TLS 地址。占位的 SSH+unix 也走这里，账号和 RESP3 与直连 TCP 相同。
fn redis_tcp_url(conf: &ConnConfig, host: &str, port: u16) -> AnyResult<Url> {
    // 与前端 buildRedisUrl 一致：裸 IPv6 必须加 []，否则 Url 解析失败；哨兵发现的 master 常是无括号地址
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let mut url = Url::parse(&format!(
        "{}://{host}:{port}",
        if conf.ssl { "rediss" } else { "redis" },
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

/// 本机套接字。redis-rs 从 query 读 `user` / `pass` / `protocol`，路径用 `to_file_path`。
fn redis_unix_url(conf: &ConnConfig) -> AnyResult<Url> {
    let path = encode_unix_path(conf.socket_path.trim());
    let mut url = Url::parse(&format!("unix://{path}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        if !conf.username.is_empty() {
            pairs.append_pair("user", &conf.username);
        }
        if !conf.password.is_empty() {
            pairs.append_pair("pass", &conf.password);
        }
        if conf.is_resp3() {
            pairs.append_pair("protocol", "resp3");
        }
    }
    Ok(url)
}

/// 保留 `/`，其余按百分号编码，避免空格等字符让 `Url::parse` 失败。
fn encode_unix_path(path: &str) -> String {
    let mut out = String::new();
    for b in path.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 打连接 URL 日志。密码固定打成 `******`。unix 打路径，不打 SSH 占位的 127.0.0.1。
fn log_redis_url(conf: &ConnConfig, url: &Url) {
    if conf.is_unix() {
        info!(
            "redis_url: unix {} user={} ssh={}{}",
            conf.socket_path.trim(),
            conf.username,
            conf.ssh,
            if conf.is_resp3() {
                " protocol=resp3"
            } else {
                ""
            }
        );
        return;
    }
    info!(
        "redis_url: {}://{}:******@{}:{}{}{}",
        url.scheme(),
        conf.username,
        conf.host,
        conf.port,
        url.query().map(|q| format!("?{q}")).unwrap_or_default(),
        url.fragment().map(|f| format!("#{f}")).unwrap_or_default()
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
    // 套接字不支持 SSL。SSH 场景的地址是占位 TCP，不能拿去探测 TLS。
    if conf.is_unix() || conf.ssl || !looks_like_reset_or_parse(&error_chain_text(&err)) {
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

    fn unix_conf(path: &str) -> ConnConfig {
        ConnConfig {
            network: "unix".into(),
            socket_path: path.into(),
            ..ConnConfig::default()
        }
    }

    /// 本机套接字走 unix://，账号和协议在 query 里，路径里的空格要编码。
    #[test]
    fn local_unix_url_uses_query_credentials() {
        let mut conf = unix_conf("/var/run/my redis.sock");
        conf.username = "u".into();
        conf.password = "p@ss".into();
        conf.meta.insert(
            "protocol".into(),
            crate::model::ConnMetaValue::String("resp3".into()),
        );
        let url = redis_url(&conf).unwrap();
        assert_eq!(url.scheme(), "unix");
        assert!(
            url.path().contains("my%20redis.sock") || url.as_str().contains("my%20redis.sock"),
            "unexpected url: {}",
            url.as_str()
        );
        let pairs: Vec<(String, String)> = url.query_pairs().into_owned().collect();
        assert!(pairs.iter().any(|(k, v)| k == "user" && v == "u"));
        assert!(pairs.iter().any(|(k, v)| k == "pass" && v == "p@ss"));
        assert!(pairs.iter().any(|(k, v)| k == "protocol" && v == "resp3"));
    }

    /// SSH + unix 必须仍是 redis://，否则 redis-rs 会丢掉 Dialer 并在本机 connect。
    #[test]
    fn ssh_unix_url_stays_tcp() {
        let mut conf = unix_conf("/var/run/redis/redis.sock");
        conf.ssh = true;
        conf.username = "u".into();
        let url = redis_url(&conf).unwrap();
        assert_eq!(url.scheme(), "redis");
        assert!(
            !url.as_str().contains("redis.sock"),
            "unexpected url: {}",
            url.as_str()
        );
        assert_eq!(url.username(), "u");
    }

    /// 套接字不能和集群一起用，而且在拨号前就拒绝。
    #[test]
    fn unix_cluster_rejected_before_io() {
        let mut conf = unix_conf("/tmp/redis.sock");
        conf.cluster = true;
        let err = get_client_cluster(&conf, Duration::from_secs(1), false).unwrap_err();
        assert!(
            err.to_string().contains("unix_socket_incompatible"),
            "unexpected error: {err}"
        );
    }

    fn expect_err<T>(result: AnyResult<T>) -> String {
        match result {
            Ok(_) => panic!("expected error"),
            Err(e) => e.to_string(),
        }
    }

    /// 相对路径、空路径同样在拨号前拒绝。
    #[test]
    fn unix_path_must_be_absolute() {
        let empty = expect_err(get_client_single(
            &unix_conf(""),
            Duration::from_secs(1),
            false,
            None,
        ));
        assert!(empty.contains("unix_socket_path_required"), "{empty}");
        let rel = expect_err(get_client_single(
            &unix_conf("tmp/redis.sock"),
            Duration::from_secs(1),
            false,
            None,
        ));
        assert!(rel.contains("unix_socket_path_invalid"), "{rel}");
    }

    /// 非 unix 平台不能本机直连套接字。
    #[cfg(not(unix))]
    #[test]
    fn local_unix_rejected_on_this_platform() {
        let err = expect_err(get_client_single(
            &unix_conf("/tmp/redis.sock"),
            Duration::from_secs(1),
            false,
            None,
        ));
        assert!(
            err.contains("unix_socket_platform_unsupported"),
            "unexpected error: {err}"
        );
    }

    /// redis-rs 能把本机 unix URL 解析成套接字地址（不发起连接）。
    #[cfg(unix)]
    #[test]
    fn local_unix_url_parses() {
        let url = redis_url(&unix_conf("/tmp/redis.sock")).unwrap();
        redis::Client::open(url.to_string()).expect("unix url should parse");
    }

    fn pairs(items: &[(&str, &str)]) -> HashMap<String, String> {
        items
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect()
    }

    /// 没填 master 名时，在建连前拒绝。
    #[test]
    fn sentinel_topology_empty_master_name_fails_before_io() {
        let conf = ConnConfig {
            host: "127.0.0.1".into(),
            port: 1,
            sentinel: true,
            ..ConnConfig::default()
        };
        let err = sentinel_topology(&conf, Duration::from_secs(1), Duration::from_secs(1))
            .unwrap_err()
            .to_string();
        assert!(
            err.contains("sentinel_master_not_found"),
            "unexpected error: {err}"
        );
    }

    /// 只留下配置里的 master；自己的通告地址从其他哨兵里去掉；副本按地址排序。
    #[test]
    fn sentinel_topology_assembles_one_master() {
        let conf = ConnConfig {
            host: "[::1]".into(),
            port: 26379,
            ..ConnConfig::default()
        };
        let masters = vec![
            pairs(&[("name", "cache"), ("ip", "10.0.0.8"), ("port", "6379")]),
            pairs(&[
                ("name", "app"),
                ("ip", "10.0.0.1"),
                ("port", "6379"),
                ("flags", "master"),
                ("quorum", "2"),
            ]),
        ];
        let master = select_monitored_master(&masters, "app").unwrap();
        let replicas = vec![
            pairs(&[
                ("ip", "10.0.0.3"),
                ("port", "6379"),
                ("flags", "slave"),
                ("master-link-status", "ok"),
                ("master-link-down-time", "0"),
            ]),
            pairs(&[
                ("ip", "10.0.0.2"),
                ("port", "6379"),
                ("flags", "slave,disconnected"),
                ("master-link-status", "err"),
                ("master-link-down-time", "1500"),
            ]),
        ];
        let sentinels = vec![
            pairs(&[("ip", "::1"), ("port", "26379"), ("flags", "sentinel")]),
            pairs(&[
                ("ip", "10.0.0.9"),
                ("port", "26380"),
                ("flags", "sentinel,s_down"),
            ]),
        ];
        let topo = assemble_sentinel_topology(&conf, "app", master, &replicas, &sentinels);
        assert_eq!(topo.self_addr, "::1:26379");
        assert_eq!(topo.master.addr, "10.0.0.1:6379");
        assert_eq!(topo.master.flags, "master");
        assert_eq!(topo.quorum, 2);
        assert_eq!(
            topo.replicas
                .iter()
                .map(|peer| peer.addr.as_str())
                .collect::<Vec<_>>(),
            vec!["10.0.0.2:6379", "10.0.0.3:6379"]
        );
        assert_eq!(topo.replicas[0].flags, "slave,disconnected,err");
        assert_eq!(topo.replicas[0].link_down_ms, 1500);
        assert_eq!(topo.replicas[1].link_down_ms, 0);
        assert_eq!(topo.sentinels.len(), 1);
        assert_eq!(topo.sentinels[0].addr, "10.0.0.9:26380");
        assert!(select_monitored_master(&masters, "missing").is_err());
    }

    /// 只有未知子命令才退回 SLAVES，权限错误保持原样。
    #[test]
    fn sentinel_replicas_subcommand_fallback_detects_unknown_only() {
        let unknown = redis::RedisError::from((
            redis::ErrorKind::Parse,
            "ERR Unknown subcommand 'replicas'. Try SENTINEL HELP.",
        ));
        assert!(unknown_sentinel_subcommand(&unknown));
        let denied = redis::RedisError::from((
            redis::ErrorKind::Parse,
            "NOPERM this user has no permissions to run the 'sentinel' command",
        ));
        assert!(!unknown_sentinel_subcommand(&denied));
    }
}
