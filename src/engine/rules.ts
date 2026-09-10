/**
 * MiSeGuard Deterministic Security Rules Matrix
 * Defines Green (Safe), Yellow (Caution/Dry-run), and Red (Hazardous/Block) rules.
 */

export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  level: RiskLevel;
  baseScore: number; // 0 - 100
  category: 'FILESYSTEM' | 'GIT' | 'CREDENTIALS' | 'SYSTEM' | 'NETWORK' | 'PROCESS' | 'ENVIRONMENT';
  remediation?: string;
}

export const SENSITIVE_PATHS = [
  // Root & OS directories
  '/', '/*', '/root', '/etc', '/etc/shadow', '/etc/passwd', '/etc/sudoers',
  '/boot', '/sys', '/proc', '/dev',
  'C:\\', 'C:\\Windows', 'C:\\Windows\\System32', 'C:\\Program Files',
  // Credentials & Keys
  '.env', '.env.*', '.env.local', '.env.production',
  '~/.ssh', '~/.ssh/*', 'id_rsa', 'id_ed25519', 'known_hosts', 'authorized_keys',
  '~/.aws', '~/.aws/*', '~/.aws/credentials', '~/.aws/config',
  '~/.kube', '~/.kube/config',
  '~/.npmrc', '~/.pypirc', '~/.docker/config.json',
  '~/.gnupg', '~/.gnupg/*',
  // Core VCS
  '.git', '.git/*', '.git/config', '.git/hooks'
];

export const SENSITIVE_PATH_PATTERNS = [
  /(?:^|[\\/])\.env(?:\..*)?$/i,
  /(?:^|[\\/])\.ssh(?:[\\/]|$)/i,
  /(?:^|[\\/])id_(?:rsa|dsa|ecdsa|ed25519)/i,
  /(?:^|[\\/])\.aws(?:[\\/]|$)/i,
  /(?:^|[\\/])\.kube(?:[\\/]config)?$/i,
  /(?:^|[\\/])\.(?:npmrc|pypirc|netrc)$/i,
  /(?:^|[\\/])\.git(?:[\\/]|$)/i,
  /^\/(?:etc|root|boot|sys|proc|dev)(?:[\\/]|$)/i,
  /^[a-zA-Z]:\\(?:Windows|Program Files|ProgramData)(?:[\\/]|$)/i,
];

export const SECURITY_RULES: Record<string, SecurityRule> = {
  // RED RULES (70 - 100)
  'RED_ROOT_DELETION': {
    id: 'RED_ROOT_DELETION',
    name: 'Recursive Root / Critical Deletion',
    description: 'Attempts recursive deletion targeting root directory, home directory, or wildcard asterisks',
    level: 'RED',
    baseScore: 100,
    category: 'FILESYSTEM',
    remediation: 'Restrict deletion to explicit relative subpaths within the workspace.',
  },
  'RED_GIT_DESTRUCTIVE': {
    id: 'RED_GIT_DESTRUCTIVE',
    name: 'Destructive Git Reset / Clean / Force Push',
    description: 'Destructive git operations that cause irrecoverable loss of uncommitted work or remote history',
    level: 'RED',
    baseScore: 90,
    category: 'GIT',
    remediation: 'Use "git stash" or non-destructive branch resets instead of "git reset --hard" or "git clean -fdx".',
  },
  'RED_CREDENTIAL_MUTATION_OR_LEAK': {
    id: 'RED_CREDENTIAL_MUTATION_OR_LEAK',
    name: 'Credential Exposure / Exfiltration',
    description: 'Attempting to read, exfiltrate, or overwrite sensitive credential files (.env, SSH keys, AWS config)',
    level: 'RED',
    baseScore: 95,
    category: 'CREDENTIALS',
    remediation: 'Use environment secret managers or mock configuration templates (.env.example).',
  },
  'RED_PIPE_TO_SHELL': {
    id: 'RED_PIPE_TO_SHELL',
    name: 'Remote Code Pipeline Execution',
    description: 'Piping remote network payload (curl/wget) directly into shell interpreter (sh/bash/python)',
    level: 'RED',
    baseScore: 95,
    category: 'NETWORK',
    remediation: 'Download scripts to a temporary file, inspect contents, and execute explicitly.',
  },
  'RED_REVERSE_SHELL_OR_EXPLOIT': {
    id: 'RED_REVERSE_SHELL_OR_EXPLOIT',
    name: 'Reverse Shell / Socket Binding Pattern',
    description: 'Suspicious socket redirection, netcat execution flags, or fork bomb pattern detected',
    level: 'RED',
    baseScore: 100,
    category: 'SYSTEM',
    remediation: 'Security violation: socket execution primitives are prohibited.',
  },
  'RED_PRIVILEGE_ESCALATION': {
    id: 'RED_PRIVILEGE_ESCALATION',
    name: 'Privilege Escalation (Sudo / Root Privileges)',
    description: 'Attempting sudo or administrator escalation in tool runtimes',
    level: 'RED',
    baseScore: 85,
    category: 'SYSTEM',
    remediation: 'Run operations using standard non-root workspace permissions.',
  },
  'RED_RAW_DISK_WRITE': {
    id: 'RED_RAW_DISK_WRITE',
    name: 'Raw Disk / Partition Overwrite',
    description: 'Using low-level disk tools like dd, mkfs, fdisk, parted against block devices',
    level: 'RED',
    baseScore: 100,
    category: 'SYSTEM',
    remediation: 'Low-level disk modification is strictly prohibited.',
  },

  // YELLOW RULES (30 - 69)
  'YELLOW_GLOBAL_PACKAGE_INSTALL': {
    id: 'YELLOW_GLOBAL_PACKAGE_INSTALL',
    name: 'Global Package Mutation',
    description: 'Installing packages globally (npm install -g, pip install --user) outside local workspace',
    level: 'YELLOW',
    baseScore: 45,
    category: 'ENVIRONMENT',
    remediation: 'Install dependencies locally within the project scope.',
  },
  'YELLOW_KILL_PROCESS': {
    id: 'YELLOW_KILL_PROCESS',
    name: 'Process Termination',
    description: 'Terminating running processes via kill, pkill, or taskkill',
    level: 'YELLOW',
    baseScore: 50,
    category: 'PROCESS',
    remediation: 'Ensure only agent-spawned background task PIDs are targeted.',
  },
  'YELLOW_RECURSIVE_CHMOD': {
    id: 'YELLOW_RECURSIVE_CHMOD',
    name: 'Recursive Permission Mutation',
    description: 'Modifying filesystem permissions recursively (chmod -R, chown -R)',
    level: 'YELLOW',
    baseScore: 55,
    category: 'FILESYSTEM',
    remediation: 'Apply file permissions to specific individual files rather than recursive trees.',
  },
  'YELLOW_CRITICAL_CONFIG_MUTATION': {
    id: 'YELLOW_CRITICAL_CONFIG_MUTATION',
    name: 'Build / Workflow Configuration Mutation',
    description: 'Modifying CI/CD pipelines (.github/workflows) or core project manifests',
    level: 'YELLOW',
    baseScore: 40,
    category: 'FILESYSTEM',
    remediation: 'Dry-run delta analysis is recommended before applying CI/CD configuration changes.',
  },
  'YELLOW_REMOTE_DOWNLOAD': {
    id: 'YELLOW_REMOTE_DOWNLOAD',
    name: 'Remote File Ingestion',
    description: 'Downloading binaries or scripts from external URLs without direct pipe',
    level: 'YELLOW',
    baseScore: 35,
    category: 'NETWORK',
    remediation: 'Verify checksums and origin domain of downloaded artifacts.',
  },
  'YELLOW_PUBLISH_OR_RELEASE': {
    id: 'YELLOW_PUBLISH_OR_RELEASE',
    name: 'Package Publication / Deployment',
    description: 'Triggering release commands (npm publish, docker push, terraform apply)',
    level: 'YELLOW',
    baseScore: 60,
    category: 'ENVIRONMENT',
    remediation: 'Requires explicit dry-run or developer review step.',
  },

  // GREEN RULES (0 - 29)
  'GREEN_READ_ONLY_INSPECTION': {
    id: 'GREEN_READ_ONLY_INSPECTION',
    name: 'Read-Only Workspace Inspection',
    description: 'Safe query commands (ls, cat, git status, grep, find, pwd, echo)',
    level: 'GREEN',
    baseScore: 0,
    category: 'FILESYSTEM',
  },
  'GREEN_LOCAL_TEST_AND_BUILD': {
    id: 'GREEN_LOCAL_TEST_AND_BUILD',
    name: 'Isolated Build & Test Run',
    description: 'Running project tests, linting, or compilation (npm test, tsc, cargo test)',
    level: 'GREEN',
    baseScore: 10,
    category: 'ENVIRONMENT',
  },
  'GREEN_LOCAL_FILE_EDIT': {
    id: 'GREEN_LOCAL_FILE_EDIT',
    name: 'Scoped Workspace File Edit',
    description: 'Creating or editing non-sensitive source files within active workspace',
    level: 'GREEN',
    baseScore: 15,
    category: 'FILESYSTEM',
  },
};
