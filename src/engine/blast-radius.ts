/**
 * MiSeGuard Deterministic Blast-Radius Risk Scoring Engine
 * Computes a standardized 0-100 risk score based on multi-factor hazard vectors.
 */

import { parseBashCommand, type ParseResult, type ParsedCommand } from './bash-parser.js';
import { SECURITY_RULES, SENSITIVE_PATH_PATTERNS, type RiskLevel, type SecurityRule } from './rules.js';
import { isAllowlisted, isProtectedByConfig, type MiseGuardConfig } from '../config/index.js';

export interface EvaluationResult {
  score: number; // 0 - 100
  level: RiskLevel;
  action: 'ALLOW' | 'DRY_RUN' | 'BLOCK';
  triggeredRules: SecurityRule[];
  reasons: string[];
  affectedTargets: string[];
  remediations: string[];
  metadata: {
    commandCount: number;
    hasDangerousPipe: boolean;
    hasSubshell: boolean;
    hasNetworkActivity: boolean;
    highestBaseScore: number;
  };
}

/**
 * Checks if a target path matches sensitive, protected, or credential paths.
 */
export function isSensitivePath(target: string, customProtectedPaths?: string[]): boolean {
  if (!target) return false;
  const normalized = target.trim().replace(/\\/g, '/');

  // Exact root or home shortcuts or directory traversals
  if (
    normalized === '/' ||
    normalized === '/*' ||
    normalized === '~' ||
    normalized === '~/' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    normalized.includes('..\\')
  ) {
    return true;
  }

  // Check against regex patterns
  if (SENSITIVE_PATH_PATTERNS.some(p => p.test(target))) {
    return true;
  }

  // Check against custom protected paths
  if (customProtectedPaths && customProtectedPaths.length > 0) {
    if (isProtectedByConfig(target, customProtectedPaths)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if target represents a broad wildcard deletion (e.g., *, ./*, .).
 */
export function isBroadWildcard(target: string): boolean {
  const t = target.trim();
  return t === '*' || t === './*' || t === '.' || t === '../*' || t === '/*';
}

/**
 * Evaluates risk for a raw shell command string.
 */
export function evaluateShellCommand(
  commandStr: string,
  workspaceDir?: string,
  config?: MiseGuardConfig
): EvaluationResult {
  const blockThreshold = config?.thresholds?.block ?? 70;
  const dryRunThreshold = config?.thresholds?.dryRun ?? 30;

  // 0. Check allowlist for instant bypass
  if (config?.allowlist && isAllowlisted(commandStr, config.allowlist)) {
    const greenRule = SECURITY_RULES['GREEN_READ_ONLY_INSPECTION'];
    return {
      score: 0,
      level: 'GREEN',
      action: 'ALLOW',
      triggeredRules: [greenRule],
      reasons: ['Command matched allowlist pattern: unconditionally permitted'],
      affectedTargets: [],
      remediations: [],
      metadata: {
        commandCount: 1,
        hasDangerousPipe: false,
        hasSubshell: false,
        hasNetworkActivity: false,
        highestBaseScore: 0,
      },
    };
  }

  const parseResult: ParseResult = parseBashCommand(commandStr);
  const triggeredRuleMap = new Map<string, SecurityRule>();
  const reasons: string[] = [];
  const affectedTargets: string[] = [];
  const remediations: string[] = [];

  let accumulatedScore = 0;
  let highestBase = 0;

  // 1. Check for dangerous remote pipes (e.g. curl ... | bash)
  if (parseResult.hasDangerousPipe) {
    const r = SECURITY_RULES['RED_PIPE_TO_SHELL'];
    triggeredRuleMap.set(r.id, r);
    reasons.push('Remote script payload piped directly into shell interpreter');
    if (r.remediation) remediations.push(r.remediation);
  }

  // 2. Check for socket exploit / reverse shell signatures
  if (
    /nc(?:\.traditional)?\s+-[a-z]*e\s+\/bin\/(?:sh|bash)/i.test(commandStr) ||
    /\/dev\/tcp\/[0-9.]+\/[0-9]+/i.test(commandStr) ||
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i.test(commandStr) || // fork bomb
    /mkfifo\s+.*\/tmp\/[a-z0-9]+\s*;\s*cat/i.test(commandStr)
  ) {
    const r = SECURITY_RULES['RED_REVERSE_SHELL_OR_EXPLOIT'];
    triggeredRuleMap.set(r.id, r);
    reasons.push('Reverse shell, socket redirection, or fork bomb signature detected');
    if (r.remediation) remediations.push(r.remediation);
  }

  // 3. Evaluate individual parsed subcommands
  for (const cmd of parseResult.commands) {
    evaluateSingleCommand(cmd, triggeredRuleMap, reasons, affectedTargets, remediations, config?.protectedPaths);
  }

  // 4. Check targets against custom protected paths
  if (config?.protectedPaths && config.protectedPaths.length > 0) {
    for (const target of affectedTargets) {
      if (isProtectedByConfig(target, config.protectedPaths)) {
        const r = SECURITY_RULES['RED_CREDENTIAL_MUTATION_OR_LEAK'];
        triggeredRuleMap.set(r.id, r);
        reasons.push(`Target matches configured protected path: ${target}`);
        highestBase = Math.max(highestBase, blockThreshold);
      }
    }
  }

  // Calculate highest base score
  for (const rule of triggeredRuleMap.values()) {
    if (rule.baseScore > highestBase) {
      highestBase = rule.baseScore;
    }
  }

  accumulatedScore = highestBase;

  // Multipliers / compounding risks
  if (parseResult.commands.length > 1 && parseResult.hasNetworkActivity && affectedTargets.some(t => isSensitivePath(t, config?.protectedPaths))) {
    accumulatedScore += 25;
    reasons.push('Potential credential exfiltration via network command pipeline');
  }

  // Cap at 100
  const finalScore = Math.min(100, Math.max(0, accumulatedScore));

  // Determine Level and Action based on configured thresholds
  let level: RiskLevel = 'GREEN';
  let action: 'ALLOW' | 'DRY_RUN' | 'BLOCK' = 'ALLOW';

  if (finalScore >= blockThreshold) {
    level = 'RED';
    action = 'BLOCK';
  } else if (finalScore >= dryRunThreshold) {
    level = 'YELLOW';
    action = 'DRY_RUN';
  } else {
    level = 'GREEN';
    action = 'ALLOW';
  }

  return {
    score: finalScore,
    level,
    action,
    triggeredRules: Array.from(triggeredRuleMap.values()),
    reasons,
    affectedTargets: Array.from(new Set(affectedTargets)),
    remediations: Array.from(new Set(remediations)),
    metadata: {
      commandCount: parseResult.commands.length,
      hasDangerousPipe: parseResult.hasDangerousPipe,
      hasSubshell: parseResult.hasSubshell,
      hasNetworkActivity: parseResult.hasNetworkActivity,
      highestBaseScore: highestBase,
    },
  };
}

/**
 * Evaluates risk for file mutation tools (e.g. write_file, edit_file, delete_file).
 */
export function evaluateFileMutation(
  filePath: string,
  operation: 'create' | 'modify' | 'delete',
  content?: string,
  config?: MiseGuardConfig
): EvaluationResult {
  const blockThreshold = config?.thresholds?.block ?? 70;
  const dryRunThreshold = config?.thresholds?.dryRun ?? 30;

  // Check allowlist
  if (config?.allowlist && isAllowlisted(filePath, config.allowlist)) {
    const r = SECURITY_RULES['GREEN_LOCAL_FILE_EDIT'];
    return {
      score: 0,
      level: 'GREEN',
      action: 'ALLOW',
      triggeredRules: [r],
      reasons: ['Target path matched allowlist pattern: unconditionally permitted'],
      affectedTargets: [filePath],
      remediations: [],
      metadata: {
        commandCount: 1,
        hasDangerousPipe: false,
        hasSubshell: false,
        hasNetworkActivity: false,
        highestBaseScore: 0,
      },
    };
  }

  const triggeredRuleMap = new Map<string, SecurityRule>();
  const reasons: string[] = [];
  const affectedTargets: string[] = [filePath];
  const remediations: string[] = [];

  const isSensitive = isSensitivePath(filePath, config?.protectedPaths);
  const isTraversal = filePath.includes('..');

  let score = 10; // Default baseline for safe file mutation

  if (isTraversal) {
    const r = SECURITY_RULES['RED_ROOT_DELETION'];
    triggeredRuleMap.set(r.id, r);
    reasons.push(`Parent directory traversal attempt detected: ${filePath}`);
    score = Math.max(95, blockThreshold);
    if (r.remediation) remediations.push('Keep file operations strictly inside the active workspace directory.');
  } else if (isSensitive) {
    if (operation === 'delete') {
      const r = SECURITY_RULES['RED_ROOT_DELETION'];
      triggeredRuleMap.set(r.id, r);
      reasons.push(`Deletion of critical or protected path: ${filePath}`);
      score = Math.max(95, blockThreshold);
    } else {
      const r = SECURITY_RULES['RED_CREDENTIAL_MUTATION_OR_LEAK'];
      triggeredRuleMap.set(r.id, r);
      reasons.push(`Direct mutation of sensitive/protected configuration: ${filePath}`);
      score = Math.max(90, blockThreshold);
    }
  } else if (operation === 'delete') {
    const r = SECURITY_RULES['YELLOW_CRITICAL_CONFIG_MUTATION'];
    triggeredRuleMap.set(r.id, r);
    reasons.push(`Deletion of workspace file: ${filePath}`);
    score = 45;
  } else if (filePath.includes('.github/workflows') || filePath.endsWith('package.json') || filePath.endsWith('tsconfig.json')) {
    const r = SECURITY_RULES['YELLOW_CRITICAL_CONFIG_MUTATION'];
    triggeredRuleMap.set(r.id, r);
    reasons.push(`Mutation of core project configuration or CI/CD workflow: ${filePath}`);
    score = 45;
  } else {
    const r = SECURITY_RULES['GREEN_LOCAL_FILE_EDIT'];
    triggeredRuleMap.set(r.id, r);
    reasons.push(`Scoped workspace file edit: ${filePath}`);
    score = 15;
  }

  let level: RiskLevel = 'GREEN';
  let action: 'ALLOW' | 'DRY_RUN' | 'BLOCK' = 'ALLOW';

  if (score >= blockThreshold) {
    level = 'RED';
    action = 'BLOCK';
  } else if (score >= dryRunThreshold) {
    level = 'YELLOW';
    action = 'DRY_RUN';
  }

  return {
    score,
    level,
    action,
    triggeredRules: Array.from(triggeredRuleMap.values()),
    reasons,
    affectedTargets,
    remediations,
    metadata: {
      commandCount: 1,
      hasDangerousPipe: false,
      hasSubshell: false,
      hasNetworkActivity: false,
      highestBaseScore: score,
    },
  };
}

/**
 * Analyzes a single parsed command and adds detected violations.
 */
function evaluateSingleCommand(
  cmd: ParsedCommand,
  rules: Map<string, SecurityRule>,
  reasons: string[],
  targets: string[],
  remediations: string[],
  customProtectedPaths?: string[]
): void {
  const { executable, subcommand, flags, namedFlags, targets: cmdTargets, redirects } = cmd;

  // Track targets
  for (const t of cmdTargets) targets.push(t);
  for (const r of redirects) targets.push(r.target);

  // 1. Sudo / Privilege Escalation
  if (flags.includes('sudo') || flags.includes('doas') || executable === 'sudo' || executable === 'doas') {
    const r = SECURITY_RULES['RED_PRIVILEGE_ESCALATION'];
    rules.set(r.id, r);
    reasons.push('Attempting privilege escalation via sudo/doas');
    if (r.remediation) remediations.push(r.remediation);
  }

  // 2. Raw Disk / Low-Level Partition Tools
  if (['dd', 'mkfs', 'fdisk', 'parted', 'gparted', 'format'].includes(executable)) {
    const r = SECURITY_RULES['RED_RAW_DISK_WRITE'];
    rules.set(r.id, r);
    reasons.push(`Low-level disk format/write command detected: ${executable}`);
    if (r.remediation) remediations.push(r.remediation);
  }

  // 3. Deletion Commands (rm, rmdir, del, Remove-Item)
  if (['rm', 'unlink', 'rmdir', 'del', 'erase', 'remove-item'].includes(executable)) {
    const hasRecursive = flags.some(f => /-[a-zA-Z]*r/i.test(f) || f === '--recursive' || /-[a-zA-Z]*s/i.test(f));
    const hasForce = flags.some(f => /-[a-zA-Z]*f/i.test(f) || f === '--force' || /-[a-zA-Z]*q/i.test(f));

    const touchesSensitive = cmdTargets.some(t => isSensitivePath(t, customProtectedPaths));
    const touchesBroadWildcard = cmdTargets.some(isBroadWildcard);

    if (hasRecursive && (touchesSensitive || touchesBroadWildcard || cmdTargets.length === 0)) {
      const r = SECURITY_RULES['RED_ROOT_DELETION'];
      rules.set(r.id, r);
      reasons.push(`Recursive force deletion targeting critical path or wildcard: ${cmdTargets.join(', ') || 'root'}`);
      if (r.remediation) remediations.push(r.remediation);
    } else if (touchesSensitive) {
      const r = SECURITY_RULES['RED_CREDENTIAL_MUTATION_OR_LEAK'];
      rules.set(r.id, r);
      reasons.push(`Deletion of sensitive credential/OS path: ${cmdTargets.join(', ')}`);
      if (r.remediation) remediations.push(r.remediation);
    }
  }

  // 4. Destructive Git Commands
  if (executable === 'git') {
    const isHardReset = subcommand === 'reset' && flags.some(f => f === '--hard');
    const isCleanForce = subcommand === 'clean' && flags.some(f => f.includes('f') || f === '--force');
    const isForcePush = subcommand === 'push' && flags.some(f => f === '-f' || f === '--force' || f === '--force-with-lease');
    const isCheckoutForce = subcommand === 'checkout' && flags.some(f => f === '-f' || f === '--force');

    if (isHardReset || isCleanForce || isForcePush || isCheckoutForce) {
      const r = SECURITY_RULES['RED_GIT_DESTRUCTIVE'];
      rules.set(r.id, r);
      reasons.push(`Destructive Git action (${subcommand} ${flags.join(' ')}) risks irrecoverable repository data loss`);
      if (r.remediation) remediations.push(r.remediation);
    }
  }

  // 5. Sensitive credentials read/write check
  const sensitiveTarget = cmdTargets.find(t => isSensitivePath(t, customProtectedPaths)) || redirects.map(r => r.target).find(t => isSensitivePath(t, customProtectedPaths));
  if (sensitiveTarget) {
    if (['cat', 'type', 'more', 'less', 'grep', 'cp', 'scp', 'curl', 'wget'].includes(executable)) {
      const r = SECURITY_RULES['RED_CREDENTIAL_MUTATION_OR_LEAK'];
      rules.set(r.id, r);
      reasons.push(`Attempt to read or exfiltrate sensitive credential file: ${sensitiveTarget}`);
      if (r.remediation) remediations.push(r.remediation);
    }
  }

  // 6. Global package installs
  if (
    (executable === 'npm' && subcommand === 'install' && flags.some(f => f === '-g' || f === '--global')) ||
    (executable === 'pip' && subcommand === 'install' && flags.some(f => f === '--user' || f === '-g')) ||
    (executable === 'cargo' && subcommand === 'install')
  ) {
    const r = SECURITY_RULES['YELLOW_GLOBAL_PACKAGE_INSTALL'];
    rules.set(r.id, r);
    reasons.push(`Global package installation modifies system environment: ${executable} ${subcommand}`);
    if (r.remediation) remediations.push(r.remediation);
  }

  // 7. Process termination
  if (['kill', 'killall', 'pkill', 'taskkill', 'stop-process'].includes(executable)) {
    const r = SECURITY_RULES['YELLOW_KILL_PROCESS'];
    rules.set(r.id, r);
    reasons.push(`Process kill signal invoked: ${executable} ${cmdTargets.join(' ')}`);
    if (r.remediation) remediations.push(r.remediation);
  }

  // 8. Recursive chmod/chown
  if (['chmod', 'chown'].includes(executable) && flags.some(f => f === '-R' || f === '--recursive')) {
    const r = SECURITY_RULES['YELLOW_RECURSIVE_CHMOD'];
    rules.set(r.id, r);
    reasons.push(`Recursive permission alteration on: ${cmdTargets.join(', ')}`);
    if (r.remediation) remediations.push(r.remediation);
  }

  // 9. Remote downloads without execution
  if (['curl', 'wget'].includes(executable) && flags.some(f => f === '-O' || f === '-o' || f === '--output')) {
    const r = SECURITY_RULES['YELLOW_REMOTE_DOWNLOAD'];
    rules.set(r.id, r);
    reasons.push(`Downloading external asset: ${cmdTargets.join(', ')}`);
    if (r.remediation) remediations.push(r.remediation);
  }

  // 10. Publishing / Deploying
  if (
    (executable === 'npm' && subcommand === 'publish') ||
    (executable === 'docker' && subcommand === 'push') ||
    (executable === 'terraform' && (subcommand === 'apply' || subcommand === 'destroy'))
  ) {
    const r = SECURITY_RULES['YELLOW_PUBLISH_OR_RELEASE'];
    rules.set(r.id, r);
    reasons.push(`Publication/deployment step requires verification: ${executable} ${subcommand}`);
    if (r.remediation) remediations.push(r.remediation);
  }

  // 11. Read-only inspection commands (Green)
  if (
    ['ls', 'dir', 'pwd', 'echo', 'which', 'whoami', 'uname', 'cat', 'head', 'tail', 'grep', 'find'].includes(executable) &&
    rules.size === 0
  ) {
    const r = SECURITY_RULES['GREEN_READ_ONLY_INSPECTION'];
    rules.set(r.id, r);
  }

  // 12. Build & Test commands (Green)
  if (
    ['test', 'build', 'lint', 'check'].includes(subcommand || '') ||
    ['tsc', 'jest', 'vitest', 'pytest', 'cargo check'].includes(executable)
  ) {
    if (rules.size === 0) {
      const r = SECURITY_RULES['GREEN_LOCAL_TEST_AND_BUILD'];
      rules.set(r.id, r);
    }
  }
}
