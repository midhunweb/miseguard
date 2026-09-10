# Integrating MiSeGuard with AI Agent Frontends

MiSeGuard works transparently with any tool runner or agent environment that communicates over stdio Model Context Protocol (MCP).

---

## ⚡ Option 1: Automatic Wrapping (`wrap-config`)

If your project already has an MCP configuration file (`mcp.json`, `.cursor/mcp.json`, `.antigravity/mcp.json`), run:

```bash
miseguard wrap-config
```

This auto-discovers your config, backs it up to `<file>.bak`, and wraps tool commands behind `miseguard proxy --`.

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
