# 5.x Changelog

## [v5.6.0](https://mp.weixin.qq.com/s/SsA5C0glDYzg040-jn1c-w) (2026-10-31)

### ✨ Improvements

- Info: cluster mode adds a **node overview** table; selecting a row switches to that node's details
- Chart: cluster **multi-node lines on one chart**, primaries shown by default, shared legend toggles series
- Value area: truncated STRING previews can be **downloaded locally**, written in chunks with a progress indicator
- Value area: code highlighting adds yaml/md/xml/ini and **infers the format from the content**
- Keys panel: context menu adds **copy as command, rename, and duplicate**; delete moved to the bottom with a divider
- Clients: the action column can copy the raw CLIENT LIST line
- Other details
  - Cluster config writes now note that the change is broadcast to all nodes
  - In cluster mode, notification settings are shown for both primary and replica nodes
  - Links to the official site moved into the table summary row; empty tables still show the bottom bar, with export disabled
  - Field tables stay responsive with very large values (cells are truncated instead of putting the full text on the page)
  - Dialogs can be dragged outside the window, without overlay scrollbars
  - macOS fullscreen shortcut is now ⌘⇧F, avoiding the system-reserved F11

### 🐞 Bug Fixes

- Fixed Ctrl+V not pasting in the terminal before it was focused
- Fixed a RESP parse error corrupting later terminal commands (the connection is rebuilt after the error)
- Fixed non-JSON values starting with `[` or `{` getting line breaks inserted when prettified

## [v5.5.0](https://mp.weixin.qq.com/s/bZYPBXn3KLDF0ex-Ox8aSQ) (2026-10-24)

### ✨ Improvements

- New **keyspace notifications** tab
  - Subscribe / stop, edit notification parameters and pattern
  - Message list: keyword matches keys only, event header filter, flags legend grouped
  - In cluster mode, shows **config consistency** across primary nodes, with per-node details on hover
- Terminal: **blocks blocking subscribe commands**; `SELECT` switches database in sync; Ctrl+V pastes from the clipboard
- PubSub: message content supports a **multi-line edit dialog**
- Table: data columns are **sortable by default**, with a third header click clearing the sort
- Other details
  - Monitor / PubSub / Notify: **batched buffering** eases jank at high message rates, with a 10k row cap
  - Monitor / PubSub: clearing data now asks for confirmation; removed the low-value action column
  - Update check endpoint now uses release latest.json with a shorter timeout
  - Upgraded front-end and back-end dependencies (Vite+ 1.3.0, Tauri 2.12.4, etc.)

### 🐞 Bug Fixes

- Fixed a permission error when right-click pasting in the macOS terminal (now uses the Tauri clipboard plugin)
- Fixed cluster connections hanging when the announced address is unreachable (falls back to the configured timeout)
- Fixed clicking a column-filter header accidentally triggering sorting

## [v5.4.3](https://mp.weixin.qq.com/s/eeDPDhU_nVnVuScOzApK6g) (2026-10-18)

### ✨ Improvements

- Table: **MeTable upgraded to the el-table-v2 virtual table**, with tables across all pages fully migrated #169
- Key-value page: **"load more" moved into the table footer**, with total count / loaded / filters shown together #169
- Field edit panel: **drag its left edge to resize** the panel; double-click restores the default width
- Keys/value area: the divider line shows on hover and **double-click restores the default split**
- Top bar: the read-only lock moved into the top menu bar, with a new settings icon
- UI simplified: removed the borders below the keys panel and around the right-side Tab

### 🐞 Bug Fixes

- Fixed Stream scan: default order now consistently descending across front end and back end; continued scans merge and deduplicate; falls back to a re-scan when conditions don't match

## v5.4.2 (2026-10-11)

### ✨ Improvements

- macOS: title bar left margin now adapts by system version to fit the larger rounded corners on new systems
- Connection: the home page shows connections in **grouped mode** by default
- Chart: toolbar layout improved; clearing data now has a confirmation step
- Other details
  - Keys panel bottom bar and right-side Tab container get rounded corners matching the top-left dropdown
  - Removed the gray background behind the key-name prefix (locate button) in the key-value header
  - Eliminated the double-instance issue in the code editor (removed vue-codemirror6, wired directly to CodeMirror)
  - Upgraded Vite+ to 1.1.0

### 🐞 Bug Fixes

- Fixed an error when adding a field to a key that was deleted/expired (reuses the on-screen type instead of re-querying) #177
- Fixed tag (el-tag) flickering caused by the transition animation when entering a connection, etc.
- Fixed vertical misalignment between the inline "Config" link and the path text after it in the Info overview

## v5.4.1 (2026-10-07)

- Codec: custom codecs can opt in to **Auto detect**
- Export: Excel **styled headers, written as a stream**
- Connection: idle for over 10 minutes reconnects directly; probe timeout is now 1 second
- Other: custom codec test samples are filled in by you; encode samples are plain text

## [v5.4.0](https://mp.weixin.qq.com/s/h6S4mnUZvGLu85mztHzxBA) (2026-10-05)

### ✨ New Features

- **RedisSearch** query engine
  - Basics: list, create, edit, and delete indexes
  - Query: search by query string, with an option to show scores
  - Browse: click the keys panel to switch to Search mode and look up document keys
  - Index info: view raw info and the restored index DDL; field details show type tags and weights
  - More: view tag sets; view, add, and edit synonym groups; insert samples; jump to documents
- Keys panel: Search mode for **full-text search by index**
- Keys panel: toolbar option to **show memory usage**
- Terminal: **prompt on multi-line paste** to run it as one command or as multiple commands
- Codec: new **Vector32**; Auto recognizes little-endian FLOAT32 vectors
- Website: new **Handbook** — Slowlog Governance, SSL Encryption
- Other details
  - Exact-match checkbox moved to the left of the query input; placeholders improved
  - Hover delete icon on the key list moved into the context menu
  - Terminal shows a success message after copying the selection from the context menu
  - Code-block copy button moved to the bottom-right
  - Table pagination no longer includes jump-to-page
  - Closing a connection releases it in the background, so the UI stays responsive
  - Connection advanced-options button now uses a tooltip; form labels widened
  - Empty-page Logo glow restored in dark theme
  - Frontend and backend dependencies upgraded (Vite+ 1.0.0, Tauri 2.12)
  - Backend refactor, with more complete tests

### 🐞 Bug Fixes

- Fixed type tags missing on the flat key list
- Fixed List range scans issuing one extra empty query after reaching the end
- Fixed Stream paging treating a full page as the end

## v5.3.1 (2026-09-25)

### 🐞 Bug Fixes

- **Fixed Mac value-table header / action-column misalignment with long cell content**
- Fixed Slow Log and ACL Log datetime columns wrapping on Mac with the default theme
- Fixed accidental text selection when clicking blank areas in tables on Mac
- Fixed the empty-state glow looking poor in dark theme (removed)

## [v5.3.0](https://mp.weixin.qq.com/s/P691_vhcJjZATq8qbRUtBw) (2026-09-25)

### ✨ New Features

- Connection: **network proxy** (system proxy or manual configuration)
- Value area: **TimeSeries** (RedisTimeSeries `TSDB-TYPE`)
  - Sample table: filter by timestamp and value range; newest first by default, can switch to ascending
  - Add, edit, and delete samples; copy a row as `TS.ADD`; view `TS.INFO`
  - Key list tag is **T**; filter by type
  - **Line chart** of the samples currently loaded; open from the bottom-bar icon or the command menu
- Other details
  - Key type dropdown: List / Array use the info color and sit next to each other
  - Monitor and Pub/Sub time columns show time of day only; Monitor defaults to newest first
  - Slow log duration shown as whole milliseconds, right-aligned

### 🐞 Bug Fixes

- Deleting a table row no longer rescans the whole key; only that row is removed, and scan filters and sort are kept #168
- Fixed the table staying on the old page after switching keys
- Fixed Redisson codec detection where Kryo misread Marshalling data

## [v5.2.0](https://mp.weixin.qq.com/s/oMVi3OsBLD-yaMfBbpxesA) (2026-09-10)

### ✨ New Features

- Connection: **SSH tunnel** fully rewritten; works in all modes (standalone, cluster, sentinel)
- TTL: set by duration or **expire-at time**; hover shows local and UTC
- Value area: Hash field TTL
  - Column shows expire-at; hover countdown of remaining time
  - HTTL toggle is remembered; switching keys / refresh no longer resets it
  - Field expiry can be saved independently; TTL can be changed even with a read-only codec
- Info page: memory usage shown as a percentage of system memory
- Redis Install helper: TLS switch moved up; sentinel/TLS default ports and output directories adjusted
- Other details
  - Website: Redis Docker install and TLS certificate generation pages
  - Close button on the field edit panel
  - STRING/JSON save button shows loading
  - Copy connection keeps the original group

### 🐞 Bug Fixes

- Fixed Auto sometimes misdetecting already-loaded large values (partial trial-decode replaced with full decode)
- Fixed hanging when the SSL checkbox doesn't match the server; **mismatch now prompts immediately and precisely**
- Fixed sentinel TLS connect hanging, and client certificates being dropped when certificate verification is skipped
- Fixed cluster and sentinel both being checkable when creating a new connection

## v5.1.1 (2026-09-05)

### 🐞 Bug Fixes

- Fixed SCAN search hanging when the cursor exceeds the JS safe integer range #163

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
