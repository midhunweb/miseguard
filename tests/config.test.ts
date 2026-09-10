import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfigSync, getDefaultConfig, isAllowlisted, isProtectedByConfig, type MiseGuardConfig } from '../src/config/index.js';
import { evaluateShellCommand, evaluateFileMutation } from '../src/engine/blast-radius.js';
import { McpHandler, type JsonRpcRequest } from '../src/proxy/mcp-handler.js';

describe('MiSeGuard Configuration & Override Tests', () => {
  describe('Config Loader Defaults & Discovery', () => {
    it('should load default configuration when no file exists', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-test-cfg-'));
      try {
        const cfg = loadConfigSync(emptyDir);
        assert.strictEqual(cfg.mode, 'strict');
        assert.strictEqual(cfg.thresholds?.block, 70);
        assert.strictEqual(cfg.thresholds?.dryRun, 30);
        assert.deepStrictEqual(cfg.allowlist, []);
        assert.ok((cfg.protectedPaths?.length ?? 0) > 0);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('should discover and load miseguard.json in working directory', () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miseguard-test-cfg-'));
      try {
        const customJson = {
          mode: 'permissive',
          thresholds: { block: 85, dryRun: 40 },
          allowlist: ['npm run clean:*', 'echo *'],
          protectedPaths: ['*.pem', 'confidential/**'],
        };
        fs.writeFileSync(path.join(testDir, 'miseguard.json'), JSON.stringify(customJson), 'utf-8');

        const cfg = loadConfigSync(testDir);
        assert.strictEqual(cfg.mode, 'permissive');
        assert.strictEqual(cfg.thresholds?.block, 85);
        assert.strictEqual(cfg.thresholds?.dryRun, 40);
        assert.ok(cfg.allowlist?.includes('npm run clean:*'));
        assert.ok(cfg.protectedPaths?.includes('confidential/**'));
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Allowlist Pattern Overrides', () => {
    const config: MiseGuardConfig = {
      allowlist: [
        'npm run clean:*',
        'rm -rf ./build/temp',
        'generated/**',
      ],
    };

    it('should bypass risk scoring when command matches allowlist wildcard', () => {
      const result = evaluateShellCommand('npm run clean:all', undefined, config);
      assert.strictEqual(result.score, 0);
      assert.strictEqual(result.level, 'GREEN');
      assert.strictEqual(result.action, 'ALLOW');
      assert.ok(result.reasons[0].includes('allowlist'));
    });

    it('should bypass risk scoring for explicit allowlisted rm command', () => {
      const result = evaluateShellCommand('rm -rf ./build/temp', undefined, config);
      assert.strictEqual(result.score, 0);
      assert.strictEqual(result.level, 'GREEN');
      assert.strictEqual(result.action, 'ALLOW');
    });

    it('should bypass risk scoring for allowlisted file mutation target', () => {
      const result = evaluateFileMutation('generated/output.json', 'modify', '{}', config);
      assert.strictEqual(result.score, 0);
      assert.strictEqual(result.level, 'GREEN');
      assert.strictEqual(result.action, 'ALLOW');
    });
  });

  describe('Custom Protected Paths Elevate Hazard to RED', () => {
    const config: MiseGuardConfig = {
      protectedPaths: [
        '*.pem',
        '*.key',
        'confidential/*',
        'secrets.json',
      ],
    };

    it('should block file deletion targeting custom protected path (*.pem)', () => {
      const result = evaluateFileMutation('server.pem', 'delete', undefined, config);
      assert.strictEqual(result.level, 'RED');
      assert.strictEqual(result.action, 'BLOCK');
      assert.ok(result.score >= 70);
    });

    it('should block file modification targeting custom protected path (secrets.json)', () => {
      const result = evaluateFileMutation('secrets.json', 'modify', '{"key":"val"}', config);
      assert.strictEqual(result.level, 'RED');
      assert.strictEqual(result.action, 'BLOCK');
      assert.ok(result.score >= 70);
    });

    it('should block shell command touching custom protected directory', () => {
      const result = evaluateShellCommand('cat confidential/keys.txt', undefined, config);
      assert.strictEqual(result.level, 'RED');
      assert.strictEqual(result.action, 'BLOCK');
    });
  });

  describe('Custom Threshold Overrides', () => {
    it('should trip RED block on lower threshold for yellow commands', () => {
      // Lower block threshold to 40 (global package install is base 45)
      const strictConfig: MiseGuardConfig = {
        thresholds: { block: 40, dryRun: 20 },
      };

      const result = evaluateShellCommand('npm install -g pnpm', undefined, strictConfig);
      assert.strictEqual(result.level, 'RED');
      assert.strictEqual(result.action, 'BLOCK');
    });
  });

  describe('MCP Filesystem Interception with Config', () => {
    it('should block direct read_file on protected credential file', async () => {
      const handler = new McpHandler({ autoDryRunYellow: false });
      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'req-read-1',
        method: 'tools/call',
        params: {
          name: 'read_file',
          arguments: {
            path: '.env',
          },
        },
      };

      const decision = await handler.handleRequest(req);
      assert.strictEqual(decision.action, 'SYNTHESIZE_RESPONSE');
      assert.strictEqual(decision.evaluation?.level, 'RED');
      assert.strictEqual(decision.response?.result?.isError, true);
      assert.ok(decision.response?.result?.content[0].text.includes('BLOCKED'));
    });

    it('should block direct write_file on custom protected path', async () => {
      const config: MiseGuardConfig = {
        protectedPaths: ['cert.pem'],
      };
      const handler = new McpHandler({ config, autoDryRunYellow: false });

      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'req-write-1',
        method: 'tools/call',
        params: {
          name: 'write_file',
          arguments: {
            path: 'cert.pem',
            content: 'CERT DATA',
          },
        },
      };

      const decision = await handler.handleRequest(req);
      assert.strictEqual(decision.action, 'SYNTHESIZE_RESPONSE');
      assert.strictEqual(decision.evaluation?.level, 'RED');
      assert.strictEqual(decision.response?.result?.isError, true);
    });

    it('should forward safe write_file on allowlisted path', async () => {
      const config: MiseGuardConfig = {
        allowlist: ['temp/**'],
      };
      const handler = new McpHandler({ config, autoDryRunYellow: false });

      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'req-write-2',
        method: 'tools/call',
        params: {
          name: 'write_file',
          arguments: {
            path: 'temp/build.log',
            content: 'done',
          },
        },
      };

      const decision = await handler.handleRequest(req);
      assert.strictEqual(decision.action, 'FORWARD');
    });

    it('should block parent directory traversal in write_file', async () => {
      const handler = new McpHandler({ autoDryRunYellow: false });
      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'req-traversal-1',
        method: 'tools/call',
        params: {
          name: 'write_file',
          arguments: {
            path: '../../etc/passwd',
            content: 'root:x:0:0:...',
          },
        },
      };

      const decision = await handler.handleRequest(req);
      assert.strictEqual(decision.action, 'SYNTHESIZE_RESPONSE');
      assert.strictEqual(decision.evaluation?.level, 'RED');
      assert.strictEqual(decision.response?.result?.isError, true);
    });
  });
});
