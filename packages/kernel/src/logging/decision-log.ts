/**
 * Archon Kernel — Decision Logger
 *
 * The DecisionLogger records and queries decision log entries.
 *
 * All decisions must be logged regardless of outcome. This is unconditional.
 * A missed log entry is a kernel integrity failure, not a minor omission.
 *
 * Log invariants:
 * - Every action evaluation produces exactly one log entry
 * - The entry is recorded regardless of outcome (Permit, Deny, or Escalate)
 * - Given rs_hash and proposed_action, the decision must be reproducible
 * - Logs must allow replay under the same RS_hash
 *
 * The logger accepts an injected LogSink for persistence. The kernel does not
 * write to disk directly — the sink is provided by the runtime host layer.
 * If no sink is injected (e.g., in tests), record() is a no-op.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 * @see docs/specs/authority_and_composition_spec.md §10 (logging and inspectability)
 */

// Import the DecisionLog interface type under an alias to avoid the naming
// collision between the interface (types/decision.ts) and this class.
import type { DecisionLog as DecisionLogEntry } from '../types/decision.js';
import type { RuleSnapshotHash } from '../types/snapshot.js';
import type { LogSink } from './log-sink.js';

/**
 * Records and queries decision log entries.
 *
 * The sink is optional: when omitted (e.g., in tests or in-memory evaluation),
 * record() is a no-op and no entry is persisted. Production instantiation
 * must inject a concrete LogSink (e.g., FileLogSink from runtime-host).
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */
export class DecisionLogger {
  constructor(private readonly sink?: LogSink) {}

  /**
   * Record a decision log entry.
   *
   * This method MUST be called for every action evaluation, regardless of
   * whether the outcome is Permit, Deny, or Escalate. The execution gate
   * is responsible for calling this (in a finally block) before returning.
   *
   * If a sink is injected, the entry is forwarded to it. If no sink is
   * provided, the call is a no-op — suitable for in-process evaluation
   * without persistence (tests, embedded use).
   *
   * @param entry - The complete decision log entry
   * @see docs/specs/architecture.md §6
   */
  record(entry: DecisionLogEntry): void {
    this.sink?.append(entry);
  }

  /**
   * Query decision log entries by Rule Snapshot hash.
   *
   * Returns all log entries produced under the given RS_hash.
   * This enables replay: given a RS_hash and input, the decisions should
   * be reproducible.
   *
   * STUB: Returns empty array. Persistent log query not yet implemented.
   *
   * TODO: implement query against persistent log store
   * TODO: support filtering by time range, agent_id, decision outcome
   * TODO: support pagination for large log sets
   *
   * @param _rsHash - The Rule Snapshot hash to query against
   * @returns ReadonlyArray<DecisionLogEntry> — empty in stub
   * @see docs/specs/architecture.md §6
   */
  query(_rsHash: RuleSnapshotHash): ReadonlyArray<DecisionLogEntry> {
    // STUB: persistent log store not yet implemented
    return [];
  }
}
