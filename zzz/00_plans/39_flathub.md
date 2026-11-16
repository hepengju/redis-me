# RedisME 上 Flathub

给维护者自己在一台 Linux 上做完、再提交。Snap 仍看 `15_linux-flathub-snap.md`，那边的 Flatpak 章节不要再跟着做：预编译 deb / AppImage 套一层过不了审。本应用是 GPL、源码公开，Flathub 要求在构建机里从源码编出来。

进度只改本文。不要回写 `docs/zh/changelog/future.md`。

## 不要把本文交上去

Flathub 不接受 AI 编写或 AI 协助编写的 manifest。披露也不豁免，PR 会被直接关掉。

因此：

- 交给 `flathub/flathub` 的 yml、metainfo、PR 说明，由你自己写。
- 本文只规定字段、命令和验收。不要整段复制进提交。
- `cargo-sources.json`、`generated-sources.json` 用官方生成器产出，可以提交。那是工具输出，不是手写清单。

官方文档（以提交当天页面为准）：

- https://docs.flathub.org/docs/for-app-authors/requirements
- https://docs.flathub.org/docs/for-app-authors/submission
- https://docs.flathub.org/docs/for-app-authors/metainfo-guidelines
- https://v2.tauri.app/distribute/flatpak/

## 已经定下来的事

| 项                | 值                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| App ID            | `com.hepengju.redis`                                                                                                                   |
| 运行时            | `org.gnome.Platform` / `org.gnome.Sdk`。2026-11 的 Tauri 文档写的是 **51**。提交前用下面的 `remote-ls` 核对，过期就改，不要写死旧的 47 |
| 扩展              | `org.freedesktop.Sdk.Extension.rust-stable`、`org.freedesktop.Sdk.Extension.node24`。分支跟运行时走；builder 找不到时再查实际分支      |
| 二进制            | 沙箱里 `/app/bin/RedisME`，`command` 就写 `RedisME`                                                                                    |
| 桌面文件 / 图标名 | `com.hepengju.redis`，不要用 `RedisME`                                                                                                 |
| 许可证            | 与 `snap/snapcraft.yaml` 一致，SPDX 用 `GPL-3.0-only`                                                                                  |
| 源码              | `https://github.com/hepengju/redis-me`，钉 tag **和** 完整 commit                                                                      |
| 官网              | `https://www.hepengju.com` 必须能打开，页面上能看到 RedisME 和这个 App ID                                                              |

商店版检测已经做完：`src-tauri/src/support/app_store.rs` 看到 `FLATPAK_ID` 或 `/.flatpak-info` 就关掉 Tauri 自更新。Flatpak 会自己设置 `FLATPAK_ID`。

GitHub 账号要开 2FA，否则合并后收不到应用仓的写权限。

## 沙箱里故意不给的权限

导入导出走文件选择器（门户）。选中的文件由门户授权，不需要家目录。

| 要                                                                 | 原因                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `share=ipc`、`socket=wayland`、`socket=fallback-x11`、`device=dri` | 窗口                                                                         |
| `share=network`                                                    | 连 Redis、SSH、手填的代理                                                    |
| `filesystem=/tmp`                                                  | 本机 Unix socket 常见位置                                                    |
| `own-name=org.com_hepengju_redis.SingleInstance`                   | 单实例。这是 Snap 配方里的名字；写进 manifest 前用下面的 `busctl` 再确认一次 |

不要要 `filesystem=home`、`filesystem=host`，也不要把宿主机的 `sh` 暴露进来。

下面三件事写成商店说明里的限制，不要靠加权限去修：

- **Unix socket 不在 `/tmp`。** 例如发行版默认的 `/run/redis`。用户自己执行 `flatpak override --user --filesystem=/run/redis com.hepengju.redis`。
- **私钥路径。** 连接里保存的是用户选中或填写的路径，下次连接由 `load_secret_key` 直接打开，不经过文件门户。按钮选出的路径若沙箱读不到，或用户填的是 `~/.ssh/id_ed25519` 这类原文路径，让用户 `flatpak override --user --filesystem=<该目录>:ro com.hepengju.redis`。不要为此申请整个家目录。
- **自定义编解码的外部命令。** 应用执行的是沙箱里的 `sh -c`。宿主机上的 python、jq、以及家目录里的脚本都看不见。内置编解码不受影响。
- **「使用系统代理」。** Linux 上只读 `http_proxy` / `https_proxy` / `all_proxy`。沙箱拿不到宿主机环境变量。商店版让用户在连接里手填代理。

商标：名称继续用 RedisME。描述写成非官方的 Redis / Valkey 客户端。图标用仓库里自己的，不用 Redis 官方标志。

## 本仓库先交一次

metainfo 必须在上游仓库里，随 tag 走。不要只放在 Flathub 的 PR 里。

建议路径：`src-tauri/resources/linux/com.hepengju.redis.metainfo.xml`。Flatpak 构建从这份文件安装到 `/app/share/metainfo/com.hepengju.redis.metainfo.xml`。

你自己写的这份 XML 至少要有：

- `component type="desktop-application"`，`id` 为 `com.hepengju.redis`
- `launchable` 指向 `com.hepengju.redis.desktop`
- 英文 `name`、`summary`、`description`。中文可以有，英文必须完整，且是人写的
- `developer`，`url`（homepage、vcs-browser、bugtracker）
- `project_license` 为 `GPL-3.0-only`，`metadata_license` 用 MIT 或 CC0-1.0（这是元数据的许可证，不是应用的）
- `content_rating type="oars-1.1"`，开发工具全选 none
- 至少一张截图，https 直链，优先 16:9 主界面。放官网或仓库均可，正式构建会再镜像
- `<releases>` 里当前版本在最前，带日期。发版时这个条目必须已经在被 tag 的那次提交里

桌面文件不用另写一份。Tauri 打 deb 时会生成 `RedisME.desktop`。构建脚本里改两处再安装：`Icon=` 改成 `com.hepengju.redis`，文件名改成 `com.hepengju.redis.desktop`。图标从 deb 的 hicolor 目录拷到同尺寸，文件名也换成 App ID。`icon.svg` 装到 `scalable`。

`LICENSE` 装到 `/app/share/licenses/com.hepengju.redis/LICENSE`。`buildsystem: simple` 不一定会自动装，日志里没有这行就手动 `install`。

生成器产物不要进本仓库。

## 本地把包打出来

在 Ubuntu 上。代理按你自己的环境设，构建沙箱内部仍然没有网络。

```bash
sudo apt install flatpak pipx
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install -y --user flathub org.flatpak.Builder

flatpak remote-ls --user flathub --columns=ref | grep -E 'org\.gnome\.(Platform|Sdk)/|Sdk\.Extension\.(rust-stable|node24)'
```

安装与 `org.gnome.Sdk` 同一分支的 Platform、Sdk，以及 rust-stable、node24 两个扩展。下面用 `51` 作占位，以 `remote-ls` 的结果替换。

```bash
flatpak install -y --user flathub \
  org.gnome.Platform//51 org.gnome.Sdk//51 \
  org.freedesktop.Sdk.Extension.rust-stable \
  org.freedesktop.Sdk.Extension.node24
```

生成器（版本跟 Flathub 当前推荐走，不要用发行版自带的旧 `flatpak-builder`）：

```bash
git clone https://github.com/flatpak/flatpak-builder-tools.git
pipx install ./flatpak-builder-tools/node

cd ~/src/redis-me
python3 ~/flatpak-builder-tools/cargo/flatpak-cargo-generator.py \
  -o "$HOME/flathub-redisme/cargo-sources.json" src-tauri/Cargo.lock

flatpak-node-generator pnpm pnpm-lock.yaml \
  -o "$HOME/flathub-redisme/generated-sources.json"
```

工作目录用 `~/flathub-redisme/`，与 redis-me 仓库分开。里面放你手写的 `com.hepengju.redis.yml` 和两份 json。

`pnpm-lock.yaml` 现在是 lockfileVersion 9.0，包管理器是 **pnpm 12.6.0**（见 `package.json` 的 `devEngines`）。生成器若拒绝这个 pnpm 版本或 store 格式，先停在这里解决。不要退回包装 deb。生成器的 `--help` 里若有 store 版本参数，按它的说明选，不要猜。

pnpm 本体不在 Node 扩展里。manifest 的 sources 再加一份与 `package.json` 完全同版本的 tarball：`https://registry.npmjs.org/pnpm/-/pnpm-12.6.0.tgz`。解压后先 `find` 到 `pnpm.cjs`。npm 的 tarball 顶层通常多一层 `package/`。

### 构建脚本要做的事

按这个顺序写进你自己的 `build-commands`。路径以生成器 json 里的 `dest` 为准，冲突时改命令，不要改生成器的输出。

1. 把 rust-stable、node24 的 `bin` 加进 `PATH`。扩展装在 `/usr/lib/sdk/rust-stable` 和 `/usr/lib/sdk/node24`。
2. 设 `CARGO_NET_OFFLINE=true`。在 `src-tauri/.cargo/config.toml` 里把 crates.io 替换成生成器解压出来的 vendor 目录，用绝对路径，模块名对应 `/run/build/<模块名>/`。
3. 用解压出来的 pnpm 12.6.0 执行它在 `generated-sources.json` 顶部要求的 store 填充，然后 `install --offline --frozen-lockfile`。不要 `pnpm install -g`，构建机没有网络。
4. 把 `node_modules/.bin` 加进 `PATH`，再执行 `pnpm run tauri:build -- --bundles deb`。`beforeBuildCommand` 是 `vp build`，`vp` 来自依赖里的 vite-plus，不在系统路径上。
5. 用 glob 找 `src-tauri/target/release/bundle/deb/RedisME_*.deb`。amd64 与 arm64 文件名不同，不要写死 `amd64`。
6. `ar -x` 再解开 `data.tar.*`，把 `usr/bin/RedisME` 安装到 `/app/bin/RedisME`。
7. 改写桌面文件和图标名，安装 metainfo 和 `LICENSE`。

第一次链接失败时，在构建环境里看缺哪个 pkg-config（常见是 `webkit2gtk-4.1`、`gtk+-3.0`）。GNOME Sdk 自带 WebKitGTK 4.1，不要再编一份 WebKit，也不要从宿主机拷 `.so`。`edition = "2024"` 需要较新的 rustc；扩展里的 `rustc --version` 若太旧，换更新的 rust-stable 扩展，不要在 manifest 里私自装一套 Rust。

本地安装和检查：

```bash
cd ~/flathub-redisme
flatpak run --command=flathub-build org.flatpak.Builder \
  --user --install --force-clean com.hepengju.redis.yml

flatpak run com.hepengju.redis

flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest com.hepengju.redis.yml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo repo
```

两条 lint 都要过。权限类的告警在 PR 里解释，不要为了消告警加上 `filesystem=host`。

### 装上之后亲手点一遍

非 Flatpak 的 deb / AppImage 先开着，确认单实例的总线名：

```bash
busctl --user list | grep -i redis
```

然后只留 Flatpak 这一份，逐项看：

- 窗口有内容。NVIDIA 上若黑屏，用户级试 `flatpak override --user --env=WEBKIT_DISABLE_DMABUF_RENDERER=1 com.hepengju.redis`。能复现再考虑写进 manifest，不要提前写。
- TCP 连接一个 Redis。
- SSH 私钥：用按钮选一个不在 `/tmp` 的密钥文件，断开再连一次。读不到就记下对话框返回的路径，不要先加 `filesystem=home`。
- 文件对话框导出再导入。这条不通，先查门户有没有把文件授权进沙箱，而不是打开整个家目录。
- `/tmp` 下的 Unix socket 能连；`/run/redis` 下的不能连，直到 override。
- 再启动一次，焦点回到已有窗口。
- 设置里没有应用内更新。
- 剪贴板能复制一段文本。
- 自定义编解码若调用宿主机上的解释器，应当失败。这是预期。

## 提交

1. Fork https://github.com/flathub/flathub ，取消勾选 “Copy the master branch only”。
2. 从 `new-pr` 拉分支，不要从 `master` 拉。
3. 仓库根只放：你写的 `com.hepengju.redis.yml`、`cargo-sources.json`、`generated-sources.json`，以及生成器如果另写了 pnpm store 脚本，那个脚本也要在。不要放源码，不要放 deb。
4. PR 的 base 必须是 `flathub/flathub` 的 **`new-pr`**。标题：`Add com.hepengju.redis`。
5. 正文你自己写：应用是什么、源码与官网、许可证、你是上游作者、每条非默认权限为什么需要、上面那份测试你做过。同时遵守页面上当时的 Generative AI 规定。

审核意见直接在原 PR 上改并推送。不要为了改 ID 或改权限而关掉 PR。对方让构建时，评论 `bot, build`，用它给出的 flatpakref 再装一次。

通过之后会有仓库 `flathub/com.hepengju.redis`，以及协作者邀请。一周内接受。首次上架大约几小时后出现在 https://flathub.org/apps/com.hepengju.redis 。

两个架构都编。GitHub Release 已经同时出 amd64 和 arm64。只有某一边确实编不过、又要先上架时，才加 `flathub.json` 暂时限到 x86_64。

## 之后每次发版

顺序不能反：

1. 在 redis-me 的待发版提交里，把新版本插到 metainfo 的 `<releases>` 最前面。
2. 按现有流程打 `vX.Y.Z` 并推送。GitHub Release 的 deb 照旧，与 Flatpak 无关。
3. 在 Linux 上检出这个 tag，重新跑 cargo 与 pnpm 两个生成器。
4. 在 `flathub/com.hepengju.redis` 里改 git 的 tag 和 commit，换上新的两份 json。按那个仓库当时的习惯直接推或开 PR。
5. 等 Flathub 构建。更新不需要再走 `new-pr`。

版本号与 GitHub Release 保持一致。

## 上架之后的蓝勾

应用仓有写权限之后，打开 https://flathub.org 的 Developer Portal，进入 `com.hepengju.redis` 的 Verification，把 token 放到：

```text
https://hepengju.com/.well-known/org.flathub.VerifiedApps.txt
```

内容以 Portal 显示的为准。只部署在 `www` 上时，`hepengju.com` 必须用 HTTPS 跳转到这份文件。验证完把文件留着。

商店页可用之后，再在官网 Linux 下载区和 GitHub Release 说明里加安装命令：

```bash
flatpak install flathub com.hepengju.redis
```

## 做到这些就可以提 PR

- [ ] 官网 HTTPS 能打开，能看到 RedisME 和 `com.hepengju.redis`
- [ ] metainfo 在将被 tag 的提交里，英文文案是自己写的
- [ ] `~/flathub-redisme` 里源码构建安装成功，两条 lint 通过
- [ ] 上面的手测做完，黑屏和文件对话框的问题已经处理
- [ ] `busctl` 核对过单实例总线名
- [ ] PR 指向 `new-pr`，manifest 和说明不是从本文粘贴的
