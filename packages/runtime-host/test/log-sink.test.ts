/**
 * Archon Runtime Host — FileLogSink Tests
 *
 * Verifies that log entries written to decisions.jsonl include the required
 * fields, in particular the event_id ULID field (P1-1 remediation).
 *
 *   LOG-U4:  decisions.jsonl line includes event_id as a 26-char ULID
 *   LOG-U4b: two appended entries have distinct event_ids
 *
 * Isolation: uses MemoryStateIO — no filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import type { DecisionLog, RuleSnapshotHash } from '@archon/kernel';
import { DecisionOutcome, CapabilityType } from '@archon/kernel';
import { FileLogSink } from '../src/logging/file-log-sink.js';
import { MemoryStateIO } from '../src/state/state-io.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal DecisionLog entry for test use — no real I/O. */
function makeEntry(): DecisionLog {
  return {
    agent_id: 'test-agent',
    proposed_action: {
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      params: { path_glob: '/tmp/test' },
      project_id: 'test-project',
    },
    decision: DecisionOutcome.Permit,
    triggered_rules: [],
    rs_hash: 'test-rs-hash' as unknown as RuleSnapshotHash,
    input_hash: 'test-input-hash',
    output_hash: null,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileLogSink', () => {
  it('LOG-U4: decisions.jsonl line includes event_id as a 26-char uppercase ULID', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO);

    sink.append(makeEntry());

    const lines = stateIO.readLines('decisions.jsonl');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed).toHaveProperty('event_id');

    const eventId = parsed['event_id'];
    expect(typeof eventId).toBe('string');
    // ULID: 26 characters of uppercase Crockford Base32 (no I, L, O, U)
    expect(eventId as string).toHaveLength(26);
    expect(eventId as string).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('LOG-U4b: two appended entries have distinct event_ids', () => {
    const stateIO = new MemoryStateIO();
    const sink = new FileLogSink(stateIO);

    sink.append(makeEntry());
    sink.append(makeEntry());

    const lines = stateIO.readLines('decisions.jsonl');
    expect(lines).toHaveLength(2);

    const id1 = (JSON.parse(lines[0]!) as Record<string, unknown>)['event_id'];
    const id2 = (JSON.parse(lines[1]!) as Record<string, unknown>)['event_id'];
    expect(id1).not.toBe(id2);
  });
});
