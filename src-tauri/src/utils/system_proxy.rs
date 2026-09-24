//! 运行时检测系统代理（环境变量 + Windows/macOS 静态设置）。不解析 PAC。
//!
//! 检测结果不写入连接配置；`proxy_mode = system` 时每次建连再跑一遍。
//! 勾选即检测/使用，不按目标主机做 loopback / NO_PROXY 绕过（本机 Redis 请自行关掉代理）。

use crate::utils::model::SystemProxyDetect;
use url::Url;

/// 解析后的代理（含 URL 里的认证，供 Dialer 使用）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedProxy {
    pub proxy_type: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DetectOutcome {
    Use {
        proxy: DetectedProxy,
        source: &'static str,
    },
    NotFound,
}

/// 建连用：检到则走代理，否则直连。
pub fn detect_system_proxy() -> DetectOutcome {
    match find_system_proxy() {
        Some((proxy, source)) => DetectOutcome::Use { proxy, source },
        None => DetectOutcome::NotFound,
    }
}

/// 表单只读提示。
pub fn detect_for_ui() -> SystemProxyDetect {
    match detect_system_proxy() {
        DetectOutcome::Use { proxy: p, source } => SystemProxyDetect {
            found: true,
            source: source.into(),
            proxy_type: p.proxy_type,
            host: p.host,
            port: p.port,
            has_auth: !p.username.is_empty() || !p.password.is_empty(),
        },
        DetectOutcome::NotFound => SystemProxyDetect {
            found: false,
            source: "none".into(),
            ..SystemProxyDetect::default()
        },
    }
}

fn find_system_proxy() -> Option<(DetectedProxy, &'static str)> {
    if let Some(p) = detect_from_env() {
        return Some((p, "env"));
    }
    #[cfg(windows)]
    if let Some(p) = detect_windows_static() {
        return Some((p, "windows"));
    }
    #[cfg(target_os = "macos")]
    if let Some(p) = detect_macos_static() {
        return Some((p, "macos"));
    }
    None
}

fn detect_from_env() -> Option<DetectedProxy> {
    let raw = env_nonempty(&[
        "https_proxy",
        "HTTPS_PROXY",
        "http_proxy",
        "HTTP_PROXY",
        "all_proxy",
        "ALL_PROXY",
    ])?;
    parse_proxy_url(&raw)
}

fn env_nonempty(names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|n| std::env::var(n).ok().filter(|s| !s.trim().is_empty()))
}

/// `http://` / `https://` / `socks5://` / `socks5h://`，或无 scheme 的 `host:port`。
pub(crate) fn parse_proxy_url(raw: &str) -> Option<DetectedProxy> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    let url = if raw.contains("://") {
        Url::parse(raw).ok()?
    } else {
        Url::parse(&format!("http://{raw}")).ok()?
    };
    let host = url.host_str()?.to_string();
    let scheme = url.scheme();
    let default_port = match scheme {
        "https" => 443,
        "socks5" | "socks5h" | "socks" => 1080,
        _ => 8080,
    };
    let port = url.port().unwrap_or(default_port);
    if port == 0 {
        return None;
    }
    let proxy_type = match scheme {
        "https" => "https",
        "socks5h" => "socks5h",
        "socks5" | "socks" => "socks5",
        _ => "http",
    };
    Some(DetectedProxy {
        proxy_type: proxy_type.into(),
        host,
        port,
        username: url.username().to_string(),
        password: url.password().unwrap_or("").to_string(),
    })
}

#[cfg(windows)]
fn read_win_internet_settings() -> Option<winreg::RegKey> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()
}

#[cfg(windows)]
fn detect_windows_static() -> Option<DetectedProxy> {
    let key = read_win_internet_settings()?;
    let enable: u32 = key.get_value("ProxyEnable").ok()?;
    if enable == 0 {
        return None;
    }
    let server: String = key.get_value("ProxyServer").ok()?;
    parse_windows_proxy_server(&server)
}

/// Windows `ProxyServer`：`host:port` 或 `http=host:port;socks=host:port`。
/// `https=` 仍是 HTTP CONNECT 代理（不是 TLS-to-proxy）。
pub(crate) fn parse_windows_proxy_server(s: &str) -> Option<DetectedProxy> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if !s.contains('=') {
        return parse_host_port(s, "http");
    }
    let mut http = None;
    let mut socks = None;
    for part in s.split(';') {
        let part = part.trim();
        let Some((k, v)) = part.split_once('=') else {
            continue;
        };
        let k = k.trim().to_ascii_lowercase();
        let v = v.trim();
        match k.as_str() {
            "socks" => socks = parse_host_port(v, "socks5"),
            "http" | "https" => {
                if http.is_none() {
                    http = parse_host_port(v, "http");
                }
            }
            _ => {}
        }
    }
    socks.or(http)
}

pub(crate) fn parse_host_port(s: &str, proxy_type: &str) -> Option<DetectedProxy> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(rest) = s.strip_prefix('[') {
        let (host, after) = rest.split_once(']')?;
        let port: u16 = after.strip_prefix(':')?.parse().ok()?;
        if port == 0 || host.is_empty() {
            return None;
        }
        return Some(DetectedProxy {
            proxy_type: proxy_type.into(),
            host: host.to_string(),
            port,
            username: String::new(),
            password: String::new(),
        });
    }
    let (host, port_str) = s.rsplit_once(':')?;
    if host.is_empty() || host.contains(':') {
        return None;
    }
    let port: u16 = port_str.parse().ok()?;
    if port == 0 {
        return None;
    }
    Some(DetectedProxy {
        proxy_type: proxy_type.into(),
        host: host.to_string(),
        port,
        username: String::new(),
        password: String::new(),
    })
}

#[cfg(target_os = "macos")]
fn detect_macos_static() -> Option<DetectedProxy> {
    let out = std::process::Command::new("scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_scutil_proxy(&String::from_utf8_lossy(&out.stdout))
}

/// 解析 `scutil --proxy`。PAC-only（仅 AutoConfig）返回 None。
#[cfg(any(test, target_os = "macos"))]
pub(crate) fn parse_scutil_proxy(output: &str) -> Option<DetectedProxy> {
    let mut map = std::collections::HashMap::new();
    for line in output.lines() {
        let line = line.trim();
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        map.insert(k.trim().to_string(), v.trim().to_string());
    }
    let enabled = |key: &str| map.get(key).is_some_and(|v| v == "1");
    let host_port = |host_k: &str, port_k: &str, ty: &str| -> Option<DetectedProxy> {
        let host = map.get(host_k)?.trim();
        if host.is_empty() {
            return None;
        }
        let port: u16 = map.get(port_k)?.parse().ok()?;
        parse_host_port(&format!("{host}:{port}"), ty)
    };
    if enabled("SOCKSEnable") {
        if let Some(p) = host_port("SOCKSProxy", "SOCKSPort", "socks5") {
            return Some(p);
        }
    }
    if enabled("HTTPEnable") {
        if let Some(p) = host_port("HTTPProxy", "HTTPPort", "http") {
            return Some(p);
        }
    }
    if enabled("HTTPSEnable") {
        if let Some(p) = host_port("HTTPSProxy", "HTTPSPort", "http") {
            return Some(p);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_url_schemes() {
        let p = parse_proxy_url("http://127.0.0.1:7890").unwrap();
        assert_eq!(p.proxy_type, "http");
        assert_eq!(p.host, "127.0.0.1");
        assert_eq!(p.port, 7890);

        let p = parse_proxy_url("https://proxy.corp:8443").unwrap();
        assert_eq!(p.proxy_type, "https");
        assert_eq!(p.port, 8443);

        let p = parse_proxy_url("socks5://user:pass@127.0.0.1:1080").unwrap();
        assert_eq!(p.proxy_type, "socks5");
        assert_eq!(p.username, "user");
        assert_eq!(p.password, "pass");

        let p = parse_proxy_url("socks5h://127.0.0.1:1080").unwrap();
        assert_eq!(p.proxy_type, "socks5h");

        let p = parse_proxy_url("127.0.0.1:7897").unwrap();
        assert_eq!(p.proxy_type, "http");
        assert_eq!(p.port, 7897);
    }

    #[test]
    fn windows_proxy_server_formats() {
        let p = parse_windows_proxy_server("127.0.0.1:8080").unwrap();
        assert_eq!(p.proxy_type, "http");
        assert_eq!(p.port, 8080);

        let p = parse_windows_proxy_server(
            "http=10.0.0.1:8080;https=10.0.0.1:8080;socks=10.0.0.1:1080",
        )
        .unwrap();
        assert_eq!(p.proxy_type, "socks5");
        assert_eq!(p.port, 1080);

        let p = parse_windows_proxy_server("https=10.0.0.1:8080").unwrap();
        assert_eq!(p.proxy_type, "http");
    }

    #[test]
    fn scutil_prefers_socks_then_http() {
        let out = "\
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7891
  SOCKSProxy : 127.0.0.1
  ProxyAutoConfigEnable : 1
}";
        let p = parse_scutil_proxy(out).unwrap();
        assert_eq!(p.proxy_type, "socks5");
        assert_eq!(p.port, 7891);

        let pac_only = "\
<dictionary> {
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : http://example/proxy.pac
}";
        assert!(parse_scutil_proxy(pac_only).is_none());
    }
}
