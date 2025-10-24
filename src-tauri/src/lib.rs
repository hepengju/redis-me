#![cfg_attr(test, allow(warnings))] // 整个文件在测试时禁用该警告

mod api;
mod client;
mod utils;

use crate::utils::init::init_logger;
use api::*;
use client::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(init_logger().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            connect,
            disconnect,
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
            mock_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}