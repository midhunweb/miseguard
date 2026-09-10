/**
 * MiSeGuard Stdio Interceptor & Process Proxy
 * Manages stdio stream piping, chunk buffering, JSON-RPC 2.0 message framing,
 * and interception lifecycle between AI agent client and downstream MCP server.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { McpHandler, type JsonRpcRequest, type JsonRpcResponse } from './mcp-handler.js';
import type { MiseGuardConfig } from '../config/index.js';

export interface InterceptorOptions {
  serverCommand: string;
  serverArgs: string[];
  workspaceDir?: string;
  autoDryRunYellow?: boolean;
  config?: MiseGuardConfig;
  configPath?: string;
}

export class StdioInterceptor {
  private childProcess: ChildProcess | null = null;
  private handler: McpHandler;
  private stdinBuffer = '';

  constructor(private options: InterceptorOptions) {
    this.handler = new McpHandler({
      workspaceDir: options.workspaceDir,
      autoDryRunYellow: options.autoDryRunYellow,
      config: options.config,
      configPath: options.configPath,
    });
  }

  /**
   * Starts the downstream child process and connects stdio interception.
   */
  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const { serverCommand, serverArgs, workspaceDir } = this.options;

      this.childProcess = spawn(serverCommand, serverArgs, {
        cwd: workspaceDir || process.cwd(),
        env: {
          ...process.env,
          MISEGUARD_ACTIVE: '1',
        },
        stdio: ['pipe', 'pipe', 'inherit'],
        shell: process.platform === 'win32',
      });

      if (!this.childProcess.stdin || !this.childProcess.stdout) {
        return reject(new Error('Failed to open child process stdio pipes.'));
      }

      // 1. Forward child process stdout directly to client stdout
      this.childProcess.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
      });

      // 2. Intercept client stdin to inspect JSON-RPC messages before forwarding
      process.stdin.on('data', (chunk: Buffer) => {
        this.handleClientInput(chunk.toString('utf-8'));
      });

      this.childProcess.on('close', (code) => {
        resolve(code ?? 0);
      });

      this.childProcess.on('error', (err) => {
        console.error(`\n[MiSeGuard] Downstream server error: ${err.message}`);
        reject(err);
      });

      // Clean signal shutdown
      const cleanup = () => {
        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill('SIGTERM');
        }
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    });
  }

  /**
   * Buffers and processes client stdin chunks.
   * Handles newline-delimited JSON-RPC messages.
   */
  private async handleClientInput(chunk: string): Promise<void> {
    this.stdinBuffer += chunk;

    const lines = this.stdinBuffer.split(/\r?\n/);
    // Keep incomplete last segment in buffer
    this.stdinBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: JsonRpcRequest | null = null;
      try {
        parsed = JSON.parse(trimmed) as JsonRpcRequest;
      } catch {
        // Not a JSON line, pass raw to child process
        if (this.childProcess?.stdin?.writable) {
          this.childProcess.stdin.write(line + '\n');
        }
        continue;
      }

      await this.processMessage(parsed, line);
    }
  }

  /**
   * Evaluates parsed JSON-RPC message against circuit breaker rules.
   */
  private async processMessage(req: JsonRpcRequest, originalLine: string): Promise<void> {
    try {
      const decision = await this.handler.handleRequest(req);

      if (decision.action === 'SYNTHESIZE_RESPONSE' && decision.response) {
        // Send synthesized blocked response directly to client stdout
        const responseJson = JSON.stringify(decision.response);
        process.stdout.write(responseJson + '\n');
        return;
      }

      // Otherwise forward to downstream child process
      if (this.childProcess?.stdin?.writable) {
        this.childProcess.stdin.write(originalLine + '\n');
      }
    } catch (err: any) {
      console.error(`[MiSeGuard Interceptor Error]: ${err.message}`);
      if (this.childProcess?.stdin?.writable) {
        this.childProcess.stdin.write(originalLine + '\n');
      }
    }
  }

  /**
   * Stops the proxy and kills child process.
   */
  public stop(): void {
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
    }
  }
}
