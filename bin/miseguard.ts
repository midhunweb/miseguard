#!/usr/bin/env node
/**
 * MiSeGuard CLI Entry Point
 * Provides proxy mode, security checker, sandbox runner, config initialization, wrapper, and snippet generator.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { StdioInterceptor } from '../src/proxy/stdio-interceptor.js';
import { evaluateShellCommand } from '../src/engine/blast-radius.js';
import { SECURITY_RULES } from '../src/engine/rules.js';
import { Reporter } from '../src/ui/reporter.js';
import { executeDryRun } from '../src/sandbox/dry-run.js';
import { loadConfigSync, wrapMcpConfigFile, generateSnippet, type ToolPreset } from '../src/config/index.js';

const program = new Command();

program
  .name('miseguard')
  .description('🛡️ Deterministic runtime circuit breaker and stdio MCP proxy for autonomous AI coding agents')
  .version('0.1.0', '-v, --version', 'Output the current version of MiSeGuard')
  .option('-c, --config <path>', 'Path to custom miseguard.json configuration file');

// Command: init
program
  .command('init')
  .description('Generate a default miseguard.json configuration file in the current workspace')
  .argument('[target-dir]', 'Directory where miseguard.json should be created', process.cwd())
  .option('-f, --force', 'Overwrite existing configuration file if present')
  .action((targetDir: string, options: { force?: boolean }) => {
    Reporter.printHeader();

    const configPath = path.resolve(targetDir, 'miseguard.json');

    if (fs.existsSync(configPath) && !options.force) {
      console.error(chalk.yellow(`\n⚠️  Configuration file already exists at: ${configPath}`));
      console.error(chalk.gray('Use --force to overwrite.\n'));
      process.exit(0);
    }

    const template = {
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
        "npm run lint*"
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
        ".git/*"
      ]
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
      console.log(chalk.green(`\n✔ Created MiSeGuard configuration file at: ${chalk.bold(configPath)}`));
      console.log(chalk.gray('\nYou can now customize your allowlisted commands and protected paths.\n'));
    } catch (err: any) {
      console.error(chalk.red(`\n✖ Failed to create configuration file: ${err.message}`));
      process.exit(1);
    }
  });

// Command: wrap-config
program
  .command('wrap-config')
  .description('Safely wrap tools in an existing MCP config file (e.g. claude_desktop_config.json, .cursor/mcp.json, .antigravity/mcp.json)')
  .argument('[file-path]', 'Explicit path to MCP configuration file (auto-detects in workspace if omitted)')
  .action((filePath?: string) => {
    Reporter.printHeader();
    const result = wrapMcpConfigFile(filePath);

    if (!result.success) {
      console.error(chalk.red(`\n✖ ${result.message}\n`));
      process.exit(1);
    }

    if (result.modified) {
      console.log(chalk.green(`\n✔ ${result.message}`));
      console.log(chalk.bold('\nShielded Servers:'));
      for (const s of result.wrappedServers) {
        console.log(`  • ${chalk.cyan(s)} -> wrapped with ${chalk.bold('miseguard proxy --')}`);
      }
      if (result.backupPath) {
        console.log(chalk.gray(`\n📦 Original configuration backed up at: ${result.backupPath}\n`));
      }
    } else {
      console.log(chalk.cyan(`\nℹ️  ${result.message}\n`));
    }
  });

// Command: snippet
program
  .command('snippet')
  .description('Output ready-to-paste JSON configuration blocks for agent GUI settings (Cursor, Antigravity, Claude)')
  .option('-t, --tool <type>', 'Pre-configured preset: filesystem, bash, git, or custom', 'filesystem')
  .option('-n, --name <string>', 'Server name key in JSON config')
  .option('-p, --path <string>', 'Target directory path for filesystem / git tools', '.')
  .option('--cmd <string>', 'Custom target executable command (when tool=custom)', 'npx')
  .option('--args <string...>', 'Custom arguments for custom command')
  .option('--full', 'Output wrapped inside a root "mcpServers" object')
  .action((options: { tool: ToolPreset; name?: string; path?: string; cmd?: string; args?: string[]; full?: boolean }) => {
    Reporter.printHeader();

    const snippet = generateSnippet({
      tool: options.tool,
      name: options.name,
      path: options.path,
      cmd: options.cmd,
      args: options.args,
    });

    console.log(chalk.bold(`📋 Shielded MCP Snippet (${chalk.cyan(options.tool)} preset):\n`));
    console.log(chalk.yellow(options.full ? snippet.fullMcpServersSnippet : snippet.jsonSnippet));
    console.log(chalk.gray(`\n💡 Paste this into your agent's MCP settings or mcpServers object.\n`));
  });

// Command: proxy
program
  .command('proxy')
  .description('Run MiSeGuard as a stdio proxy in front of an MCP tool server')
  .argument('<command...>', 'Downstream MCP server command and arguments')
  .option('-w, --workspace <path>', 'Target workspace directory', process.cwd())
  .option('-c, --config <path>', 'Custom configuration file path')
  .option('--no-dry-run', 'Disable automatic sandbox dry-run for Yellow tier operations')
  .action(async (commandArgs: string[], options: { workspace: string; dryRun: boolean; config?: string }) => {
    if (commandArgs.length === 0) {
      console.error(chalk.red('Error: Downstream command is required. Example: miseguard proxy -- npx server-filesystem ./'));
      process.exit(1);
    }

    const [serverCommand, ...serverArgs] = commandArgs;
    const configPath = options.config || program.opts().config;
    const config = loadConfigSync(options.workspace, configPath);

    Reporter.printHeader();
    console.error(chalk.gray(`[MiSeGuard] Starting stdio proxy for: ${serverCommand} ${serverArgs.join(' ')}`));
    console.error(chalk.gray(`[MiSeGuard] Active workspace: ${options.workspace}`));
    console.error(chalk.gray(`[MiSeGuard] Mode: ${config.mode || 'strict'}`));
    console.error(chalk.gray(`[MiSeGuard] Thresholds: Block >= ${config.thresholds?.block ?? 70}, Dry-run >= ${config.thresholds?.dryRun ?? 30}`));
    console.error(chalk.gray(`[MiSeGuard] Dry-run enabled: ${options.dryRun ? 'Yes' : 'No'}\n`));

    const interceptor = new StdioInterceptor({
      serverCommand,
      serverArgs,
      workspaceDir: options.workspace,
      autoDryRunYellow: options.dryRun,
      config,
      configPath,
    });

    try {
      const exitCode = await interceptor.start();
      process.exit(exitCode);
    } catch (err: any) {
      console.error(chalk.red(`\n[MiSeGuard Fatal Error]: ${err.message}`));
      process.exit(1);
    }
  });

// Command: check
program
  .command('check')
  .description('Deterministically score and evaluate the blast radius of a shell command')
  .argument('<command-string...>', 'The shell command to analyze')
  .option('-w, --workspace <path>', 'Target workspace directory', process.cwd())
  .option('-c, --config <path>', 'Custom configuration file path')
  .action((commandArgs: string[], options: { workspace: string; config?: string }) => {
    try {
      const commandStr = commandArgs.join(' ');
      const configPath = options.config || program.opts().config;
      const config = loadConfigSync(options.workspace, configPath);

      Reporter.printHeader();
      const evaluation = evaluateShellCommand(commandStr, options.workspace, config);
      Reporter.printEvaluation(commandStr, evaluation);

      // Contracted Exit Codes:
      // 0: Green (Safe) or Yellow (Permissive mode)
      // 1: Red (Blocked)
      // 2: Yellow (Caution / Dry-run in strict mode)
      if (evaluation.level === 'RED') {
        process.exit(1);
      } else if (evaluation.level === 'YELLOW') {
        if (config.mode === 'permissive') {
          process.exit(0);
        } else {
          process.exit(2);
        }
      } else {
        process.exit(0);
      }
    } catch (err: any) {
      console.error(chalk.red(`\n[MiSeGuard Error]: ${err.message}\n`));
      process.exit(3);
    }
  });

// Command: dry-run
program
  .command('dry-run')
  .description('Execute a command inside an ephemeral shadow sandbox and inspect filesystem deltas')
  .argument('<command-string...>', 'The shell command to test in sandbox')
  .option('-w, --workspace <path>', 'Source workspace directory to snapshot', process.cwd())
  .action(async (commandArgs: string[], options: { workspace: string }) => {
    const commandStr = commandArgs.join(' ');
    Reporter.printHeader();
    console.error(chalk.cyan(`[MiSeGuard] Forking ephemeral sandbox from: ${options.workspace}...`));
    console.error(chalk.gray(`[MiSeGuard] Executing: ${commandStr}\n`));

    const result = await executeDryRun(commandStr, {
      workspaceDir: options.workspace,
    });

    console.error(chalk.bold('--- Sandbox Execution Output ---'));
    if (result.stdout) console.log(result.stdout.trim());
    if (result.stderr) console.error(chalk.yellow(result.stderr.trim()));
    console.error(chalk.bold('--------------------------------'));
    console.error(chalk.dim(`Duration: ${result.durationMs}ms | Exit Code: ${result.exitCode}`));

    Reporter.printDiffReport(result.diffReport);
  });

// Command: rules
program
  .command('rules')
  .description('Display the active deterministic security rules and score matrix')
  .action(() => {
    Reporter.printRulesList(SECURITY_RULES);
  });

program.parse(process.argv);
