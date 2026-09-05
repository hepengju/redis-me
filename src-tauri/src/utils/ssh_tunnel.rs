use crate::utils::error::AppError;
use crate::utils::model::SshOption;
use crate::utils::util::{AnyResult, parse_path};
use log::{info, warn};
use russh::client;
use russh::client::AuthResult;
use russh::keys::key::PrivateKeyWithHashAlg;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::io::copy_bidirectional;
use tokio::net::TcpListener;
use tokio::runtime::Runtime;
use tokio::time::timeout;

/// SSH 隧道管理器
pub struct SshTunnel {
    pub local_port: u16,
    stop_flag: Arc<AtomicBool>,
    runtime: Option<Runtime>,
}

/// SSH 客户端处理器
struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        // 接受所有服务器密钥（生产环境应该验证服务器密钥）
        Ok(true)
    }
}

impl SshTunnel {
    /// 启动 SSH 隧道，返回本地监听端口。connect_timeout 覆盖 TCP 建连 + 认证。
    pub fn start(
        ssh_option: &SshOption,
        target_host: &str,
        target_port: u16,
        connect_timeout: Duration,
    ) -> AnyResult<Self> {
        info!(
            "SSH 隧道 {}:{}，超时 {}s",
            ssh_option.host,
            ssh_option.port,
            connect_timeout.as_secs()
        );

        let runtime = Runtime::new()?;

        // 首先进行 SSH 认证测试，确保认证可以通过
        runtime.block_on(async {
            let session = Self::connect_and_auth(ssh_option, connect_timeout).await?;
            drop(session); // 关闭测试连接
            info!("SSH 认证测试通过");
            Ok::<_, anyhow::Error>(())
        })?;

        let stop_flag = Arc::new(AtomicBool::new(false));

        // 绑定本地端口
        let local_port = runtime.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await?;
            Ok::<_, std::io::Error>(listener.local_addr()?.port())
        })?;

        info!("SSH 隧道本地监听端口: {}", local_port);

        let ssh_option = ssh_option.clone();
        let target_host = target_host.to_string();
        let stop_flag_clone = stop_flag.clone();

        // 后台监听连接
        runtime.spawn(async move {
            if let Err(e) = Self::run_listener(
                stop_flag_clone,
                ssh_option,
                target_host,
                target_port,
                local_port,
                connect_timeout,
            )
            .await
            {
                warn!("SSH 隧道运行错误: {}", e);
            }
        });

        Ok(SshTunnel {
            local_port,
            stop_flag,
            runtime: Some(runtime),
        })
    }

    async fn run_listener(
        stop_flag: Arc<AtomicBool>,
        ssh_option: SshOption,
        target_host: String,
        target_port: u16,
        local_port: u16,
        connect_timeout: Duration,
    ) -> AnyResult<()> {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", local_port)).await?;

        info!("SSH 隧道等待连接...");

        loop {
            if stop_flag.load(Ordering::SeqCst) {
                info!("SSH 隧道停止中...");
                break;
            }

            // 设置接受连接的超时
            match timeout(Duration::from_millis(500), listener.accept()).await {
                Ok(Ok((mut local_stream, _))) => {
                    let opt = ssh_option.clone();
                    let host = target_host.clone();
                    let tport = target_port;

                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection(
                            &mut local_stream,
                            &opt,
                            &host,
                            tport,
                            connect_timeout,
                        )
                        .await
                        {
                            warn!("SSH 隧道连接失败: {}", e);
                        }
                    });
                }
                Ok(Err(e)) => {
                    warn!("接受连接失败: {}", e);
                }
                Err(_) => {
                    // 超时，继续循环
                }
            }
        }

        Ok(())
    }

    async fn handle_connection(
        local_stream: &mut tokio::net::TcpStream,
        ssh_option: &SshOption,
        target_host: &str,
        target_port: u16,
        connect_timeout: Duration,
    ) -> AnyResult<()> {
        info!("SSH 隧道新连接，目标: {}:{}", target_host, target_port);

        let session = Self::connect_and_auth(ssh_option, connect_timeout).await?;

        info!("SSH 认证完成，准备打开 TCP 转发通道");

        let channel = match timeout(
            connect_timeout,
            session.channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0),
        )
        .await
        {
            Ok(Ok(ch)) => ch,
            Ok(Err(e)) => return Err(e.into()),
            Err(_) => {
                info!("SSH 转发通道打开超时（{}s）", connect_timeout.as_secs());
                anyhow::bail!(AppError::SshTimeout);
            }
        };

        let mut ssh_stream = channel.into_stream();

        match copy_bidirectional(local_stream, &mut ssh_stream).await {
            Ok((to_remote, to_local)) => {
                info!(
                    "SSH 隧道连接关闭，传输: 上行 {} 字节, 下行 {} 字节",
                    to_remote, to_local
                );
            }
            Err(e) => {
                warn!("SSH 隧道数据传输错误: {}", e);
            }
        }

        Ok(())
    }

    /// 连接 SSH 服务器并完成认证（TCP + 认证共用建连超时）
    async fn connect_and_auth(
        ssh_option: &SshOption,
        connect_timeout: Duration,
    ) -> AnyResult<client::Handle<ClientHandler>> {
        let fut = async {
            let ssh_config = Arc::new(client::Config::default());
            let handler = ClientHandler;
            let mut session = client::connect(
                ssh_config,
                format!("{}:{}", ssh_option.host, ssh_option.port),
                handler,
            )
            .await?;
            Self::authenticate(&mut session, ssh_option).await?;
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
                Self::check_auth_result(result, username)?;
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
                Self::check_auth_result(result, username)?;
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

    /// 检查认证结果
    fn check_auth_result(
        result: Result<AuthResult, russh::Error>,
        username: &str,
    ) -> AnyResult<()> {
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
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        info!("SSH 隧道关闭，本地端口: {}", self.local_port);
        self.stop_flag.store(true, Ordering::SeqCst);

        // 等待运行时任务完成
        if let Some(runtime) = self.runtime.take() {
            // 给一点时间让循环检测到 stop_flag
            std::thread::sleep(Duration::from_millis(100));
            runtime.shutdown_timeout(Duration::from_secs(2));
        }
    }
}
