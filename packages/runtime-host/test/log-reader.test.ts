/**
 * Archon Runtime Host — LogReader Tests
 *
 * Verifies pure function readLog() behaviour:
 *
 *   LOGR-U1: valid JSONL events are parsed and returned
 *   LOGR-U2: duplicate event_ids are dropped (first-seen wins)
 *   LOGR-U3: partial trailing line is detected and the last line is dropped
 *   LOGR-U4: out-of-order detection (> 1 consecutive timestamp regression)
 *   LOGR-U5: output events are sorted by (timestamp asc, event_id asc)
 *   LOGR-U6: empty input returns zero stats
 *   LOGR-U6b: all-duplicate input returns only the first unique event
 *
 * Tests are pure: no I/O, no clock dependency, no state.
 */

import { describe, it, expect } from 'vitest';
import { readLog } from '../src/logging/log-reader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(id: string, timestamp?: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ event_id: id, ...(timestamp !== undefined ? { timestamp } : {}), ...extra });
}

// ---------------------------------------------------------------------------
// LOGR-U1: parse valid JSONL events
// ---------------------------------------------------------------------------

describe('LogReader — LOGR-U1: parses valid JSONL events', () => {
  it('returns one event per valid JSONL line', () => {
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z'),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z'),
      '',  // blank line — should be skipped
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.totalLines).toBe(2);
    expect(result.stats.parsedEvents).toBe(2);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.events).toHaveLength(2);
  });

  it('drops lines that are not valid JSON', () => {
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z'),
      'not valid json at all',
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z'),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.totalLines).toBe(3);
    expect(result.stats.parsedEvents).toBe(2);
    expect(result.stats.parseErrors).toBe(1);
    expect(result.events).toHaveLength(2);
  });

  it('drops lines that lack an event_id field', () => {
    const raw = [
      makeEvent('01HX0000000000000000000001'),
      JSON.stringify({ no_event_id: true }),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.parseErrors).toBe(1);
    expect(result.events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LOGR-U2: deduplicate by event_id (first-seen wins)
// ---------------------------------------------------------------------------

describe('LogReader — LOGR-U2: deduplicates by event_id', () => {
  it('drops the second occurrence of the same event_id', () => {
    const id = '01HX0000000000000000000001';
    const raw = [
      JSON.stringify({ event_id: id, timestamp: '2026-01-01T00:00:01.000Z', value: 'first' }),
      JSON.stringify({ event_id: id, timestamp: '2026-01-01T00:00:02.000Z', value: 'second' }),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.duplicates).toBe(1);
    expect(result.events).toHaveLength(1);
    // First-seen wins: the 'first' value is retained
    expect(result.events[0]!['value']).toBe('first');
  });

  it('counts all subsequent duplicates', () => {
    const id = '01HX0000000000000000000001';
    const lines = [id, id, id].map((i) => JSON.stringify({ event_id: i }));
    const raw = lines.join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.duplicates).toBe(2);
    expect(result.events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LOGR-U3: partial trailing line detection
// ---------------------------------------------------------------------------

describe('LogReader — LOGR-U3: partial trailing line', () => {
  it('detects when content does not end with newline and drops the last line', () => {
    // Two complete events + a partial third (no trailing newline)
    const raw =
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z') + '\n' +
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:02.000Z') + '\n' +
      '{"event_id":"01HX0000000000000000000003","partial":tr'; // incomplete

    const result = readLog(raw);

    expect(result.stats.partialTrailingLine).toBe(true);
    expect(result.events).toHaveLength(2);
    // The partial line is dropped
    expect(result.events.find((e) => e.event_id === '01HX0000000000000000000003')).toBeUndefined();
  });

  it('does not flag partialTrailingLine when content ends with newline', () => {
    const raw = makeEvent('01HX0000000000000000000001') + '\n';

    const result = readLog(raw);

    expect(result.stats.partialTrailingLine).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LOGR-U4: out-of-order detection
// ---------------------------------------------------------------------------

describe('LogReader — LOGR-U4: out-of-order detection', () => {
  it('does not flag outOfOrder for a single timestamp regression (clock skew tolerance)', () => {
    // One regression: T3 then T4 then T2 — only one consecutive regression
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:03.000Z'),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:04.000Z'),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:02.000Z'),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.outOfOrder).toBe(false);
  });

  it('flags outOfOrder for > 1 consecutive timestamp regressions', () => {
    // Two consecutive regressions: T3→T2 and T2→T1
    const raw = [
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:05.000Z'),
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:03.000Z'),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:01.000Z'),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.stats.outOfOrder).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LOGR-U5: output is sorted by (timestamp asc, event_id asc)
// ---------------------------------------------------------------------------

describe('LogReader — LOGR-U5: output sorted by timestamp asc, event_id tiebreaker', () => {
  it('sorts events by timestamp ascending', () => {
    const raw = [
      makeEvent('01HX0000000000000000000002', '2026-01-01T00:00:03.000Z'),
      makeEvent('01HX0000000000000000000001', '2026-01-01T00:00:01.000Z'),
      makeEvent('01HX0000000000000000000003', '2026-01-01T00:00:02.000Z'),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.events[0]!.event_id).toBe('01HX0000000000000000000001');
    expect(result.events[1]!.event_id).toBe('01HX0000000000000000000003');
    expect(result.events[2]!.event_id).toBe('01HX0000000000000000000002');
  });

  it('uses event_id as tiebreaker when timestamps are equal', () => {
    const ts = '2026-01-01T00:00:01.000Z';
    const raw = [
      makeEvent('01HX0000000000000000000002', ts),
      makeEvent('01HX0000000000000000000001', ts),
    ].join('\n') + '\n';

    const result = readLog(raw);

    expect(result.events[0]!.event_id).toBe('01HX0000000000000000000001');
    expect(result.events[1]!.event_id).toBe('01HX0000000000000000000002');
  });
});

// ---------------------------------------------------------------------------
// LOGR-U6: empty input
// ---------------------------------------------------------------------------

describe('LogReader — LOGR-U6: empty input', () => {
  it('returns empty result with zero stats for empty string', () => {
    const result = readLog('');

    expect(result.events).toHaveLength(0);
    expect(result.stats.totalLines).toBe(0);
    expect(result.stats.parsedEvents).toBe(0);
    expect(result.stats.duplicates).toBe(0);
    expect(result.stats.parseErrors).toBe(0);
    expect(result.stats.partialTrailingLine).toBe(false);
    expect(result.stats.outOfOrder).toBe(false);
  });

  it('LOGR-U6b: all-duplicate input returns no output events', () => {
    const id = '01HX0000000000000000000001';
    const raw = [id, id].map((i) => JSON.stringify({ event_id: i })).join('\n') + '\n';

    const result = readLog(raw);

    expect(result.events).toHaveLength(1);
    expect(result.stats.duplicates).toBe(1);
    expect(result.stats.parsedEvents).toBe(1);
  });
});
