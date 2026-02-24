/**
 * Archon Kernel — Kernel Purity Test (I2)
 *
 * Statically verifies that packages/kernel/src/ contains no imports of
 * forbidden side-effectful Node.js modules:
 *   - node:fs, fs (filesystem I/O)
 *   - node:child_process, child_process (subprocess execution)
 *   - node:net, net (raw network sockets)
 *
 * node:crypto is explicitly allowed: createHash is a pure deterministic
 * computation (not I/O), used for snapshot and input hashing (I4).
 *
 * This test fails at CI time if anyone reintroduces side effects into the
 * kernel package, preventing silent boundary violations.
 *
 * Approach: read all .ts source files under packages/kernel/src/ and
 * scan for forbidden import patterns. No exec, no build artifact scanning —
 * source scan is sufficient and deterministic.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the kernel src directory relative to this test file.
// __dirname equivalent for ESM:
const testDir = fileURLToPath(new URL('.', import.meta.url));
const kernelSrcDir = join(testDir, '..', 'src');

// ---------------------------------------------------------------------------
// Forbidden import patterns (applied to source file content)
// ---------------------------------------------------------------------------

/**
 * Each entry is a pattern that must NOT appear in kernel source files.
 * The label is used in the failure message.
 */
const FORBIDDEN_IMPORT_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: "node:fs",
    pattern: /from ['"]node:fs['"]/,
  },
  {
    label: "node:fs/promises",
    pattern: /from ['"]node:fs\/promises['"]/,
  },
  {
    label: "'fs' (bare)",
    pattern: /from ['"]fs['"]/,
  },
  {
    label: "node:child_process",
    pattern: /from ['"]node:child_process['"]/,
  },
  {
    label: "'child_process' (bare)",
    pattern: /from ['"]child_process['"]/,
  },
  {
    label: "node:net",
    pattern: /from ['"]node:net['"]/,
  },
  {
    label: "'net' (bare)",
    pattern: /from ['"]net['"]/,
  },
];

// ---------------------------------------------------------------------------
// Helper: recursively collect all .ts files under a directory
// ---------------------------------------------------------------------------

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// I2 — No kernel side effects
// ---------------------------------------------------------------------------

describe('I2: kernel package must not import forbidden side-effectful modules', () => {
  const sourceFiles = collectTsFiles(kernelSrcDir);

  it('kernel/src contains at least one .ts source file (sanity check)', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN_IMPORT_PATTERNS)(
    'no kernel source file imports $label',
    ({ label, pattern }) => {
      const violations: string[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(file, 'utf-8');
        if (pattern.test(content)) {
          // Resolve to a relative path for legibility in failure messages
          const rel = file.replace(kernelSrcDir + '/', '');
          violations.push(`  ${rel} contains forbidden import: ${label}`);
        }
      }

      expect(
        violations,
        `Kernel boundary violation — kernel/src must not import '${label}':\n` +
        violations.join('\n'),
      ).toHaveLength(0);
    },
  );

  it('kernel/src is permitted to import node:crypto (pure deterministic hashing)', () => {
    // Positive assertion: crypto import must exist in at least one file,
    // confirming the allowlist is not vacuously satisfied.
    const hasCrypto = sourceFiles.some((file) => {
      const content = readFileSync(file, 'utf-8');
      return /from ['"]node:crypto['"]/.test(content);
    });
    expect(hasCrypto).toBe(true);
  });
});
