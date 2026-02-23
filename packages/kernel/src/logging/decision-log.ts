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
 * @see docs/specs/architecture.md §6 (logging and replay)
 * @see docs/specs/authority_and_composition_spec.md §10 (logging and inspectability)
 */

// Import the DecisionLog interface type under an alias to avoid the naming
// collision between the interface (types/decision.ts) and this class.
import type { DecisionLog as DecisionLogEntry } from '../types/decision.js';
import type { RuleSnapshotHash } from '../types/snapshot.js';

/**
 * Records and queries decision log entries.
 *
 * Named `DecisionLogger` in this file to avoid collision with the
 * `DecisionLog` interface defined in types/decision.ts. The exported
 * class name is `DecisionLogger`.
 *
 * Stub implementation:
 * - record() logs to console in development (explicitly labeled dev behavior)
 * - query() returns an empty array
 *
 * Production implementation will require:
 * - Persistent log store (file, database, or structured log sink)
 * - Atomic write guarantee (a decision must be logged before execution proceeds)
 * - Indexed by RS_hash and timestamp for efficient replay queries
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */
export class DecisionLogger {
  /**
   * Record a decision log entry.
   *
   * This method MUST be called for every action evaluation, regardless of
   * whether the outcome is Permit, Deny, or Escalate. The execution gate
   * is responsible for calling this before returning the outcome.
   *
   * STUB: In development, logs the entry to console.
   * This is explicitly labeled dev-only behavior — console output is not
   * the production logging mechanism and must not be relied upon.
   *
   * TODO: implement persistent log storage
   * TODO: implement atomic write guarantee (log before execution proceeds)
   * TODO: implement structured log format for replay support
   *
   * @param entry - The complete decision log entry
   * @see docs/specs/architecture.md §6
   */
  // eslint-disable-next-line no-console
  record(entry: DecisionLogEntry): void {
    // DEV STUB: console logging is explicitly labeled as development-only.
    // This behavior must be replaced with persistent storage before v0.1.
    // eslint-disable-next-line no-console
    console.log('[archon:decision-log:dev-stub]', JSON.stringify({
      agent_id: entry.agent_id,
      type: entry.proposed_action.type,
      decision: entry.decision,
      rs_hash: entry.rs_hash,
      timestamp: entry.timestamp,
    }));
  }

  /**
   * Query decision log entries by Rule Snapshot hash.
   *
   * Returns all log entries produced under the given RS_hash.
   * This enables replay: given a RS_hash and input, the decisions should
   * be reproducible.
   *
   * STUB: Returns empty array. Persistent storage not yet implemented.
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
