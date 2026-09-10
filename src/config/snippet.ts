/**
 * MiSeGuard MCP Snippet Generator
 * Generates copy-pasteable JSON configuration blocks for agent GUI settings (Cursor, Antigravity, Claude, etc.).
 */

export type ToolPreset = 'filesystem' | 'bash' | 'git' | 'custom';

export interface SnippetOptions {
  tool?: ToolPreset;
  name?: string;
  path?: string;
  cmd?: string;
  args?: string[];
}

export interface GeneratedSnippet {
  name: string;
  serverDef: {
    command: string;
    args: string[];
  };
  jsonSnippet: string;
  fullMcpServersSnippet: string;
}

/**
 * Generates a shielded MCP server configuration definition and JSON snippet string.
 */
export function generateSnippet(options: SnippetOptions = {}): GeneratedSnippet {
  const tool: ToolPreset = options.tool || 'filesystem';
  const targetPath = options.path || '.';

  let defaultName = 'filesystem';
  let targetCmd = 'npx';
  let targetArgs: string[] = [];

  switch (tool) {
    case 'filesystem':
      defaultName = 'filesystem';
      targetCmd = 'npx';
      targetArgs = ['-y', '@modelcontextprotocol/server-filesystem', targetPath];
      break;

    case 'bash':
      defaultName = 'terminal';
      targetCmd = 'npx';
      targetArgs = ['-y', '@modelcontextprotocol/server-bash'];
      break;

    case 'git':
      defaultName = 'git';
      targetCmd = 'npx';
      targetArgs = ['-y', 'mcp-server-git', '--repository', targetPath];
      break;

    case 'custom':
      defaultName = 'custom-server';
      targetCmd = options.cmd || 'npx';
      targetArgs = options.args && options.args.length > 0 ? options.args : [];
      break;
  }

  const serverName = options.name || defaultName;

  const serverDef = {
    command: 'miseguard',
    args: ['proxy', '--', targetCmd, ...targetArgs],
  };

  const jsonSnippet = JSON.stringify(
    {
      [serverName]: serverDef,
    },
    null,
    2
  );

  const fullMcpServersSnippet = JSON.stringify(
    {
      mcpServers: {
        [serverName]: serverDef,
      },
    },
    null,
    2
  );

  return {
    name: serverName,
    serverDef,
    jsonSnippet,
    fullMcpServersSnippet,
  };
}
