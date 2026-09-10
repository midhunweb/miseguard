/**
 * MiSeGuard Latency Benchmark Suite
 * Measures and compares baseline vs MiSeGuard intercepted JSON-RPC execution overhead across 100 iterations.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { McpHandler, type JsonRpcRequest } from '../src/proxy/mcp-handler.js';
import { getDefaultConfig } from '../src/config/index.js';

interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

function calculateStats(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;

  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));

  return {
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted[sorted.length - 1].toFixed(3)),
    mean: Number(mean.toFixed(3)),
    median: Number(median.toFixed(3)),
    p95: Number(sorted[p95Index].toFixed(3)),
    p99: Number(sorted[p99Index].toFixed(3)),
  };
}

// Baseline mock JSON-RPC handler (pure echo without security analysis)
class BaselineHandler {
  public async handleRequest(req: JsonRpcRequest): Promise<any> {
    const serialized = JSON.stringify(req);
    const parsed = JSON.parse(serialized);
    if (parsed.method === 'tools/call') {
      return {
        jsonrpc: '2.0',
        id: parsed.id ?? null,
        result: { content: [{ type: 'text', text: 'Baseline output' }] },
      };
    }
    return { jsonrpc: '2.0', id: parsed.id ?? null, result: {} };
  }
}

async function runBenchmark(iterations = 100) {
  console.log(
    chalk.cyanBright.bold(`
 ╔══════════════════════════════════════════════════════════════╗
 ║                ⚡ MiSeGuard Latency Benchmark                ║
 ║           Measuring Deterministic Interception Latency       ║
 ╚══════════════════════════════════════════════════════════════╝
`)
  );

  console.log(chalk.gray(`Warming up JIT compiler and running ${iterations} iterations per test scenario...\n`));

  const baseline = new BaselineHandler();
  // Set silent: true to measure pure CPU algorithmic latency without console I/O
  const guard = new McpHandler({
    autoDryRunYellow: false,
    silent: true,
    config: getDefaultConfig(),
  });

  // Test requests
  const greenRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'execute_command',
      arguments: { command: 'git status' },
    },
  };

  const yellowRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'execute_command',
      arguments: { command: 'npm install -g typescript' },
    },
  };

  const redRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'execute_command',
      arguments: { command: 'rm -rf /' },
    },
  };

  const fsRedRequest: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'delete_file',
      arguments: { path: '.env' },
    },
  };

  // Warmup Phase (25 iterations per scenario to stabilize V8 optimization)
  for (let i = 0; i < 25; i++) {
    await baseline.handleRequest(greenRequest);
    await guard.handleRequest(greenRequest);
    await guard.handleRequest(yellowRequest);
    await guard.handleRequest(redRequest);
    await guard.handleRequest(fsRedRequest);
  }

  // 1. Baseline Latencies
  const baselineTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await baseline.handleRequest(greenRequest);
    const t1 = performance.now();
    baselineTimes.push(t1 - t0);
  }

  // 2. Green Pass-Through Latencies
  const greenTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await guard.handleRequest(greenRequest);
    const t1 = performance.now();
    greenTimes.push(t1 - t0);
  }

  // 3. Yellow Classification Latencies
  const yellowTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await guard.handleRequest(yellowRequest);
    const t1 = performance.now();
    yellowTimes.push(t1 - t0);
  }

  // 4. Red Command Block Latencies
  const redTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await guard.handleRequest(redRequest);
    const t1 = performance.now();
    redTimes.push(t1 - t0);
  }

  // 5. Direct Filesystem Red Block Latencies
  const fsRedTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await guard.handleRequest(fsRedRequest);
    const t1 = performance.now();
    fsRedTimes.push(t1 - t0);
  }

  const statsBaseline = calculateStats(baselineTimes);
  const statsGreen = calculateStats(greenTimes);
  const statsYellow = calculateStats(yellowTimes);
  const statsRed = calculateStats(redTimes);
  const statsFsRed = calculateStats(fsRedTimes);

  const table = new Table({
    head: [
      chalk.cyan('Scenario'),
      chalk.cyan('Min (ms)'),
      chalk.cyan('Mean (ms)'),
      chalk.cyan('Median (ms)'),
      chalk.cyan('p95 (ms)'),
      chalk.cyan('p99 (ms)'),
      chalk.cyan('Max (ms)'),
    ],
    style: { head: [], border: [] },
  });

  table.push(
    [chalk.gray('Baseline JSON-RPC (No Guard)'), statsBaseline.min, statsBaseline.mean, statsBaseline.median, statsBaseline.p95, statsBaseline.p99, statsBaseline.max],
    [chalk.green('🟢 Green Pass-Through (git status)'), statsGreen.min, statsGreen.mean, statsGreen.median, statsGreen.p95, statsGreen.p99, statsGreen.max],
    [chalk.yellow('🟡 Yellow Caution (npm -g)'), statsYellow.min, statsYellow.mean, statsYellow.median, statsYellow.p95, statsYellow.p99, statsYellow.max],
    [chalk.red('🔴 Red Command Block (rm -rf /)'), statsRed.min, statsRed.mean, statsRed.median, statsRed.p95, statsRed.p99, statsRed.max],
    [chalk.red('🔴 Red Filesystem Block (delete .env)'), statsFsRed.min, statsFsRed.mean, statsFsRed.median, statsFsRed.p95, statsFsRed.p99, statsFsRed.max],
  );

  console.log(table.toString());

  const avgOverhead = Number((statsGreen.mean - statsBaseline.mean).toFixed(3));
  console.log(
    chalk.bold(`\n📊 Proxy Latency Overview:`) +
    `\n  • Safe Operations (Green): ` + chalk.green.bold(`~${statsGreen.median} ms median`) + ` (~${statsGreen.mean} ms mean)` +
    `\n  • Caution Analysis (Yellow): ` + chalk.yellow.bold(`~${statsYellow.median} ms median`) + ` (~${statsYellow.mean} ms mean)` +
    `\n  • Block Decision (Red): ` + chalk.red.bold(`~${statsRed.median} ms median`) + ` (~${statsRed.mean} ms mean)`
  );

  console.log(chalk.gray(`\n✔ Benchmark completed successfully across ${iterations * 5} total trials.\n`));
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
