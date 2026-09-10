/**
 * MiSeGuard Configuration Schema
 * Defines the configuration interface and default settings for MiSeGuard circuit breaker.
 */

export interface MiseGuardThresholds {
  /**
   * Blast-radius risk score threshold to trigger an immediate circuit breaker block.
   * Default: 70
   */
  block?: number;

  /**
   * Blast-radius risk score threshold to trigger an ephemeral dry-run sandbox inspection.
   * Default: 30
   */
  dryRun?: number;
}

export interface MiseGuardConfig {
  /**
   * Execution mode:
   * - "strict": All Red hazards block; Yellow operations trigger dry-run.
   * - "permissive": Warnings logged for Yellow; only Red hazards block.
   */
  mode?: 'strict' | 'permissive';

  /**
   * Risk scoring threshold overrides.
   */
  thresholds?: MiseGuardThresholds;

  /**
   * Glob patterns or prefix strings of commands or file paths that are unconditionally allowed (Green, Score 0).
   * Example: ["npm run clean:*", "echo *", "src/generated/**"]
   */
  allowlist?: string[];

  /**
   * Glob patterns of sensitive files or paths that will elevate risk directly to Red (>= 70).
   * Example: [".env*", "*.pem", "id_rsa*", "secrets/**"]
   */
  protectedPaths?: string[];
}

export const DEFAULT_PROTECTED_PATHS: string[] = [
  '.env*',
  '*.pem',
  '*.key',
  'id_rsa*',
  'id_dsa*',
  'id_ecdsa*',
  'id_ed25519*',
  '~/.ssh/*',
  '~/.aws/*',
  '~/.kube/*',
  '.git/*',
  '/etc/*',
  '/root/*',
  'C:\\Windows\\*',
];

export const DEFAULT_CONFIG: Required<MiseGuardConfig> = {
  mode: 'strict',
  thresholds: {
    block: 70,
    dryRun: 30,
  },
  allowlist: [],
  protectedPaths: DEFAULT_PROTECTED_PATHS,
};
