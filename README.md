> **Disclaimer**
>
> MiSeGuard is an independent personal project created by Midhun Sekhar.
> It is not affiliated with, endorsed by, or representative of any current, past, or future employer.
> All development was conducted entirely on personal equipment, during personal time, and without the use of proprietary resources or confidential information.

# 🛡️ MiSeGuard

**A deterministic safety layer for autonomous coding agents.**

*Runtime circuit breaker and stdio proxy that intercepts MCP tool calls before they reach your OS.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![MCP Ready](https://img.shields.io/badge/Model%20Context%20Protocol-Compatible-emerald.svg)](https://modelcontextprotocol.io)
[![Latency](https://img.shields.io/badge/Policy%20Evaluation-%3C1ms-brightgreen.svg)](#-performance--latency)

> **AI coding agents can modify your machine. MiSeGuard puts a deterministic security boundary between the agent and your tools.**

![MiSeGuard Demo](./docs/assets/demo.gif)

---

> **What is MCP?**
> The Model Context Protocol (MCP) is an open standard that lets autonomous AI agents (such as **Cursor, Claude Code, Antigravity, OpenCode, Windsurf**) invoke external tools (bash, filesystem, git, terminal) over stdio JSON-RPC 2.0. **MiSeGuard** sits as a transparent, sub-millisecond proxy between your agent and those tool runtimes to inspect, score, and block destructive operations before they reach the real operating system.

> **What Does "Deterministic" Mean?**
> The same command or file mutation with the same configuration always produces the exact identical risk score. **No LLM in the loop, no non-deterministic inference, no prompt drift.**

---

## 📦 Installation

```bash
# Global install (recommended for CLI use)
npm install -g miseguard

# Or run directly via npx
npx miseguard --help

# Or add as a project dev dependency
npm install --save-dev miseguard
```

**Requirements:** Node.js 18.0 or later.

---

## 🚀 30-Second Quick Start

### 1. Initialize workspace security policy (`miseguard.json`)
```bash
miseguard init
```

### 2. Shield your MCP agent tools
Choose the method that matches your workflow:

- **Starting fresh or configuring an agent GUI?** Use `snippet` to generate copy-pasteable JSON:
  ```bash
  miseguard snippet --tool filesystem --path .
  ```
- **Already have an existing MCP configuration file?** Use `wrap-config <file-path>` to automatically rewrite and back up your config in place:
  ```bash
  # Pass the explicit path to your agent's config file:
  miseguard wrap-config .antigravity/mcp.json
  miseguard wrap-config "%APPDATA%\Claude\claude_desktop_config.json"
  
  # Or omit path to auto-detect mcp.json / .cursor/mcp.json in current directory:
  miseguard wrap-config
  ```

### 3. Test the deterministic circuit breaker
```bash
miseguard check "rm -rf /"     # 🛑 Exit Code 1: Blocked
miseguard check "git status"    # 🟢 Exit Code 0: Safe
```

---

## 🚦 Deterministic Risk Tiers & Exit Code Contract

MiSeGuard computes a multi-factor **Blast-Radius Risk Score (0–100)** for every tool invocation.

| Level | Score | `strict` Mode | `permissive` Mode | Action | Trigger Examples |
|---|---|---|---|---|---|
| 🟢 **GREEN** | `0 - 29` | **Exit `0`** | **Exit `0`** | **ALLOW** | `git status`, `ls -la`, `npm test`, `tsc --noEmit`, safe file edits |
| 🟡 **YELLOW** | `30 - 69` | **Exit `2`** | **Exit `0`** (Warning) | **DRY-RUN** | `npm install -g`, `chmod -R`, `kill`, `npm publish`, `package.json` updates |
| 🔴 **RED** | `70 - 100` | **Exit `1`** | **Exit `1`** | **BLOCK** | `rm -rf /`, `git reset --hard`, `cat .env`, `curl ... \| bash`, `nc -e /bin/sh`, `delete_file .env` |

> 📌 **CLI Exit Code Stability Contract:**
> - `0`: Safe operation (Green) or permitted in permissive mode.
> - `1`: Dangerous operation blocked by circuit breaker (Red).
> - `2`: Caution operation triggering dry-run in strict mode (Yellow).
> - `3`: Internal parsing or configuration error.
> 
> *Exit codes are stable and guaranteed across versions for CI/CD and pre-commit hook integration.*

---

## ⚙️ Configuration (`miseguard.json`)

Generate a starter configuration file in your project:

```bash
miseguard init
```

### Configuration Options

```json
{
  "$schema": "https://raw.githubusercontent.com/midhunweb/miseguard/main/schema.json",
  "mode": "strict",
  "thresholds": {
    "block": 70,
    "dryRun": 30
  },
  "allowlist": [
    "echo *",
    "git log*",
    "git status*",
    "git diff*",
    "npm run test*",
    "npm run lint*",
    "npm run clean:*"
  ],
  "protectedPaths": [
    ".env*",
    "*.pem",
    "*.key",
    "id_rsa*",
    "id_ed25519*",
    "~/.ssh/*",
    "~/.aws/*",
    "~/.kube/*",
    ".git/*",
    "secrets/**"
  ]
}
```

- **`mode`**:
  - `"strict"` (default): Yellow tier actions trigger ephemeral sandbox dry-run simulation; Red tier actions are blocked.
  - `"permissive"`: Yellow tier actions log warnings and allow execution; Red tier actions are still blocked.
- **`allowlist`**: Commands or file targets matching these patterns are unconditionally granted **Green (Score 0)** status.
- **`protectedPaths`**: Glob patterns of sensitive files that immediately elevate risk to **Red (Score >= 70)** upon access or mutation attempt.
- **`thresholds`**: Customize risk boundaries for `block` and `dryRun`.

---

## 🛠️ CLI Reference

### 1. `miseguard wrap-config [file-path]`
Safely transforms tools in an existing MCP configuration file so commands run shielded behind `miseguard proxy --`. Supports explicit file paths or workspace auto-discovery:

```bash
# Explicit path (recommended across agents):
miseguard wrap-config .antigravity/mcp.json
miseguard wrap-config "%APPDATA%\Claude\claude_desktop_config.json"
miseguard wrap-config ~/.config/Claude/claude_desktop_config.json

# Workspace auto-detection (scans for mcp.json, .cursor/mcp.json, .antigravity/mcp.json):
miseguard wrap-config
```
*Creates `<file-path>.bak` before modification and guarantees idempotency.*

### 2. `miseguard snippet [options]`
Generates copy-pasteable JSON configuration blocks for agent GUI settings (Cursor, Claude, Antigravity, Windsurf):
```bash
# Filesystem preset (default)
miseguard snippet --tool filesystem --path ./

# Git preset
miseguard snippet --tool git --path ./

# Bash/Terminal preset
miseguard snippet --tool bash

# Custom tool preset
miseguard snippet --tool custom --name my-server --cmd python --args -m my_module
```

### 3. `miseguard check "<command>"`
Evaluates the blast-radius risk score of any shell command:
```bash
miseguard check "rm -rf /"
```

### 4. `miseguard dry-run "<command>"`
Simulates a command inside an isolated ephemeral shadow sandbox and outputs a SHA-256 filesystem delta table:
```bash
miseguard dry-run "npm run build"
```

### 5. `miseguard proxy -- <command...>`
Runs MiSeGuard as an active stdio proxy in front of an MCP server process:
```bash
miseguard proxy -- npx -y @modelcontextprotocol/server-filesystem ./
```

### 6. `miseguard rules`
Displays the complete deterministic security rule matrix.

---

## ⚡ Performance & Latency

MiSeGuard adds negligible overhead. The numbers below measure **policy evaluation and interception logic** — the scoring, sandbox dispatch, and diff-checking path. They exclude process spawn, JSON serialization, and OS scheduling, which are common to all stdio proxies and not attributable to MiSeGuard.

| Scenario | Median Latency | Mean Latency | 95th Percentile (p95) |
|---|---|---|---|
| 🟢 **Green Pass-Through (`git status`)** | **~0.006 ms** | ~0.007 ms | 0.010 ms |
| 🔴 **Red Filesystem Block (`delete_file .env`)** | **~0.004 ms** | ~0.005 ms | 0.009 ms |
| 🔴 **Red Command Block (`rm -rf /`)** | **~0.066 ms** | ~0.083 ms | 0.118 ms |
| 🟡 **Yellow Caution Scoring (`npm -g`)** | **~0.194 ms** | ~0.280 ms | 0.325 ms |

> **Reproducibility:** Full methodology, hardware specs, warm-up procedure, and percentile distributions are in [`docs/BENCHMARKS.md`](./docs/BENCHMARKS.md). Run `npm run benchmark` to reproduce on your own machine.

---

## 🤖 Which Agents Are Protected?

MiSeGuard operates at the **Model Context Protocol (MCP) stdio layer**. It intercepts every `tools/call` JSON-RPC message that flows between an agent and an MCP tool server (bash, filesystem, git, etc.).

| Agent / Environment | Protected? | Notes |
|---|:---:|---|
| **Claude Desktop** | ✅ **Full** | MCP-native (all tools route via stdio) |
| **Claude Code** | ✅ **Full** | MCP-native |
| **Cline** | ✅ **Full** | MCP-native |
| **Roo Code** | ✅ **Full** | MCP-native |
| **OpenCode** | ✅ **Full** | MCP-native |
| **LibreChat** | ✅ **Full** | MCP-native |
| **Cursor (MCP servers)** | ✅ **Yes** | Protects all tools configured under `mcpServers` |
| **Antigravity (MCP servers)** | ✅ **Yes** | Protects all tools configured under `mcpServers` |
| **Cursor (native IDE tools)** | ❌ *No* | Bypasses MCP (Roadmap: v0.3.0 IDE Extension) |
| **Antigravity (native IDE tools)** | ❌ *No* | Bypasses MCP (Roadmap: v0.3.0 IDE Extension) |
| **Windsurf (native IDE tools)** | ❌ *No* | Bypasses MCP (Roadmap: v0.3.0 IDE Extension) |

---

## ⚠️ Scope & Limitations

Being explicit about architectural boundaries:
- **Does not protect against prompt injection** — That is an LLM inference layer concern. MiSeGuard assumes the agent's intent may be compromised or hallucinatory, and deterministically enforces policy on the *executed action*, not the reasoning.
- **Does not intercept native IDE built-in tools** — Cursor's internal `run_command`, Antigravity's internal `edit_file`, and Windsurf's native terminal bypass MCP entirely. MiSeGuard only inspects MCP stdio traffic. Direct IDE extension hooks are planned for v0.3.0.
- **Does not sandbox long-running persistent VM state** — Ephemeral shadow sandboxes for dry-runs are discarded immediately after filesystem diff analysis.
- **Does not support HTTP/gRPC transports yet** — Standard input/output (`stdio`) JSON-RPC 2.0 only for v0.1.0 (HTTP/SSE transport on roadmap for v0.2.0).
- **Does not use ML or probabilistic heuristics for risk scoring** — By design. Determinism and reproducibility are core security features.
- **Does not defend against kernel-level escapes or raw syscall bypasses** — Operates at the tool runtime protocol layer.

### 🗺️ Roadmap
- **v0.2.0**: HTTP / SSE / gRPC MCP transport support
- **v0.3.0**: IDE Extension / LSP wrapper for Cursor, Antigravity, and Windsurf native tools

---

## 📖 Extended Documentation

- [Architecture & Design Specification →](./docs/ARCHITECTURE.md)
- [Latency Benchmark Details →](./docs/BENCHMARKS.md)
- [Agent Frontend Integration Guide (Cursor, Claude Desktop, Antigravity) →](./docs/INTEGRATION.md)

---

## 🧪 Testing

```bash
# Run all 60 unit and integration tests
npm test

# Run latency benchmark suite
npm run benchmark
```

---

## 📜 License

MIT License. Copyright (c) 2026 Midhun Sekhar & MiSeGuard Contributors.
