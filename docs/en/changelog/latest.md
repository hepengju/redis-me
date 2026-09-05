# 5.x Changelog

## [v5.1.0](https://mp.weixin.qq.com/s/1IS91XFgCn4nBvs6M06V7g) (2026-09-05)

### ✨ New Features

- Connection: TLS compatible with **X.509 v1** certificates (CentOS 7 and other old OpenSSL self-signed certs)
- Codec: Auto supports **Gzip read-only unwrap**
- Memory: scan shows **live progress**, with pause/resume and stop
- Connection: added a drag-hint icon after the host in grouped view #162

### 🐞 Bug Fixes

- Fixed local key/field filtering missing keys with slashes (aligned with Redis MATCH semantics)

## v5.0.3 (2026-09-03)

### ✨ New Features

- Connection: keep the toolbar visible when the list is empty (import etc.) #160
- Connection: empty named groups stay visible even with no connections
- Value area: preview hint no longer expands the main pane into a scrollbar
- Value area: data codec dropdown placement improved

### 🐞 Bug Fixes

- Fixed **Auto sometimes misdetecting truncated large string previews as Hex**; default preview is now 4KB
- Fixed AnotherRDM 1.7.2+ grouped `.ano` import failing #160
- Fixed the fullscreen row in the empty-state shortcut list not responding to clicks

## v5.0.2 (2026-09-02)

### ✨ New Features

- Value area: **ZSet filter by score range**
- Settings: new configurable **connection timeout** #157
- Settings: renamed Command Timeout to I/O Timeout

## v5.0.1 (2026-09-01)

### ✨ New Features

- Value area: ZSet member rank now shown in a table dialog
- Minimal mode skips CLIENT SETNAME on connect

### 🐞 Bug Fixes

- Fixed empty-page Logo glow occasionally showing a box on Mac
- Fixed config page crash on Redis 5 and other older versions

## [v5.0.0](https://mp.weixin.qq.com/s/qtq9ESg-uYcR0tAyvDaCgA) (2026-08-28)

### ✨ New Features

- New **Redis Install** helper
  - Fill in a form to generate Linux Docker artifacts; copy and run them on the target machine
  - Three modes: standalone / cluster / sentinel
  - Optional TLS: bundled openssl self-signed certificate script
  - Images: Redis or Valkey; password, external data/config mounts, and timezone
- Terminal: **key-slot completion for favorite and scanned keys**, plus hint layout polish
- Connection: **Redis URL generate and paste-parse** #152
  - Footer URL button copies the current connection string
  - Paste a full URL or host:port into the host field to auto-fill host, port, credentials, DB, and SSL
- Other details
  - Default db to 0 when left empty #153
  - CodeMirror wrapping off by default
  - Upgraded frontend/backend dependencies to latest

### 🐞 Bug Fixes

- Fixed occasional issues from a second handshake on the real connection #155
- Fixed connection group header height jumping when switching between Chinese and English
