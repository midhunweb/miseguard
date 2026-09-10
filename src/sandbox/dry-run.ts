/**
 * MiSeGuard Ephemeral Dry-Run Sandbox
 * Forks an isolated temporary workspace / git shadow environment to simulate operations
 * and capture filesystem mutations safely before touching the real operating system.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { snapshotDirectory, compareSnapshots, type DiffReport } from './diff-analyzer.js';
import { isSensitivePath } from '../engine/blast-radius.js';

export interface DryRunOptions {
  workspaceDir: string;
  timeoutMs?: number;
  maxFilesToCopy?: number;
}

export interface DryRunResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  diffReport: DiffReport;
  sandboxPath: string;
  cleanedUp: boolean;
}

/**
 * Creates an ephemeral sandbox copy of the workspace.
 */
export function createEphemeralSandbox(workspaceDir: string, maxFiles = 500): string {
  const tmpBase = os.tmpdir();
  const sandboxName = `miseguard-sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const sandboxPath = path.join(tmpBase, sandboxName);

  fs.mkdirSync(sandboxPath, { recursive: true });

  // Copy directory structure and non-ignored files
  let copiedCount = 0;

  function copyRecursive(src: string, dest: string) {
    if (copiedCount >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(src, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (copiedCount >= maxFiles) break;
      if (['node_modules', '.git', 'dist', '.cache'].includes(entry.name)) {
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        try {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } catch {}
      } else if (entry.isFile()) {
        try {
          fs.copyFileSync(srcPath, destPath);
          copiedCount++;
        } catch {}
      }
    }
  }

  copyRecursive(workspaceDir, sandboxPath);
  return sandboxPath;
}

/**
 * Cleans up ephemeral sandbox directory.
 */
export function cleanupSandbox(sandboxPath: string): void {
  try {
    if (fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }
  } catch {
    // Ignore sandbox cleanup errors
  }
}

/**
 * Executes a command in an isolated ephemeral sandbox environment.
 */
export async function executeDryRun(command: string, options: DryRunOptions): Promise<DryRunResult> {
  const sandboxPath = createEphemeralSandbox(options.workspaceDir, options.maxFilesToCopy || 500);
  const beforeSnapshot = snapshotDirectory(sandboxPath);

  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = 0;

  try {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command];

    await new Promise<void>((resolve) => {
      const child = spawn(shell, shellArgs, {
        cwd: sandboxPath,
        env: {
          ...process.env,
          MISEGUARD_DRY_RUN: '1',
          SANDBOX_ROOT: sandboxPath,
        },
        timeout: options.timeoutMs || 8000,
        windowsVerbatimArguments: isWindows,
      });

      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });

      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        exitCode = code;
        resolve();
      });

      child.on('error', (err) => {
        stderr += `\nSandbox execution error: ${err.message}`;
        exitCode = 1;
        resolve();
      });
    });
  } catch (err: any) {
    stderr += `\nFailed to run dry-run: ${err.message}`;
    exitCode = 1;
  }

  const durationMs = Date.now() - startTime;
  const afterSnapshot = snapshotDirectory(sandboxPath);
  const diffReport = compareSnapshots(beforeSnapshot, afterSnapshot, isSensitivePath);

  // Clean up sandbox
  cleanupSandbox(sandboxPath);

  return {
    command,
    exitCode,
    stdout,
    stderr,
    durationMs,
    diffReport,
    sandboxPath,
    cleanedUp: true,
  };
}
