# MiSeGuard Architecture & Design Specification

MiSeGuard is designed as a deterministic, zero-dependency runtime circuit breaker that operates as a standard input/output (stdio) Model Context Protocol (MCP) JSON-RPC 2.0 proxy.

---

## 🏗️ High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│             Autonomous AI Agent Frontend                     │
│        (Cursor, Claude Code, Antigravity, OpenCode, etc.)   │
└──────────────────────────────┬──────────────────────────────┘
                               │  JSON-RPC 2.0 (stdio)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      🛡️ MiSeGuard Proxy                     │
│                                                             │
│   ┌──────────────────┐   ┌──────────────────────────────┐   │
│   │ Bash AST Parser  │──►│ Blast-Radius Risk Engine     │   │
│   │ & Tokenizer      │   │ (Deterministic 0-100 Score)  │   │
│   └──────────────────┘   └──────────────┬───────────────┘   │
│                                         │                   │
│   ┌──────────────────┐                  │                   │
│   │ Config Loader    │──────────────────┤                   │
│   │ (miseguard.json) │                  │                   │
│   └──────────────────┘                  │                   │
│                                         │                   │
│             ┌───────────────────────────┼────────────────┐  │
│             ▼                           ▼                ▼  │
│    🟢 GREEN (0-29)              🟡 YELLOW (30-69)  🔴 RED (70-100)
│   (Safe Passthrough)           (Ephemeral Dry-Run) (Circuit Breaker)
│             │                           │                │  │
│             │                           ▼                ▼  │
│             │                  Diff Analyzer        Synthesize Error
│             │                  (Pre/Post Hash)      Block Payload   │
└─────────────┼───────────────────────────┼────────────────┼──┘
              │                           │                │
              ▼                           ▼                │
┌────────────────────────────────────────────────────────┐ │
│         Downstream MCP Server / Tool Runtime           │ │
└────────────────────────────────────────────────────────┘ │
                                                           ▼
                                                [Agent Receives Safe Block]
```

---

## 🧩 Core Subsystems

### 1. Stdio Interceptor (`src/proxy/stdio-interceptor.ts`)
- Manages stdio pipes between the agent client and the downstream tool process.
- Implements chunk buffering and JSON-RPC 2.0 message boundary framing.
- Passes non-destructive queries directly to child process without buffering latency.

### 2. MCP Handler & Circuit Breaker (`src/proxy/mcp-handler.ts`)
- Intercepts incoming `tools/call` JSON-RPC methods.
- Inspects shell commands (`execute_command`, `bash`, `sh`, `terminal`) and filesystem tools (`write_file`, `delete_file`, `read_file`, `replace_file_content`, `patch_file`, `move_file`).
- When a Red hazard is detected, it prevents transmission to the OS and synthesizes a structured JSON-RPC error response detailing violated rules and safe alternatives.

### 3. Bash & Shell AST Tokenizer (`src/engine/bash-parser.ts`)
- Lexically analyzes command strings, handling single/double quotes, subshells (`$(...)`, backticks), pipelines (`|`), chained operators (`&&`, `||`, `;`), and redirects (`>`, `>>`, `2>`).
- Identifies executables, subcommands, flags, path arguments, and network exfiltration patterns.

### 4. Blast-Radius Scoring Engine (`src/engine/blast-radius.ts`)
- Deterministic multi-factor risk scoring algorithm ($0 \le \text{Score} \le 100$):
  - **Base Rule Hazard**: Base score from triggered security rules.
  - **Target Sensitivity**: Immediate Red elevation for `.env`, `*.pem`, `id_rsa`, `.ssh/`, `.aws/`, `.git/`.
  - **Irreversibility Modifier**: Penalties for recursive flags (`-r`, `-R`, `/s`), force flags (`-f`, `/q`), and wildcards (`*`, `./*`).
  - **Exfiltration Multiplier**: Penalties for remote pipes (`curl ... | bash`) and network pipelines touching sensitive files.

### 5. Ephemeral Dry-Run Sandbox (`src/sandbox/dry-run.ts`)
- Clones a lightweight copy-on-write shadow workspace into the system temp directory.
- Runs Yellow tier actions in isolation, preventing changes to the real workspace.
- Uses `diff-analyzer.ts` with SHA-256 hashes to analyze file additions, modifications, and deletions.
