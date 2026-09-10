/**
 * MiSeGuard MCP Configuration Wrapper
 * Safely wraps tools in any specified MCP JSON config file so downstream commands run shielded through MiSeGuard.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WrapResult {
  success: boolean;
  modified: boolean;
  wrappedCount: number;
  wrappedServers: string[];
  alreadyShieldedCount: number;
  backupPath?: string;
  filePath?: string;
  message: string;
}

const CANDIDATE_MCP_PATHS = [
  'mcp.json',
  '.antigravity/mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
];

/**
 * Finds an MCP configuration file in the workspace if no explicit path was provided.
 */
export function findMcpConfigFile(cwd: string = process.cwd()): string | null {
  // 1. Check common locations
  for (const candidate of CANDIDATE_MCP_PATHS) {
    const candidatePath = path.resolve(cwd, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  // 2. Scan root directory for any .json file with "mcpServers"
  try {
    const files = fs.readdirSync(cwd, { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json') && file.name !== 'package.json' && file.name !== 'package-lock.json' && file.name !== 'tsconfig.json') {
        const fullPath = path.resolve(cwd, file.name);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8').replace(/^\uFEFF/, '');
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object' && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
            return fullPath;
          }
        } catch {
          // ignore unparseable json
        }
      }
    }
  } catch {
    // ignore read directory errors
  }

  return null;
}

/**
 * Wraps MCP server commands inside an MCP JSON configuration file with MiSeGuard proxy.
 */
export function wrapMcpConfigFile(targetFilePath?: string, cwd: string = process.cwd()): WrapResult {
  let resolvedPath: string | null = null;

  if (targetFilePath) {
    resolvedPath = path.isAbsolute(targetFilePath) ? targetFilePath : path.resolve(cwd, targetFilePath);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        modified: false,
        wrappedCount: 0,
        wrappedServers: [],
        alreadyShieldedCount: 0,
        message: `File not found at specified path: ${resolvedPath}`,
      };
    }
  } else {
    resolvedPath = findMcpConfigFile(cwd);
    if (!resolvedPath) {
      return {
        success: false,
        modified: false,
        wrappedCount: 0,
        wrappedServers: [],
        alreadyShieldedCount: 0,
        message: 'No MCP configuration file found in workspace.\n  • To wrap a specific agent config: miseguard wrap-config <path/to/config.json>\n  • To generate a new config snippet: miseguard snippet --tool filesystem',
      };
    }
  }

  let fileContent = '';
  let parsedConfig: any = null;

  try {
    fileContent = fs.readFileSync(resolvedPath, 'utf-8').replace(/^\uFEFF/, '');
    parsedConfig = JSON.parse(fileContent);
  } catch (err: any) {
    return {
      success: false,
      modified: false,
      wrappedCount: 0,
      wrappedServers: [],
      alreadyShieldedCount: 0,
      filePath: resolvedPath,
      message: `Failed to parse JSON file at ${resolvedPath}: ${err.message}`,
    };
  }

  if (!parsedConfig || typeof parsedConfig !== 'object') {
    return {
      success: false,
      modified: false,
      wrappedCount: 0,
      wrappedServers: [],
      alreadyShieldedCount: 0,
      filePath: resolvedPath,
      message: `Invalid configuration format: Root must be a JSON object in ${resolvedPath}`,
    };
  }

  // If mcpServers is not defined at top level, check if top level itself is a dictionary of servers
  let serversObj = parsedConfig.mcpServers;
  let isTopLevel = false;

  if (!serversObj || typeof serversObj !== 'object') {
    // Check if keys look like server definitions
    const keys = Object.keys(parsedConfig);
    const looksLikeServers = keys.length > 0 && keys.every(k => parsedConfig[k] && typeof parsedConfig[k] === 'object' && typeof parsedConfig[k].command === 'string');
    if (looksLikeServers) {
      serversObj = parsedConfig;
      isTopLevel = true;
    } else {
      return {
        success: false,
        modified: false,
        wrappedCount: 0,
        wrappedServers: [],
        alreadyShieldedCount: 0,
        filePath: resolvedPath,
        message: `No "mcpServers" object found in ${resolvedPath}`,
      };
    }
  }

  const serverNames = Object.keys(serversObj);
  const wrappedServers: string[] = [];
  let alreadyShieldedCount = 0;

  for (const serverName of serverNames) {
    const serverDef = serversObj[serverName];
    if (!serverDef || typeof serverDef !== 'object') continue;

    const originalCommand = serverDef.command;
    const originalArgs = Array.isArray(serverDef.args) ? serverDef.args : [];

    if (typeof originalCommand !== 'string' || !originalCommand.trim()) continue;

    // Check if already wrapped
    if (originalCommand.trim() === 'miseguard' || originalCommand.trim().endsWith('/miseguard') || originalCommand.trim().endsWith('\\miseguard')) {
      alreadyShieldedCount++;
      continue;
    }

    // Wrap command
    serverDef.command = 'miseguard';
    serverDef.args = ['proxy', '--', originalCommand, ...originalArgs];
    wrappedServers.push(serverName);
  }

  if (wrappedServers.length === 0) {
    return {
      success: true,
      modified: false,
      wrappedCount: 0,
      wrappedServers: [],
      alreadyShieldedCount,
      filePath: resolvedPath,
      message: `All servers in ${resolvedPath} are already shielded.`,
    };
  }

  // Create backup file
  const backupPath = `${resolvedPath}.bak`;
  try {
    fs.writeFileSync(backupPath, fileContent, 'utf-8');
  } catch (err: any) {
    return {
      success: false,
      modified: false,
      wrappedCount: 0,
      wrappedServers: [],
      alreadyShieldedCount,
      filePath: resolvedPath,
      message: `Failed to create backup at ${backupPath}: ${err.message}`,
    };
  }

  // Write updated configuration
  try {
    const newContent = JSON.stringify(parsedConfig, null, 2) + '\n';
    fs.writeFileSync(resolvedPath, newContent, 'utf-8');
  } catch (err: any) {
    return {
      success: false,
      modified: false,
      wrappedCount: 0,
      wrappedServers: [],
      alreadyShieldedCount,
      backupPath,
      filePath: resolvedPath,
      message: `Failed to write updated configuration to ${resolvedPath}: ${err.message}`,
    };
  }

  return {
    success: true,
    modified: true,
    wrappedCount: wrappedServers.length,
    wrappedServers,
    alreadyShieldedCount,
    backupPath,
    filePath: resolvedPath,
    message: `Successfully shielded ${wrappedServers.length} server(s) in ${resolvedPath}`,
  };
}
