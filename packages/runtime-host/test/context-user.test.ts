/**
 * Archon Runtime Host — UserContext Tests (ACM-001)
 *
 *   USR-U1: loadOrCreateUser() creates user.json on first call
 *   USR-U2: user_id is a 26-char ULID
 *   USR-U3: loadOrCreateUser() preserves user_id on subsequent calls (stable)
 *   USR-U4: created_at is an ISO 8601 timestamp
 *
 * Isolation: each test uses an independent temp directory. No shared state.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateUser } from '../src/context/user.js';

function makeTmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `archon-usr-${label}-`));
}

describe('UserContext — USR-U1: creates user.json on first call', () => {
  it('returns a UserContext with a non-empty user_id', () => {
    const archonDir = makeTmpDir('u1');
    const user = loadOrCreateUser(archonDir);
    expect(typeof user.user_id).toBe('string');
    expect(user.user_id.length).toBeGreaterThan(0);
  });

  it('creates user.json at <archonDir>/user.json', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const archonDir = makeTmpDir('u1b');
    loadOrCreateUser(archonDir);
    expect(existsSync(join(archonDir, 'user.json'))).toBe(true);
  });
});

describe('UserContext — USR-U2: user_id is a 26-char uppercase ULID', () => {
  it('user_id matches ULID format', () => {
    const archonDir = makeTmpDir('u2');
    const user = loadOrCreateUser(archonDir);
    expect(user.user_id).toHaveLength(26);
    expect(user.user_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe('UserContext — USR-U3: user_id is stable across calls (idempotent)', () => {
  it('returns the same user_id on every call in the same directory', () => {
    const archonDir = makeTmpDir('u3');
    const first = loadOrCreateUser(archonDir);
    const second = loadOrCreateUser(archonDir);
    const third = loadOrCreateUser(archonDir);
    expect(second.user_id).toBe(first.user_id);
    expect(third.user_id).toBe(first.user_id);
  });

  it('returns a different user_id for a different directory', () => {
    const dir1 = makeTmpDir('u3a');
    const dir2 = makeTmpDir('u3b');
    const u1 = loadOrCreateUser(dir1);
    const u2 = loadOrCreateUser(dir2);
    expect(u1.user_id).not.toBe(u2.user_id);
  });
});

describe('UserContext — USR-U4: created_at is an ISO 8601 timestamp', () => {
  it('created_at can be parsed as a valid date', () => {
    const archonDir = makeTmpDir('u4');
    const user = loadOrCreateUser(archonDir);
    expect(typeof user.created_at).toBe('string');
    const date = new Date(user.created_at);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });
});
