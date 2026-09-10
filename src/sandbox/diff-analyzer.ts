/**
 * MiSeGuard Diff Analyzer
 * Compares directory snapshots or git worktree state to detect file mutations, deletions, additions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface FileDelta {
  path: string;
  relativePath: string;
  status: 'ADDED' | 'MODIFIED' | 'DELETED';
  oldSizeBytes?: number;
  newSizeBytes?: number;
  isSensitive: boolean;
}

export interface DiffReport {
  timestamp: string;
  totalChanges: number;
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  deltas: FileDelta[];
  hasSensitiveModifications: boolean;
}

export interface FileSnapshot {
  [relativePath: string]: {
    hash: string;
    size: number;
  };
}

/**
 * Computes SHA-256 hash of a file for content-change detection.
 */
function hashFile(filePath: string): string {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Recursively takes a snapshot of all files in a directory.
 */
export function snapshotDirectory(dirPath: string, maxFiles = 2000): FileSnapshot {
  const snapshot: FileSnapshot = {};
  if (!fs.existsSync(dirPath)) return snapshot;

  let fileCount = 0;

  function walk(current: string) {
    if (fileCount >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (fileCount >= maxFiles) break;
      const fullPath = path.join(current, entry.name);

      // Skip heavy ignore dirs like node_modules, .git
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        fileCount++;
        const relativePath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        try {
          const stats = fs.statSync(fullPath);
          snapshot[relativePath] = {
            hash: hashFile(fullPath),
            size: stats.size,
          };
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  walk(dirPath);
  return snapshot;
}

/**
 * Compares two snapshots and produces a structured DiffReport.
 */
export function compareSnapshots(before: FileSnapshot, after: FileSnapshot, isSensitiveChecker?: (p: string) => boolean): DiffReport {
  const deltas: FileDelta[] = [];
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));

  let addedCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;

  // Added or Modified
  for (const relPath of afterKeys) {
    const afterItem = after[relPath];
    const isSensitive = isSensitiveChecker ? isSensitiveChecker(relPath) : false;

    if (!beforeKeys.has(relPath)) {
      addedCount++;
      deltas.push({
        path: relPath,
        relativePath: relPath,
        status: 'ADDED',
        newSizeBytes: afterItem.size,
        isSensitive,
      });
    } else {
      const beforeItem = before[relPath];
      if (beforeItem.hash !== afterItem.hash) {
        modifiedCount++;
        deltas.push({
          path: relPath,
          relativePath: relPath,
          status: 'MODIFIED',
          oldSizeBytes: beforeItem.size,
          newSizeBytes: afterItem.size,
          isSensitive,
        });
      }
    }
  }

  // Deleted
  for (const relPath of beforeKeys) {
    if (!afterKeys.has(relPath)) {
      const beforeItem = before[relPath];
      const isSensitive = isSensitiveChecker ? isSensitiveChecker(relPath) : false;
      deletedCount++;
      deltas.push({
        path: relPath,
        relativePath: relPath,
        status: 'DELETED',
        oldSizeBytes: beforeItem.size,
        isSensitive,
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalChanges: deltas.length,
    addedCount,
    modifiedCount,
    deletedCount,
    deltas,
    hasSensitiveModifications: deltas.some(d => d.isSensitive),
  };
}
