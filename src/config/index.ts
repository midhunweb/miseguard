/**
 * MiSeGuard Configuration Loader
 * Discovers, parses, validates, and merges local configuration files with default settings.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import picomatch from 'picomatch';
import {
  type MiseGuardConfig,
  type MiseGuardThresholds,
  DEFAULT_CONFIG,
  DEFAULT_PROTECTED_PATHS,
} from './schema.js';

export * from './schema.js';
export * from './wrapper.js';
export * from './snippet.js';

const CONFIG_CANDIDATES = [
  'miseguard.json',
  '.miseguardrc.json',
  '.miseguardrc',
  'miseguard.config.json',
];

/**
 * Normalizes and validates raw user configuration options.
 */
function sanitizeConfig(raw: any): MiseGuardConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CONFIG };
  }

  const mode = raw.mode === 'permissive' ? 'permissive' : 'strict';

  const thresholds: MiseGuardThresholds = {
    block: typeof raw.thresholds?.block === 'number' ? Math.max(0, Math.min(100, raw.thresholds.block)) : DEFAULT_CONFIG.thresholds.block,
    dryRun: typeof raw.thresholds?.dryRun === 'number' ? Math.max(0, Math.min(100, raw.thresholds.dryRun)) : DEFAULT_CONFIG.thresholds.dryRun,
  };

  const allowlist: string[] = Array.isArray(raw.allowlist)
    ? raw.allowlist.filter((item: any) => typeof item === 'string' && item.trim().length > 0)
    : [];

  const rawProtected = Array.isArray(raw.protectedPaths)
    ? raw.protectedPaths.filter((item: any) => typeof item === 'string' && item.trim().length > 0)
    : [];

  const protectedPaths = Array.from(new Set([...DEFAULT_PROTECTED_PATHS, ...rawProtected]));

  return {
    mode,
    thresholds,
    allowlist,
    protectedPaths,
  };
}

/**
 * Synchronously loads and merges MiSeGuard configuration.
 */
export function loadConfigSync(cwd: string = process.cwd(), customConfigPath?: string): MiseGuardConfig {
  if (customConfigPath) {
    const resolvedPath = path.isAbsolute(customConfigPath) ? customConfigPath : path.resolve(cwd, customConfigPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        return sanitizeConfig(parsed);
      } catch (err: any) {
        console.error(`[MiSeGuard Warning] Failed to parse custom config at ${resolvedPath}: ${err.message}. Using defaults.`);
        return { ...DEFAULT_CONFIG };
      }
    } else {
      console.error(`[MiSeGuard Warning] Config file not found at ${resolvedPath}. Using defaults.`);
      return { ...DEFAULT_CONFIG };
    }
  }

  // Look for configuration candidates in cwd
  for (const candidate of CONFIG_CANDIDATES) {
    const candidatePath = path.resolve(cwd, candidate);
    if (fs.existsSync(candidatePath)) {
      try {
        const fileContent = fs.readFileSync(candidatePath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        return sanitizeConfig(parsed);
      } catch (err: any) {
        console.error(`[MiSeGuard Warning] Failed to parse config at ${candidatePath}: ${err.message}. Using defaults.`);
        return { ...DEFAULT_CONFIG };
      }
    }
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Asynchronously loads and merges MiSeGuard configuration.
 */
export async function loadConfig(cwd: string = process.cwd(), customConfigPath?: string): Promise<MiseGuardConfig> {
  return loadConfigSync(cwd, customConfigPath);
}

/**
 * Returns a pristine copy of default configuration.
 */
export function getDefaultConfig(): Required<MiseGuardConfig> {
  return {
    mode: DEFAULT_CONFIG.mode,
    thresholds: { ...DEFAULT_CONFIG.thresholds },
    allowlist: [...DEFAULT_CONFIG.allowlist],
    protectedPaths: [...DEFAULT_CONFIG.protectedPaths],
  };
}

/**
 * Checks if a command or target path matches any pattern in the allowlist.
 */
export function isAllowlisted(input: string, allowlist?: string[]): boolean {
  if (!input || !allowlist || allowlist.length === 0) return false;

  const trimmed = input.trim();

  for (const pattern of allowlist) {
    const p = pattern.trim();
    if (!p) continue;

    // Direct equality
    if (trimmed === p) return true;

    // Prefix wildcard check (e.g. "npm run clean:*" matching "npm run clean:all")
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      if (trimmed.startsWith(prefix)) return true;
    }

    // Glob matcher
    try {
      const isMatch = picomatch(p, { dot: true, nocase: true });
      if (isMatch(trimmed)) return true;
    } catch {
      // Fallback simple wildcard
      if (p.includes('*')) {
        const regex = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
        if (regex.test(trimmed)) return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a path matches custom or configured protected paths.
 */
export function isProtectedByConfig(targetPath: string, protectedPaths?: string[]): boolean {
  if (!targetPath || !protectedPaths || protectedPaths.length === 0) return false;

  const normalized = targetPath.trim().replace(/\\/g, '/');
  const basename = path.basename(normalized);

  for (const pattern of protectedPaths) {
    const p = pattern.trim().replace(/\\/g, '/');
    if (!p) continue;

    if (normalized === p || basename === p) return true;

    try {
      const isMatch = picomatch(p, { dot: true, nocase: true });
      if (isMatch(normalized) || isMatch(basename)) return true;
    } catch {
      if (p.includes('*')) {
        const regex = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
        if (regex.test(normalized) || regex.test(basename)) return true;
      }
    }
  }

  return false;
}
