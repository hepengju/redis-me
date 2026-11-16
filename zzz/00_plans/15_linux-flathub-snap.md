# RedisME 上架 Linux：Snap

> **实现状态**：待实施  
> **App ID（已定）**：`com.hepengju.redis`（与 `tauri.conf.json` / 官网 [hepengju.com](https://www.hepengju.com) 一致）  
> **Snap 名（建议）**：`redis-me`（注册前先查是否被占；注册后不可改）  
> **说明**：进度只改本文；不要回写 `docs/zh/changelog/future.md`  
> **Flathub**：见 `39_flathub.md`

对标 Redis Insight 的 Snapcraft。GitHub Release 的 deb/rpm/AppImage 继续保留。

---

## 你需要准备什么

| 项                                  | 用途                        |
| ----------------------------------- | --------------------------- |
| Linux 机（建议 Ubuntu 22.04/24.04） | 本地打 Snap、试装           |
| Ubuntu One 账号                     | Snap Store 发布者           |
| 本地 `tauri build` 产出的 deb       | `snapcraft.yaml` 解包后封装 |

**建议顺序**：应用侧检测 → Snap 注册与上架 → 官网徽章。

---

## 第 0 步：应用侧改造 ✅

目的：Snap 安装时走「商店版」逻辑，**关掉 Tauri 内置更新**（与微软商店一致）。同一处也识别 Flatpak，上架步骤不在本文。

### 0.1 `src-tauri/src/support/app_store.rs`（已实现）

| 环境    | 判定                                         |
| ------- | -------------------------------------------- |
| Flatpak | `FLATPAK_ID` 已设置，或存在 `/.flatpak-info` |
| Snap    | `SNAP` 已设置                                |

Windows / macOS 逻辑不变。前端 `Setting.vue` / `AppMain.vue` 已按 `isAppStore` 分支，无需再改。

### 0.2 自测清单

- [ ] 官网直装：仍可检查更新
- [ ] 设 `SNAP=/snap/redis-me/current` 启动：设置页为商店更新、不弹自更新

---

## 第 1 步：Snap Store——注册与上架

官方：[注册 snap](https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/register-a-snap/) · [发布修订](https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/manage-revisions-and-releases/)

### 1.1 注册发布者账号（网页）

1. 打开 https://login.ubuntu.com → 注册 / 登录 **Ubuntu One**（建议开 2FA）。
2. 打开 https://snapcraft.io/account → 用同一账号登录。
3. 填写 **Publisher display name**（商店里显示的作者名，如 `hepengju` / `RedisME`）。
4. 可选：上传头像、填官网 `https://www.hepengju.com`。

### 1.2 本机安装工具并登录

在 Ubuntu 上：

```bash
sudo snap install snapcraft --classic
# 若尚未安装 snapd：sudo apt install snapd

snapcraft login
# 按提示输入 Ubuntu One 邮箱、密码、2FA
snapcraft whoami   # 确认登录成功
```

CI 以后可用导出凭据（勿提交仓库）：

```bash
snapcraft export-login snapcraft-creds.txt
# Actions 里：SNAPCRAFT_STORE_CREDENTIALS=$(cat snapcraft-creds.txt)
```

### 1.3 注册包名 `redis-me`

包名全局唯一、**注册后不能改**。先试：

```bash
snapcraft register redis-me
```

- 成功：继续。
- 已被占用：试 `redisme`、`redisme-gui` 等，或网页 https://snapcraft.io/account → **Register a snap name**。
- `snapcraft.yaml` 里的 `name:` **必须**与注册名完全一致。

商店里给人看的标题用 `title: RedisME`（可与 `name` 不同）。

### 1.4 `snap/snapcraft.yaml`（对齐 Tauri 官方：包装 deb）

对照已上架配方（勿自创 WebKit 路径）：
[faire-todo-app](https://snapcraft.io/faire-todo-app) · [addiction-tracker](https://snapcraft.io/addiction-tracker) · [Tauri#10326](https://github.com/tauri-apps/tauri/discussions/10326)

| 项     | 约定                                                                       |
| ------ | -------------------------------------------------------------------------- |
| base   | **core22**（与 faire / addiction-tracker 一致，勿用 core24 瞎试）          |
| layout | symlink → `$SNAP/usr/lib.../webkit2gtk-4.1`（含 libexec、injected-bundle） |
| 输入   | 本地已有 deb：`dpkg -x`（他们是 snap 内 build；运行时形状相同）            |
| plugs  | `wayland` `x11` `home` `desktop` `unity7` `network` + single-instance dbus |
| 本地   | `pack`/`clean` 都加 `--destructive-mode`（勿 sudo）                        |

### 1.5 本地构建与试装

```bash
cd ~/redis-me
vp run tauri build
ls src-tauri/target/release/bundle/deb/RedisME_*_amd64.deb

export https_proxy=http://192.168.1.111:7897
export http_proxy=http://192.168.1.111:7897
snapcraft pack --destructive-mode

sudo snap remove redis-me || true
sudo snap install ./redis-me_*.snap --dangerous
redis-me
# 测：图标、导出连接路径对话框、连 Redis、商店版无自更新
```

### 1.6 上传与渠道发布

首版可手动；配方稳定后改由 Actions 上传（secret：`SNAPCRAFT_STORE_CREDENTIALS`，见 1.2）。

```bash
# 先上 edge，自己再 snap install redis-me --edge 验证
snapcraft upload ./redis-me_*.snap --release=edge

# 无问题后晋升（revision 以 upload 输出为准）
snapcraft release redis-me <revision> stable
```

网页可在 https://snapcraft.io/redis-me/releases 看修订与渠道。

### 1.6.1 GitHub Actions 自动打 Snap（待接，目标形态）

在 `release.yml` 的 **ubuntu amd64** 矩阵任务末尾（`tauri-action` 已产出 **deb** 之后），或独立 `needs: publish-tauri` 的 job：

1. 安装 `snapcraft`
2. `snapcraft pack --destructive-mode`（读默认 Tauri **deb** 路径）
3. `snapcraft upload *.snap --release=edge`（凭据来自 secret）
4. 稳定后改为 `stable`，或保留手动晋升

Release 说明里可补一行：`sudo snap install redis-me`。

### 1.7 商店列表信息（网页）

登录 https://snapcraft.io/account → 选中 `redis-me`：

- [ ] 图标、截图（与官网一致即可）
- [ ] 简介、分类（如 Productivity / Utilities / Developer Tools）
- [ ] 许可证、源码链接 `https://github.com/hepengju/redis-me`
- [ ] 联系邮箱

### 1.8 Snap 验收

- [ ] https://snapcraft.io/redis-me 可打开
- [ ] `sudo snap install redis-me` 可装、可连 Redis
- [ ] `isAppStore` 为真
- [ ] 新版本可走 `upload` → `edge` → `stable`

---

## 第 2 步：官网与 Release 文案

| 位置                                        | 动作                               |
| ------------------------------------------- | ---------------------------------- |
| 官网 Linux 下载区                           | 增加 Snap 徽章与安装命令           |
| `.github/workflows/release.yml` 的 Linux 行 | 增加商店链接（直装包仍保留）       |
| 本文文首                                    | 全部验收后把「实现状态」改为已完成 |

安装命令示例（上架后）：

```bash
sudo snap install redis-me
```

---

## 检查清单（按时间线勾）

### A. 账号与注册

- [ ] Ubuntu One + snapcraft.io/account 资料填好
- [ ] `snapcraft login` + `snapcraft register redis-me` 成功

### B. 应用

- [x] Linux Snap 下 `is_app_store()` 为 true，updater 关闭（`app_store.rs` 已实现；真机/设环境变量自测）

### C. Snap

- [ ] `snap/snapcraft.yaml` 本地构建通过
- [ ] `--dangerous` 试装通过
- [ ] `edge` → `stable` 已发布
- [ ] 商店页截图/简介齐全

### D. 对外

- [ ] 官网 + Release 的 Snap 入口

---

## 风险速查

| 问题                           | 处理                       |
| ------------------------------ | -------------------------- |
| Snap 名被占                    | 换名并同步改 yaml / 文档   |
| strict 沙箱连不上 / 读不了密钥 | 逐步加 plugs；文档说明限制 |
| 自更新与商店抢更新             | 务必完成第 0 步检测        |

---

## 参考链接

- Insight 桌面安装说明：https://redis.io/docs/latest/operate/redisinsight/install/install-on-desktop/
- Snap 注册：https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/register-a-snap/
- Snap 发布：https://documentation.ubuntu.com/snapcraft/latest/how-to/publishing/manage-revisions-and-releases/
- Tauri Flatpak/Snap 实战：https://vincent.jousse.org/blog/en/packaging-tauri-v2-flatpak-snapcraft-elm/

## 相关代码

- `src-tauri/tauri.conf.json` — `identifier`: `com.hepengju.redis`
- `src-tauri/src/support/app_store.rs` — 商店检测
- `.github/workflows/release.yml` — Linux 产物与 Release 文案
- `src/views/ext/Setting.vue`、`src/views/AppMain.vue` — `isAppStore`
