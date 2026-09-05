use chrono::Local;
use log::{LevelFilter, Record};
use std::fmt::Arguments;
use tauri::{Manager, TitleBarStyle};
use tauri_plugin_log::fern::{
    FormatCallback,
    colors::{Color, ColoredLevelConfig},
};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_window_state::{StateFlags, WindowExt};

// 参考其他Tauri项目的日志配置: https://github.com/invm/noir
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

// 初始化应用窗口设置等
pub fn app_setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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
