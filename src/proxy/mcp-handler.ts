/**
 * MiSeGuard MCP Request Handler & Circuit Breaker
 * Inspects JSON-RPC 2.0 messages, extracts tool calls, computes risk, and synthesizes responses.
 */

import { evaluateShellCommand, evaluateFileMutation, isSensitivePath, type EvaluationResult } from '../engine/blast-radius.js';
import { executeDryRun, type DryRunResult } from '../sandbox/dry-run.js';
import { Reporter } from '../ui/reporter.js';
import { loadConfigSync, type MiseGuardConfig } from '../config/index.js';
import { SECURITY_RULES } from '../engine/rules.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface InterceptDecision {
  action: 'FORWARD' | 'SYNTHESIZE_RESPONSE';
  evaluation?: EvaluationResult;
  response?: JsonRpcResponse;
  dryRunResult?: DryRunResult;
}

export interface McpHandlerOptions {
  workspaceDir?: string;
  autoDryRunYellow?: boolean;
  config?: MiseGuardConfig;
  configPath?: string;
  silent?: boolean;
}

export class McpHandler {
  private workspaceDir: string;
  private autoDryRunYellow: boolean;
  private config: MiseGuardConfig;
  private silent: boolean;

  constructor(options: McpHandlerOptions = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.autoDryRunYellow = options.autoDryRunYellow ?? true;
    this.config = options.config || loadConfigSync(this.workspaceDir, options.configPath);
    this.silent = options.silent ?? false;
  }

  public getConfig(): MiseGuardConfig {
    return this.config;
  }

  public setConfig(config: MiseGuardConfig): void {
    this.config = config;
  }

  /**
   * Extracts file target path(s) from varied tool argument conventions.
   */
  private extractTargetPaths(args: any): string[] {
    if (!args || typeof args !== 'object') return [];

    const paths: string[] = [];

    if (typeof args.path === 'string' && args.path.trim()) paths.push(args.path.trim());
    if (typeof args.filepath === 'string' && args.filepath.trim()) paths.push(args.filepath.trim());
    if (typeof args.filePath === 'string' && args.filePath.trim()) paths.push(args.filePath.trim());
    if (typeof args.targetFile === 'string' && args.targetFile.trim()) paths.push(args.targetFile.trim());
    if (typeof args.TargetFile === 'string' && args.TargetFile.trim()) paths.push(args.TargetFile.trim());
    if (typeof args.targetFilePath === 'string' && args.targetFilePath.trim()) paths.push(args.targetFilePath.trim());
    if (typeof args.TargetFilePath === 'string' && args.TargetFilePath.trim()) paths.push(args.TargetFilePath.trim());
    if (typeof args.source === 'string' && args.source.trim()) paths.push(args.source.trim());
    if (typeof args.destination === 'string' && args.destination.trim()) paths.push(args.destination.trim());
    if (typeof args.directory === 'string' && args.directory.trim()) paths.push(args.directory.trim());

    if (Array.isArray(args.paths)) {
      for (const p of args.paths) {
        if (typeof p === 'string' && p.trim()) paths.push(p.trim());
      }
    }

    return Array.from(new Set(paths));
  }

  /**
   * Evaluates an incoming JSON-RPC request from an AI agent frontend.
   */
  public async handleRequest(req: JsonRpcRequest): Promise<InterceptDecision> {
    if (req.method !== 'tools/call' || !req.params) {
      return { action: 'FORWARD' };
    }

    const toolName = (req.params.name || '').toLowerCase();
    const args = req.params.arguments || {};
    const reqId = req.id !== undefined ? req.id : null;

    // 1. Shell Command Tools (execute_command, bash, sh, exec, terminal...)
    if (['execute_command', 'bash', 'run_terminal_cmd', 'sh', 'exec', 'command_runner', 'terminal', 'shell'].includes(toolName)) {
      const commandStr: string = args.command || args.cmd || args.script || args.CommandLine || '';

      if (!commandStr) {
        return { action: 'FORWARD' };
      }

      const evaluation = evaluateShellCommand(commandStr, this.workspaceDir, this.config);
      if (!this.silent) {
        Reporter.printEvaluation(`[MCP:${toolName}] ${commandStr}`, evaluation);
      }

      // RED: Circuit breaker block
      if (evaluation.level === 'RED') {
        return {
          action: 'SYNTHESIZE_RESPONSE',
          evaluation,
          response: this.createBlockedResponse(reqId, toolName, commandStr, evaluation),
        };
      }

      // YELLOW: Perform Sandbox Dry-Run if enabled
      if (evaluation.level === 'YELLOW' && this.autoDryRunYellow && this.config.mode !== 'permissive') {
        const dryRunResult = await executeDryRun(commandStr, { workspaceDir: this.workspaceDir });
        if (!this.silent) {
          Reporter.printDiffReport(dryRunResult.diffReport);
        }

        // If dry run revealed sensitive modifications, upgrade to RED block
        if (dryRunResult.diffReport.hasSensitiveModifications) {
          evaluation.level = 'RED';
          evaluation.action = 'BLOCK';
          evaluation.score = 95;
          evaluation.reasons.push('Sandbox dry-run revealed critical sensitive file modifications');
          return {
            action: 'SYNTHESIZE_RESPONSE',
            evaluation,
            dryRunResult,
            response: this.createBlockedResponse(reqId, toolName, commandStr, evaluation),
          };
        }

        return {
          action: 'FORWARD',
          evaluation,
          dryRunResult,
        };
      }

      return {
        action: 'FORWARD',
        evaluation,
      };
    }

    // 2. Direct Filesystem Read Tools (read_file, read_multiple_files, fetch_file)
    if (['read_file', 'read_multiple_files', 'view_file', 'read_file_content'].includes(toolName)) {
      const targetPaths = this.extractTargetPaths(args);

      for (const targetPath of targetPaths) {
        if (isSensitivePath(targetPath, this.config.protectedPaths)) {
          const rule = SECURITY_RULES['RED_CREDENTIAL_MUTATION_OR_LEAK'];
          const evaluation: EvaluationResult = {
            score: Math.max(90, this.config.thresholds?.block ?? 70),
            level: 'RED',
            action: 'BLOCK',
            triggeredRules: [rule],
            reasons: [`Direct read attempt on sensitive/protected credential file: ${targetPath}`],
            affectedTargets: [targetPath],
            remediations: ['Do not access private keys or credentials directly. Use environment mock templates.'],
            metadata: {
              commandCount: 1,
              hasDangerousPipe: false,
              hasSubshell: false,
              hasNetworkActivity: false,
              highestBaseScore: 90,
            },
          };

          if (!this.silent) {
            Reporter.printEvaluation(`[MCP:${toolName}] ${targetPath}`, evaluation);
          }

          return {
            action: 'SYNTHESIZE_RESPONSE',
            evaluation,
            response: this.createBlockedResponse(reqId, toolName, targetPath, evaluation),
          };
        }
      }

      return { action: 'FORWARD' };
    }

    // 3. Direct Filesystem Mutation Tools (write_file, edit_file, delete_file, patch_file, etc.)
    if (
      [
        'write_file',
        'create_file',
        'edit_file',
        'delete_file',
        'replace_file_content',
        'patch_file',
        'write_to_file',
        'create_directory',
        'move_file',
      ].includes(toolName)
    ) {
      const targetPaths = this.extractTargetPaths(args);
      const content: string = args.content || args.CodeContent || args.replacement || args.ReplacementContent || '';
      const isDelete = toolName === 'delete_file' || args.operation === 'delete';

      for (const targetPath of targetPaths) {
        const evaluation = evaluateFileMutation(targetPath, isDelete ? 'delete' : 'modify', content, this.config);
        if (!this.silent) {
          Reporter.printEvaluation(`[MCP:${toolName}] ${targetPath}`, evaluation);
        }

        if (evaluation.level === 'RED') {
          return {
            action: 'SYNTHESIZE_RESPONSE',
            evaluation,
            response: this.createBlockedResponse(reqId, toolName, targetPath, evaluation),
          };
        }
      }

      return {
        action: 'FORWARD',
      };
    }

    return { action: 'FORWARD' };
  }

  /**
   * Synthesizes a standardized MCP tool error response.
   */
  private createBlockedResponse(
    reqId: string | number | null,
    toolName: string,
    target: string,
    evaluation: EvaluationResult
  ): JsonRpcResponse {
    const errorDetails = [
      `🛡️ [MiSeGuard Circuit Breaker] Execution of tool "${toolName}" was BLOCKED.`,
      `Risk Score: ${evaluation.score}/100 (Level: ${evaluation.level})`,
      '',
      'Triggered Violations:',
      ...evaluation.reasons.map(r => ` - ${r}`),
      '',
      evaluation.remediations.length > 0 ? 'Safe Alternatives:\n' + evaluation.remediations.map(r => ` - ${r}`).join('\n') : '',
    ].filter(Boolean).join('\n');

    return {
      jsonrpc: '2.0',
      id: reqId,
      result: {
        isError: true,
        content: [
          {
            type: 'text',
            text: errorDetails,
          },
        ],
      },
    };
  }
}
