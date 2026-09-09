//! SSH 传输：一条 russh 会话，每条 Redis 连接一个 `direct_tcpip` channel。
//!
//! # 为什么看起来绕
//!
//! | 约束 | 做法 |
//! |---|---|
//! | russh 是 tokio 异步，redis-rs Dialer 是同步 `Read`/`Write` | 专用 Runtime 上 `block_on` |
//! | 会话任务（含 30s keepalive）在两次命令之间也要跑 | Runtime 必须是 multi-thread（这里 1 worker），不能 current-thread |
//! | Tauri 同步命令在 **WebView2 回调**里：栈很浅、没有 tokio context | 所有 `block_on` / russh 析构走 `off_ui` |
//! | russh `ChannelStream` Drop 内部 `tokio::spawn` | 析构前必须 `Handle::enter()` |
//! | `Handle` 非 `Sync` | 开 channel 时持 session 锁；不能 `Arc<Handle>` 并行 |
//!
//! Redis 的 TLS（`rediss://`）仍由 redis-rs 在 Dialer 返回的明文流上包裹，本文件不要再包一层。
//!
//! 数据流：`SshDialer::connect` 认证一次 → `dial(host, port)` 开 channel →
//! `SshRedisStream` 交给 redis-rs。集群/哨兵子连接复用同一 `Arc<SshDialer>`。

use crate::utils::error::AppError;
use crate::utils::model::SshOption;
use crate::utils::util::{AnyResult, parse_path};
use log::info;
use parking_lot::Mutex;
use redis::{ConnectionDialer, RedisError, RedisResult, RedisStream};
use russh::client;
use russh::client::AuthResult;
use russh::keys::key::PrivateKeyWithHashAlg;
use std::any::Any;
use std::cell::Cell;
use std::future::Future;
use std::io::{self, Read, Write};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::runtime::Runtime;
use tokio::time::timeout;

type ChannelStream = russh::ChannelStream<client::Msg>;

struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        // 与旧隧道一致：不校验 known_hosts
        Ok(true)
    }
}

/// 一条跳板会话 + 一台专用 Runtime。放进 `Client` / `ClusterClient` 的 Dialer 槽，不要在 MeSingle 上另存。
///
/// `runtime` 必须是最后一个字段：Drop 时先取出 session，再取出 Runtime，
/// 在 `off_ui` 里先 `enter` 再丢 Handle，最后才关 Runtime。
pub struct SshDialer {
    ssh_option: SshOption,
    /// `dial(..., timeout: None)` 时用（redis-rs `get_connection` 会传 None）
    connect_timeout: Duration,
    /// 只串行化「重连」，不挡正常开 channel
    reconnect_lock: Mutex<()>,
    session: Mutex<Option<client::Handle<ClientHandler>>>,
    runtime: Option<Runtime>,
}

impl SshDialer {
    fn runtime(&self) -> &Runtime {
        self.runtime.as_ref().expect("SSH runtime dropped")
    }

    fn rt_handle(&self) -> tokio::runtime::Handle {
        self.runtime().handle().clone()
    }

    /// 连跳板并认证。失败不留下半开 Runtime（局部 `runtime` 随 `?` 析构）。
    pub fn connect(ssh_option: &SshOption, connect_timeout: Duration) -> AnyResult<Arc<Self>> {
        info!(
            "SSH 会话 {}:{}，超时 {}s",
            ssh_option.host,
            ssh_option.port,
            connect_timeout.as_secs()
        );
        let runtime = new_ssh_runtime()?;
        let handle =
            off_ui_any(|| runtime.block_on(connect_and_auth(ssh_option, connect_timeout)))?;
        Ok(Arc::new(Self {
            ssh_option: ssh_option.clone(),
            connect_timeout,
            reconnect_lock: Mutex::new(()),
            session: Mutex::new(Some(handle)),
            runtime: Some(runtime),
        }))
    }

    /// 会话已断则再认证一次。集群多节点会并发 `dial`，用 `reconnect_lock` 避免打出两条 SSH。
    fn reconnect(&self) -> RedisResult<()> {
        let _gate = self.reconnect_lock.lock();
        if !self.session_closed() {
            return Ok(());
        }
        // 认证不持 session 锁，避免把别的 channel_open 卡住整段 TCP
        let handle = off_ui_redis(|| {
            self.runtime()
                .block_on(connect_and_auth(&self.ssh_option, self.connect_timeout))
                .map_err(any_to_redis)
        })?;
        let mut guard = self.session.lock();
        if guard.as_ref().is_some_and(|h| !h.is_closed()) {
            drop(guard);
            drop_with_enter(self.rt_handle(), handle);
            return Ok(());
        }
        let old = guard.replace(handle);
        drop(guard);
        if let Some(old) = old {
            drop_with_enter(self.rt_handle(), old);
        }
        info!("SSH 会话已重连");
        Ok(())
    }

    fn session_closed(&self) -> bool {
        self.session
            .lock()
            .as_ref()
            .map(|h| h.is_closed())
            .unwrap_or(true)
    }

    /// `host` 是 redis-rs `ConnectionAddr` 原样字符串，不要在这边做 DNS。
    /// 持 session 锁直到 channel 打开：`Handle` 非 Sync，不能把引用送出锁外。
    fn open_channel(
        &self,
        host: &str,
        port: u16,
        open_timeout: Duration,
    ) -> RedisResult<russh::Channel<client::Msg>> {
        off_ui_redis(|| {
            let guard = self.session.lock();
            let handle = guard.as_ref().ok_or_else(|| {
                RedisError::from(io::Error::new(
                    io::ErrorKind::NotConnected,
                    "SSH session missing",
                ))
            })?;
            if handle.is_closed() {
                return Err(RedisError::from(io::Error::new(
                    io::ErrorKind::NotConnected,
                    "SSH session closed",
                )));
            }
            // timeout / channel_open 的 future 必须在 runtime 上下文里创建
            match self.runtime().block_on(async {
                timeout(
                    open_timeout,
                    handle.channel_open_direct_tcpip(host, port as u32, "127.0.0.1", 0),
                )
                .await
            }) {
                Ok(Ok(ch)) => Ok(ch),
                Ok(Err(e)) => Err(RedisError::from(io::Error::other(e.to_string()))),
                Err(_) => Err(RedisError::from(io::Error::new(
                    io::ErrorKind::TimedOut,
                    format!("SSH channel open timed out ({}s)", open_timeout.as_secs()),
                ))),
            }
        })
    }
}

impl ConnectionDialer for SshDialer {
    fn dial(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> RedisResult<Box<dyn RedisStream>> {
        let open_timeout = timeout.unwrap_or(self.connect_timeout);
        if self.session_closed() {
            self.reconnect()?;
        }
        // 开 channel 失败且会话已断：重连一次再试（计划：最多一次）
        let channel = match self.open_channel(host, port, open_timeout) {
            Ok(ch) => ch,
            Err(_) if self.session_closed() => {
                self.reconnect()?;
                self.open_channel(host, port, open_timeout)?
            }
            Err(e) => return Err(e),
        };
        Ok(Box::new(SshRedisStream {
            rt: self.rt_handle(),
            stream: Some(channel.into_stream()),
            read_timeout: Mutex::new(None),
            write_timeout: Mutex::new(None),
        }))
    }
}

impl Drop for SshDialer {
    fn drop(&mut self) {
        // 只 take、不在 WebView2 上真正 drop russh / Runtime
        let session = self.session.lock().take();
        let runtime = self.runtime.take();
        let _ = off_ui(move || {
            {
                let _enter = runtime.as_ref().map(|rt| rt.enter());
                drop(session);
            }
            drop(runtime);
        });
    }
}

/// 一条 Redis TCP 对应的 SSH channel。超时存在 Dialer 流上（订阅会设 `None`），不存在共享 Dialer 上。
struct SshRedisStream {
    rt: tokio::runtime::Handle,
    stream: Option<ChannelStream>,
    read_timeout: Mutex<Option<Duration>>,
    write_timeout: Mutex<Option<Duration>>,
}

impl SshRedisStream {
    fn stream(&mut self) -> io::Result<&mut ChannelStream> {
        self.stream
            .as_mut()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotConnected, "SSH channel closed"))
    }

    /// 把同步闭包丢到 `off_ui` 跑。闭包里自己 `block_on`；不要先 `enter()` 再 `block_on`（1-worker 会死锁）。
    fn block_on_io<T: Send>(
        &mut self,
        run: impl FnOnce(&mut ChannelStream) -> io::Result<T> + Send,
    ) -> io::Result<T> {
        let stream = self.stream()?;
        off_ui_io(|| run(stream))
    }
}

impl Drop for SshRedisStream {
    fn drop(&mut self) {
        let Some(stream) = self.stream.take() else {
            return;
        };
        drop_with_enter(self.rt.clone(), stream);
    }
}

impl Read for SshRedisStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let limit = *self.read_timeout.lock();
        let rt = self.rt.clone();
        self.block_on_io(|stream| {
            rt.block_on(async {
                io_timeout(limit, "SSH channel read timed out", stream.read(buf)).await
            })
        })
    }
}

impl Write for SshRedisStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let limit = *self.write_timeout.lock();
        let rt = self.rt.clone();
        self.block_on_io(|stream| {
            rt.block_on(async {
                io_timeout(limit, "SSH channel write timed out", stream.write(buf)).await
            })
        })
    }

    fn flush(&mut self) -> io::Result<()> {
        let limit = *self.write_timeout.lock();
        let rt = self.rt.clone();
        self.block_on_io(|stream| {
            rt.block_on(async {
                io_timeout(limit, "SSH channel flush timed out", stream.flush()).await
            })
        })
    }
}

impl RedisStream for SshRedisStream {
    fn set_read_timeout(&self, dur: Option<Duration>) -> io::Result<()> {
        *self.read_timeout.lock() = dur;
        Ok(())
    }

    fn set_write_timeout(&self, dur: Option<Duration>) -> io::Result<()> {
        *self.write_timeout.lock() = dur;
        Ok(())
    }
}

async fn io_timeout<T>(
    limit: Option<Duration>,
    timed_out: &'static str,
    fut: impl Future<Output = io::Result<T>>,
) -> io::Result<T> {
    match limit {
        Some(d) => timeout(d, fut)
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, timed_out))?,
        None => fut.await,
    }
}

/// 1 个 worker：keepalive / russh 会话任务在后台跑；调用方 `block_on` 在 `off_ui` 线程，不会跟 worker 抢同一条栈。
fn new_ssh_runtime() -> io::Result<Runtime> {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .thread_name("redis-me-ssh")
        .build()
}

/// russh 对象析构常会 `tokio::spawn`，必须在目标 Runtime 的 `enter()` 下做。
fn drop_with_enter<T: Send>(rt: tokio::runtime::Handle, value: T) {
    let _ = off_ui(move || {
        let _enter = rt.enter();
        drop(value);
    });
}

async fn connect_and_auth(
    ssh_option: &SshOption,
    connect_timeout: Duration,
) -> AnyResult<client::Handle<ClientHandler>> {
    let fut = async {
        let mut config = client::Config::default();
        config.keepalive_interval = Some(Duration::from_secs(30));
        let mut session = client::connect(
            Arc::new(config),
            ssh_socket_addr(&ssh_option.host, ssh_option.port),
            ClientHandler,
        )
        .await?;
        authenticate(&mut session, ssh_option).await?;
        Ok(session)
    };
    match timeout(connect_timeout, fut).await {
        Ok(result) => result,
        Err(_) => {
            info!("SSH 连接超时（{}s）", connect_timeout.as_secs());
            anyhow::bail!(AppError::SshTimeout);
        }
    }
}

async fn authenticate(
    session: &mut client::Handle<ClientHandler>,
    ssh_option: &SshOption,
) -> AnyResult<()> {
    let username = if ssh_option.username.is_empty() {
        "root"
    } else {
        &ssh_option.username
    };

    match ssh_option.login_type.as_str() {
        "pwd" | "" => {
            info!("开始 SSH 密码认证，用户: {}", username);
            let result = session
                .authenticate_password(username, &ssh_option.password)
                .await;
            check_auth_result(result, username)?;
        }
        "pkfile" => {
            if ssh_option.pkfile.is_empty() {
                anyhow::bail!(AppError::SshKeyFileEmpty);
            }
            let passphrase = if ssh_option.passphrase.is_empty() {
                None
            } else {
                Some(ssh_option.passphrase.as_str())
            };
            let key_pair =
                russh::keys::load_secret_key(parse_path(&ssh_option.pkfile), passphrase)?;
            let key_pair = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
            info!("开始 SSH 公钥认证，用户: {}", username);
            let result = session.authenticate_publickey(username, key_pair).await;
            check_auth_result(result, username)?;
        }
        other => {
            anyhow::bail!(AppError::SshLoginMethodNotSupported {
                method: other.into()
            });
        }
    }
    info!("SSH 认证成功，用户: {}", username);
    Ok(())
}

fn check_auth_result(result: Result<AuthResult, russh::Error>, username: &str) -> AnyResult<()> {
    match result {
        Ok(AuthResult::Success) => Ok(()),
        Ok(AuthResult::Failure {
            remaining_methods,
            partial_success,
        }) => {
            info!(
                "SSH 认证失败，用户: {}, 剩余方法: {:?}, 部分成功: {}",
                username, remaining_methods, partial_success
            );
            anyhow::bail!(AppError::SshAuthFailed);
        }
        Err(e) => {
            info!("SSH 认证异常，用户: {}, 错误: {}", username, e);
            anyhow::bail!(AppError::SshAuthFailed);
        }
    }
}

thread_local! {
    static IN_OFF_UI: Cell<bool> = const { Cell::new(false) };
}

/// 换一条普通 OS 线程再跑 `f`（深栈 + 可 `enter` tokio）。
/// 已在这类线程上则直接跑，避免 `reconnect` 套 `open_channel` 再套一层。
fn off_ui<T: Send>(f: impl FnOnce() -> T + Send) -> Result<T, String> {
    if IN_OFF_UI.get() {
        return Ok(f());
    }
    std::thread::scope(|s| {
        s.spawn(|| {
            IN_OFF_UI.set(true);
            f()
        })
        .join()
    })
    .map_err(panic_message)
}

fn panic_message(payload: Box<dyn Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "SSH worker thread panicked".into()
    }
}

fn off_ui_io<T: Send>(f: impl FnOnce() -> io::Result<T> + Send) -> io::Result<T> {
    off_ui(f).unwrap_or_else(|msg| Err(io::Error::other(msg)))
}

fn off_ui_redis<T: Send>(f: impl FnOnce() -> RedisResult<T> + Send) -> RedisResult<T> {
    off_ui(f).unwrap_or_else(|msg| Err(RedisError::from(io::Error::other(msg))))
}

fn off_ui_any<T: Send>(f: impl FnOnce() -> AnyResult<T> + Send) -> AnyResult<T> {
    off_ui(f).unwrap_or_else(|msg| anyhow::bail!(msg))
}

fn ssh_socket_addr(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

fn any_to_redis(err: anyhow::Error) -> RedisError {
    RedisError::from(io::Error::other(err.to_string()))
}
