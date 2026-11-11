//! 跨连接键迁移：后台新建源/目标专用连接，RESTORE 或命令重建，结束后断开。

use crate::client::me_client::MeClient;
use crate::client::me_cluster::MeCluster;
use crate::client::me_single::MeSingle;
use crate::client::ops::key_scan::batch_key0;
use crate::client::state::{AppState, app_timeouts};
use crate::model::*;
use crate::support::error::AppError;
use crate::support::util::*;
use anyhow::bail;
use log::{info, warn};
use parking_lot::MutexGuard;
use redis::Commands;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};

/// 按配置 id 新建专用客户端（不写入顶栏 clients 缓存）。`db` 覆盖配置默认库。
pub fn open_ephemeral(app: &AppHandle, conn_id: &str, db: u16) -> AnyResult<Box<dyn MeClient>> {
    let state: State<AppState> = app.state();
    let conf = {
        let map = state.connections.lock().unwrap();
        let mut conf = map
            .get(conn_id)
            .ok_or(AppError::ConnectionNotFound { id: conn_id.into() })?
            .clone();
        conf.db = db;
        conf
    };
    let (connect_timeout, command_timeout) = app_timeouts(app);
    let client = if conf.cluster {
        MeCluster::init(&conf, connect_timeout, command_timeout)?
    } else {
        MeSingle::init(&conf, connect_timeout, command_timeout)?
    };
    client.base().command_logger.bind_app_handle(app.clone());
    *client.base().app_handle.write() = Some(app.clone());
    Ok(client)
}

/// 开始前探测：RESTORE 模式检查 DUMP/RESTORE；命令模式检查 TYPE。
pub fn migrate_probe(app: &AppHandle, param: RedisMigrateProbe) -> AnyResult<MigrateProbeResult> {
    if param.source_conn_id == param.target_conn_id && param.source_db == param.target_db {
        bail!(AppError::MigrateSameSourceTarget);
    }
    let source = open_ephemeral(app, &param.source_conn_id, param.source_db)?;
    let target = open_ephemeral(app, &param.target_conn_id, param.target_db)?;
    let result = match param.mode.as_str() {
        "command" => probe_command(&*source),
        _ => probe_restore(&*source, &*target),
    };
    drop(source);
    drop(target);
    Ok(result)
}

fn probe_ok() -> MigrateProbeResult {
    MigrateProbeResult {
        ok: true,
        message: String::new(),
    }
}

fn probe_fail(message: String) -> MigrateProbeResult {
    MigrateProbeResult { ok: false, message }
}

fn probe_restore(source: &dyn MeClient, target: &dyn MeClient) -> MigrateProbeResult {
    if let Err(e) = source.migrate_command_available("DUMP") {
        return probe_fail(format!("source DUMP: {e}"));
    }
    if let Err(e) = target.migrate_command_available("RESTORE") {
        return probe_fail(format!("target RESTORE: {e}"));
    }
    probe_ok()
}

fn probe_command(source: &dyn MeClient) -> MigrateProbeResult {
    match source.migrate_command_available("TYPE") {
        Ok(()) => probe_ok(),
        Err(e) => probe_fail(format!("source TYPE: {e}")),
    }
}

/// 启动后台迁移；立即返回。进度走 `EVENT_MIGRATE`。
pub fn migrate_keys_start(app: AppHandle, param: RedisMigrateParam) -> AnyResult<()> {
    if param.source_conn_id == param.target_conn_id && param.source_db == param.target_db {
        bail!(AppError::MigrateSameSourceTarget);
    }
    let state: State<AppState> = app.state();
    let running = state.migrate_running.clone();
    if running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        bail!(AppError::MigrateRunning);
    }

    let source = match open_ephemeral(&app, &param.source_conn_id, param.source_db) {
        Ok(c) => c,
        Err(e) => {
            running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    let target = match open_ephemeral(&app, &param.target_conn_id, param.target_db) {
        Ok(c) => c,
        Err(e) => {
            drop(source);
            running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };

    let app_handle = app.clone();
    thread::spawn(move || {
        let task_id = param.task_id.clone();
        match run_migrate(&*source, &*target, &param, running.clone(), &app_handle) {
            Ok(()) => info!("migrate ok: {task_id}"),
            Err(e) => {
                // 启动后失败（如键列表为空）：用 err_count=1 让前端走失败摘要，不显示「成功 0」
                warn!("migrate err: {e}");
                emit_progress(&app_handle, &task_id, 0, 1, 1, 0, true, &e.to_string());
            }
        }
        drop(source);
        drop(target);
        running.store(false, Ordering::SeqCst);
        info!("migrate ephemeral connections closed");
    });
    Ok(())
}

/// 取消当前迁移（当前键写完后停止）。
pub fn migrate_stop(app: &AppHandle) {
    let state: State<AppState> = app.state();
    state.migrate_running.store(false, Ordering::SeqCst);
}

fn run_migrate(
    source: &dyn MeClient,
    target: &dyn MeClient,
    param: &RedisMigrateParam,
    running: Arc<AtomicBool>,
    app_handle: &AppHandle,
) -> AnyResult<()> {
    let key_list = batch_key0(
        source,
        RedisBatchKey {
            pattern: param.pattern.clone(),
            key_list: param.key_list.clone(),
        },
        true,
    )?;
    let total_count = key_list.len() as u64;
    let mut ok_count = 0u64;
    let mut err_count = 0u64;
    let mut ignore_count = 0u64;
    let mode_command = param.mode == "command";
    let replace = param.handle_conflict == "replace";
    let stop_on_error = param.on_error == "stop";

    for key in key_list {
        if !running.load(Ordering::Relaxed) {
            break;
        }
        let display = vec8_to_display_string(key.to_bytes());
        // 先推「正在处理」再跑，卡住时界面能对准当前键
        emit_progress(
            app_handle,
            &param.task_id,
            ok_count,
            err_count,
            total_count,
            ignore_count,
            false,
            &display,
        );
        match if mode_command {
            migrate_one_command(source, target, &key, replace)
        } else {
            migrate_one_restore(source, target, &key, replace)
        } {
            Ok(MigrateOne::Ok) => ok_count += 1,
            Ok(MigrateOne::Skipped) => ignore_count += 1,
            Err(e) => {
                warn!("migrate key err [{display}]: {e}");
                err_count += 1;
                if stop_on_error {
                    break;
                }
            }
        }
        emit_progress(
            app_handle,
            &param.task_id,
            ok_count,
            err_count,
            total_count,
            ignore_count,
            false,
            &display,
        );
    }

    emit_progress(
        app_handle,
        &param.task_id,
        ok_count,
        err_count,
        total_count,
        ignore_count,
        true,
        "",
    );
    Ok(())
}

enum MigrateOne {
    Ok,
    Skipped,
}

fn migrate_one_restore(
    source: &dyn MeClient,
    target: &dyn MeClient,
    key: &RedisKey,
    replace: bool,
) -> AnyResult<MigrateOne> {
    if !replace && target.migrate_exists(key.clone())? {
        return Ok(MigrateOne::Skipped);
    }
    let (payload, pttl) = source.migrate_dump(key.clone())?;
    match target.migrate_restore(key.clone(), pttl, payload, replace) {
        Ok(()) => Ok(MigrateOne::Ok),
        Err(e) => {
            let msg = e.to_string();
            if !replace && is_busy_key(&msg) {
                Ok(MigrateOne::Skipped)
            } else {
                Err(e)
            }
        }
    }
}

fn migrate_one_command(
    source: &dyn MeClient,
    target: &dyn MeClient,
    key: &RedisKey,
    replace: bool,
) -> AnyResult<MigrateOne> {
    if !replace && target.migrate_exists(key.clone())? {
        return Ok(MigrateOne::Skipped);
    }

    // 结构化读写：源读 KeyPayload → 目标直写，不经 redis-cli 文本拼/解析
    let payload = source.migrate_read_payload(key.clone())?;
    let pttl = source.migrate_pttl(key.clone())?;

    if replace {
        let _ = target.del(key.clone());
    }

    target.migrate_write_payload(key.clone(), payload)?;
    if pttl > 0 {
        target.migrate_pexpire(key.clone(), pttl)?;
    }
    Ok(MigrateOne::Ok)
}

fn is_busy_key(msg: &str) -> bool {
    let lower = msg.to_ascii_lowercase();
    lower.contains("busykey") || lower.contains("target key name")
}

fn emit_progress(
    app: &AppHandle,
    id: &str,
    ok_count: u64,
    err_count: u64,
    total_count: u64,
    ignore_count: u64,
    finished: bool,
    current_key: &str,
) {
    let _ = app.emit(
        EVENT_MIGRATE,
        MigrateEvent {
            id: id.to_string(),
            ok_count,
            err_count,
            total_count,
            ignore_count,
            finished,
            current_key: current_key.to_string(),
        },
    );
}

// ------------------------------ 供 MeClient 转发调用 ------------------------------

pub fn dump_with_pttl0(
    mut conn: MutexGuard<'_, impl Commands>,
    key: RedisKey,
) -> AnyResult<(Vec<u8>, i64)> {
    let payload: Option<Vec<u8>> = redis::cmd("DUMP").arg(&key).query(&mut *conn)?;
    let Some(payload) = payload else {
        bail!(AppError::KeyNotFound {
            key: vec8_to_display_string(key.to_bytes())
        });
    };
    let pttl: i64 = redis::cmd("PTTL").arg(&key).query(&mut *conn)?;
    Ok((payload, if pttl > 0 { pttl } else { 0 }))
}

pub fn restore_key0(
    mut conn: MutexGuard<'_, impl Commands>,
    key: RedisKey,
    ttl_ms: i64,
    payload: Vec<u8>,
    replace: bool,
) -> AnyResult<()> {
    let mut cmd = redis::cmd("RESTORE");
    cmd.arg(&key).arg(ttl_ms).arg(payload);
    if replace {
        cmd.arg("REPLACE");
    }
    let _: () = cmd.query(&mut *conn)?;
    Ok(())
}

pub fn exists_key0(mut conn: MutexGuard<'_, impl Commands>, key: RedisKey) -> AnyResult<bool> {
    let n: i32 = redis::cmd("EXISTS").arg(&key).query(&mut *conn)?;
    Ok(n > 0)
}

pub fn pttl0(mut conn: MutexGuard<'_, impl Commands>, key: RedisKey) -> AnyResult<i64> {
    let pttl: i64 = redis::cmd("PTTL").arg(&key).query(&mut *conn)?;
    Ok(if pttl > 0 { pttl } else { 0 })
}

pub fn pexpire0(mut conn: MutexGuard<'_, impl Commands>, key: RedisKey, ms: i64) -> AnyResult<()> {
    let _: () = redis::cmd("PEXPIRE").arg(&key).arg(ms).query(&mut *conn)?;
    Ok(())
}

pub fn command_available0(mut conn: MutexGuard<'_, impl Commands>, name: &str) -> AnyResult<()> {
    // COMMAND INFO；极老版本无此命令时视为探测不完整但放行由调用方决定
    let value: redis::Value = match redis::cmd("COMMAND")
        .arg("INFO")
        .arg(name)
        .query(&mut *conn)
    {
        Ok(v) => v,
        Err(e) => {
            // 无 COMMAND 命令：不阻断
            warn!("COMMAND INFO {name} failed (allow): {e}");
            return Ok(());
        }
    };
    match value {
        redis::Value::Array(items) if items.len() == 1 => match &items[0] {
            redis::Value::Nil => bail!("command not available"),
            redis::Value::Array(inner) if inner.is_empty() => bail!("command not available"),
            _ => Ok(()),
        },
        redis::Value::Nil => bail!("command not available"),
        _ => Ok(()),
    }
}
