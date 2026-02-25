/**
 * Archon Kernel — Proposal Types
 *
 * Defines the Proposal model: a durable, human-approved change record
 * for governance operations that require explicit operator confirmation.
 *
 * Proposal types are pure data shapes — no I/O, no enforcement logic.
 * ProposalQueue (packages/module-loader) applies enforcement at apply time.
 *
 * Supported change types (ProposalChange discriminated union):
 *   - enable_capability  — enable a CapabilityType in the CapabilityRegistry
 *   - disable_capability — disable a CapabilityType
 *   - enable_module      — enable a module in the ModuleRegistry
 *   - disable_module     — disable a module
 *   - set_restrictions   — replace restriction rules for a capability type
 *
 * Authority rule (enforced in ProposalQueue.approveProposal):
 *   Only proposers with kind 'human', 'cli', or 'ui' may approve/reject.
 *   Agents (kind='agent') may propose but cannot approve.
 *
 * State machine:
 *   pending → applied   (successful approval + apply)
 *   pending → rejected  (explicit rejection by operator)
 *   pending → failed    (unexpected exception during apply)
 *   pending → pending   (recoverable errors: wrong ack phrase, non-human approver)
 *
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import type { CapabilityType } from './capability.js';
import type { StructuredRestrictionRule } from './restriction.js';

// ---------------------------------------------------------------------------
// Proposer Identity
// ---------------------------------------------------------------------------

/**
 * The kind of entity that submitted or acted on a proposal.
 *
 * Authority rule:
 * - 'human', 'cli', 'ui': may propose AND approve/reject
 * - 'agent': may propose ONLY; cannot approve or reject
 */
export type ProposerKind = 'human' | 'agent' | 'cli' | 'ui';

/**
 * Identity of the entity that submitted or acted on a proposal.
 */
export interface ProposedBy {
  readonly kind: ProposerKind;
  /**
   * Stable identifier for this proposer. Examples:
   * - 'operator' for CLI interactive sessions
   * - 'desktop-ui' for the desktop UI
   * - agent_id string for AI agents
   */
  readonly id: string;
}

// ---------------------------------------------------------------------------
// Proposal Status
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a proposal.
 *
 * Transitions:
 *   pending → applied   Approval succeeded and change was applied
 *   pending → rejected  Operator explicitly rejected the proposal
 *   pending → failed    Unexpected exception during apply
 *   pending → pending   Recoverable error (wrong ack phrase, non-human approver, etc.)
 */
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'failed';

// ---------------------------------------------------------------------------
// Proposal Kind
// ---------------------------------------------------------------------------

/**
 * Identifies the type of governance change the proposal represents.
 * Matches the `kind` discriminant on ProposalChange.
 */
export type ProposalKind =
  | 'enable_capability'
  | 'disable_capability'
  | 'enable_module'
  | 'disable_module'
  | 'set_restrictions';

// ---------------------------------------------------------------------------
// Proposal Change (discriminated union)
// ---------------------------------------------------------------------------

/**
 * Enable a capability type in the CapabilityRegistry.
 *
 * Requires: declaring module must be enabled.
 * May require: typed ack phrase (T3 tier), hazard confirmations.
 */
export interface EnableCapabilityChange {
  readonly kind: 'enable_capability';
  readonly capabilityType: CapabilityType;
}

/**
 * Disable a capability type in the CapabilityRegistry.
 */
export interface DisableCapabilityChange {
  readonly kind: 'disable_capability';
  readonly capabilityType: CapabilityType;
}

/**
 * Enable a module in the ModuleRegistry.
 */
export interface EnableModuleChange {
  readonly kind: 'enable_module';
  readonly moduleId: string;
}

/**
 * Disable a module in the ModuleRegistry.
 */
export interface DisableModuleChange {
  readonly kind: 'disable_module';
  readonly moduleId: string;
}

/**
 * Replace restriction rules for the capability types covered by `rules`.
 *
 * `rules` contains fully-compiled StructuredRestrictionRules.
 * `dslSource` is optional — recorded for audit/display when rules were
 * compiled from DSL source at proposal-creation time. Not used during apply.
 */
export interface SetRestrictionsChange {
  readonly kind: 'set_restrictions';
  /**
   * The complete set of rules to apply.
   * These replace any existing rules for the affected capability types.
   */
  readonly rules: ReadonlyArray<StructuredRestrictionRule>;
  /**
   * Original DSL source (if rules were compiled from DSL). For audit only.
   * Not used during apply — `rules` is the authoritative payload.
   */
  readonly dslSource?: string | undefined;
}

/**
 * Discriminated union of all supported proposal change types.
 *
 * Use an exhaustive switch with a `never` fallthrough check to handle
 * all variants. TypeScript will report an error if a new variant is
 * added to this union without being handled.
 *
 * @example
 * function describe(change: ProposalChange): string {
 *   switch (change.kind) {
 *     case 'enable_capability': return `enable ${change.capabilityType}`;
 *     case 'disable_capability': return `disable ${change.capabilityType}`;
 *     case 'enable_module': return `enable module ${change.moduleId}`;
 *     case 'disable_module': return `disable module ${change.moduleId}`;
 *     case 'set_restrictions': return `set ${change.rules.length} rules`;
 *     default: { const _exhaustive: never = change; return _exhaustive; }
 *   }
 * }
 */
export type ProposalChange =
  | EnableCapabilityChange
  | DisableCapabilityChange
  | EnableModuleChange
  | DisableModuleChange
  | SetRestrictionsChange;

// ---------------------------------------------------------------------------
// Proposal Preview
// ---------------------------------------------------------------------------

/**
 * Pre-computed summary of what applying this proposal requires.
 *
 * Computed at proposal-creation time from current governance state and
 * stored in the Proposal so the approver sees what was true when the
 * proposal was created (state may change before approval).
 *
 * Note: requirements are re-validated at apply time. The preview is for
 * operator display only and does not bypass enforcement.
 */
export interface ProposalPreview {
  /** Human-readable one-line summary of the change. */
  readonly changeSummary: string;
  /**
   * Whether a typed acknowledgment phrase is required to approve.
   * True iff the capability tier is in TYPED_ACK_REQUIRED_TIERS (currently T3 only).
   */
  readonly requiresTypedAck: boolean;
  /**
   * The exact phrase the approver must type, if requiresTypedAck is true.
   * Format: "I ACCEPT T3 RISK (<capabilityType>)".
   * Undefined when requiresTypedAck is false.
   */
  readonly requiredAckPhrase?: string | undefined;
  /**
   * Hazard pairs triggered by this proposal (partner already enabled at proposal time).
   * Each entry is [type_a, type_b] as defined in the hazard matrix.
   */
  readonly hazardsTriggered: ReadonlyArray<readonly [CapabilityType, CapabilityType]>;
  /**
   * Whether explicit hazard pair confirmation is required to approve.
   * True iff hazardsTriggered is non-empty.
   */
  readonly requiresHazardConfirm: boolean;
}

// ---------------------------------------------------------------------------
// Proposal (full record)
// ---------------------------------------------------------------------------

/**
 * A durable governance proposal record.
 *
 * Proposals are created in 'pending' status. State transitions update
 * the status and populate the appropriate resolution fields
 * (approvedBy, rejectedBy, failureReason, rsHashAfter, etc.).
 *
 * Proposals are persisted to the project's state directory via the injected StateIO.
 * Each state transition is also appended to the project's `proposal-events.jsonl`.
 */
export interface Proposal {
  /** Unique identifier (UUIDv4). */
  readonly id: string;
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
  /** Entity that submitted this proposal. */
  readonly createdBy: ProposedBy;
  /** Current lifecycle status. */
  readonly status: ProposalStatus;
  /** The kind of governance change. Matches change.kind. */
  readonly kind: ProposalKind;
  /** The full change payload. */
  readonly change: ProposalChange;
  /**
   * Pre-computed preview of requirements at proposal-creation time.
   * Informational only — requirements are re-validated at apply time.
   */
  readonly preview: ProposalPreview;

  // -- Resolution fields: populated when status transitions from 'pending' --

  /** Entity that approved this proposal. Set when status = 'applied'. */
  readonly approvedBy?: ProposedBy | undefined;
  /** ISO 8601 timestamp of approval action. Set when status = 'applied'. */
  readonly approvedAt?: string | undefined;

  /** Entity that rejected this proposal. Set when status = 'rejected'. */
  readonly rejectedBy?: ProposedBy | undefined;
  /** ISO 8601 timestamp of rejection action. Set when status = 'rejected'. */
  readonly rejectedAt?: string | undefined;
  /** Reason provided by the rejector. */
  readonly rejectionReason?: string | undefined;

  /** ISO 8601 timestamp when apply completed. Set when status = 'applied'. */
  readonly appliedAt?: string | undefined;

  /** ISO 8601 timestamp when apply failed with an exception. Set when status = 'failed'. */
  readonly failedAt?: string | undefined;
  /** Error detail when status = 'failed'. */
  readonly failureReason?: string | undefined;

  /**
   * RS_hash of the rule snapshot after this proposal was applied.
   * Set when status = 'applied'. Written as null initially (two-phase write);
   * patched by the caller after computing the post-apply snapshot hash.
   */
  readonly rsHashAfter?: string | null | undefined;
}

// ---------------------------------------------------------------------------
// Proposal Summary (list view)
// ---------------------------------------------------------------------------

/**
 * Abbreviated proposal record for list display.
 *
 * Contains only the fields needed for the Proposals panel list view.
 * Fetch the full Proposal via ProposalQueue.getProposal() for details.
 */
export interface ProposalSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly status: ProposalStatus;
  readonly kind: ProposalKind;
  readonly changeSummary: string;
  readonly createdBy: ProposedBy;
}

// ---------------------------------------------------------------------------
// ApproveResult
// ---------------------------------------------------------------------------

/**
 * Result of ProposalQueue.approveProposal().
 *
 * On success (applied=true):
 *   - proposal status is 'applied'
 *   - ackEpoch reflects the new count (incremented if T3 was acknowledged)
 *   - rsHashAfter is the RS_hash after applying the change
 *
 * On recoverable failure (applied=false, proposal stays 'pending'):
 *   - error describes the exact problem (wrong ack phrase, non-human approver, etc.)
 *   - The caller may retry with corrected inputs
 *
 * On unrecoverable failure (applied=false, proposal may be 'failed'):
 *   - error describes the exception
 */
export interface ApproveResult {
  /** Whether the proposal was successfully applied. */
  readonly applied: boolean;
  /**
   * ack_epoch after this operation.
   * On success: potentially incremented (if T3 was acknowledged).
   * On failure: unchanged epoch at the time of the operation.
   */
  readonly ackEpoch: number;
  /**
   * RS_hash immediately after apply. Present only when applied=true.
   */
  readonly rsHashAfter?: string | undefined;
  /**
   * Error description if applied=false.
   * Undefined when applied=true.
   */
  readonly error?: string | undefined;
}
