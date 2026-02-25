/**
 * Archon Runtime Host — DriftDetector Tests
 *
 * Verifies pure function detectDrift() behaviour:
 *
 *   DRIFT-U1: clean log → status 'none'
 *   DRIFT-U2: duplicates present → status 'unknown', reason DUPLICATES_PRESENT
 *   DRIFT-U3: parse errors present → status 'unknown', reason PARSE_ERRORS
 *   DRIFT-U4: out-of-order events → status 'unknown', reason OUT_OF_ORDER
 *   DRIFT-U5: RS_hash oscillation ≥ threshold → status 'conflict', reason RS_HASH_OSCILLATION
 *   DRIFT-U6: same proposal_id with 2 terminal states → status 'conflict', reason PROPOSAL_STATE_CONFLICT
 *   DRIFT-I1: conflict is non-downgrading — unknown + conflict elevates to conflict
 *   DRIFT-U7: partial trailing line → status 'unknown', reason PARTIAL_TRAILING_LINE
 *
 * Tests are pure: no I/O, no clock dependency, no state.
 */

import { describe, it, expect } from 'vitest';
import { readLog } from '../src/logging/log-reader.js';
import { detectDrift, DRIFT_REASONS } from '../src/logging/drift-detector.js';
import type { LogReadResult } from '../src/logging/log-reader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(id: string, ts?: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ event_id: id, ...(ts !== undefined ? { timestamp: ts } : {}), ...extra });
}

/** Build a LogReadResult from raw JSONL content. */
function fromRaw(raw: string): LogReadResult {
  return readLog(raw);
}

/** Build a clean LogReadResult with no anomalies. */
function cleanResult(events: ReadonlyArray<{ id: string; ts: string; extra?: Record<string, unknown> }>): LogReadResult {
  const raw = events
    .map(({ id, ts, extra }) => makeEvent(id, ts, extra))
    .join('\n') + '\n';
  return fromRaw(raw);
}

// ---------------------------------------------------------------------------
// DRIFT-U1: clean log
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U1: clean log produces status none', () => {
  it('returns status none with no reasons and zero metrics for a clean log', () => {
    const result = cleanResult([
      { id: '01HX0000000000000000000001', ts: '2026-01-01T00:00:01.000Z' },
      { id: '01HX0000000000000000000002', ts: '2026-01-01T00:00:02.000Z' },
    ]);

    const drift = detectDrift(result);

    expect(drift.status).toBe('none');
    expect(drift.reasons).toHaveLength(0);
    expect(drift.metrics.duplicateEventIds).toBe(0);
    expect(drift.metrics.parseErrors).toBe(0);
    expect(drift.metrics.outOfOrder).toBe(false);
    expect(drift.metrics.rsHashDiscontinuities).toBe(0);
    expect(drift.metrics.proposalStateConflicts).toBe(0);
  });

  it('returns status none for empty input', () => {
    const drift = detectDrift(readLog(''));
    expect(drift.status).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// DRIFT-U2: duplicates → unknown
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U2: duplicates elevate to unknown', () => {
  it('returns unknown with DUPLICATES_PRESENT when duplicates exist', () => {
    const id = '01HX0000000000000000000001';
    const raw = [
      makeEvent(id, '2026-01-01T00:00:01.000Z'),
      makeEvent(id, '2026-01-01T00:00:02.000Z'),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('unknown');
    expect(drift.reasons).toContain(DRIFT_REASONS.DUPLICATES_PRESENT);
    expect(drift.metrics.duplicateEventIds).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DRIFT-U3: parse errors → unknown
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U3: parse errors elevate to unknown', () => {
  it('returns unknown with PARSE_ERRORS when parse errors exist', () => {
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z'),
      'not json at all',
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('unknown');
    expect(drift.reasons).toContain(DRIFT_REASONS.PARSE_ERRORS);
    expect(drift.metrics.parseErrors).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DRIFT-U4: out-of-order → unknown
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U4: out-of-order events elevate to unknown', () => {
  it('returns unknown with OUT_OF_ORDER when events are heavily reordered', () => {
    // Two consecutive regressions → outOfOrder=true
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:05.000Z'),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:03.000Z'),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:01.000Z'),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('unknown');
    expect(drift.reasons).toContain(DRIFT_REASONS.OUT_OF_ORDER);
    expect(drift.metrics.outOfOrder).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DRIFT-U5: RS_hash oscillation → conflict
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U5: RS_hash oscillation elevates to conflict', () => {
  it('returns conflict with RS_HASH_OSCILLATION when oscillation meets threshold', () => {
    // Hash sequence: A → B → A → B → A
    // Transitions: A→B(+1), B→A(+2 oscillation), A→B(+2 oscillation), B→A(+2 oscillation) = 7 total → conflict
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z', { rs_hash: 'hash-A' }),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z', { rs_hash: 'hash-B' }),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:03.000Z', { rs_hash: 'hash-A' }),
      makeEvent('01HX0000000000000000000004', '2026-01-01T00:00:04.000Z', { rs_hash: 'hash-B' }),
      makeEvent('01HX0000000000000000000005', '2026-01-01T00:00:05.000Z', { rs_hash: 'hash-A' }),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('conflict');
    expect(drift.reasons).toContain(DRIFT_REASONS.RS_HASH_OSCILLATION);
    expect(drift.metrics.rsHashDiscontinuities).toBeGreaterThanOrEqual(3);
  });

  it('does not trigger RS_HASH_OSCILLATION for monotonic hash progression', () => {
    // Normal progression: A → B → C — no oscillation
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z', { rs_hash: 'hash-A' }),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z', { rs_hash: 'hash-A' }),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:03.000Z', { rs_hash: 'hash-B' }),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.reasons).not.toContain(DRIFT_REASONS.RS_HASH_OSCILLATION);
    expect(drift.metrics.rsHashDiscontinuities).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------------------
// DRIFT-U6: proposal state conflict → conflict
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U6: proposal state conflicts elevate to conflict', () => {
  it('returns conflict when same proposal_id has applied and rejected events', () => {
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z', {
        proposal_id: 'prop-001',
        event_type: 'applied',
      }),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z', {
        proposal_id: 'prop-001',
        event_type: 'rejected',
      }),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('conflict');
    expect(drift.reasons).toContain(DRIFT_REASONS.PROPOSAL_STATE_CONFLICT);
    expect(drift.metrics.proposalStateConflicts).toBe(1);
  });

  it('does not flag proposal with only one terminal state', () => {
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z', {
        proposal_id: 'prop-001',
        event_type: 'pending',
      }),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z', {
        proposal_id: 'prop-001',
        event_type: 'applied',
      }),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.reasons).not.toContain(DRIFT_REASONS.PROPOSAL_STATE_CONFLICT);
    expect(drift.metrics.proposalStateConflicts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DRIFT-I1: conflict is non-downgrading
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-I1: conflict is monotonically non-downgrading', () => {
  it('status remains conflict when both unknown and conflict signals are present', () => {
    // Duplicate events (→ unknown) + proposal conflict (→ conflict) = conflict
    const id = '01HX0000000000000000000001';
    const raw = [
      makeEvent(id, '2026-01-01T00:00:01.000Z'),
      makeEvent(id, '2026-01-01T00:00:01.000Z'),  // duplicate → unknown
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z', {
        proposal_id: 'prop-001',
        event_type: 'applied',
      }),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:03.000Z', {
        proposal_id: 'prop-001',
        event_type: 'rejected',
      }),
    ].join('\n') + '\n';

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('conflict');
    expect(drift.reasons).toContain(DRIFT_REASONS.DUPLICATES_PRESENT);
    expect(drift.reasons).toContain(DRIFT_REASONS.PROPOSAL_STATE_CONFLICT);
  });
});

// ---------------------------------------------------------------------------
// DRIFT-U7: partial trailing line → unknown
// ---------------------------------------------------------------------------

describe('DriftDetector — DRIFT-U7: partial trailing line elevates to unknown', () => {
  it('returns unknown with PARTIAL_TRAILING_LINE when trailing line is detected', () => {
    // No terminal newline → partial trailing line
    const raw =
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z') +
      '\n{"event_id":"01HX0000000000000000000002","partial';  // incomplete

    const drift = detectDrift(fromRaw(raw));

    expect(drift.status).toBe('unknown');
    expect(drift.reasons).toContain(DRIFT_REASONS.PARTIAL_TRAILING_LINE);
  });
});
