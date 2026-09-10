# MiSeGuard Latency & Performance Benchmark

MiSeGuard is designed for ultra-low latency, running deterministic AST tokenization and risk scoring with sub-millisecond overhead.

---

## ⚡ Benchmark Methodology

- **Iterations**: 100 trials per scenario across 5 distinct test scenarios (500 total trials).
- **Warm-Up**: 25 iterations per scenario discarded prior to measurement to eliminate V8 JIT compilation artifacts.
- **Timing**: High-resolution `performance.now()` microsecond timestamping.
- **Environment**: Node.js v22 (x86_64).

---

## 📊 Latency Distribution Table

| Scenario | Min | Mean | Median | p95 | p99 | Max |
|---|---|---|---|---|---|---|
| **Baseline JSON-RPC (No Proxy)** | 0.003 ms | 0.004 ms | 0.003 ms | 0.007 ms | 0.022 ms | 0.022 ms |
| 🟢 **Green Pass-Through (`git status`)** | 0.006 ms | **0.007 ms** | **0.006 ms** | 0.010 ms | 0.033 ms | 0.033 ms |
| 🔴 **Red Filesystem Block (`delete_file .env`)** | 0.004 ms | **0.005 ms** | **0.004 ms** | 0.009 ms | 0.016 ms | 0.016 ms |
| 🔴 **Red Command Block (`rm -rf /`)** | 0.045 ms | **0.083 ms** | **0.066 ms** | 0.118 ms | 1.443 ms | 1.443 ms |
| 🟡 **Yellow Caution Scoring (`npm -g`)** | 0.083 ms | **0.280 ms** | **0.194 ms** | 0.325 ms | 5.851 ms | 5.851 ms |

---

## 🔍 Key Performance Findings

1. **Safe Operations (Green Pass-Through)**:
   - Median latency overhead is **~0.006 ms (6 microseconds)**.
   - 95% of safe requests pass through in **≤ 0.01 ms**.
2. **Circuit Breaker Block Decisions (Red)**:
   - Direct filesystem blocks resolve in **~0.004 ms**.
   - Shell AST tokenization and rule analysis for complex commands completes in **~0.066 ms median**.
3. **Caution & Dry-Run Scoring (Yellow)**:
   - Full AST pipeline analysis, path cross-referencing, and sandbox pre-flight checks average **~0.28 ms mean** (< 0.3 ms).

---

## 🏃 Reproducing Benchmarks

Run the automated benchmark suite on your local hardware:

```bash
npm run benchmark
```
