/// Windows 先塞应用清单，再跑 Tauri 的构建脚本。
///
/// 绕过 tauri#13419：2.7 只把清单链进主程序，`cargo test` 缺 Common Controls v6，
/// 加载即退出（0xc0000139）。tauri-build >= 2.8.0（#16320）已默认链进测试，
/// 升级后删掉本文件的 Windows 分支和 `windows-app-manifest.xml`，改回 `tauri_build::build()`。
fn main() {
    #[cfg(windows)]
    add_manifest();

    tauri_build::try_build(build_attributes()).unwrap();
}

/// Windows 不用 Tauri 自带清单，改用仓库里的 `windows-app-manifest.xml`。
fn build_attributes() -> tauri_build::Attributes {
    #[cfg(windows)]
    {
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
    }
    #[cfg(not(windows))]
    {
        tauri_build::Attributes::new()
    }
}

#[cfg(windows)]
/// 把清单嵌进 exe，并把链接警告当成错误。
fn add_manifest() {
    static WINDOWS_MANIFEST_FILE: &str = "windows-app-manifest.xml";

    let manifest = std::env::current_dir().unwrap().join(WINDOWS_MANIFEST_FILE);

    println!("cargo:rerun-if-changed={}", manifest.display());
    // Embed the Windows application manifest file.
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!(
        "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
        manifest.to_str().unwrap()
    );
    // Turn linker warnings into errors.
    println!("cargo:rustc-link-arg=/WX");
}
