# Changelog

All notable changes to **MiSeGuard** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-09-10

### 🚀 Initial Public Release

#### Added
- **stdio MCP Proxy**: Zero-dependency stdio Model Context Protocol (MCP) JSON-RPC 2.0 proxy with live `tools/call` interception.
- **Deterministic Blast-Radius Risk Engine**: 0–100 multi-factor risk scoring classifying agent operations into Green (0–29, Safe), Yellow (30–69, Caution / Dry-Run), and Red (70–100, Circuit Breaker Block).
- **Direct MCP Filesystem Interception**: Deep inspection and protection for `write_file`, `edit_file`, `create_file`, `delete_file`, `read_file`, `read_multiple_files`, `replace_file_content`, and `move_file`.
- **Ephemeral Sandbox Dry-Run**: Isolated copy-on-write temp workspace sandbox with SHA-256 pre/post snapshot diff analysis.
- **Workspace Security Configuration (`miseguard.json`)**:
  - `allowlist`: Instant Score 0 bypass for trusted command or path patterns.
  - `protectedPaths`: Automatic hazard elevation to Red for sensitive files (`.env*`, `*.pem`, `id_rsa*`, `~/.ssh/*`, `~/.aws/*`, `~/.kube/*`).
  - `thresholds`: Customizable `block` and `dryRun` risk score boundaries.
  - `mode`: `"strict"` and `"permissive"` operational modes.
- **JSON Schema IntelliSense (`schema.json`)**: Official JSON Schema hosted at `https://raw.githubusercontent.com/midhunweb/miseguard/main/schema.json` for IDE autocomplete.
- **Developer Onboarding CLI**:
  - `miseguard init`: Scaffolds standard `miseguard.json` policy.
  - `miseguard wrap-config [file]`: Auto-detects and wraps existing `mcp.json` tool configs with backup `.bak` creation and idempotency protection.
  - `miseguard snippet [options]`: Generates copy-pasteable JSON configuration blocks for GUI settings (`filesystem`, `bash`, `git`, `custom`).
  - `miseguard check "<cmd>"`: Rapid shell command risk scoring with guaranteed CLI exit code contract (`0` Green, `1` Red, `2` Yellow in strict mode, `3` Error).
  - `miseguard dry-run "<cmd>"`: Runs isolated shadow dry-runs and outputs filesystem delta tables.
  - `miseguard rules`: Displays full security matrix and base hazard scores.
- **Performance & Latency Benchmark**:
  - Automated 100-iteration benchmark suite verifying sub-millisecond proxy overhead (~0.006 ms median for Green).
- **Documentation & Community Standards**:
  - Comprehensive documentation with `docs/ARCHITECTURE.md`, `docs/BENCHMARKS.md`, and `docs/INTEGRATION.md`.
  - Full community files (`SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/workflows/ci.yml`, and issue/PR templates).
- **Test Suite**:
  - 60 unit and integration tests covering parser, rules, scoring, filesystem interception, configuration, wrapping, and CLI exit code contracts.
