/**
 * Archon Kernel — DRR Evaluator
 *
 * Pure, deterministic evaluation of Dynamic Restriction Rules against a
 * proposed capability instance.
 *
 * Allowlist policy (I2):
 * - If no rules apply for a capabilityType → permit (no restrictions).
 * - If deny rules exist and match → deny immediately.
 * - If allow rules exist → allowlist mode: must match at least one allow rule.
 * - If only deny rules exist and none match → permit.
 *
 * This module is side-effect free. It does not read state, perform I/O,
 * or depend on anything outside the kernel type system and the glob matcher.
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 * @see docs/specs/formal_governance.md §5 (I2: restriction monotonicity)
 */

import { matchesGlob } from '@archon/restriction-dsl';
import type { CompiledDRR, DRRCondition } from '@archon/restriction-dsl';
import type { CapabilityInstance } from '../types/capability.js';

// ---------------------------------------------------------------------------
// Evaluation result type (internal to kernel)
// ---------------------------------------------------------------------------

/**
 * Result of evaluating all applicable DRRs against a proposed action.
 *
 * This is an internal kernel type consumed by ValidationEngine.
 * The outcome is 'permit' or 'deny' (not DecisionOutcome) to keep this
 * module free of the full decision type hierarchy.
 */
export interface DRREvalResult {
  readonly outcome: 'permit' | 'deny';
  /**
   * IDs of the rules that determined the outcome.
   * - Deny: IDs of matched deny rules (first match wins).
   * - Permit via allowlist: IDs of matched allow rules.
   * - Permit with no rules: empty array.
   * - Deny via allowlist exhaustion: empty array (no allow rule matched).
   */
  readonly triggeredRules: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all Dynamic Restriction Rules against a proposed action.
 *
 * Evaluation order:
 * 1. Filter rules to those targeting action.type.
 * 2. If no rules → permit (no restrictions).
 * 3. Evaluate deny rules: if any match, deny immediately.
 * 4. If allow rules exist: must match at least one → allowlist mode.
 * 5. If no allow rules: deny rules were the only restrictions; none matched → permit.
 *
 * This function is a pure, deterministic function over its inputs (I4).
 * Given the same action and the same drrs, it always returns the same result.
 *
 * @param action - The capability instance proposed by the agent
 * @param drrs - All compiled DRRs from the active RuleSnapshot
 * @returns DRREvalResult with outcome and triggered rule IDs
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition — conjunction)
 * @see docs/specs/formal_governance.md §5 (I2)
 */
export function evaluateDRRs(
  action: CapabilityInstance,
  drrs: ReadonlyArray<CompiledDRR>,
): DRREvalResult {
  // Filter to rules that apply to this capability type.
  const relevant = drrs.filter((d) => d.capabilityType === action.type);

  if (relevant.length === 0) {
    return { outcome: 'permit', triggeredRules: [] };
  }

  const allowRules = relevant.filter((d) => d.effect === 'allow');
  const denyRules = relevant.filter((d) => d.effect === 'deny');

  // Deny rules are evaluated first: any matching deny rule blocks execution.
  for (const rule of denyRules) {
    if (ruleMatches(rule, action)) {
      return { outcome: 'deny', triggeredRules: [rule.id] };
    }
  }

  // If allow rules exist, the capability type operates in allowlist mode:
  // the action must satisfy at least one allow rule.
  if (allowRules.length > 0) {
    for (const rule of allowRules) {
      if (ruleMatches(rule, action)) {
        return { outcome: 'permit', triggeredRules: [rule.id] };
      }
    }
    // No allow rule matched — allowlist exhausted → deny.
    // triggered_rules is empty because no rule was triggered; the denial
    // is a consequence of the allowlist policy, not a specific rule match.
    return { outcome: 'deny', triggeredRules: [] };
  }

  // Only deny rules existed and none matched → permit.
  return { outcome: 'permit', triggeredRules: [] };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Test whether all conditions of a CompiledDRR match the proposed action.
 *
 * All conditions compose via conjunction (AND). Every condition must hold.
 * There is no OR within a rule (I2: no disjunction between restriction sources).
 *
 * @internal
 */
function ruleMatches(rule: CompiledDRR, action: CapabilityInstance): boolean {
  return rule.conditions.every((cond) => conditionMatches(cond, action));
}

/**
 * Evaluate a single DRRCondition against the proposed action.
 *
 * v0.1: only the 'matches' operator against 'capability.params.*' fields.
 * Unknown fields or operators → condition does not match (safe default).
 *
 * @internal
 */
function conditionMatches(cond: DRRCondition, action: CapabilityInstance): boolean {
  const fieldValue = resolveField(cond.field, action);
  if (typeof fieldValue !== 'string') {
    // v0.1: glob matching requires a string field value.
    // A missing or non-string field does not satisfy a 'matches' condition.
    return false;
  }
  // cond.op is always 'matches' in v0.1; the DRRCondition type enforces this.
  return matchesGlob(cond.value, fieldValue);
}

/**
 * Resolve a dot-notation field path against a CapabilityInstance.
 *
 * Supported prefixes (v0.1):
 * - `capability.params.<key>` → action.params[key]
 *
 * All other paths return undefined.
 *
 * @internal
 */
function resolveField(fieldPath: string, action: CapabilityInstance): unknown {
  const PARAMS_PREFIX = 'capability.params.';
  if (fieldPath.startsWith(PARAMS_PREFIX)) {
    const paramKey = fieldPath.slice(PARAMS_PREFIX.length);
    return action.params[paramKey];
  }
  return undefined;
}
