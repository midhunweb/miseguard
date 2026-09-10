import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const COMPILED_CLI = path.resolve('dist/bin/miseguard.js');

function runCli(args: string[], cwd?: string): { exitCode: number | null; stdout: string; stderr: string } {
  const res = spawnSync(
    process.execPath,
    [COMPILED_CLI, ...args],
    {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
    }
  );

  return {
    exitCode: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

describe('MiSeGuard CLI Exit Code & Interface Contract', () => {
  it('should return Exit Code 0 for version queries (-v and --version)', () => {
    const res = runCli(['--version']);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('0.1.0'));
  });

  it('should return Exit Code 0 for Green safe commands', () => {
    const res = runCli(['check', 'git status']);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stderr.includes('SAFE: EXECUTION PERMITTED'));
  });

  it('should return Exit Code 1 for Red hazardous commands', () => {
    const res = runCli(['check', 'rm -rf /']);
    assert.strictEqual(res.exitCode, 1);
    assert.ok(res.stderr.includes('CIRCUIT BREAKER TRIGGERED: BLOCKED'));
  });

  it('should return Exit Code 2 for Yellow caution commands in strict mode', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-cli-contract-'));
    fs.writeFileSync(path.join(testDir, 'miseguard.json'), JSON.stringify({ mode: 'strict' }), 'utf-8');

    try {
      const res = runCli(['check', 'npm install -g pnpm'], testDir);
      assert.strictEqual(res.exitCode, 2);
      assert.ok(res.stderr.includes('CAUTION: DRY-RUN INSPECTION'));
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return Exit Code 0 for Yellow caution commands in permissive mode', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-cli-contract-'));
    fs.writeFileSync(path.join(testDir, 'miseguard.json'), JSON.stringify({ mode: 'permissive' }), 'utf-8');

    try {
      const res = runCli(['check', 'npm install -g pnpm'], testDir);
      assert.strictEqual(res.exitCode, 0);
      assert.ok(res.stderr.includes('CAUTION: DRY-RUN INSPECTION'));
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
