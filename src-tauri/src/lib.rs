mod api;
pub mod client;
pub mod model;
pub mod net;
pub mod support;

use crate::api::*;
use crate::client::state::AppState;
use chrono::Local;
use log::{LevelFilter, Record};
use rustls::crypto::ring::default_provider;
#[cfg(any(debug_assertions, test))]
use specta_typescript::Typescript;
use std::fmt::Arguments;
#[cfg(any(debug_assertions, test))]
use std::path::PathBuf;
use tauri::{Manager, TitleBarStyle};
use tauri_plugin_log::fern::{
    FormatCallback,
    colors::{Color, ColoredLevelConfig},
};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_window_state::{StateFlags, WindowExt};
use tauri_specta::{Builder, Commands, collect_commands};

/// 启动应用：安装 rustls、注册命令、挂上插件，并显示主窗口。
#[rustfmt::skip] // 行尾注释按列对齐，rustfmt 会把多余空格收成一个
pub fn run() {
    install_rustls();

    let specta_builder = specta_builder();
    let invoke_handler = specta_builder.invoke_handler();

    tauri::Builder::default()
        .plugin(single_instance())                            // 单实例，再次启动时聚焦已有窗口
        .plugin(window_state())                               // 记住窗口位置和大小，不记住可见性
        .plugin(tauri_plugin_os::init())                      // 操作系统信息
        .plugin(tauri_plugin_system_fonts::init())            // 系统字体
        .plugin(tauri_plugin_process::init())                 // 进程（重启、退出）
        .plugin(tauri_plugin_updater::Builder::new().build()) // 应用更新
        .plugin(tauri_plugin_fs::init())                      // 文件系统（导入导出）
        .plugin(tauri_plugin_store::Builder::new().build())   // 状态存储（连接、设置的自动保存和读取）
        .plugin(tauri_plugin_dialog::init())                  // 弹框选择文件
        .plugin(tauri_plugin_opener::init())                  // 打开外部链接
        .plugin(tauri_plugin_shell::init())                   // 自定义 Formatter 执行外部脚本
        .plugin(tauri_plugin_clipboard_manager::init())       // 剪贴板读写（终端右键粘贴，绕开 WKWebView 权限限制）
        .plugin(init_logger().build())                        // 日志
        .setup(app_setup(specta_builder))                     // 挂上 specta 事件并显示主窗口
        .manage(AppState::default())                          // 状态管理，保持 Redis 连接
        .invoke_handler(invoke_handler)                       // 注册 Tauri 命令
        .run(tauri::generate_context!())                      // 按 tauri.conf 启动
        .expect("error while running tauri application");     // 启动失败时退出
}

/// 单实例。再次启动时聚焦已经在跑的窗口。
/// https://tauri.app/zh-cn/plugin/single-instance/
fn single_instance() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some((_, webview_window)) = app.webview_windows().iter().next() {
            let _ = webview_window.set_focus();
        }
    })
}

/// 记住窗口位置和大小，但不记住可见性。主窗口在 `show_main_window` 里恢复后再显示，避免启动时先居中再跳一下。
fn window_state() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_window_state::Builder::new()
        .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
        .skip_initial_state("main")
        .build()
}

/// 安装 rustls 的默认加密实现，后面的 TLS 连接要用。
fn install_rustls() {
    default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");
}

/// 注册 Tauri 命令。debug 构建时同时写出前端类型文件。
fn specta_builder() -> Builder<tauri::Wry> {
    let specta_builder = Builder::<tauri::Wry>::new()
        .dangerously_cast_bigints_to_number()
        .commands(tauri_specta_commands());

    #[cfg(debug_assertions)]
    specta_builder
        .export(Typescript::default(), tauri_specta_typescript_path())
        .expect("Failed to export TypeScript bindings");

    specta_builder
}

/// 日志插件：控制台、日志目录和 WebView 三处同时输出。
fn init_logger() -> tauri_plugin_log::Builder {
    let log_targets = [
        Target::new(TargetKind::Stdout),
        Target::new(TargetKind::LogDir { file_name: None }),
        Target::new(TargetKind::Webview),
    ];

    tauri_plugin_log::Builder::default()
        .format(format)
        .level(LevelFilter::Info)
        .targets(log_targets)
}

/// 挂上 specta 事件，再显示主窗口。
fn app_setup(
    specta_builder: Builder<tauri::Wry>,
) -> impl FnOnce(&mut tauri::App) -> Result<(), Box<dyn std::error::Error>> + Send {
    move |app| {
        specta_builder.mount_events(app);
        show_main_window(app)
    }
}

/// 主窗口：先在隐藏状态下恢复位置，再显示，避免启动时先居中再跳一下。
fn show_main_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let type_ = tauri_plugin_os::type_();
    let window = app
        .get_webview_window("main")
        .expect("main window not exists");

    // 隐藏状态下先恢复位置/大小，再显示，避免用户看到居中后瞬间跳动
    window.restore_state(StateFlags::all())?;
    window
        .set_decorations(type_.to_string() == "macos")
        .unwrap();
    window.set_title_bar_style(TitleBarStyle::Overlay).unwrap();
    window.show()?;

    Ok(())
}

/// 日志行：时间、级别、模块名（截到 10 字符）和正文。
fn format(out: FormatCallback, message: &Arguments, record: &Record) {
    let colors = ColoredLevelConfig::default().info(Color::BrightGreen);
    let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let mut target = record.target().to_string();
    target = target
        .split("::")
        .last()
        .unwrap_or(target.as_str())
        .to_string();
    target.truncate(10);
    out.finish(format_args!(
        "[{}] [{:5}] [{:10}] - {}",
        ts,
        colors.color(record.level()),
        target,
        message
    ))
}

/// specta 要导出的 Tauri 命令。新增 IPC 时这里和 `api_commands!` 一起改。
fn tauri_specta_commands() -> Commands<tauri::Wry> {
    collect_commands![
        greet,
        app_dir,
        is_app_store,
        restart_after_update,
        test_conn,
        detect_system_proxy,
        masters,
        conn_list,
        app_settings,
        connect,
        disconnect,
        db_list,
        select_db,
        info,
        info_list,
        chart,
        chart_list,
        node_list,
        scan,
        field_scan,
        value_download,
        ttl,
        set,
        del,
        rename,
        copy,
        field_add,
        field_set,
        field_ttl,
        field_get,
        hash_keys,
        hash_values,
        field_pop,
        field_del,
        zset_rank,
        zset_range,
        ar_last_items,
        ar_info,
        v_info,
        ts_info,
        search_index_names,
        search_index_list,
        search_query,
        search_index_drop,
        search_index_create,
        search_index_alter,
        search_tag_vals,
        search_syn_dump,
        search_syn_update,
        search_sample_load,
        v_getattr,
        v_setattr,
        v_sim,
        object_info,
        execute_command,
        acl_users,
        acl_list_users,
        acl_getuser,
        acl_setuser,
        acl_deluser,
        acl_whoami,
        acl_cat,
        acl_genpass,
        acl_save,
        acl_load,
        acl_log,
        acl_log_reset,
        acl_dryrun,
        slow_log,
        memory_usage,
        key_memory,
        config_get,
        config_set,
        client_list,
        publish,
        subscribe,
        subscribe_stop,
        monitor,
        monitor_stop,
        notify_subscribe,
        notify_subscribe_stop,
        batch_del,
        batch_ttl,
        export_csv,
        import_csv,
        import_cmd,
        mock_data,
        key_type,
        get_key_as_command,
        get_field_as_command,
        xinfo_groups,
        xinfo_consumers,
        key_slot,
        key_node,
        flush_db,
        flush_all,
        command_logs,
        command_logs_clear,
    ]
}

/// 生成前端 TS 绑定路径（相对 `src-tauri` 的 `CARGO_MANIFEST_DIR`）。
/// release 构建不导出类型，避免 `dead_code`。
#[cfg(any(debug_assertions, test))]
fn tauri_specta_typescript_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/types/tauri-specta.ts")
}

#[cfg(test)]
mod specta_export_tests {
    use super::*;

    /// 不启动 GUI，仅写出 `src/types/tauri-specta.ts`（与 debug 启动时导出一致）。
    /// 导出的前端类型文件和仓库里的绑定一致，避免 specta 悄悄改了字段。
    #[test]
    fn export_tauri_specta_typescript_bindings() {
        Builder::<tauri::Wry>::new()
            .dangerously_cast_bigints_to_number()
            .commands(tauri_specta_commands())
            .export(Typescript::default(), tauri_specta_typescript_path())
            .expect("Failed to export TypeScript bindings");
    }
}
