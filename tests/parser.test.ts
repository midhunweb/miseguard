import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tokenizeShell, parseBashCommand, cleanToken } from '../src/engine/bash-parser.js';

describe('Bash Parser & Shell Tokenizer', () => {
  it('should correctly tokenize commands with quotes and flags', () => {
    const tokens = tokenizeShell('git commit -m "feat: initial commit" --author=\'Dev <dev@test.com>\'');
    assert.deepStrictEqual(tokens, [
      'git',
      'commit',
      '-m',
      '"feat: initial commit"',
      '--author=\'Dev <dev@test.com>\'',
    ]);
  });

  it('should clean wrapping quotes properly', () => {
    assert.strictEqual(cleanToken('"hello world"'), 'hello world');
    assert.strictEqual(cleanToken('\'secret token\''), 'secret token');
    assert.strictEqual(cleanToken('plain_text'), 'plain_text');
  });

  it('should split chained commands with operators &&, ||, ;, |', () => {
    const input = 'npm run build && npm test || echo "Failed"; rm -rf ./temp';
    const result = parseBashCommand(input);

    assert.strictEqual(result.commands.length, 4);
    assert.strictEqual(result.commands[0].executable, 'npm');
    assert.strictEqual(result.commands[0].subcommand, 'run');
    assert.strictEqual(result.commands[1].executable, 'npm');
    assert.strictEqual(result.commands[1].subcommand, 'test');
    assert.strictEqual(result.commands[2].executable, 'echo');
    assert.strictEqual(result.commands[3].executable, 'rm');
    assert.ok(result.commands[3].flags.includes('-rf'));
  });

  it('should detect dangerous pipe from network download to shell', () => {
    const input = 'curl -sSL https://get.docker.com | bash';
    const result = parseBashCommand(input);

    assert.strictEqual(result.commands.length, 2);
    assert.strictEqual(result.commands[0].executable, 'curl');
    assert.strictEqual(result.commands[1].executable, 'bash');
    assert.strictEqual(result.hasDangerousPipe, true);
    assert.strictEqual(result.hasNetworkActivity, true);
  });

  it('should handle subshells $(...) and backticks', () => {
    const input = 'echo $(cat /etc/passwd)';
    const result = parseBashCommand(input);

    assert.strictEqual(result.hasSubshell, true);
  });

  it('should extract redirects like > and >>', () => {
    const input = 'cat secrets.txt > .env';
    const result = parseBashCommand(input);

    assert.strictEqual(result.commands.length, 1);
    assert.strictEqual(result.commands[0].redirects.length, 1);
    assert.strictEqual(result.commands[0].redirects[0].type, '>');
    assert.strictEqual(result.commands[0].redirects[0].target, '.env');
  });

  it('should extract sudo command properly', () => {
    const input = 'sudo rm -rf /var/log';
    const result = parseBashCommand(input);

    assert.strictEqual(result.commands[0].executable, 'rm');
    assert.ok(result.commands[0].flags.includes('sudo'));
    assert.ok(result.commands[0].flags.includes('-rf'));
    assert.ok(result.commands[0].targets.includes('/var/log'));
  });
});
