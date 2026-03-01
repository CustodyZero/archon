/**
 * Archon Runtime Host — EventEnvelope Tests (ACM-001)
 *
 *   ENV-U1: buildEventEnvelope() produces all required ACM-001 fields
 *   ENV-U2: fields map correctly from RuntimeContext
 *   ENV-U3: event_id, event_type, rs_hash, payload are set from arguments
 *   ENV-U4: timestamp is an ISO 8601 string
 *   ENV-U5: schema_version is the exported constant (1)
 *   ENV-U6: makeTestContext() returns deterministic, non-empty fields
 *   ENV-U7: makeTestContext() overrides merge correctly
 *
 * Isolation: pure functions — no I/O, no disk access.
 */

import { describe, it, expect } from 'vitest';
import {
  buildEventEnvelope,
  makeTestContext,
  SCHEMA_VERSION,
} from '../src/context/event-envelope.js';
import { ARCHON_VERSION } from '../src/context/version.js';

const TEST_EVENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TEST_RS_HASH  = 'sha256:abc123';

describe('EventEnvelope — ENV-U1: buildEventEnvelope() produces all required fields', () => {
  it('returns an object with all 12 required ACM-001 top-level fields', () => {
    const ctx = makeTestContext();
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', TEST_RS_HASH, {});

    const required = [
      'event_id', 'event_type', 'timestamp', 'archon_version',
      'device_id', 'user_id', 'session_id', 'project_id', 'agent_id',
      'rs_hash', 'schema_version', 'payload',
    ];
    for (const field of required) {
      expect(envelope).toHaveProperty(field);
    }
  });
});

describe('EventEnvelope — ENV-U2: context fields map to envelope fields', () => {
  it('device_id, user_id, session_id, project_id, agent_id come from ctx', () => {
    const ctx = makeTestContext({
      device_id:  'device-xyz',
      user_id:    'user-xyz',
      session_id: 'session-xyz',
      project_id: 'project-xyz',
      agent_id:   'agent-xyz',
    });

    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', TEST_RS_HASH, {});

    expect(envelope.device_id).toBe('device-xyz');
    expect(envelope.user_id).toBe('user-xyz');
    expect(envelope.session_id).toBe('session-xyz');
    expect(envelope.project_id).toBe('project-xyz');
    expect(envelope.agent_id).toBe('agent-xyz');
  });

  it('archon_version comes from ctx', () => {
    const ctx = makeTestContext({ archon_version: '9.9.9' });
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', TEST_RS_HASH, {});
    expect(envelope.archon_version).toBe('9.9.9');
  });
});

describe('EventEnvelope — ENV-U3: argument fields populate correctly', () => {
  it('event_id is set from the argument', () => {
    const ctx = makeTestContext();
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'proposal.created', TEST_RS_HASH, {});
    expect(envelope.event_id).toBe(TEST_EVENT_ID);
  });

  it('event_type is set from the argument', () => {
    const ctx = makeTestContext();
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'proposal.applied', TEST_RS_HASH, {});
    expect(envelope.event_type).toBe('proposal.applied');
  });

  it('rs_hash is set from the argument', () => {
    const ctx = makeTestContext();
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', 'some-rs-hash', {});
    expect(envelope.rs_hash).toBe('some-rs-hash');
  });

  it('payload is set from the argument (passed through by reference)', () => {
    const ctx = makeTestContext();
    const payload = { capabilityType: 'fs.read', decision: 'Permit' };
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', TEST_RS_HASH, payload);
    expect(envelope.payload).toStrictEqual(payload);
  });
});

describe('EventEnvelope — ENV-U4: timestamp is an ISO 8601 string', () => {
  it('timestamp can be parsed as a valid Date', () => {
    const ctx = makeTestContext();
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', TEST_RS_HASH, {});
    expect(typeof envelope.timestamp).toBe('string');
    const date = new Date(envelope.timestamp);
    expect(Number.isNaN(date.getTime())).toBe(false);
  });
});

describe('EventEnvelope — ENV-U5: schema_version is the exported constant', () => {
  it('schema_version equals SCHEMA_VERSION (1)', () => {
    const ctx = makeTestContext();
    const envelope = buildEventEnvelope(ctx, TEST_EVENT_ID, 'governance.decision', TEST_RS_HASH, {});
    expect(envelope.schema_version).toBe(SCHEMA_VERSION);
    expect(envelope.schema_version).toBe(1);
  });
});

describe('EventEnvelope — ENV-U6: makeTestContext() returns deterministic fields', () => {
  it('all fields are non-empty strings', () => {
    const ctx = makeTestContext();
    expect(ctx.device_id.length).toBeGreaterThan(0);
    expect(ctx.user_id.length).toBeGreaterThan(0);
    expect(ctx.session_id.length).toBeGreaterThan(0);
    expect(ctx.project_id.length).toBeGreaterThan(0);
    expect(ctx.agent_id.length).toBeGreaterThan(0);
    expect(ctx.archon_version.length).toBeGreaterThan(0);
  });

  it('archon_version matches the ARCHON_VERSION constant', () => {
    const ctx = makeTestContext();
    expect(ctx.archon_version).toBe(ARCHON_VERSION);
  });

  it('returns the same values on repeated calls (deterministic)', () => {
    const ctx1 = makeTestContext();
    const ctx2 = makeTestContext();
    expect(ctx1.device_id).toBe(ctx2.device_id);
    expect(ctx1.user_id).toBe(ctx2.user_id);
    expect(ctx1.session_id).toBe(ctx2.session_id);
    expect(ctx1.project_id).toBe(ctx2.project_id);
    expect(ctx1.agent_id).toBe(ctx2.agent_id);
  });
});

describe('EventEnvelope — ENV-U7: makeTestContext() overrides merge correctly', () => {
  it('override fields replace defaults; unoverridden fields retain defaults', () => {
    const base = makeTestContext();
    const ctx  = makeTestContext({ device_id: 'custom-device' });
    expect(ctx.device_id).toBe('custom-device');
    expect(ctx.user_id).toBe(base.user_id);
    expect(ctx.session_id).toBe(base.session_id);
    expect(ctx.project_id).toBe(base.project_id);
    expect(ctx.agent_id).toBe(base.agent_id);
  });
});
