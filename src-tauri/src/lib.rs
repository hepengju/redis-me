mod api;
mod client;
mod utils;

use crate::utils::setup::{app_setup, init_logger};
use api::*;
use client::state::AppState;
use rustls::crypto::ring::default_provider;
#[cfg(any(debug_assertions, test))]
use specta_typescript::Typescript;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;
use tauri_specta::{Builder, Commands, collect_commands};

fn tauri_specta_commands() -> Commands<tauri::Wry> {
    collect_commands![
        greet,
        app_dir,
        is_app_store,
        restart_after_update,
        test_conn,
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
        config_get,
        config_set,
        client_list,
        publish,
        subscribe,
        subscribe_stop,
        monitor,
        monitor_stop,
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
pub fn tauri_specta_typescript_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/types/tauri-specta.ts")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    let specta_builder = Builder::<tauri::Wry>::new()
        .dangerously_cast_bigints_to_number()
        .commands(tauri_specta_commands());

    #[cfg(debug_assertions)]
    specta_builder
        .export(Typescript::default(), tauri_specta_typescript_path())
        .expect("Failed to export TypeScript bindings");

    let invoke_handler = specta_builder.invoke_handler();

    tauri::Builder::default()
        // 单实例 https://tauri.app/zh-cn/plugin/single-instance/
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 默认情况下，当应用程序已经在运行时启动新实例时，不会采取任何操作。当用户尝试打开一个新实例时，为了聚焦正在运行实例的窗口，修改回调闭包如下
            if let Some((_, webview_window)) = app.webview_windows().iter().next() {
                let _ = webview_window.set_focus();
            }
        }))
        // 不持久化可见性；主窗口在 setup 中手动恢复位置后再 show，避免启动时先居中再跳动
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .skip_initial_state("main")
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_system_fonts::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init()) // 文件系统插件(导入导出)
        .plugin(tauri_plugin_store::Builder::new().build()) // 状态存储插件(连接、设置的自动保存和读取)
        .plugin(tauri_plugin_dialog::init()) // 弹框选择文件
        .plugin(tauri_plugin_opener::init()) // 打开外部链接
        .plugin(tauri_plugin_shell::init()) // 自定义 Formatter 执行外部脚本
        .plugin(init_logger().build()) // 日志插件
        .setup(move |app| {
            specta_builder.mount_events(app);
            app_setup(app)
        })
        .manage(AppState::default()) // 状态管理，保持Redis连接
        .invoke_handler(invoke_handler)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod specta_export_tests {
    use super::*;

    /// 不启动 GUI，仅写出 `src/types/tauri-specta.ts`（与 debug 启动时导出一致）。
    #[test]
    fn export_tauri_specta_typescript_bindings() {
        Builder::<tauri::Wry>::new()
            .dangerously_cast_bigints_to_number()
            .commands(tauri_specta_commands())
            .export(Typescript::default(), tauri_specta_typescript_path())
            .expect("Failed to export TypeScript bindings");
    }
}
