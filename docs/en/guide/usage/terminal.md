# Terminal

Although the RedisME GUI supports most scenarios, running commands in the terminal is still indispensable.

## Feature Overview

- **Execution & Output**: Enter a command and press Enter to run
- **Command History**: Navigate with ↑ / ↓
- **Hint & Completion**: Command usage hints and Tab completion
- **Command List**: Click the icon to view command groups, syntax, descriptions, etc.
- **Shortcuts**: Ctrl+L/C/A/E for clear screen/stop current command/move cursor to start/end; F11 for fullscreen
- **Extended Features**: Collapsible command output, selection copy, right-click / Cmd+V paste, auto-copy results, etc.
- **Multi-line Paste**: Choose whether to run the text as one command or run each line
- **Built-in Commands**: clear to clear screen, help for help, open to open a URL
- **Cluster Mode**: Automatic command broadcasting, execution on specified nodes
  - When auto-broadcast is enabled and no node is selected, commands such as `CONFIG SET` and `SLOWLOG RESET` are
    executed on all nodes
  - Node specification is usually unnecessary; manual selection is only for special scenarios like viewing
    configurations of a specific node

![light.png](../../../public/images/terminal/light.png)
![dark.png](../../../public/images/terminal/dark.png)
![command-table.png](../../../public/images/terminal/command-table.png)

## Design History

The terminal of RedisME has gone through three major full rewrites and is now increasingly mature.To support both
Chinese and English and achieve better performance, command hints are pre-downloaded from
the [official Redis repository](https://raw.githubusercontent.com/redis/redis-doc/refs/heads/master/commands.json),
preprocessed, and built into the program.

## 1. Based on [Xterm.js](https://xtermjs.org) (v0.1 ~ v1.2)

Xterm.js implements a full‑featured terminal in the browser and is widely used in web SSH clients, online IDEs, CLI
tools, etc.It was chosen initially because of familiarity from previous projects and
because [TinyRDM](https://redis.tinycraft.cc) also uses Xterm.js.Shortcuts, command history, and other basic features
required manual implementation, which was relatively straightforward.
**Handling cursor movement and half‑character backspace issues with Chinese input, as well as backspacing when commands
exceed one line, proved extremely difficult**.
Xterm.js is therefore more suitable for scenarios where all characters are
forwarded to the backend via WebSocket, rather than the current requirements.
![xtermjs.png](../../../public/images/terminal/xtermjs.png)

## 2. Based on [Xterminal](https://xterminal.js.org) (v1.3 ~ v1.8)

XTerminal is a lightweight, high‑performance frontend library for building command‑line interfaces in browsers.It
works well for the typical flow: input command → execute → display result.Command history is built‑in; only shortcuts
required manual addition, meeting basic needs. **Displaying the command manual and implementing input hints required
heavy custom development**.
![xterminal.png](../../../public/images/terminal/xterminal.png)

## 3. Based on [vue-web-terminal](https://tzfun.github.io/vue-web-terminal/zh) (v1.9 ~ lastest)

vue-web-terminal is a powerful imperative web‑based emulated terminal plugin.It supports drag, resize, cursor
control, history navigation, and other typical terminal behaviors,making it ideal for building clients for Redis,
MySQL, ETCD, and similar tools.It satisfied requirements with minimal customization and was a perfect fit.
![vue-web-terminal.png](../../../public/images/terminal/vue-web-terminal.png)
