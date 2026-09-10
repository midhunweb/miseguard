import { describe, it } from 'node:test';
import assert from 'node:assert';
import { McpHandler, type JsonRpcRequest } from '../src/proxy/mcp-handler.js';

describe('MCP Handler & JSON-RPC Circuit Breaker Interception', () => {
  const handler = new McpHandler({ autoDryRunYellow: false });

  it('should forward non-tools/call requests untouched (e.g. initialize, tools/list)', async () => {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    const decision = await handler.handleRequest(req);
    assert.strictEqual(decision.action, 'FORWARD');
  });

  it('should forward safe GREEN tool calls (e.g. ls, git status)', async () => {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'execute_command',
        arguments: {
          command: 'git status',
        },
      },
    };

    const decision = await handler.handleRequest(req);
    assert.strictEqual(decision.action, 'FORWARD');
    assert.strictEqual(decision.evaluation?.level, 'GREEN');
  });

  it('should synthesize a blocked JSON-RPC response for RED bash commands', async () => {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 'agent-req-99',
      method: 'tools/call',
      params: {
        name: 'execute_command',
        arguments: {
          command: 'rm -rf /',
        },
      },
    };

    const decision = await handler.handleRequest(req);
    assert.strictEqual(decision.action, 'SYNTHESIZE_RESPONSE');
    assert.strictEqual(decision.evaluation?.level, 'RED');

    assert.ok(decision.response);
    assert.strictEqual(decision.response.jsonrpc, '2.0');
    assert.strictEqual(decision.response.id, 'agent-req-99');
    assert.strictEqual(decision.response.result?.isError, true);
    assert.ok(decision.response.result?.content[0].text.includes('MiSeGuard Circuit Breaker'));
    assert.ok(decision.response.result?.content[0].text.includes('BLOCKED'));
  });

  it('should synthesize a blocked response when deleting .env via file tools', async () => {
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/call',
      params: {
        name: 'delete_file',
        arguments: {
          path: '.env',
        },
      },
    };

    const decision = await handler.handleRequest(req);
    assert.strictEqual(decision.action, 'SYNTHESIZE_RESPONSE');
    assert.strictEqual(decision.evaluation?.level, 'RED');
    assert.strictEqual(decision.response?.result?.isError, true);
  });
});
