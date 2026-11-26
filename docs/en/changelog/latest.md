# 6.x Changelog

## [v6.0.0 - Workbench](https://mp.weixin.qq.com/s/3PJszHk_5N-LWlCFDOYK7Q) <span class="changelog-date">2026-11-27</span>

### ✨ Improvements

- New **Workbench**
  - Edit a multi-line command; a selection runs only the selected text
  - Results stay as tags; FT.SEARCH, CLIENT LIST, and similar commands can switch to a table
  - Command hints and run history; on a cluster, pick a node
- Tabs: show on demand. Check items in the **More** menu on the right, and restore the default
- Config: **write the config file**, and compare **config differences across cluster nodes**
- Info: added **official site** and **raw** entries
- Title bar: **GitHub** and **check for updates**; update directly when a new version is found
- Other details
  - Terminal output format defaults to Raw, and Raw is listed first
  - Runtime config reference moved to the table footer; hover to pick a version
  - Opening Config or Clients on a cluster selects the first node by default
  - The auto-broadcast hint now states which nodes a command hits when it is on or off
  - English tab names changed to Terminal, Slowlog, and Pub/Sub
  - Icons updated in several places: tabs, slow log, disconnect, title-bar moon, official site, and others

### 🐞 Bug Fixes

- Fixed Linux refusing to restart after an update (permission denied)
