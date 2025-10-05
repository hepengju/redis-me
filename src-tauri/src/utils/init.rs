use log::{LevelFilter, Record};
use std::fmt::Arguments;
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_log::fern::{
    colors::{Color, ColoredLevelConfig},
    FormatCallback,
};

// 参考其他Tauri项目的日志配置: https://github.com/invm/noir
fn format(out: FormatCallback, message: &Arguments, record: &Record) {
    let colors = ColoredLevelConfig::default().info(Color::BrightGreen);
    let mut target = record.target();
    if target.starts_with("log@") {
        target = "frontend"
    } else {
        target = target.split("::").last().unwrap_or(target)
    }
    let mut target = String::from(target);
    target.truncate(10);
    let target = format!("{:<10}", target);
    let ts = chrono::offset::Utc::now()
        .with_timezone(&chrono_tz::Asia::Shanghai)
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string();
    out.finish(format_args!(
        "[{}] [{}] [{}] - {}",
        ts,
        colors.color(record.level()),
        target.as_str(),
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
