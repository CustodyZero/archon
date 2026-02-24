/**
 * Archon Restriction DSL — Core Type Definitions
 *
 * This module defines all types for the Restriction DSL: the capability
 * taxonomy, condition operators, AST nodes, compiled IR, and result types.
 *
 * These types are the base layer of the Archon type system. The kernel
 * depends on this package; this package has no internal Archon dependencies.
 *
 * @see docs/specs/reestriction-dsl-spec.md
 * @see docs/specs/capabilities.md (capability taxonomy)
 * @see docs/specs/formal_governance.md §4 (restriction monotonicity)
 * @see docs/specs/formal_governance.md §5 (governance invariant set)
 */

// ---------------------------------------------------------------------------
// Capability Taxonomy
// ---------------------------------------------------------------------------

/**
 * The canonical set of capability types recognized by the Archon kernel.
 *
 * No module may introduce new capability types at runtime.
 * New types require a core taxonomy change via PR.
 * Unknown types are rejected at module load time (Invariant I7).
 *
 * @see docs/specs/capabilities.md §3 (capability families)
 * @see docs/specs/formal_governance.md §12 (taxonomy soundness)
 */
export enum CapabilityType {
  // Agent Coordination
  /** Spawn a subordinate agent. Tier T2. */
  AgentSpawn = 'agent.spawn',
  /** Send a message to another agent. Tier T1. */
  AgentMessageSend = 'agent.message.send',
  /** Grant delegation authority to another agent. Tier T2. */
  AgentDelegationGrant = 'agent.delegation.grant',
  /** Revoke delegation from another agent. Tier T1. */
  AgentDelegationRevoke = 'agent.delegation.revoke',
  /** Terminate a running agent. Tier T2. */
  AgentTerminate = 'agent.terminate',

  // Filesystem
  /** Read files matching a path glob. Tier T1. */
  FsRead = 'fs.read',
  /** List files matching a path glob. Tier T1. */
  FsList = 'fs.list',
  /** Write files matching a path glob. Tier T2. */
  FsWrite = 'fs.write',
  /** Delete files matching a path glob. Tier T3. Typed acknowledgment required. */
  FsDelete = 'fs.delete',

  // Execution
  /** Execute a subprocess. Tier T3. Typed acknowledgment required. */
  ExecRun = 'exec.run',

  // Network
  /** Perform HTTP fetch to declared domain allowlist. Tier T1. */
  NetFetchHttp = 'net.fetch.http',
  /** Raw network egress to declared address allowlist. Tier T3. Typed acknowledgment required. */
  NetEgressRaw = 'net.egress.raw',

  // Credentials / Secrets
  /** Read secret values by ID. Tier T2. */
  SecretsRead = 'secrets.read',
  /** Use a secret value (flow to declared sink). Tier T3. Typed acknowledgment required. */
  SecretsUse = 'secrets.use',
  /** Inject a secret into a process environment. Tier T3. Typed acknowledgment required. */
  SecretsInjectEnv = 'secrets.inject.env',

  // Operator Interaction
  /** Request explicit operator approval. Tier T0. */
  UiRequestApproval = 'ui.request_approval',
  /** Present a risk acknowledgment prompt to the operator. Tier T0. */
  UiPresentRiskAck = 'ui.present_risk_ack',
  /** Request operator clarification. Tier T0. */
  UiRequestClarification = 'ui.request_clarification',

  // Inference
  /** Invoke an LLM inference call via a provider module. Tier T1. */
  LlmInfer = 'llm.infer',
}

// ---------------------------------------------------------------------------
// Condition Operators
// ---------------------------------------------------------------------------

/**
 * All comparison operators available in the Archon Restriction DSL.
 *
 * These operators are intentionally limited. No arbitrary expressions,
 * no function calls, no dynamic dispatch. The DSL must be non-Turing-complete.
 *
 * @see docs/specs/reestriction-dsl-spec.md §4.2
 */
export enum ConditionOperator {
  /** Exact equality. */
  Eq = '==',
  /** Inequality. */
  Neq = '!=',
  /** Less than or equal (numeric). */
  Lte = '<=',
  /** Greater than or equal (numeric). */
  Gte = '>=',
  /** Less than (numeric). */
  Lt = '<',
  /** Greater than (numeric). */
  Gt = '>',
  /** Value is a member of a declared list. */
  In = 'in',
  /** Value is not a member of a declared list. */
  NotIn = 'not_in',
  /** String matches a glob pattern (no regex). */
  Matches = 'matches',
  /** Field is present and non-null. */
  IsDefined = 'is_defined',
  /** Field is absent or null. */
  IsNull = 'is_null',
}

// ---------------------------------------------------------------------------
// AST (Abstract Syntax Tree) — produced by parser
// ---------------------------------------------------------------------------

/**
 * A value node in the DSL AST.
 *
 * Values are restricted to literals, lists, context references, and
 * string concatenation for glob construction only.
 * No variables, no assignments, no computed values beyond these forms.
 *
 * @see docs/specs/reestriction-dsl-spec.md §4.3
 */
export type ASTValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'list'; readonly values: ReadonlyArray<ASTValue> }
  | { readonly kind: 'context_ref'; readonly path: string }
  | {
      readonly kind: 'string_concat';
      readonly left: ASTValue;
      readonly right: ASTValue;
    };

/**
 * A single condition node in the DSL AST.
 *
 * @see docs/specs/reestriction-dsl-spec.md §4
 */
export interface ASTCondition {
  /** Dot-notation field reference into capability.params.*, context.*, or workspace.*. */
  readonly fieldPath: string;
  readonly operator: ConditionOperator;
  readonly value: ASTValue;
}

/**
 * The top-level AST for a restriction block.
 *
 * A restriction is scoped to exactly one capability type.
 * All conditions within a block compose via logical AND.
 * There is no OR within a restriction block.
 *
 * @see docs/specs/reestriction-dsl-spec.md §3
 */
export interface RestrictionAST {
  readonly capabilityType: CapabilityType;
  readonly conditions: ReadonlyArray<ASTCondition>;
}

// ---------------------------------------------------------------------------
// Compiled IR (Internal Representation) — produced by compiler
// ---------------------------------------------------------------------------

/**
 * A value in compiled IR form. Structurally identical to ASTValue but
 * represents the post-compilation canonical form.
 *
 * @see docs/specs/reestriction-dsl-spec.md §7
 */
export type IRValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'list'; readonly values: ReadonlyArray<IRValue> }
  | { readonly kind: 'context_ref'; readonly path: string }
  | {
      readonly kind: 'string_concat';
      readonly left: IRValue;
      readonly right: IRValue;
    };

/**
 * A condition in compiled IR form.
 *
 * @see docs/specs/reestriction-dsl-spec.md §7
 */
export interface IRCondition {
  readonly field: string;
  readonly operator: ConditionOperator;
  readonly value: IRValue;
}

/**
 * The compiled internal representation of a restriction block.
 *
 * IR is:
 * - Deterministic: identical DSL source produces identical IR
 * - Canonical: stable key ordering, normalized values
 * - Hashable: included in the rule snapshot hash
 *
 * The IR format is a kernel-internal concern. Modules interact with
 * DSL source only — they never produce or consume IR directly.
 *
 * @see docs/specs/reestriction-dsl-spec.md §7
 * @see docs/specs/formal_governance.md §10 (snapshot determinism)
 */
export interface RestrictionIR {
  readonly capabilityType: CapabilityType;
  readonly conditions: ReadonlyArray<IRCondition>;
}

// ---------------------------------------------------------------------------
// Parse and Validation Result Types
// ---------------------------------------------------------------------------

/**
 * A parse error produced by the DSL parser.
 *
 * @see docs/specs/reestriction-dsl-spec.md §7.2
 */
export interface ParseError {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/**
 * Result of parsing a DSL source string.
 * A discriminated union: either the AST or a list of parse errors.
 *
 * @see docs/specs/reestriction-dsl-spec.md §7
 */
export type ParseResult =
  | { readonly ok: true; readonly ast: RestrictionAST }
  | { readonly ok: false; readonly errors: ReadonlyArray<ParseError> };

/**
 * A validation error produced by the DSL compiler or module validator.
 */
export interface ValidationError {
  readonly message: string;
  readonly context?: string | undefined;
}

/**
 * Generic validation result type.
 *
 * Used by the DSL compiler (validate function) and by the module-loader
 * validator for manifest and capability type validation.
 *
 * - `ValidationResult<void>`: success has no value (structural validation only)
 * - `ValidationResult<T>`: success carries a typed value
 */
export type ValidationResult<T = void> =
  | (T extends void ? { readonly ok: true } : { readonly ok: true; readonly value: T })
  | { readonly ok: false; readonly errors: ReadonlyArray<ValidationError> };

// ---------------------------------------------------------------------------
// Dynamic Restriction Rule (DRR) Types
// ---------------------------------------------------------------------------

/**
 * Effect of a Dynamic Restriction Rule: allow or deny.
 *
 * - 'allow': if any allow rules exist for a capabilityType, all of them act as
 *   an allowlist — the action must satisfy at least one allow rule to proceed.
 * - 'deny': the action is denied if any deny rule conditions match.
 *
 * Deny always overrides allow. Restrictions compose via conjunction (I2).
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 */
export type DRREffect = 'allow' | 'deny';

/**
 * A single condition within a Dynamic Restriction Rule (v0.1).
 *
 * v0.1 supports only the 'matches' operator with glob patterns.
 * The only supported field prefix is 'capability.params.*'.
 *
 * @see docs/specs/reestriction-dsl-spec.md §4 (condition syntax)
 */
export interface DRRCondition {
  /** Dot-notation field reference, e.g. 'capability.params.path'. */
  readonly field: string;
  /** v0.1: only 'matches' (glob pattern). */
  readonly op: 'matches';
  /** Glob pattern to match against, e.g. './docs/**'. */
  readonly value: string;
}

/**
 * A structured restriction rule in operator-facing JSON form.
 *
 * This is the persisted, human-readable representation of a DRR.
 * It is compiled to CompiledDRR before being included in a RuleSnapshot.
 *
 * @see docs/specs/reestriction-dsl-spec.md §3 (restriction model)
 */
export interface StructuredRestrictionRule {
  /** Stable operator-assigned identifier, e.g. 'drr:1'. */
  readonly id: string;
  /** The capability type this restriction targets. */
  readonly capabilityType: CapabilityType;
  /** Effect: restrict to allow-listed paths (allow) or block matching paths (deny). */
  readonly effect: DRREffect;
  /** Conditions. All conditions compose via conjunction (implicit AND). */
  readonly conditions: ReadonlyArray<DRRCondition>;
}

/**
 * A compiled Dynamic Restriction Rule (DRR) — the kernel's internal form.
 *
 * CompiledDRR is what the SnapshotBuilder includes in drr_canonical.
 * The ValidationEngine evaluates CompiledDRR against proposed actions.
 *
 * The ir_hash covers (effect + capabilityType + conditions) but NOT id,
 * so equivalent rules from different input paths (structured JSON vs. DSL text)
 * produce identical ir_hash values.
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 * @see docs/specs/reestriction-dsl-spec.md §7 (IR hashing)
 */
export interface CompiledDRR {
  /** Stable operator-assigned identifier. Matches StructuredRestrictionRule.id. */
  readonly id: string;
  readonly effect: DRREffect;
  readonly capabilityType: CapabilityType;
  /** Compiled conditions. All must hold (implicit AND). */
  readonly conditions: ReadonlyArray<DRRCondition>;
  /**
   * SHA-256 hash of canonical(effect + capabilityType + conditions).
   * Does not include 'id' — equivalent rules produce identical ir_hash.
   * Included in the rule snapshot hash to satisfy Invariant I4.
   */
  readonly ir_hash: string;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Thrown by all stub implementations to mark unfinished kernel logic.
 *
 * Every stub body throws this error with a reference to the spec section
 * it will implement. This error must never appear in a production code path.
 * If it surfaces at runtime, it means a stub was not replaced before deployment.
 */
export class NotImplementedError extends Error {
  constructor(specReference: string) {
    super(`Not implemented. Spec reference: ${specReference}`);
    this.name = 'NotImplementedError';
  }
}
