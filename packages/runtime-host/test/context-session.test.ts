/**
 * Archon Runtime Host — SessionContext Tests (ACM-001)
 *
 *   SES-U1: createSession() returns a SessionContext with a 26-char ULID session_id
 *   SES-U2: createSession() carries device_id and user_id from input contexts
 *   SES-U3: createSession() started_at is an ISO 8601 timestamp
 *   SES-U4: endSession() writes <archonDir>/sessions/<session_id>.json
 *   SES-U5: endSession() file contains ended_at (ISO 8601 timestamp)
 *
 * Isolation: each test uses an independent temp directory. No shared state.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSession, endSession } from '../src/context/session.js';
import type { DeviceContext } from '../src/context/device.js';
import type { UserContext } from '../src/context/user.js';

function makeTmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `archon-ses-${label}-`));
}

function makeDevice(): DeviceContext {
  return { device_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', created_at: new Date().toISOString() };
}

function makeUser(): UserContext {
  return { user_id: '01ARZ3NDEKTSV4RRFFQ69G5FBW', created_at: new Date().toISOString() };
}

describe('SessionContext — SES-U1: session_id is a 26-char uppercase ULID', () => {
  it('session_id matches ULID format', () => {
    const session = createSession(makeDevice(), makeUser());
    expect(session.session_id).toHaveLength(26);
    expect(session.session_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('two sessions created in sequence have distinct session_ids', () => {
    const device = makeDevice();
    const user = makeUser();
    const s1 = createSession(device, user);
    const s2 = createSession(device, user);
    expect(s1.session_id).not.toBe(s2.session_id);
  });
});

describe('SessionContext — SES-U2: carries device_id and user_id from inputs', () => {
  it('device_id matches the provided DeviceContext', () => {
    const device = makeDevice();
    const session = createSession(device, makeUser());
    expect(session.device_id).toBe(device.device_id);
  });

  it('user_id matches the provided UserContext', () => {
    const user = makeUser();
    const session = createSession(makeDevice(), user);
    expect(session.user_id).toBe(user.user_id);
  });
});

describe('SessionContext — SES-U3: started_at is an ISO 8601 timestamp', () => {
  it('started_at can be parsed as a valid date', () => {
    const session = createSession(makeDevice(), makeUser());
    expect(typeof session.started_at).toBe('string');
    const date = new Date(session.started_at);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });
});

describe('SessionContext — SES-U4: endSession() writes session file to disk', () => {
  it('creates <archonDir>/sessions/<session_id>.json', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const archonDir = makeTmpDir('u4');
    const session = createSession(makeDevice(), makeUser());
    endSession(session, archonDir);
    const expectedPath = join(archonDir, 'sessions', `${session.session_id}.json`);
    expect(existsSync(expectedPath)).toBe(true);
  });
});

describe('SessionContext — SES-U5: endSession() file contains ended_at', () => {
  it('ended_at is present and is a valid ISO 8601 timestamp', () => {
    const archonDir = makeTmpDir('u5');
    const session = createSession(makeDevice(), makeUser());
    endSession(session, archonDir);

    const sessionPath = join(archonDir, 'sessions', `${session.session_id}.json`);
    const raw = readFileSync(sessionPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(typeof parsed['ended_at']).toBe('string');
    const date = new Date(parsed['ended_at'] as string);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });

  it('written file preserves session_id, device_id, user_id, and started_at', () => {
    const archonDir = makeTmpDir('u5b');
    const device = makeDevice();
    const user = makeUser();
    const session = createSession(device, user);
    endSession(session, archonDir);

    const sessionPath = join(archonDir, 'sessions', `${session.session_id}.json`);
    const parsed = JSON.parse(readFileSync(sessionPath, 'utf-8')) as Record<string, unknown>;

    expect(parsed['session_id']).toBe(session.session_id);
    expect(parsed['device_id']).toBe(session.device_id);
    expect(parsed['user_id']).toBe(session.user_id);
    expect(parsed['started_at']).toBe(session.started_at);
  });
});
