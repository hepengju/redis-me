use log::{LevelFilter, Record};
use std::fmt::Arguments;
use chrono::Local;
use chrono::offset::Utc;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_log::fern::{
    colors::{Color, ColoredLevelConfig},
    FormatCallback,
};

// 参考其他Tauri项目的日志配置: https://github.com/invm/noir
fn format(out: FormatCallback, message: &Arguments, record: &Record) {
    let colors = ColoredLevelConfig::default().info(Color::BrightGreen);
    let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let mut target = record.target().to_string();
    target = target.split("::").last().unwrap_or(target.as_str()).to_string();
    target.truncate(10);
    out.finish(format_args!(
        "[{}] [{:5}] [{:10}] - {}",
        ts,
        colors.color(record.level()),
        target,
        message
    ))
}

pub fn init_logger() -> tauri_plugin_log::Builder {
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
