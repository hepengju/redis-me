//! HTTP CONNECT / HTTPS（TLS-to-proxy）/ SOCKS5 / SOCKS5H Dialer。
//!
//! Redis 的 `rediss://` 仍由 redis-rs 叠在本 Dialer 返回的流上，这里不要再对 Redis 包 TLS。

use crate::utils::error::AppError;
use crate::utils::model::{ConnConfig, ProxyOption};
use crate::utils::system_proxy::{DetectOutcome, DetectedProxy, detect_system_proxy};
use crate::utils::util::AnyResult;
use anyhow::bail;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use log::info;
use redis::{ConnectionDialer, RedisError, RedisResult, RedisStream};
use rustls::pki_types::ServerName;
use rustls::{ClientConfig, ClientConnection, StreamOwned};
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// 按连接配置构建代理 Dialer。系统模式检不到则 `Ok(None)`（直连，不报错）。
pub fn build_proxy_dialer(
    conf: &ConnConfig,
    connect_timeout: Duration,
) -> AnyResult<Option<Arc<dyn ConnectionDialer>>> {
    let opt = &conf.proxy_option;
    match opt.proxy_mode.as_str() {
        "system" => match detect_system_proxy() {
            DetectOutcome::Use { proxy, source } => {
                info!(
                    "系统代理 ({source}) {} {}:{} → {}:{}",
                    proxy.proxy_type, proxy.host, proxy.port, conf.host, conf.port
                );
                Ok(Some(dialer_from_detected(&proxy, connect_timeout)?))
            }
            DetectOutcome::NotFound => {
                info!("未检测到系统代理，将直连 {}:{}", conf.host, conf.port);
                Ok(None)
            }
        },
        "manual" | "" => Ok(Some(manual_dialer(opt, connect_timeout)?)),
        other => bail!(AppError::ProxyModeNotSupported { mode: other.into() }),
    }
}

fn manual_dialer(
    opt: &ProxyOption,
    connect_timeout: Duration,
) -> AnyResult<Arc<dyn ConnectionDialer>> {
    if opt.host.trim().is_empty() || opt.port == 0 {
        bail!(AppError::ProxyHostRequired);
    }
    let detected = DetectedProxy {
        proxy_type: opt.proxy_type.clone(),
        host: opt.host.trim().to_string(),
        port: opt.port,
        username: opt.username.clone(),
        password: opt.password.clone(),
    };
    info!(
        "手动代理 {} {}:{}",
        detected.proxy_type, detected.host, detected.port
    );
    dialer_from_detected(&detected, connect_timeout)
}

fn dialer_from_detected(
    p: &DetectedProxy,
    connect_timeout: Duration,
) -> AnyResult<Arc<dyn ConnectionDialer>> {
    match p.proxy_type.as_str() {
        "http" | "https" => Ok(Arc::new(HttpDialer {
            tls_to_proxy: p.proxy_type == "https",
            proxy_host: p.host.clone(),
            proxy_port: p.port,
            username: p.username.clone(),
            password: p.password.clone(),
            connect_timeout,
        })),
        "socks5" | "socks5h" => Ok(Arc::new(Socks5Dialer {
            remote_dns: p.proxy_type == "socks5h",
            proxy_host: p.host.clone(),
            proxy_port: p.port,
            username: p.username.clone(),
            password: p.password.clone(),
            connect_timeout,
        })),
        other => bail!(AppError::ProxyTypeNotSupported {
            proxy_type: other.into()
        }),
    }
}

fn app_to_redis(err: AppError) -> RedisError {
    let msg = serde_json::to_string(&err).unwrap_or_else(|_| format!("{err:?}"));
    RedisError::from(io::Error::other(msg))
}

/// 用户名或密码任一非空即带认证（避免只填密码被静默忽略）。
fn proxy_auth_configured(username: &str, password: &str) -> bool {
    !username.is_empty() || !password.is_empty()
}

fn strip_brackets(host: &str) -> &str {
    host.strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(host)
}

pub(crate) fn format_connect_authority(host: &str, port: u16) -> String {
    let h = strip_brackets(host);
    if h.contains(':') {
        format!("[{h}]:{port}")
    } else {
        format!("{h}:{port}")
    }
}

fn connect_proxy_tcp(host: &str, port: u16, timeout: Duration) -> io::Result<TcpStream> {
    let host = strip_brackets(host);
    let addrs: Vec<SocketAddr> = (host, port).to_socket_addrs()?.collect();
    if addrs.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("proxy host `{host}` resolved to no addresses"),
        ));
    }
    let mut last = None;
    for addr in addrs {
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(stream) => {
                stream.set_nodelay(true)?;
                stream.set_read_timeout(Some(timeout))?;
                stream.set_write_timeout(Some(timeout))?;
                return Ok(stream);
            }
            Err(e) => last = Some(e),
        }
    }
    Err(last.unwrap_or_else(|| {
        io::Error::new(io::ErrorKind::ConnectionRefused, "proxy connect failed")
    }))
}

struct HttpDialer {
    tls_to_proxy: bool,
    proxy_host: String,
    proxy_port: u16,
    username: String,
    password: String,
    connect_timeout: Duration,
}

impl ConnectionDialer for HttpDialer {
    fn dial(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> RedisResult<Box<dyn RedisStream>> {
        let timeout = timeout.unwrap_or(self.connect_timeout);
        let tcp = connect_proxy_tcp(&self.proxy_host, self.proxy_port, timeout)?;
        if self.tls_to_proxy {
            dial_https_proxy(
                tcp,
                &self.proxy_host,
                host,
                port,
                &self.username,
                &self.password,
            )
        } else {
            let mut tcp = tcp;
            http_connect(&mut tcp, host, port, &self.username, &self.password)?;
            Ok(Box::new(tcp) as Box<dyn RedisStream>)
        }
    }
}

/// HTTPS = 先 TLS 到代理再 CONNECT。明文代理（Clash）常以 UnexpectedEof 失败，映射成可读错误。
fn dial_https_proxy(
    tcp: TcpStream,
    proxy_host: &str,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> RedisResult<Box<dyn RedisStream>> {
    let mut tls = wrap_proxy_tls(tcp, proxy_host).map_err(map_https_proxy_io)?;
    http_connect(&mut tls, host, port, username, password).map_err(map_https_proxy_redis)?;
    Ok(Box::new(tls))
}

fn map_https_proxy_io(err: io::Error) -> RedisError {
    if looks_like_plaintext_proxy_tls_fail(&err) {
        app_to_redis(AppError::ProxyTlsToProxyFailed)
    } else {
        app_to_redis(AppError::ProxyHandshakeFailed {
            detail: err.to_string(),
        })
    }
}

fn map_https_proxy_redis(err: RedisError) -> RedisError {
    let msg = err.to_string();
    // 已是 AppError JSON（407 / CONNECT 拒绝等）则原样返回
    if msg.contains("\"code\"") {
        return err;
    }
    if looks_like_plaintext_proxy_tls_msg(&msg) {
        return app_to_redis(AppError::ProxyTlsToProxyFailed);
    }
    err
}

fn looks_like_plaintext_proxy_tls_fail(err: &io::Error) -> bool {
    matches!(
        err.kind(),
        io::ErrorKind::UnexpectedEof
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::BrokenPipe
            | io::ErrorKind::InvalidData
    ) || looks_like_plaintext_proxy_tls_msg(&err.to_string())
}

fn looks_like_plaintext_proxy_tls_msg(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    m.contains("unexpected end of file")
        || m.contains("connection reset")
        || m.contains("broken pipe")
        || m.contains("peer closed")
}

fn http_connect<S: Read + Write>(
    stream: &mut S,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> RedisResult<()> {
    let authority = format_connect_authority(host, port);
    let mut req = format!("CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n");
    if !username.is_empty() || !password.is_empty() {
        let token = BASE64_STANDARD.encode(format!("{username}:{password}"));
        req.push_str(&format!("Proxy-Authorization: Basic {token}\r\n"));
    }
    req.push_str("\r\n");
    stream.write_all(req.as_bytes())?;
    stream.flush()?;

    let headers = read_http_headers(stream)?;
    let status = parse_http_status(&headers).ok_or_else(|| {
        app_to_redis(AppError::ProxyHandshakeFailed {
            detail: "invalid HTTP CONNECT response".into(),
        })
    })?;
    if status == 200 {
        return Ok(());
    }
    if status == 407 {
        return Err(app_to_redis(AppError::ProxyAuthRequired));
    }
    Err(app_to_redis(AppError::ProxyConnectRejected { status }))
}

fn read_http_headers<S: Read>(stream: &mut S) -> io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        stream.read_exact(&mut byte)?;
        buf.push(byte[0]);
        if buf.len() > 64 * 1024 {
            return Err(io::Error::other("proxy HTTP response too large"));
        }
        if buf.ends_with(b"\r\n\r\n") {
            return Ok(buf);
        }
    }
}

pub(crate) fn parse_http_status(headers: &[u8]) -> Option<u16> {
    let text = std::str::from_utf8(headers).ok()?;
    let line = text.lines().next()?;
    let mut parts = line.split_whitespace();
    let _version = parts.next()?;
    parts.next()?.parse().ok()
}

struct TlsProxyStream {
    inner: StreamOwned<ClientConnection, TcpStream>,
}

impl Read for TlsProxyStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buf)
    }
}

impl Write for TlsProxyStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.inner.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

impl RedisStream for TlsProxyStream {
    fn set_read_timeout(&self, dur: Option<Duration>) -> io::Result<()> {
        self.inner.get_ref().set_read_timeout(dur)
    }
    fn set_write_timeout(&self, dur: Option<Duration>) -> io::Result<()> {
        self.inner.get_ref().set_write_timeout(dur)
    }
}

fn wrap_proxy_tls(tcp: TcpStream, proxy_host: &str) -> io::Result<TlsProxyStream> {
    let name = strip_brackets(proxy_host);
    let server_name = ServerName::try_from(name.to_string()).map_err(|e| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("proxy TLS SNI `{name}`: {e}"),
        )
    })?;
    let conn = ClientConnection::new(proxy_tls_config(), server_name)
        .map_err(|e| io::Error::other(format!("proxy TLS: {e}")))?;
    Ok(TlsProxyStream {
        inner: StreamOwned::new(conn, tcp),
    })
}

fn proxy_tls_config() -> Arc<ClientConfig> {
    static CFG: OnceLock<Arc<ClientConfig>> = OnceLock::new();
    CFG.get_or_init(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let supported = rustls::crypto::ring::default_provider().signature_verification_algorithms;
        Arc::new(
            ClientConfig::builder()
                .dangerous()
                .with_custom_certificate_verifier(Arc::new(NoCert { supported }))
                .with_no_client_auth(),
        )
    })
    .clone()
}

#[derive(Debug)]
struct NoCert {
    supported: rustls::crypto::WebPkiSupportedAlgorithms,
}

impl rustls::client::danger::ServerCertVerifier for NoCert {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.supported.supported_schemes()
    }
}

struct Socks5Dialer {
    remote_dns: bool,
    proxy_host: String,
    proxy_port: u16,
    username: String,
    password: String,
    connect_timeout: Duration,
}

impl ConnectionDialer for Socks5Dialer {
    fn dial(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> RedisResult<Box<dyn RedisStream>> {
        let timeout = timeout.unwrap_or(self.connect_timeout);
        let mut tcp = connect_proxy_tcp(&self.proxy_host, self.proxy_port, timeout)?;
        socks5_handshake(
            &mut tcp,
            host,
            port,
            self.remote_dns,
            &self.username,
            &self.password,
        )?;
        Ok(Box::new(tcp) as Box<dyn RedisStream>)
    }
}

fn socks5_handshake(
    stream: &mut TcpStream,
    host: &str,
    port: u16,
    remote_dns: bool,
    username: &str,
    password: &str,
) -> RedisResult<()> {
    let want_auth = proxy_auth_configured(username, password);
    if want_auth {
        stream.write_all(&[0x05, 0x02, 0x02, 0x00])?;
    } else {
        stream.write_all(&[0x05, 0x01, 0x00])?;
    }
    let mut method = [0u8; 2];
    stream.read_exact(&mut method)?;
    if method[0] != 0x05 {
        return Err(app_to_redis(AppError::ProxyHandshakeFailed {
            detail: "not a SOCKS5 proxy".into(),
        }));
    }
    match method[1] {
        0x00 => {}
        0x02 if want_auth => socks5_userpass(stream, username, password)?,
        0x02 => {
            return Err(app_to_redis(AppError::ProxyHandshakeFailed {
                detail: "SOCKS5 proxy requires authentication".into(),
            }));
        }
        0xFF => {
            return Err(app_to_redis(AppError::ProxyHandshakeFailed {
                detail: if want_auth {
                    "SOCKS5 authentication rejected".into()
                } else {
                    "SOCKS5 proxy requires authentication".into()
                },
            }));
        }
        other => {
            return Err(app_to_redis(AppError::ProxyHandshakeFailed {
                detail: format!("SOCKS5 method 0x{other:02x} not supported"),
            }));
        }
    }

    let mut req = vec![0x05, 0x01, 0x00];
    append_socks5_addr(&mut req, host, port, remote_dns)?;
    stream.write_all(&req)?;

    let mut head = [0u8; 4];
    stream.read_exact(&mut head)?;
    if head[0] != 0x05 {
        return Err(app_to_redis(AppError::ProxyHandshakeFailed {
            detail: "invalid SOCKS5 reply".into(),
        }));
    }
    if head[1] != 0x00 {
        return Err(app_to_redis(AppError::ProxyHandshakeFailed {
            detail: socks5_rep_text(head[1]),
        }));
    }
    skip_socks5_bnd(stream, head[3])?;
    Ok(())
}

fn socks5_userpass(stream: &mut TcpStream, username: &str, password: &str) -> RedisResult<()> {
    let u = username.as_bytes();
    let p = password.as_bytes();
    if u.len() > 255 || p.len() > 255 {
        return Err(app_to_redis(AppError::ProxyHandshakeFailed {
            detail: "SOCKS5 username/password too long".into(),
        }));
    }
    let mut buf = Vec::with_capacity(3 + u.len() + p.len());
    buf.push(0x01);
    buf.push(u.len() as u8);
    buf.extend_from_slice(u);
    buf.push(p.len() as u8);
    buf.extend_from_slice(p);
    stream.write_all(&buf)?;
    let mut reply = [0u8; 2];
    stream.read_exact(&mut reply)?;
    if reply[1] != 0x00 {
        return Err(app_to_redis(AppError::ProxyAuthRequired));
    }
    Ok(())
}

fn append_socks5_addr(
    req: &mut Vec<u8>,
    host: &str,
    port: u16,
    remote_dns: bool,
) -> RedisResult<()> {
    let host = strip_brackets(host);
    if let Ok(ip) = host.parse::<IpAddr>() {
        push_socks5_ip(req, ip, port);
        return Ok(());
    }
    if remote_dns {
        let bytes = host.as_bytes();
        if bytes.is_empty() || bytes.len() > 255 {
            return Err(app_to_redis(AppError::ProxyHandshakeFailed {
                detail: "SOCKS5H host must be 1–255 bytes".into(),
            }));
        }
        req.push(0x03);
        req.push(bytes.len() as u8);
        req.extend_from_slice(bytes);
        req.extend_from_slice(&port.to_be_bytes());
        return Ok(());
    }
    let addr = (host, port).to_socket_addrs()?.next().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("failed to resolve `{host}`"),
        )
    })?;
    push_socks5_ip(req, addr.ip(), addr.port());
    Ok(())
}

fn push_socks5_ip(req: &mut Vec<u8>, ip: IpAddr, port: u16) {
    match ip {
        IpAddr::V4(v4) => {
            req.push(0x01);
            req.extend_from_slice(&v4.octets());
        }
        IpAddr::V6(v6) => {
            req.push(0x04);
            req.extend_from_slice(&v6.octets());
        }
    }
    req.extend_from_slice(&port.to_be_bytes());
}

fn skip_socks5_bnd(stream: &mut TcpStream, atyp: u8) -> RedisResult<()> {
    match atyp {
        0x01 => {
            let mut b = [0u8; 4 + 2];
            stream.read_exact(&mut b)?;
        }
        0x04 => {
            let mut b = [0u8; 16 + 2];
            stream.read_exact(&mut b)?;
        }
        0x03 => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len)?;
            let mut rest = vec![0u8; len[0] as usize + 2];
            stream.read_exact(&mut rest)?;
        }
        other => {
            return Err(app_to_redis(AppError::ProxyHandshakeFailed {
                detail: format!("SOCKS5 ATYP 0x{other:02x}"),
            }));
        }
    }
    Ok(())
}

fn socks5_rep_text(rep: u8) -> String {
    match rep {
        0x01 => "SOCKS5 general failure".into(),
        0x02 => "SOCKS5 connection not allowed".into(),
        0x03 => "SOCKS5 network unreachable".into(),
        0x04 => "SOCKS5 host unreachable".into(),
        0x05 => "SOCKS5 connection refused".into(),
        0x06 => "SOCKS5 TTL expired".into(),
        0x07 => "SOCKS5 command not supported".into(),
        0x08 => "SOCKS5 address type not supported".into(),
        other => format!("SOCKS5 reply 0x{other:02x}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connect_authority_ipv6() {
        assert_eq!(format_connect_authority("::1", 6379), "[::1]:6379");
        assert_eq!(format_connect_authority("[::1]", 6379), "[::1]:6379");
        assert_eq!(
            format_connect_authority("127.0.0.1", 6379),
            "127.0.0.1:6379"
        );
        assert_eq!(
            format_connect_authority("redis.example", 6379),
            "redis.example:6379"
        );
    }

    #[test]
    fn http_connect_status_line() {
        assert_eq!(
            parse_http_status(b"HTTP/1.1 200 Connection established\r\n\r\n"),
            Some(200)
        );
        assert_eq!(
            parse_http_status(b"HTTP/1.0 407 Proxy Authentication Required\r\n\r\n"),
            Some(407)
        );
        assert_eq!(parse_http_status(b"not http"), None);
    }

    #[test]
    fn auth_when_password_only() {
        assert!(!proxy_auth_configured("", ""));
        assert!(proxy_auth_configured("u", ""));
        assert!(proxy_auth_configured("", "p"));
        assert!(proxy_auth_configured("u", "p"));
    }

    #[test]
    fn plaintext_proxy_tls_fail_heuristics() {
        assert!(looks_like_plaintext_proxy_tls_msg("unexpected end of file"));
        assert!(looks_like_plaintext_proxy_tls_msg("Connection reset by peer"));
        assert!(!looks_like_plaintext_proxy_tls_msg("proxy auth required"));
        assert!(looks_like_plaintext_proxy_tls_fail(&io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "eof"
        )));
    }
}
