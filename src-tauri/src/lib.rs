mod api;
mod client;
mod utils;

use crate::utils::logger::init_logger;
use api::*;
use client::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init()) // 文件系统插件(导入导出)
        .plugin(tauri_plugin_store::Builder::new().build()) // 状态存储插件(连接、设置的自动保存和读取)
        .plugin(init_logger().build()) // 日志插件
        .plugin(tauri_plugin_dialog::init()) // 弹框选择文件
        .plugin(tauri_plugin_opener::init()) // 打开外部链接
        .manage(AppState::default()) // 状态管理，保持Redis连接
        .invoke_handler(tauri::generate_handler![
            greet,
            test_conn,
            conn_list,
            connect,
            disconnect,
            db_list,
            select_db,
            info,
            info_list,
            node_list,
            scan,
            get,
            ttl,
            set,
            del,
            batch_del,
            field_add,
            field_set,
            field_del,
            execute_command,
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
            mock_data,
            check_import_conn_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
