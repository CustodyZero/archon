/**
 * Archon Kernel — Deterministic Validation Engine
 *
 * The ValidationEngine is the core enforcement logic of the Archon kernel.
 * It evaluates proposed agent actions against an active Rule Snapshot and
 * returns a deterministic outcome.
 *
 * This class is responsible for maintaining all seven governance invariants:
 *
 * I1 — Deny-by-default capability:
 *   No capability exists unless explicitly enabled. S = ∅ ⇒ C(S) = ∅.
 *   If the action is not in the enabled capability set, it is denied.
 *
 * I2 — Restriction monotonicity:
 *   Dynamic restriction rules may reduce capability, never expand it.
 *   C_eff(S) ⊆ C(S). No rule may widen what an agent is permitted to do.
 *
 * I3 — Human approval required for capability expansion:
 *   Enabling a capability module requires explicit operator confirmation.
 *   The engine does not expand capability autonomously.
 *
 * I4 — Snapshot determinism:
 *   Given identical snapshot and identical action, the decision is always
 *   identical. D(action, RS₁) = D(action, RS₂) when RS₁ = RS₂.
 *   The engine has no side effects that affect evaluation outcome.
 *
 * I5 — Typed acknowledgment on tier elevation:
 *   Enabling T3 capabilities or elevating system risk tier requires typed
 *   acknowledgment. The engine enforces tier constraints.
 *
 * I6 — Delegation non-escalation:
 *   An agent may not cause another agent to execute capabilities it does
 *   not itself possess. (a_i → a_j) ∈ G ⇒ a_i may request a_j only for
 *   c ∈ C_eff(S, a_j). Delegation does not expand authority.
 *
 * I7 — Taxonomy soundness:
 *   Unknown capability types are rejected. Enforced by the module loader
 *   at load time, verified by the engine at evaluation time.
 *
 * @see docs/specs/formal_governance.md §5 (governance invariant set)
 * @see docs/specs/formal_governance.md §6 (invariant preservation under module stacking)
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/authority_and_composition_spec.md §5 (composition semantics)
 */

import type { CapabilityInstance } from '../types/capability.js';
import { CapabilityType } from '../types/capability.js';
import { DecisionOutcome } from '../types/decision.js';
import type { RuleSnapshot } from '../types/snapshot.js';

/**
 * The deterministic validation engine.
 *
 * Evaluates proposed agent actions against an active Rule Snapshot.
 * The engine is a pure function over its inputs — given the same snapshot
 * and the same action, it returns the same decision.
 *
 * This class cannot be modified by modules. The kernel logic is immutable
 * and not modifiable by modules (formal_governance.md §6).
 *
 * @see docs/specs/architecture.md §4 (validation flow, steps 3–4)
 * @see docs/specs/formal_governance.md §5 (seven governance invariants)
 */
export class ValidationEngine {
  /**
   * Evaluate a proposed capability instance against the active Rule Snapshot.
   *
   * Evaluation logic (composition semantics, Policy A):
   *   Permit iff:
   *     1. Capability containment: action ∈ C(S)  [Invariant I1, I7]
   *     2. Restriction compliance: Valid(action, R_d) = true  [Invariant I2]
   *   If (1) fails → Deny
   *   If (2) fails → Deny or Escalate (per explicit DRR/CCM conditions)
   *   Deny overrides Allow. No implicit widening.
   *
   * @param action - The capability instance proposed by the agent
   * @param snapshot - The active, immutable Rule Snapshot to evaluate against
   * @returns DecisionOutcome — Permit, Deny, or Escalate
   *
   * @throws {NotImplementedError} — stub implementation
   *   Will implement:
   *   - Capability containment check against snapshot.ccm_enabled (I1, I7)
   *   - Intrinsic restriction evaluation for all enabled modules (I2)
   *   - Dynamic restriction rule evaluation from snapshot.drr_canonical (I2)
   *   - Delegation non-escalation check for agent.spawn and delegation types (I6)
   *   - Tier constraint enforcement (I5)
   *   - Escalation condition detection per explicit DRR/CCM triggers
   *
   * @see docs/specs/formal_governance.md §5 (I1–I7 invariants)
   * @see docs/specs/authority_and_composition_spec.md §5 (composition semantics)
   */
  evaluate(
    action: CapabilityInstance,
    snapshot: RuleSnapshot,
  ): DecisionOutcome {
    // I7: taxonomy soundness — defense-in-depth check at evaluation time.
    // The module loader enforces I7 at load time; this is the evaluation-time check.
    const validTypes = new Set<string>(Object.values(CapabilityType));
    if (!validTypes.has(action.type)) {
      return DecisionOutcome.Deny;
    }

    // I1 (capability level): the action's type must appear in enabled_capabilities.
    // Both conditions are required: type in enabled_capabilities AND type declared
    // by an enabled module (checked below).
    const enabledCapSet = new Set<string>(snapshot.enabled_capabilities);
    if (!enabledCapSet.has(action.type)) {
      return DecisionOutcome.Deny;
    }

    // I1 (module level): the action must match a capability descriptor in an
    // enabled module. Both module_id and capability_id must match.
    const found = snapshot.ccm_enabled.some((module) =>
      module.capability_descriptors.some(
        (d) =>
          d.module_id === action.module_id &&
          d.capability_id === action.capability_id,
      ),
    );
    if (!found) {
      return DecisionOutcome.Deny;
    }

    // TODO I2: restriction evaluation — formal_governance.md §5 I2
    // Intrinsic restriction predicates and DRR evaluation are not yet implemented.
    // When implemented: evaluate snapshot.ccm_enabled[*].compiled_restrictions
    // and snapshot.drr_canonical against action.params via conjunction.

    // TODO I5: tier acknowledgment enforcement — formal_governance.md §5 I5
    // When implemented: check action.tier against system tier; deny if typed
    // acknowledgment was not recorded for this tier level.

    // TODO I6: delegation non-escalation — formal_governance.md §5 I6
    // When implemented: for agent.spawn and delegation capability types, verify
    // the requesting agent's effective capability set contains the delegated scope.

    return DecisionOutcome.Permit;
  }
}
