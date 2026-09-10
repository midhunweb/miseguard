# Integrating MiSeGuard with AI Agent Frontends

MiSeGuard works transparently with any tool runner or agent environment that communicates over stdio Model Context Protocol (MCP).

---

## ⚡ Option 1: Wrapping Existing Configs (`wrap-config`)

If your agent already has an MCP configuration file, you can pass the path directly to `miseguard wrap-config`:

```bash
# Antigravity
miseguard wrap-config .antigravity/mcp.json

# Claude Desktop (Windows)
miseguard wrap-config "%APPDATA%\Claude\claude_desktop_config.json"

# Claude Desktop (macOS)
miseguard wrap-config ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Cursor / VS Code
miseguard wrap-config .cursor/mcp.json
miseguard wrap-config .vscode/mcp.json

# Workspace Auto-Discovery (if mcp.json is in current directory)
miseguard wrap-config
```

This creates a timestamped backup (`<file>.bak`), preserves your existing configuration, and transparently wraps server commands behind `miseguard proxy --`.

---

## 💻 Option 2: Cursor Integration

In Cursor Settings -> **Features** -> **MCP Servers**, add or update your server configuration:

```json
{
  "mcpServers": {
    "filesystem-shielded": {
      "command": "miseguard",
      "args": [
        "proxy",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/workspace"
      ]
    }
  }
}
```

---

## 🤖 Option 3: Claude Desktop Integration

Edit your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "miseguard",
      "args": [
        "proxy",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/project"
      ]
    },
    "terminal": {
      "command": "miseguard",
      "args": [
        "proxy",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-bash"
      ]
    }
  }
}
```

---

## 🛡️ Option 4: Antigravity / Windsurf / OpenCode

Generate direct snippets using the CLI:

```bash
# Filesystem server snippet
miseguard snippet --tool filesystem --path ./

# Git server snippet
miseguard snippet --tool git --path ./

# Terminal / Bash server snippet
miseguard snippet --tool bash
```
