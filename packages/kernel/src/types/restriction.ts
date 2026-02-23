/**
 * Archon Kernel — Restriction Types
 *
 * Defines the kernel-level restriction types: compiled predicates, conditions,
 * and suggested profile references.
 *
 * Restrictions compose via conjunction, never disjunction.
 *   R_intr(S)(c) = ∧_{m ∈ S} Rₘ(c)
 *
 * This is a hard structural invariant. There is no OR between restriction
 * sources. A capability is permitted only if ALL active restrictions allow it.
 *
 * Re-exports ConditionOperator and RestrictionIR from @archon/restriction-dsl
 * so that consumers of @archon/kernel receive all restriction types from one
 * import location.
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 * @see docs/specs/formal_governance.md §4 (monotonicity properties)
 * @see docs/specs/reestriction-dsl-spec.md §2 (constraints: composable via conjunction)
 * @see docs/specs/module_api.md §5 (intrinsic restrictions)
 */

// Re-export DSL-level restriction types from restriction-dsl for convenience.
// Consumers of @archon/kernel can import ConditionOperator and RestrictionIR
// from here rather than from @archon/restriction-dsl directly.
export type { RestrictionIR } from '@archon/restriction-dsl';
export { ConditionOperator } from '@archon/restriction-dsl';
import type { CapabilityType } from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Kernel-Level Restriction Types
// ---------------------------------------------------------------------------

/**
 * A single condition in a compiled restriction predicate.
 *
 * Conditions are the atomic unit of restriction evaluation.
 * They compare a field reference against a value using a typed operator.
 *
 * @see docs/specs/reestriction-dsl-spec.md §4 (condition syntax)
 */
export interface Condition {
  /** Dot-notation field path: capability.params.*, context.*, workspace.* */
  readonly field: string;
  readonly operator: import('@archon/restriction-dsl').ConditionOperator;
  /** The comparison value. Typed as unknown; runtime validation against the field schema. */
  readonly value: unknown;
}

/**
 * A compiled restriction predicate — the kernel's internal representation
 * of a module intrinsic restriction after DSL compilation.
 *
 * Restriction predicates compose via conjunction:
 *   R_intr(S)(c) = ∧_{m ∈ S} Rₘ(c)
 *
 * All predicates for a capability type must hold for the action to be permitted.
 * There is no disjunction between restriction sources.
 *
 * The `compiled_hash` enables the snapshot to change identity whenever a
 * restriction's content changes — ensuring Invariant I4 (snapshot determinism).
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 * @see docs/specs/reestriction-dsl-spec.md §2 (composable via conjunction)
 */
export interface RestrictionPredicate {
  /** The capability type this predicate applies to. */
  readonly capability_type: CapabilityType;
  /**
   * Compiled conditions. All conditions must hold (implicit AND).
   * There is no OR within a restriction predicate.
   */
  readonly conditions: ReadonlyArray<Condition>;
  /**
   * SHA-256 hash of the canonical IR for this predicate.
   * Included in the rule snapshot hash to ensure snapshot identity
   * changes when restriction content changes.
   *
   * @see docs/specs/reestriction-dsl-spec.md §7 (IR hashing)
   */
  readonly compiled_hash: string;
}

// ---------------------------------------------------------------------------
// Suggested Profile Reference
// ---------------------------------------------------------------------------

/**
 * A non-authoritative profile suggestion from a module.
 *
 * Modules may suggest profiles but cannot apply them.
 * All profile applications require Confirm-on-Change operator flow.
 *
 * @see docs/specs/module_api.md §7 (proposals and configuration hooks)
 * @see docs/specs/profiles.md §2 (confirm-on-change policy)
 */
export interface SuggestedProfile {
  /** Stable identifier for the suggested profile. */
  readonly profile_id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Non-marketing description of what this profile enables. */
  readonly description: string;
  /** Maximum declared risk tier for this profile. */
  readonly max_tier: import('./capability.js').RiskTier;
}
