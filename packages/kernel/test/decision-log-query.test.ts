/**
 * Archon Kernel — DecisionLogger.query() Tests
 *
 * Verifies that DecisionLogger.query() correctly filters, sorts, and
 * paginates in-memory decision log entries.
 *
 * Test categories:
 * - query/rsHash-filter: entries are filtered by rs_hash (required param)
 * - query/agentId-filter: optional agentId filter
 * - query/outcome-filter: optional outcome filter
 * - query/timeRange-filter: optional timeRange filter (from, to, both)
 * - query/sorting: results sorted by timestamp descending
 * - query/pagination: limit and offset
 * - query/empty: empty results when no matches
 * - query/combined-filters: multiple filters applied simultaneously
 *
 * These tests are pure: no file I/O, no network, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { DecisionLogger } from '../src/logging/decision-log.js';
import { DecisionOutcome } from '../src/types/decision.js';
import type { DecisionLog } from '../src/types/decision.js';
import type { RuleSnapshotHash } from '../src/types/snapshot.js';
import { CapabilityType, RiskTier } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RS_HASH_A = 'aaaa' as RuleSnapshotHash;
const RS_HASH_B = 'bbbb' as RuleSnapshotHash;

function makeEntry(overrides: Partial<DecisionLog> = {}): DecisionLog {
  return {
    agent_id: 'agent-1',
    proposed_action: {
      project_id: 'test-project',
      module_id: 'test-module',
      capability_id: 'test.fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: '/tmp/test.txt' },
    },
    decision: DecisionOutcome.Permit,
    triggered_rules: [],
    rs_hash: RS_HASH_A,
    input_hash: 'input-hash-1',
    output_hash: null,
    timestamp: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// query/rsHash-filter
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: rs_hash filter', () => {
  it('returns entries matching the given rs_hash', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ rs_hash: RS_HASH_A, input_hash: 'h1' }));
    logger.record(makeEntry({ rs_hash: RS_HASH_B, input_hash: 'h2' }));
    logger.record(makeEntry({ rs_hash: RS_HASH_A, input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.rs_hash).toBe(RS_HASH_A);
    }
  });

  it('returns empty array when no entries match the rs_hash', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ rs_hash: RS_HASH_A }));

    const results = logger.query(RS_HASH_B);
    expect(results).toHaveLength(0);
  });

  it('returns empty array when no entries have been recorded', () => {
    const logger = new DecisionLogger();
    const results = logger.query(RS_HASH_A);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// query/agentId-filter
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: agentId filter', () => {
  it('filters by agent_id when provided', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ agent_id: 'agent-1', input_hash: 'h1' }));
    logger.record(makeEntry({ agent_id: 'agent-2', input_hash: 'h2' }));
    logger.record(makeEntry({ agent_id: 'agent-1', input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A, { agentId: 'agent-2' });
    expect(results).toHaveLength(1);
    expect(results[0]!.agent_id).toBe('agent-2');
  });
});

// ---------------------------------------------------------------------------
// query/outcome-filter
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: outcome filter', () => {
  it('filters by decision outcome when provided', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ decision: DecisionOutcome.Permit, input_hash: 'h1' }));
    logger.record(makeEntry({ decision: DecisionOutcome.Deny, input_hash: 'h2' }));
    logger.record(makeEntry({ decision: DecisionOutcome.Permit, input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A, { outcome: DecisionOutcome.Deny });
    expect(results).toHaveLength(1);
    expect(results[0]!.decision).toBe(DecisionOutcome.Deny);
  });
});

// ---------------------------------------------------------------------------
// query/timeRange-filter
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: timeRange filter', () => {
  it('filters by from (inclusive lower bound)', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ timestamp: '2026-01-10T00:00:00.000Z', input_hash: 'h1' }));
    logger.record(makeEntry({ timestamp: '2026-01-15T00:00:00.000Z', input_hash: 'h2' }));
    logger.record(makeEntry({ timestamp: '2026-01-20T00:00:00.000Z', input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A, {
      timeRange: { from: '2026-01-15T00:00:00.000Z' },
    });
    expect(results).toHaveLength(2);
  });

  it('filters by to (inclusive upper bound)', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ timestamp: '2026-01-10T00:00:00.000Z', input_hash: 'h1' }));
    logger.record(makeEntry({ timestamp: '2026-01-15T00:00:00.000Z', input_hash: 'h2' }));
    logger.record(makeEntry({ timestamp: '2026-01-20T00:00:00.000Z', input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A, {
      timeRange: { to: '2026-01-15T00:00:00.000Z' },
    });
    expect(results).toHaveLength(2);
  });

  it('filters by both from and to', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ timestamp: '2026-01-10T00:00:00.000Z', input_hash: 'h1' }));
    logger.record(makeEntry({ timestamp: '2026-01-15T00:00:00.000Z', input_hash: 'h2' }));
    logger.record(makeEntry({ timestamp: '2026-01-20T00:00:00.000Z', input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A, {
      timeRange: {
        from: '2026-01-12T00:00:00.000Z',
        to: '2026-01-18T00:00:00.000Z',
      },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.timestamp).toBe('2026-01-15T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// query/sorting
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: sorting', () => {
  it('returns results sorted by timestamp descending (most recent first)', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ timestamp: '2026-01-10T00:00:00.000Z', input_hash: 'h1' }));
    logger.record(makeEntry({ timestamp: '2026-01-20T00:00:00.000Z', input_hash: 'h2' }));
    logger.record(makeEntry({ timestamp: '2026-01-15T00:00:00.000Z', input_hash: 'h3' }));

    const results = logger.query(RS_HASH_A);
    expect(results).toHaveLength(3);
    expect(results[0]!.timestamp).toBe('2026-01-20T00:00:00.000Z');
    expect(results[1]!.timestamp).toBe('2026-01-15T00:00:00.000Z');
    expect(results[2]!.timestamp).toBe('2026-01-10T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// query/pagination
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: pagination', () => {
  it('applies limit to restrict result count', () => {
    const logger = new DecisionLogger();
    for (let i = 0; i < 5; i++) {
      logger.record(makeEntry({ input_hash: `h${i}` }));
    }

    const results = logger.query(RS_HASH_A, { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('applies offset to skip entries', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ timestamp: '2026-01-01T00:00:00.000Z', input_hash: 'h1' }));
    logger.record(makeEntry({ timestamp: '2026-01-02T00:00:00.000Z', input_hash: 'h2' }));
    logger.record(makeEntry({ timestamp: '2026-01-03T00:00:00.000Z', input_hash: 'h3' }));

    // Sorted desc: 03, 02, 01. Offset 1 skips 03.
    const results = logger.query(RS_HASH_A, { offset: 1 });
    expect(results).toHaveLength(2);
    expect(results[0]!.timestamp).toBe('2026-01-02T00:00:00.000Z');
  });

  it('applies offset and limit together', () => {
    const logger = new DecisionLogger();
    for (let i = 1; i <= 5; i++) {
      logger.record(makeEntry({
        timestamp: `2026-01-0${i}T00:00:00.000Z`,
        input_hash: `h${i}`,
      }));
    }

    // Sorted desc: 05, 04, 03, 02, 01. Offset 1, limit 2 → 04, 03.
    const results = logger.query(RS_HASH_A, { offset: 1, limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]!.timestamp).toBe('2026-01-04T00:00:00.000Z');
    expect(results[1]!.timestamp).toBe('2026-01-03T00:00:00.000Z');
  });

  it('returns empty when offset exceeds result count', () => {
    const logger = new DecisionLogger();
    logger.record(makeEntry({ input_hash: 'h1' }));

    const results = logger.query(RS_HASH_A, { offset: 10 });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// query/combined-filters
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: combined filters', () => {
  it('applies agentId + outcome + timeRange together (AND semantics)', () => {
    const logger = new DecisionLogger();

    // Matching entry
    logger.record(makeEntry({
      agent_id: 'agent-1',
      decision: DecisionOutcome.Deny,
      timestamp: '2026-01-15T00:00:00.000Z',
      input_hash: 'h1',
    }));

    // Wrong agent
    logger.record(makeEntry({
      agent_id: 'agent-2',
      decision: DecisionOutcome.Deny,
      timestamp: '2026-01-15T00:00:00.000Z',
      input_hash: 'h2',
    }));

    // Wrong outcome
    logger.record(makeEntry({
      agent_id: 'agent-1',
      decision: DecisionOutcome.Permit,
      timestamp: '2026-01-15T00:00:00.000Z',
      input_hash: 'h3',
    }));

    // Outside time range
    logger.record(makeEntry({
      agent_id: 'agent-1',
      decision: DecisionOutcome.Deny,
      timestamp: '2026-01-01T00:00:00.000Z',
      input_hash: 'h4',
    }));

    const results = logger.query(RS_HASH_A, {
      agentId: 'agent-1',
      outcome: DecisionOutcome.Deny,
      timeRange: { from: '2026-01-10T00:00:00.000Z' },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.agent_id).toBe('agent-1');
    expect(results[0]!.decision).toBe(DecisionOutcome.Deny);
  });
});

// ---------------------------------------------------------------------------
// query/sink-forwarding
// ---------------------------------------------------------------------------

describe('DecisionLogger.query: sink interaction', () => {
  it('forwards entries to sink AND stores them in-memory for query', () => {
    const sinkEntries: DecisionLog[] = [];
    const sink = { append: (e: DecisionLog) => { sinkEntries.push(e); } };

    const logger = new DecisionLogger(sink);
    logger.record(makeEntry({ input_hash: 'h1' }));
    logger.record(makeEntry({ input_hash: 'h2' }));

    // Sink received entries
    expect(sinkEntries).toHaveLength(2);

    // Query also returns entries
    const results = logger.query(RS_HASH_A);
    expect(results).toHaveLength(2);
  });
});
