/**
 * Archon Runtime Host — FileLogSink with RuntimeContext Tests (ACM-001)
 *
 *   FLS-U1: FileLogSink emits full ACM-001 envelope on each append
 *   FLS-U2: envelope fields match the injected RuntimeContext
 *   FLS-U3: event_type is 'governance.decision'
 *   FLS-U4: payload contains agentId, capabilityType, decision, reason, input_hash
 *   FLS-U5: schema_version is 1
 *   FLS-U6: two appended entries carry distinct event_ids
 *
 * Isolation: uses MemoryStateIO — no filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import type { DecisionLog, RuleSnapshotHash } from '@archon/kernel';
import { DecisionOutcome, CapabilityType, unwrapRuleSnapshotHash } from '@archon/kernel';
import { FileLogSink } from '../src/logging/file-log-sink.js';
import { MemoryStateIO } from '../src/state/state-io.js';
import { makeTestContext } from '../src/context/event-envelope.js';
import { SCHEMA_VERSION } from '../src/context/event-envelope.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<DecisionLog>): DecisionLog {
  return {
    agent_id: 'sink-test-agent',
    proposed_action: {
      module_id:   'filesystem',
      capability_id: 'fs.read',
      type:        CapabilityType.FsRead,
      params:      { path_glob: '/tmp/test' },
      project_id:  'test-project',
    },
    decision:        DecisionOutcome.Permit,
    triggered_rules: [],
    rs_hash:         'sink-rs-hash' as unknown as RuleSnapshotHash,
    input_hash:      'sink-input-hash',
    output_hash:     null,
    timestamp:       new Date().toISOString(),
    ...overrides,
  };
}

function parsedLine(stateIO: MemoryStateIO, index = 0): Record<string, unknown> {
  const lines = stateIO.readLines('decisions.jsonl');
  return JSON.parse(lines[index]!) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileLogSink — FLS-U1: emits full ACM-001 envelope fields', () => {
  it('written line contains all required top-level envelope fields', () => {
    const stateIO = new MemoryStateIO();
    const ctx = makeTestContext();
    const sink = new FileLogSink(stateIO, ctx);

    sink.append(makeEntry());

    const line = parsedLine(stateIO);
    const required = [
      'event_id', 'event_type', 'timestamp', 'archon_version',
      'device_id', 'user_id', 'session_id', 'project_id', 'agent_id',
      'rs_hash', 'schema_version', 'payload',
    ];
    for (const field of required) {
      expect(line).toHaveProperty(field);
    }
  });
});

describe('FileLogSink — FLS-U2: envelope fields match the injected RuntimeContext', () => {
  it('device_id, user_id, session_id, project_id, agent_id come from ctx', () => {
    const stateIO = new MemoryStateIO();
    const ctx = makeTestContext({
      device_id:  'dev-abc',
      user_id:    'usr-abc',
      session_id: 'ses-abc',
      project_id: 'prj-abc',
      agent_id:   'agt-abc',
    });
    const sink = new FileLogSink(stateIO, ctx);
    sink.append(makeEntry());

    const line = parsedLine(stateIO);
    expect(line['device_id']).toBe('dev-abc');
    expect(line['user_id']).toBe('usr-abc');
    expect(line['session_id']).toBe('ses-abc');
    expect(line['project_id']).toBe('prj-abc');
    expect(line['agent_id']).toBe('agt-abc');
  });

  it('archon_version comes from ctx', () => {
    const stateIO = new MemoryStateIO();
    const ctx = makeTestContext({ archon_version: '3.1.4' });
    const sink = new FileLogSink(stateIO, ctx);
    sink.append(makeEntry());

    const line = parsedLine(stateIO);
    expect(line['archon_version']).toBe('3.1.4');
  });
});

describe('FileLogSink — FLS-U3: event_type is governance.decision', () => {
  it('event_type equals "governance.decision"', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    sink.append(makeEntry());
    expect(parsedLine(stateIO)['event_type']).toBe('governance.decision');
  });
});

describe('FileLogSink — FLS-U4: payload contains required decision fields', () => {
  it('payload includes agentId, capabilityType, decision, reason, input_hash', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    sink.append(makeEntry());

    const line = parsedLine(stateIO);
    const payload = line['payload'] as Record<string, unknown>;
    expect(payload).toHaveProperty('agentId');
    expect(payload).toHaveProperty('capabilityType');
    expect(payload).toHaveProperty('decision');
    expect(payload).toHaveProperty('reason');
    expect(payload).toHaveProperty('input_hash');
  });

  it('payload.agentId comes from the DecisionLog entry', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    sink.append(makeEntry({ agent_id: 'specific-agent' }));

    const payload = parsedLine(stateIO)['payload'] as Record<string, unknown>;
    expect(payload['agentId']).toBe('specific-agent');
  });

  it('payload.input_hash comes from the DecisionLog entry', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    sink.append(makeEntry({ input_hash: 'my-input-hash' }));

    const payload = parsedLine(stateIO)['payload'] as Record<string, unknown>;
    expect(payload['input_hash']).toBe('my-input-hash');
  });
});

describe('FileLogSink — FLS-U5: schema_version is 1', () => {
  it('schema_version equals the exported SCHEMA_VERSION constant', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    sink.append(makeEntry());

    expect(parsedLine(stateIO)['schema_version']).toBe(SCHEMA_VERSION);
    expect(parsedLine(stateIO)['schema_version']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// HASH-U1: unwrapRuleSnapshotHash returns the underlying string value
//
// Verifies the kernel helper that replaces `as unknown as string` in FileLogSink.
// ---------------------------------------------------------------------------

describe('HASH-U1: unwrapRuleSnapshotHash returns the underlying string value', () => {
  it('unwrapped value equals the source string', () => {
    const hash = 'sink-rs-hash' as unknown as RuleSnapshotHash;
    expect(unwrapRuleSnapshotHash(hash)).toBe('sink-rs-hash');
  });

  it('rs_hash in emitted envelope equals the source RuleSnapshotHash value', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    const rsHash = 'my-rs-hash-value' as unknown as RuleSnapshotHash;

    sink.append(makeEntry({ rs_hash: rsHash }));

    const line = parsedLine(stateIO);
    expect(line['rs_hash']).toBe('my-rs-hash-value');
  });
});

describe('FileLogSink — FLS-U6: two appended entries have distinct event_ids', () => {
  it('event_id is a 26-char ULID and differs across entries', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO, makeTestContext());
    sink.append(makeEntry());
    sink.append(makeEntry());

    const lines = stateIO.readLines('decisions.jsonl');
    expect(lines).toHaveLength(2);

    const id1 = (JSON.parse(lines[0]!) as Record<string, unknown>)['event_id'] as string;
    const id2 = (JSON.parse(lines[1]!) as Record<string, unknown>)['event_id'] as string;

    expect(id1).toHaveLength(26);
    expect(id1).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(id1).not.toBe(id2);
  });
});
