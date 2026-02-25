/**
 * Archon Runtime Host — ARCHON_HOME Resolution Tests
 *
 * Verifies that getArchonDir() honors the full precedence chain implemented
 * by resolveArchonHome():
 *
 *   AH-U1: ARCHON_HOME env var is honored when set
 *   AH-U2: ARCHON_STATE_DIR env var is honored when ARCHON_HOME is absent
 *   AH-U3: Default fallback is an absolute path when neither env var is set
 *
 * Isolation: each test saves and restores both ARCHON_HOME and ARCHON_STATE_DIR
 * to avoid cross-test contamination.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute } from 'node:path';
import { getArchonDir } from '../src/state/project-store.js';

// ---------------------------------------------------------------------------
// Env var save/restore helper
// ---------------------------------------------------------------------------

let savedArchonHome: string | undefined;
let savedArchonStateDir: string | undefined;

beforeEach(() => {
  savedArchonHome = process.env['ARCHON_HOME'];
  savedArchonStateDir = process.env['ARCHON_STATE_DIR'];
});

afterEach(() => {
  if (savedArchonHome === undefined) {
    delete process.env['ARCHON_HOME'];
  } else {
    process.env['ARCHON_HOME'] = savedArchonHome;
  }
  if (savedArchonStateDir === undefined) {
    delete process.env['ARCHON_STATE_DIR'];
  } else {
    process.env['ARCHON_STATE_DIR'] = savedArchonStateDir;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ARCHON_HOME resolution (getArchonDir)', () => {
  it('AH-U1: ARCHON_HOME env var is honored when set', () => {
    // Use an existing temp dir so resolveArchonHome() mkdirSync is a no-op.
    const tmpDir = mkdtempSync(`${tmpdir()}/archon-ah-u1-`);
    process.env['ARCHON_HOME'] = tmpDir;
    delete process.env['ARCHON_STATE_DIR'];

    const result = getArchonDir();

    expect(result).toBe(tmpDir);
  });

  it('AH-U2: ARCHON_STATE_DIR is honored when ARCHON_HOME is absent', () => {
    // ARCHON_STATE_DIR is precedence level 3 in resolveArchonHome().
    const tmpDir = mkdtempSync(`${tmpdir()}/archon-ah-u2-`);
    delete process.env['ARCHON_HOME'];
    process.env['ARCHON_STATE_DIR'] = tmpDir;

    const result = getArchonDir();

    expect(result).toBe(tmpDir);
  });

  it('AH-U3: default fallback is an absolute path when neither env var is set', () => {
    // Clear both env vars. resolveArchonHome() will use OS config or ~/.archon.
    // The exact path is environment-dependent; we assert it is non-empty and absolute.
    delete process.env['ARCHON_HOME'];
    delete process.env['ARCHON_STATE_DIR'];

    const result = getArchonDir();

    expect(result).toBeTruthy();
    expect(isAbsolute(result)).toBe(true);
    // Must contain 'archon' in the path (either ~/.archon or a custom override)
    expect(result.toLowerCase()).toContain('archon');
  });
});
