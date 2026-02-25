/**
 * Archon Kernel — Capability Types
 *
 * Defines the risk tier model and capability descriptor/instance types.
 * CapabilityType is re-exported from @archon/restriction-dsl, which is the
 * canonical location for the taxonomy (restriction-dsl builds before kernel
 * and restriction predicates are scoped by capability type).
 *
 * @see docs/specs/capabilities.md (capability taxonomy, risk tier model)
 * @see docs/specs/module_api.md §3 (capability descriptors)
 * @see docs/specs/formal_governance.md §7 (risk tier model)
 */

// Re-export CapabilityType from restriction-dsl. It is canonical there because
// the restriction compiler scopes predicates by capability type and must build
// first. Consumers of @archon/kernel receive CapabilityType from here.
export { CapabilityType } from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Risk Tier Model
// ---------------------------------------------------------------------------

/**
 * Risk tier enumeration with strict ordering: T0 < T1 < T2 < T3.
 *
 * System tier is defined as:
 *   Tier(S) = max_{c ∈ C_eff(S)} Tier(c)
 *
 * Tier elevation from the current system tier requires typed operator
 * acknowledgment (Invariant I5). Modules cannot suppress this requirement.
 *
 * @see docs/specs/capabilities.md §2 (risk tier model)
 * @see docs/specs/formal_governance.md §7 (risk tier formalism)
 */
export enum RiskTier {
  /** Chat only. No tool invocation, no spawning, no I/O, no network. */
  T0 = 'T0',
  /** Read-only / low risk. Limited file read, restricted HTTP fetch. */
  T1 = 'T1',
  /** Mutating / bounded. Controlled writes, agent spawning (restricted). */
  T2 = 'T2',
  /** High risk. Subprocess execution, credential usage, broad network egress. */
  T3 = 'T3',
}

/**
 * The numeric ordering of risk tiers for comparison.
 * Use this map to enforce T0 < T1 < T2 < T3 invariant in validation logic.
 *
 * @see docs/specs/formal_governance.md §7
 */
export const RISK_TIER_ORDER: Readonly<Record<RiskTier, number>> = {
  [RiskTier.T0]: 0,
  [RiskTier.T1]: 1,
  [RiskTier.T2]: 2,
  [RiskTier.T3]: 3,
} as const;

// ---------------------------------------------------------------------------
// Capability Descriptor
// ---------------------------------------------------------------------------

/**
 * A hazard pair declaration: two capability types that, when both enabled,
 * require explicit operator confirmation.
 *
 * @see docs/specs/formal_governance.md §8 (hazard composition model)
 * @see docs/specs/governance.md §2 (hazard matrix)
 */
export interface HazardPair {
  readonly type_a: import('@archon/restriction-dsl').CapabilityType;
  readonly type_b: import('@archon/restriction-dsl').CapabilityType;
  readonly description?: string | undefined;
}

/**
 * A capability descriptor as declared by a module in its manifest.
 *
 * Capability descriptors are declarative metadata — they do not execute.
 * The kernel validates descriptors at module load time (Invariant I7).
 *
 * Invariant: `default_enabled` MUST be false unless explicitly included in
 * a documented default profile and approved by maintainer. The module loader
 * enforces this at load time. New modules shipping with `default_enabled: true`
 * will be rejected.
 *
 * @see docs/specs/module_api.md §3 (capability descriptors)
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 */
export interface CapabilityDescriptor {
  /** Stable globally unique module identifier. */
  readonly module_id: string;
  /** Stable identifier for this capability within the module. */
  readonly capability_id: string;
  /** Capability type — must exist in the core taxonomy. */
  readonly type: import('@archon/restriction-dsl').CapabilityType;
  /** Risk tier — must match or be stricter than the taxonomy constraint. */
  readonly tier: RiskTier;
  /**
   * JSON Schema fragment describing the capability's parameter shape.
   * Used by the kernel to validate capability instances at evaluation time.
   */
  readonly params_schema: Record<string, unknown>;
  /**
   * Whether this capability requires a typed operator acknowledgment.
   * Must match or be stricter than the taxonomy requirement.
   */
  readonly ack_required: boolean;
  /**
   * Whether this capability is enabled by default.
   *
   * MUST be false. The module loader rejects any module declaring
   * `default_enabled: true` without explicit documented exception.
   * This enforces Invariant I1 (deny-by-default capability).
   *
   * @see docs/specs/formal_governance.md §5 (I1)
   */
  readonly default_enabled: boolean;
  /** Hazard pairs involving this capability type. */
  readonly hazards: ReadonlyArray<HazardPair>;
}

// ---------------------------------------------------------------------------
// Capability Instance
// ---------------------------------------------------------------------------

/**
 * A resolved capability with bound parameters — the concrete form of a
 * proposed agent action submitted to the validation engine.
 *
 * A CapabilityInstance is what an agent produces when it proposes an action.
 * The kernel validates it against the active Rule Snapshot.
 *
 * P4 (Project Scoping): `project_id` is the governance isolation boundary.
 * The ValidationEngine denies any action whose `project_id` does not match
 * the `project_id` in the active Rule Snapshot (Invariant I2-P4).
 *
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/module_api.md §4 (tool implementations)
 */
export interface CapabilityInstance {
  /**
   * The project this action is being proposed for.
   *
   * Must match the `project_id` in the active Rule Snapshot.
   * A mismatch causes the ValidationEngine to Deny with triggered_rules=['project_mismatch'].
   * This prevents an action scoped to project A from being evaluated against
   * project B's snapshot — enforcing governance isolation across projects.
   */
  readonly project_id: string;
  /** The capability descriptor's capability_id. */
  readonly capability_id: string;
  /** The module that declared this capability. */
  readonly module_id: string;
  /** Resolved capability type — used for taxonomy soundness check. */
  readonly type: import('@archon/restriction-dsl').CapabilityType;
  /** Resolved risk tier. */
  readonly tier: RiskTier;
  /** Bound parameters for this invocation. Must conform to params_schema. */
  readonly params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Capability Set
// ---------------------------------------------------------------------------

/**
 * The set of capability descriptors contributed by enabled modules.
 *
 * C(S) = ⋃_{m ∈ S} Cₘ
 * S = ∅ ⇒ C(S) = ∅   (Invariant I1: deny-by-default)
 *
 * @see docs/specs/formal_governance.md §2 (capability construction)
 */
export type CapabilitySet = ReadonlySet<CapabilityDescriptor>;
