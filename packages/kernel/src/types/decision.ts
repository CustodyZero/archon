/**
 * Archon Kernel — Decision Types
 *
 * Defines the decision outcomes and the decision log entry structure.
 *
 * Every action evaluation — including denied ones — must produce a
 * DecisionLog entry. No decision goes unlogged.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 * @see docs/specs/authority_and_composition_spec.md §10 (logging and inspectability)
 */

import type { CapabilityInstance } from './capability.js';
import type { RuleSnapshotHash } from './snapshot.js';

// ---------------------------------------------------------------------------
// Decision Outcome
// ---------------------------------------------------------------------------

/**
 * The three possible outcomes of kernel validation.
 *
 * Deny overrides Allow. Restrictions override capability permissions.
 * Escalate is a deterministic outcome requiring explicit operator approval
 * before execution can proceed.
 *
 * @see docs/specs/authority_and_composition_spec.md §5 (composition semantics)
 * @see docs/specs/authority_and_composition_spec.md §5.2 (escalation)
 */
export enum DecisionOutcome {
  /** Action is within capability bounds and satisfies all restrictions. */
  Permit = 'Permit',
  /** Action is outside capability bounds or violates a restriction. */
  Deny = 'Deny',
  /**
   * Action requires explicit operator approval before execution.
   * Triggered by explicit DRR conditions or CCM-defined escalation requirements.
   * Escalation is not autonomous — it pauses execution and awaits human decision.
   */
  Escalate = 'Escalate',
}

// ---------------------------------------------------------------------------
// Decision Log Entry
// ---------------------------------------------------------------------------

/**
 * A structured log entry for a single action evaluation.
 *
 * All fields are required — every decision must be fully attributed.
 * No optional fields. An incomplete log entry indicates a system integrity failure.
 *
 * Decision log invariants:
 * - Every evaluation produces exactly one log entry
 * - The entry is recorded regardless of outcome (Permit, Deny, or Escalate)
 * - Given rs_hash and proposed_action, the decision must be reproducible
 * - Logs must allow replay under the same RS_hash
 *
 * @see docs/specs/architecture.md §6
 * @see docs/specs/authority_and_composition_spec.md §10
 */
export interface DecisionLog {
  /** Identifier of the agent that proposed the action. */
  readonly agent_id: string;
  /** The capability instance proposed by the agent. */
  readonly proposed_action: CapabilityInstance;
  /** The validation outcome. */
  readonly decision: DecisionOutcome;
  /**
   * Identifiers of the rules that were triggered (for Deny or Escalate).
   * Empty array for Permit decisions with no triggered restrictions.
   */
  readonly triggered_rules: ReadonlyArray<string>;
  /**
   * SHA-256 hash of the Rule Snapshot used for this evaluation.
   * Enables replay: given this hash and proposed_action, the decision
   * must be reproducible.
   */
  readonly rs_hash: RuleSnapshotHash;
  /** SHA-256 hash of the canonical input (action + context). */
  readonly input_hash: string;
  /**
   * SHA-256 hash of the execution output, if the action was permitted
   * and executed. Null if the action was denied or escalated.
   */
  readonly output_hash: string | null;
  /** ISO 8601 timestamp of the evaluation. */
  readonly timestamp: string;
}
