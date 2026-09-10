import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SECURITY_RULES } from '../src/engine/rules.js';
import { isSensitivePath, isBroadWildcard } from '../src/engine/blast-radius.js';

describe('Security Rules & Sensitivity Checks', () => {
  it('should have properly structured rule definitions', () => {
    for (const [id, rule] of Object.entries(SECURITY_RULES)) {
      assert.strictEqual(id, rule.id);
      assert.ok(['GREEN', 'YELLOW', 'RED'].includes(rule.level));
      assert.ok(rule.baseScore >= 0 && rule.baseScore <= 100);
      assert.ok(rule.name.length > 0);
      assert.ok(rule.description.length > 0);
    }
  });

  it('should accurately identify sensitive files and directories', () => {
    assert.strictEqual(isSensitivePath('.env'), true);
    assert.strictEqual(isSensitivePath('.env.production'), true);
    assert.strictEqual(isSensitivePath('/etc/shadow'), true);
    assert.strictEqual(isSensitivePath('/etc/passwd'), true);
    assert.strictEqual(isSensitivePath('~/.ssh/id_rsa'), true);
    assert.strictEqual(isSensitivePath('.git/config'), true);
    assert.strictEqual(isSensitivePath('C:\\Windows\\System32\\drivers'), true);
    assert.strictEqual(isSensitivePath('/'), true);
    assert.strictEqual(isSensitivePath('~'), true);

    // Non-sensitive files
    assert.strictEqual(isSensitivePath('src/index.ts'), false);
    assert.strictEqual(isSensitivePath('README.md'), false);
    assert.strictEqual(isSensitivePath('package.json'), false);
  });

  it('should identify broad wildcards for deletions', () => {
    assert.strictEqual(isBroadWildcard('*'), true);
    assert.strictEqual(isBroadWildcard('./*'), true);
    assert.strictEqual(isBroadWildcard('.'), true);
    assert.strictEqual(isBroadWildcard('/*'), true);

    assert.strictEqual(isBroadWildcard('*.ts'), false);
    assert.strictEqual(isBroadWildcard('dist'), false);
  });
});
