import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { wrapMcpConfigFile, findMcpConfigFile } from '../src/config/wrapper.js';
import { generateSnippet } from '../src/config/snippet.js';

describe('MiSeGuard MCP Config Wrapper & Snippet Generator', () => {
  describe('wrapMcpConfigFile Transformation', () => {
    it('should wrap single and multiple servers preserving arguments', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-wrap-test-'));
      const configPath = path.join(testDir, 'mcp.json');

      const originalMcp = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/repo'],
          },
          memory: {
            command: 'node',
            args: ['./dist/memory.js'],
          },
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(originalMcp, null, 2), 'utf-8');

      try {
        const result = wrapMcpConfigFile(configPath);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.modified, true);
        assert.strictEqual(result.wrappedCount, 2);
        assert.deepStrictEqual(result.wrappedServers, ['filesystem', 'memory']);

        // Check file was updated
        const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.strictEqual(updated.mcpServers.filesystem.command, 'miseguard');
        assert.deepStrictEqual(updated.mcpServers.filesystem.args, [
          'proxy',
          '--',
          'npx',
          '-y',
          '@modelcontextprotocol/server-filesystem',
          '/path/to/repo',
        ]);

        assert.strictEqual(updated.mcpServers.memory.command, 'miseguard');
        assert.deepStrictEqual(updated.mcpServers.memory.args, [
          'proxy',
          '--',
          'node',
          './dist/memory.js',
        ]);

        // Verify backup was created
        const backupPath = `${configPath}.bak`;
        assert.strictEqual(fs.existsSync(backupPath), true);
        const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        assert.strictEqual(backupContent.mcpServers.filesystem.command, 'npx');
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should be idempotent and not double-wrap on subsequent runs', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-wrap-test-'));
      const configPath = path.join(testDir, 'mcp.json');

      const originalMcp = {
        mcpServers: {
          git: {
            command: 'npx',
            args: ['-y', 'mcp-server-git'],
          },
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(originalMcp, null, 2), 'utf-8');

      try {
        // Run 1: Should wrap
        const res1 = wrapMcpConfigFile(configPath);
        assert.strictEqual(res1.wrappedCount, 1);
        assert.strictEqual(res1.modified, true);

        // Run 2: Should be idempotent
        const res2 = wrapMcpConfigFile(configPath);
        assert.strictEqual(res2.wrappedCount, 0);
        assert.strictEqual(res2.modified, false);
        assert.strictEqual(res2.alreadyShieldedCount, 1);
        assert.ok(res2.message.includes('already shielded'));

        // Check args were not multiplied
        const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.strictEqual(updated.mcpServers.git.command, 'miseguard');
        assert.deepStrictEqual(updated.mcpServers.git.args, [
          'proxy',
          '--',
          'npx',
          '-y',
          'mcp-server-git',
        ]);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should auto-discover .cursor/mcp.json if no path is passed', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-wrap-test-'));
      const cursorDir = path.join(testDir, '.cursor');
      fs.mkdirSync(cursorDir, { recursive: true });
      const configPath = path.join(cursorDir, 'mcp.json');

      fs.writeFileSync(
        configPath,
        JSON.stringify({ mcpServers: { terminal: { command: 'bash-mcp', args: [] } } }),
        'utf-8'
      );

      try {
        const discovered = findMcpConfigFile(testDir);
        assert.strictEqual(discovered, configPath);

        const result = wrapMcpConfigFile(undefined, testDir);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.wrappedCount, 1);
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should return graceful message when no MCP config is found', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-wrap-test-'));
      try {
        const result = wrapMcpConfigFile(undefined, emptyDir);
        assert.strictEqual(result.success, false);
        assert.ok(result.message.includes('No MCP configuration file found'));
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('generateSnippet Presets', () => {
    it('should generate filesystem snippet with default path', () => {
      const snippet = generateSnippet({ tool: 'filesystem' });
      assert.strictEqual(snippet.name, 'filesystem');
      assert.strictEqual(snippet.serverDef.command, 'miseguard');
      assert.deepStrictEqual(snippet.serverDef.args, [
        'proxy',
        '--',
        'npx',
        '-y',
        '@modelcontextprotocol/server-filesystem',
        '.',
      ]);
    });

    it('should generate bash snippet with terminal name', () => {
      const snippet = generateSnippet({ tool: 'bash' });
      assert.strictEqual(snippet.name, 'terminal');
      assert.strictEqual(snippet.serverDef.command, 'miseguard');
      assert.deepStrictEqual(snippet.serverDef.args, [
        'proxy',
        '--',
        'npx',
        '-y',
        '@modelcontextprotocol/server-bash',
      ]);
    });

    it('should generate git snippet with custom path and name', () => {
      const snippet = generateSnippet({ tool: 'git', name: 'my-repo-git', path: '/workspace/project' });
      assert.strictEqual(snippet.name, 'my-repo-git');
      assert.deepStrictEqual(snippet.serverDef.args, [
        'proxy',
        '--',
        'npx',
        '-y',
        'mcp-server-git',
        '--repository',
        '/workspace/project',
      ]);
    });

    it('should generate custom tool snippet with custom cmd and args', () => {
      const snippet = generateSnippet({
        tool: 'custom',
        name: 'python-mcp',
        cmd: 'python',
        args: ['-m', 'my_mcp_server', '--port', '8000'],
      });

      assert.strictEqual(snippet.name, 'python-mcp');
      assert.strictEqual(snippet.serverDef.command, 'miseguard');
      assert.deepStrictEqual(snippet.serverDef.args, [
        'proxy',
        '--',
        'python',
        '-m',
        'my_mcp_server',
        '--port',
        '8000',
      ]);
    });
  });
});
