/**
 * Archon Runtime Host — DeviceContext Tests (ACM-001)
 *
 *   DEV-U1: loadOrCreateDevice() creates device.json on first call
 *   DEV-U2: device_id is a 26-char ULID
 *   DEV-U3: loadOrCreateDevice() preserves device_id on subsequent calls (stable)
 *   DEV-U4: created_at is an ISO 8601 timestamp
 *
 * Isolation: each test uses an independent temp directory. No shared state.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateDevice } from '../src/context/device.js';

function makeTmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `archon-dev-${label}-`));
}

describe('DeviceContext — DEV-U1: creates device.json on first call', () => {
  it('returns a DeviceContext with a non-empty device_id', () => {
    const archonDir = makeTmpDir('u1');
    const device = loadOrCreateDevice(archonDir);
    expect(typeof device.device_id).toBe('string');
    expect(device.device_id.length).toBeGreaterThan(0);
  });

  it('creates device.json at <archonDir>/device.json', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const archonDir = makeTmpDir('u1b');
    loadOrCreateDevice(archonDir);
    expect(existsSync(join(archonDir, 'device.json'))).toBe(true);
  });
});

describe('DeviceContext — DEV-U2: device_id is a 26-char uppercase ULID', () => {
  it('device_id matches ULID format', () => {
    const archonDir = makeTmpDir('u2');
    const device = loadOrCreateDevice(archonDir);
    expect(device.device_id).toHaveLength(26);
    expect(device.device_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe('DeviceContext — DEV-U3: device_id is stable across calls (idempotent)', () => {
  it('returns the same device_id on every call in the same directory', () => {
    const archonDir = makeTmpDir('u3');
    const first = loadOrCreateDevice(archonDir);
    const second = loadOrCreateDevice(archonDir);
    const third = loadOrCreateDevice(archonDir);
    expect(second.device_id).toBe(first.device_id);
    expect(third.device_id).toBe(first.device_id);
  });

  it('returns a different device_id for a different directory', () => {
    const dir1 = makeTmpDir('u3a');
    const dir2 = makeTmpDir('u3b');
    const dev1 = loadOrCreateDevice(dir1);
    const dev2 = loadOrCreateDevice(dir2);
    expect(dev1.device_id).not.toBe(dev2.device_id);
  });
});

describe('DeviceContext — DEV-U4: created_at is an ISO 8601 timestamp', () => {
  it('created_at can be parsed as a valid date', () => {
    const archonDir = makeTmpDir('u4');
    const device = loadOrCreateDevice(archonDir);
    expect(typeof device.created_at).toBe('string');
    const date = new Date(device.created_at);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });
});
