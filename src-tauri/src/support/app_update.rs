//! 按调用方给出的顺序检查更新。
//!
//! 前端 `check()` 改不了端点顺序，而两份 latest.json 里的安装包地址不同，
//! 先拿到哪一份，包就从哪边下。启动自动检查和设置里的手动检查都走这里，差别只在界面：
//! 自动检查静默进行，有新版本时在连接列表标出；手动检查会提示正在检查、已是最新或失败。
//! 顺序由前端按设置排好再传入：自动时中国大陆时区先 Gitee，其余先 GitHub；
//! 指定 Gitee 或 GitHub 时固定先问那一边。`timeout_ms` 是每个源各自的超时。
//! 某个源连不上、超时或不是合法清单时才试下一个。它一旦返回合法清单就停，
//! 即使另一边版本更新也不会再问。
//!
//! `tauri.conf.json` 里的 `plugins.updater.endpoints` 会被这里覆盖，改那里的先后不影响实际访问。
//! 同一处的 `pubkey` 仍然用来校验安装包签名。地址要和前端 `app-update.ts` 里的两行保持一致。

use std::time::Duration;

use serde::Serialize;
use specta::Type;
use tauri::{Manager, Webview};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::support::util::ApiResult;

/// 与插件 `check` 返回给前端 `Update` 的字段一致，下载和安装仍走插件命令。
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateMetadata {
    pub rid: u32,
    pub current_version: String,
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
    #[specta(type = specta_typescript::Any)]
    pub raw_json: serde_json::Value,
}

/// `timeout_ms` 是每个端点各自的超时，不是整次检查的总时长。
pub async fn check(
    webview: Webview,
    endpoints: Vec<String>,
    timeout_ms: u64,
) -> ApiResult<Option<AppUpdateMetadata>> {
    if endpoints.is_empty() {
        return Err("没有可用的更新源".to_string());
    }

    let mut urls = Vec::with_capacity(endpoints.len());
    for endpoint in &endpoints {
        urls.push(Url::parse(endpoint).map_err(|_| format!("更新地址无效: {endpoint}"))?);
    }

    log::info!("检查更新，端点顺序: {}", endpoints.join(" -> "));

    let updater = webview
        .updater_builder()
        .endpoints(urls)
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| e.to_string())?;

    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };

    let rid = webview.resources_table().add(update.clone());
    Ok(Some(AppUpdateMetadata {
        rid,
        current_version: update.current_version,
        version: update.version,
        date: update.date.map(|date| date.to_string()),
        body: update.body,
        raw_json: update.raw_json,
    }))
}
