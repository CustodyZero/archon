/**
 * Archon Runtime Host — DriftDetector
 *
 * Pure function for detecting sync conflict signals in JSONL log data.
 * Consumes a LogReadResult (from LogReader) and produces a DriftStatus
 * with a level, reason codes, and metrics.
 *
 * Signal hierarchy (monotonically increasing — never downgraded):
 *   none     — no anomalies detected
 *   unknown  — anomaly present but ambiguous (may indicate sync issues)
 *   conflict — high-confidence indication of a sync fork or merge conflict
 *
 * Detection rules:
 *   D1: duplicates / parse errors / partial trailing line → unknown
 *   D2: out-of-order events → unknown
 *   D3: RS_hash oscillations ≥ threshold → conflict
 *   D4: same proposal_id with 2+ distinct terminal states → conflict
 *
 * @see docs/specs/architecture.md §P6 (Portability Integrity + Sync Conflict Posture)
 */

import type { LogReadResult, LogEvent } from './log-reader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Drift status level — monotonically ordered: none < unknown < conflict. */
export type DriftStatusLevel = 'none' | 'unknown' | 'conflict';

/** Reason codes emitted when the drift level is elevated. */
export const DRIFT_REASONS = {
  /** Duplicate event_ids were present in the log file. */
  DUPLICATES_PRESENT: 'DUPLICATES_PRESENT',
  /** One or more log lines could not be parsed as valid JSON. */
  PARSE_ERRORS: 'PARSE_ERRORS',
  /** Content ended without a terminal newline (mid-write truncation). */
  PARTIAL_TRAILING_LINE: 'PARTIAL_TRAILING_LINE',
  /** Events were in a non-monotonic timestamp order. */
  OUT_OF_ORDER: 'OUT_OF_ORDER',
  /** RS_hash changed back to a previously-seen value (oscillation). */
  RS_HASH_OSCILLATION: 'RS_HASH_OSCILLATION',
  /** The same proposal_id appeared with two or more distinct terminal states. */
  PROPOSAL_STATE_CONFLICT: 'PROPOSAL_STATE_CONFLICT',
} as const;

export type DriftReason = (typeof DRIFT_REASONS)[keyof typeof DRIFT_REASONS];

/** Raw signal metrics collected during drift analysis. */
export interface DriftMetrics {
  /** Number of duplicate event_ids found in the log (before dedup). */
  duplicateEventIds: number;
  /** Number of parse errors encountered during log reading. */
  parseErrors: number;
  /** Whether out-of-order events were detected. */
  outOfOrder: boolean;
  /**
   * Count of RS_hash value transitions in time-ordered events.
   * Oscillations (revisiting a prior hash) are counted double.
   */
  rsHashDiscontinuities: number;
  /** Number of proposals with > 1 distinct terminal state. */
  proposalStateConflicts: number;
}

/** The result of drift analysis on a log file. */
export interface DriftStatus {
  /** Aggregated drift level — highest level triggered by any rule. */
  status: DriftStatusLevel;
  /** Reason codes explaining the level (empty when status = 'none'). */
  reasons: ReadonlyArray<DriftReason>;
  /** Raw metrics for diagnostic display. */
  metrics: DriftMetrics;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * RS-hash oscillation threshold.
 *
 * The number of hash value changes (with oscillations double-counted) that
 * triggers the 'conflict' level. Threshold of 3 avoids false positives from
 * normal governance operations (enable capability → new hash, then change rule
 * → another hash), while being sensitive enough to catch sync forks where two
 * divergent histories are merged.
 */
const RS_HASH_OSCILLATION_THRESHOLD = 3;

/** Terminal proposal states. A proposal in two terminal states is a conflict. */
const TERMINAL_STATES = new Set(['applied', 'rejected', 'failed']);

/**
 * Exhaustiveness guard for DriftStatusLevel.
 *
 * Record<DriftStatusLevel, number> requires all members to be present as keys.
 * If DriftStatusLevel gains a new member, TypeScript will error here — forcing
 * elevate() to be updated before the new level can be added.
 */
const LEVEL_RANK: Record<DriftStatusLevel, number> = { none: 0, unknown: 1, conflict: 2 };
void LEVEL_RANK;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Elevate drift status monotonically: none < unknown < conflict.
 * Once 'conflict', never downgraded.
 */
function elevate(current: DriftStatusLevel, next: DriftStatusLevel): DriftStatusLevel {
  if (current === 'conflict' || next === 'conflict') return 'conflict';
  if (current === 'unknown' || next === 'unknown') return 'unknown';
  return 'none';
}

/**
 * Count RS_hash value changes in time-ordered events.
 * Oscillations (revisiting a previously-seen hash value) are counted double.
 *
 * @param events - Time-ordered events from LogReadResult
 */
function computeRsHashDiscontinuities(events: ReadonlyArray<LogEvent>): number {
  let count = 0;
  let prevHash: string | undefined;
  const seenHashes = new Set<string>();

  for (const event of events) {
    const hash = typeof event['rs_hash'] === 'string' ? event['rs_hash'] : undefined;
    if (hash === undefined) continue;

    if (prevHash !== undefined && hash !== prevHash) {
      // Oscillation: hash returns to a previously observed value → double-count
      count += seenHashes.has(hash) ? 2 : 1;
    }

    seenHashes.add(hash);
    prevHash = hash;
  }

  return count;
}

/**
 * Count proposals with more than one distinct terminal state.
 * A proposal that appears as both 'applied' and 'rejected' (for example)
 * indicates that two conflicting histories were merged.
 *
 * @param events - Time-ordered events from LogReadResult
 */
function computeProposalStateConflicts(events: ReadonlyArray<LogEvent>): number {
  const proposalTerminalStates = new Map<string, Set<string>>();

  for (const event of events) {
    const proposalId = typeof event['proposal_id'] === 'string' ? event['proposal_id'] : undefined;
    const eventType = typeof event['event_type'] === 'string' ? event['event_type'] : undefined;
    if (proposalId === undefined || eventType === undefined) continue;
    if (!TERMINAL_STATES.has(eventType)) continue;

    const states = proposalTerminalStates.get(proposalId) ?? new Set<string>();
    states.add(eventType);
    proposalTerminalStates.set(proposalId, states);
  }

  let conflicts = 0;
  for (const states of proposalTerminalStates.values()) {
    if (states.size > 1) conflicts++;
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a LogReadResult for sync conflict signals.
 *
 * Pure function — no I/O. Accepts the output of readLog() directly.
 *
 * @param result - Parsed and deduplicated log result from readLog()
 * @returns DriftStatus with level, reason codes, and raw metrics
 */
export function detectDrift(result: LogReadResult): DriftStatus {
  const reasons: DriftReason[] = [];
  let status: DriftStatusLevel = 'none';

  // D1: Data integrity anomalies → unknown
  if (result.stats.duplicates > 0) {
    status = elevate(status, 'unknown');
    reasons.push(DRIFT_REASONS.DUPLICATES_PRESENT);
  }
  if (result.stats.parseErrors > 0) {
    status = elevate(status, 'unknown');
    reasons.push(DRIFT_REASONS.PARSE_ERRORS);
  }
  if (result.stats.partialTrailingLine) {
    status = elevate(status, 'unknown');
    reasons.push(DRIFT_REASONS.PARTIAL_TRAILING_LINE);
  }

  // D2: Ordering anomaly → unknown
  if (result.stats.outOfOrder) {
    status = elevate(status, 'unknown');
    reasons.push(DRIFT_REASONS.OUT_OF_ORDER);
  }

  // D3: RS_hash oscillation above threshold → conflict
  const rsHashDiscontinuities = computeRsHashDiscontinuities(result.events);
  if (rsHashDiscontinuities >= RS_HASH_OSCILLATION_THRESHOLD) {
    status = elevate(status, 'conflict');
    reasons.push(DRIFT_REASONS.RS_HASH_OSCILLATION);
  }

  // D4: Same proposal_id in two terminal states → conflict
  const proposalStateConflicts = computeProposalStateConflicts(result.events);
  if (proposalStateConflicts > 0) {
    status = elevate(status, 'conflict');
    reasons.push(DRIFT_REASONS.PROPOSAL_STATE_CONFLICT);
  }

  return {
    status,
    reasons,
    metrics: {
      duplicateEventIds: result.stats.duplicates,
      parseErrors: result.stats.parseErrors,
      outOfOrder: result.stats.outOfOrder,
      rsHashDiscontinuities,
      proposalStateConflicts,
    },
  };
}
