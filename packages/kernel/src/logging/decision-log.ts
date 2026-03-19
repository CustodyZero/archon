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
import type { DecisionOutcome } from '../types/decision.js';
import type { RuleSnapshotHash } from '../types/snapshot.js';
import type { LogSink } from './log-sink.js';

// ---------------------------------------------------------------------------
// Query Filters
// ---------------------------------------------------------------------------

/**
 * Optional filters for DecisionLogger.query().
 *
 * All filter fields are optional. When multiple fields are specified, they
 * are combined with AND semantics — an entry must match all provided filters.
 */
export interface DecisionLogQueryFilters {
  /** Filter by the agent that proposed the action. */
  readonly agentId?: string | undefined;
  /** Filter by decision outcome (Permit, Deny, or Escalate). */
  readonly outcome?: DecisionOutcome | undefined;
  /** Filter by timestamp range. Both bounds are inclusive and ISO 8601. */
  readonly timeRange?: {
    readonly from?: string | undefined;
    readonly to?: string | undefined;
  } | undefined;
  /** Maximum number of entries to return. */
  readonly limit?: number | undefined;
  /** Number of matching entries to skip before returning results. */
  readonly offset?: number | undefined;
}

/**
 * Records and queries decision log entries.
 *
 * Maintains an in-memory log of all recorded entries, enabling deterministic
 * query without requiring a persistent store. When a LogSink is injected,
 * entries are also forwarded to it for durable persistence.
 *
 * The sink is optional: when omitted (e.g., in tests or in-memory evaluation),
 * entries are still stored in memory (queryable) but not persisted.
 * Production instantiation must inject a concrete LogSink
 * (e.g., FileLogSink from runtime-host).
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */
export class DecisionLogger {
  private readonly entries: DecisionLogEntry[] = [];

  constructor(private readonly sink?: LogSink) {}

  /**
   * Record a decision log entry.
   *
   * This method MUST be called for every action evaluation, regardless of
   * whether the outcome is Permit, Deny, or Escalate. The execution gate
   * is responsible for calling this (in a finally block) before returning.
   *
   * The entry is stored in memory for query support. If a sink is injected,
   * the entry is also forwarded to it for durable persistence.
   *
   * @param entry - The complete decision log entry
   * @see docs/specs/architecture.md §6
   */
  record(entry: DecisionLogEntry): void {
    this.entries.push(entry);
    this.sink?.append(entry);
  }

  /**
   * Query decision log entries by Rule Snapshot hash.
   *
   * Returns all log entries produced under the given RS_hash, filtered
   * by the optional query filters. Results are sorted by timestamp
   * descending (most recent first).
   *
   * This enables replay: given a RS_hash and input, the decisions should
   * be reproducible.
   *
   * @param rsHash - The Rule Snapshot hash to query against (required)
   * @param filters - Optional filters: agentId, outcome, timeRange, limit, offset
   * @returns ReadonlyArray<DecisionLogEntry> — matching entries, sorted by timestamp descending
   * @see docs/specs/architecture.md §6
   */
  query(
    rsHash: RuleSnapshotHash,
    filters?: DecisionLogQueryFilters,
  ): ReadonlyArray<DecisionLogEntry> {
    // Step 1: Filter by rs_hash (required).
    let results = this.entries.filter((e) => e.rs_hash === rsHash);

    // Step 2: Apply optional filters (AND semantics).
    if (filters !== undefined) {
      if (filters.agentId !== undefined) {
        results = results.filter((e) => e.agent_id === filters.agentId);
      }
      if (filters.outcome !== undefined) {
        results = results.filter((e) => e.decision === filters.outcome);
      }
      if (filters.timeRange !== undefined) {
        const { from, to } = filters.timeRange;
        if (from !== undefined) {
          results = results.filter((e) => e.timestamp >= from);
        }
        if (to !== undefined) {
          results = results.filter((e) => e.timestamp <= to);
        }
      }
    }

    // Step 3: Sort by timestamp descending (most recent first).
    results.sort((a, b) => {
      if (a.timestamp > b.timestamp) return -1;
      if (a.timestamp < b.timestamp) return 1;
      return 0;
    });

    // Step 4: Apply pagination (offset, then limit).
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit;

    if (limit !== undefined) {
      return results.slice(offset, offset + limit);
    }
    if (offset > 0) {
      return results.slice(offset);
    }

    return results;
  }
}
