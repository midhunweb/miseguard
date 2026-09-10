import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function getVersion(): string {
  const candidates = [
    new URL('../../package.json', import.meta.url),
    new URL('../../../package.json', import.meta.url),
    new URL('../package.json', import.meta.url),
  ];

  for (const candidate of candidates) {
    try {
      const p = fileURLToPath(candidate);
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
    } catch {
      // try next candidate
    }
  }

  return '0.1.1';
}

export const VERSION = getVersion();
