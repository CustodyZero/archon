/**
 * Archon Module Loader — Proposal Queue
 *
 * Implements the Proposal Queue: a durable, human-approval workflow for
 * governance operations. Operators (CLI, desktop UI) submit proposals for
 * changes; a human approver reviews and explicitly approves or rejects each.
 *
 * Supported change types:
 *   enable_capability  — enable a CapabilityType (calls applyEnableCapability)
 *   disable_capability — disable a CapabilityType
 *   enable_module      — enable a module in the ModuleRegistry
 *   disable_module     — disable a module
 *   set_restrictions   — replace restriction rules for affected capability types
 *
 * Authority rule:
 *   Only proposers with kind 'human', 'cli', or 'ui' may approve or reject.
 *   Agents (kind='agent') may propose but cannot approve or reject.
 *   Violations return applied=false (recoverable error); proposal stays 'pending'.
 *
 * State machine:
 *   pending → applied   Approval + apply succeeded
 *   pending → rejected  Explicit rejection
 *   pending → failed    Unexpected exception during apply
 *   pending → pending   Recoverable errors (wrong ack phrase, non-human approver, etc.)
 *
 * Persistence:
 *   proposals.json           — full Proposal array (read/rewrite on each mutation)
 *   logs/proposal-events.jsonl — append-only audit trail
 *
 * buildSnapshotHash injection:
 *   The constructor receives `buildSnapshotHash: () => string` — a factory that
 *   rebuilds the snapshot from fresh state and returns the RS_hash string.
 *   This is called after a successful apply to populate rsHashAfter.
 *
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import { randomUUID } from 'node:crypto';
import type { CapabilityType } from '@archon/kernel';
import { readJsonState, writeJsonState, appendProposalEvent } from '@archon/runtime-host';
import type { ModuleRegistry } from './registry.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { RestrictionRegistry } from './restriction-registry.js';
import {
  previewEnableCapability,
  applyEnableCapability,
} from './capability-governance.js';
import {
  getAckEpoch,
  patchAckEventRsHash,
  patchHazardAckEventRsHash,
} from './ack-store.js';
import type {
  Proposal,
  ProposalChange,
  ProposalKind,
  ProposalPreview,
  ProposalStatus,
  ProposalSummary,
  ProposedBy,
  ApproveResult,
} from '@archon/kernel';

// ---------------------------------------------------------------------------
// Authority constants
// ---------------------------------------------------------------------------

/**
 * Proposer kinds permitted to approve or reject proposals.
 * Agents may only propose.
 */
const HUMAN_PROPOSER_KINDS = new Set<string>(['human', 'cli', 'ui']);

// ---------------------------------------------------------------------------
// ProposalQueue
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of governance proposals.
 *
 * All state mutations are persisted to `.archon/state/proposals.json`.
 * Lifecycle events are appended to `.archon/logs/proposal-events.jsonl`.
 */
export class ProposalQueue {
  constructor(
    private readonly moduleRegistry: ModuleRegistry,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly restrictionRegistry: RestrictionRegistry,
    /**
     * Factory that rebuilds the snapshot from current state and returns the
     * RS_hash string. Called after a successful apply to compute rsHashAfter.
     */
    private readonly buildSnapshotHash: () => string,
  ) {}

  // -------------------------------------------------------------------------
  // propose
  // -------------------------------------------------------------------------

  /**
   * Submit a new governance proposal.
   *
   * The proposal is created in 'pending' status. A preview is computed from
   * current governance state and stored with the proposal. The preview is
   * informational — requirements are re-validated at apply time.
   *
   * Any proposer kind may submit proposals, including agents.
   *
   * @param change - The governance change to propose
   * @param createdBy - Identity of the entity submitting the proposal
   * @returns The created Proposal (status='pending')
   */
  propose(change: ProposalChange, createdBy: ProposedBy): Proposal {
    const id = randomUUID();
    const now = new Date().toISOString();
    const preview = this.buildPreview(change);

    const proposal: Proposal = {
      id,
      createdAt: now,
      createdBy,
      status: 'pending',
      kind: change.kind as ProposalKind,
      change,
      preview,
    };

    this.saveProposal(proposal);
    appendProposalEvent({
      timestamp: now,
      proposalId: id,
      event: 'created',
      kind: change.kind,
      actorKind: createdBy.kind,
      actorId: createdBy.id,
    });

    return proposal;
  }

  // -------------------------------------------------------------------------
  // listProposals
  // -------------------------------------------------------------------------

  /**
   * List proposals, optionally filtered by status.
   *
   * Returns ProposalSummary records (not full Proposals) for efficient listing.
   *
   * @param filter - Optional filter. Omit to list all proposals.
   * @returns Immutable array of ProposalSummary, sorted by createdAt descending.
   */
  listProposals(filter?: { status?: ProposalStatus }): ReadonlyArray<ProposalSummary> {
    const proposals = this.loadProposals();
    const filtered = filter?.status !== undefined
      ? proposals.filter((p) => p.status === filter.status)
      : proposals;

    return [...filtered]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => toSummary(p));
  }

  // -------------------------------------------------------------------------
  // getProposal
  // -------------------------------------------------------------------------

  /**
   * Retrieve the full Proposal record by ID.
   *
   * @param id - UUIDv4 proposal identifier
   * @returns Full Proposal if found, undefined if not found
   */
  getProposal(id: string): Proposal | undefined {
    const proposals = this.loadProposals();
    return proposals.find((p) => p.id === id);
  }

  // -------------------------------------------------------------------------
  // approveProposal
  // -------------------------------------------------------------------------

  /**
   * Approve and apply a pending proposal.
   *
   * Validation order:
   *   1. Proposal must exist and be 'pending'
   *   2. Approver must have a human-class kind ('human', 'cli', 'ui')
   *   3. Change-type-specific governance checks (ack phrase, hazard pairs)
   *
   * Failures at step 1-3 are recoverable: proposal stays 'pending', no state changes.
   * Unexpected exceptions during apply: proposal transitions to 'failed'.
   *
   * On success: proposal transitions to 'applied'; rsHashAfter is computed and patched.
   *
   * @param id - UUIDv4 proposal identifier
   * @param opts - Governance credentials (typedAckPhrase for T3, hazardConfirmedPairs)
   * @param approver - Identity of the entity approving
   * @returns ApproveResult
   */
  approveProposal(
    id: string,
    opts: {
      typedAckPhrase?: string;
      hazardConfirmedPairs?: ReadonlyArray<readonly [CapabilityType, CapabilityType]>;
    },
    approver: ProposedBy,
  ): ApproveResult {
    // Step 1: proposal must exist and be pending.
    const proposal = this.getProposal(id);
    if (proposal === undefined) {
      return {
        applied: false,
        ackEpoch: getAckEpoch(),
        error: `Proposal not found: ${id}`,
      };
    }
    if (proposal.status !== 'pending') {
      return {
        applied: false,
        ackEpoch: getAckEpoch(),
        error: `Proposal ${id} is not pending (status: ${proposal.status})`,
      };
    }

    // Step 2: authority check — only human-class proposers may approve.
    if (!HUMAN_PROPOSER_KINDS.has(approver.kind)) {
      return {
        applied: false,
        ackEpoch: getAckEpoch(),
        error:
          `Only human-class proposers (human, cli, ui) may approve proposals. ` +
          `Approver kind '${approver.kind}' is not permitted.`,
      };
    }

    // Step 3: apply the change with governance validation.
    const now = new Date().toISOString();
    try {
      const applyResult = this.applyChange(proposal.change, opts);

      if (!applyResult.applied) {
        // Recoverable failure: wrong ack phrase, missing hazard confirmation, etc.
        // Proposal stays 'pending' — no state written.
        return {
          applied: false,
          ackEpoch: applyResult.ackEpoch,
          error: applyResult.error,
        };
      }

      // Apply succeeded. Compute post-apply RS_hash.
      const rsHashAfter = this.buildSnapshotHash();

      // Patch ack event rsHashAfter fields if T3 was acknowledged.
      if (applyResult.ackEventId !== undefined) {
        patchAckEventRsHash(applyResult.ackEventId, rsHashAfter);
      }
      if (applyResult.hazardEventIds !== undefined) {
        for (const hazardId of applyResult.hazardEventIds) {
          patchHazardAckEventRsHash(hazardId, rsHashAfter);
        }
      }

      // Transition proposal to 'applied'.
      const resolved: Proposal = {
        ...proposal,
        status: 'applied',
        approvedBy: approver,
        approvedAt: now,
        appliedAt: now,
        rsHashAfter,
      };
      this.saveProposal(resolved);

      appendProposalEvent({
        timestamp: now,
        proposalId: id,
        event: 'applied',
        kind: proposal.kind,
        actorKind: approver.kind,
        actorId: approver.id,
        rsHashAfter,
      });

      return {
        applied: true,
        ackEpoch: applyResult.ackEpoch,
        rsHashAfter,
      };
    } catch (err: unknown) {
      // Unrecoverable: unexpected exception. Transition to 'failed'.
      const failureReason = err instanceof Error ? err.message : String(err);
      const failed: Proposal = {
        ...proposal,
        status: 'failed',
        failedAt: now,
        failureReason,
      };
      this.saveProposal(failed);

      appendProposalEvent({
        timestamp: now,
        proposalId: id,
        event: 'failed',
        kind: proposal.kind,
        actorKind: approver.kind,
        actorId: approver.id,
        error: failureReason,
      });

      return {
        applied: false,
        ackEpoch: getAckEpoch(),
        error: failureReason,
      };
    }
  }

  // -------------------------------------------------------------------------
  // rejectProposal
  // -------------------------------------------------------------------------

  /**
   * Explicitly reject a pending proposal.
   *
   * Only human-class proposers may reject. If the proposal is not found or
   * not pending, returns undefined. The caller is responsible for checking
   * the return value.
   *
   * @param id - UUIDv4 proposal identifier
   * @param rejector - Identity of the entity rejecting
   * @param reason - Optional rejection reason for audit trail
   * @returns The updated Proposal (status='rejected'), or undefined if not found/not pending
   */
  rejectProposal(id: string, rejector: ProposedBy, reason?: string): Proposal | undefined {
    if (!HUMAN_PROPOSER_KINDS.has(rejector.kind)) {
      return undefined;
    }

    const proposal = this.getProposal(id);
    if (proposal === undefined || proposal.status !== 'pending') {
      return undefined;
    }

    const now = new Date().toISOString();
    const rejected: Proposal = {
      ...proposal,
      status: 'rejected',
      rejectedBy: rejector,
      rejectedAt: now,
      ...(reason !== undefined ? { rejectionReason: reason } : {}),
    };
    this.saveProposal(rejected);

    appendProposalEvent({
      timestamp: now,
      proposalId: id,
      event: 'rejected',
      kind: proposal.kind,
      actorKind: rejector.kind,
      actorId: rejector.id,
    });

    return rejected;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Build a ProposalPreview from the current governance state for a change.
   * Pure computation — no side effects.
   */
  private buildPreview(change: ProposalChange): ProposalPreview {
    switch (change.kind) {
      case 'enable_capability': {
        const preview = previewEnableCapability(
          change.capabilityType,
          this.moduleRegistry,
          this.capabilityRegistry,
        );
        return {
          changeSummary: `Enable capability: ${change.capabilityType} (tier=${preview.tier})`,
          requiresTypedAck: preview.requiresTypedAck,
          requiredAckPhrase: preview.expectedPhrase ?? undefined,
          hazardsTriggered: preview.activeHazardPairs.map(
            ({ entry }) => [entry.type_a, entry.type_b] as const,
          ),
          requiresHazardConfirm: preview.activeHazardPairs.length > 0,
        };
      }
      case 'disable_capability':
        return {
          changeSummary: `Disable capability: ${change.capabilityType}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      case 'enable_module':
        return {
          changeSummary: `Enable module: ${change.moduleId}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      case 'disable_module':
        return {
          changeSummary: `Disable module: ${change.moduleId}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      case 'set_restrictions': {
        const count = change.rules.length;
        const types = [...new Set(change.rules.map((r) => r.capabilityType))].sort().join(', ');
        return {
          changeSummary: `Set ${count} restriction rule${count === 1 ? '' : 's'} for: ${types || '(none)'}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      }
      default: {
        // Exhaustive check: TypeScript will error here if a new variant is added
        // to ProposalChange without being handled above.
        const _exhaustive: never = change;
        return _exhaustive;
      }
    }
  }

  /**
   * Apply a ProposalChange using the appropriate governance API.
   *
   * Returns an internal result shape that extends ApproveResult with optional
   * audit event IDs for ack-patching.
   */
  private applyChange(
    change: ProposalChange,
    opts: {
      typedAckPhrase?: string;
      hazardConfirmedPairs?: ReadonlyArray<readonly [CapabilityType, CapabilityType]>;
    },
  ): InternalApplyResult {
    switch (change.kind) {
      case 'enable_capability': {
        const result = applyEnableCapability(
          change.capabilityType,
          {
            typedAckPhrase: opts.typedAckPhrase,
            hazardConfirmedPairs: opts.hazardConfirmedPairs,
          },
          this.moduleRegistry,
          this.capabilityRegistry,
        );
        return {
          applied: result.applied,
          ackEpoch: result.ackEpoch,
          error: result.error,
          ackEventId: result.ackEventId,
          hazardEventIds: result.hazardEventIds,
        };
      }
      case 'disable_capability':
        this.capabilityRegistry.disableCapability(change.capabilityType, { confirmed: true });
        return { applied: true, ackEpoch: getAckEpoch() };

      case 'enable_module':
        this.moduleRegistry.enable(change.moduleId, { confirmed: true });
        return { applied: true, ackEpoch: getAckEpoch() };

      case 'disable_module':
        this.moduleRegistry.disable(change.moduleId, { confirmed: true });
        return { applied: true, ackEpoch: getAckEpoch() };

      case 'set_restrictions': {
        // Collect affected capability types; clear their existing rules; add new.
        const affectedTypes = new Set(change.rules.map((r) => r.capabilityType));
        for (const type of affectedTypes) {
          this.restrictionRegistry.clearRules(type, { confirmed: true });
        }
        for (const rule of change.rules) {
          this.restrictionRegistry.addRule(rule, { confirmed: true });
        }
        return { applied: true, ackEpoch: getAckEpoch() };
      }

      default: {
        const _exhaustive: never = change;
        return _exhaustive;
      }
    }
  }

  // -------------------------------------------------------------------------
  // State persistence
  // -------------------------------------------------------------------------

  private loadProposals(): Proposal[] {
    return readJsonState<Proposal[]>('proposals.json', []);
  }

  /**
   * Upsert a proposal: replaces the existing entry with the same ID,
   * or appends if new. Writes the full array back to proposals.json.
   */
  private saveProposal(proposal: Proposal): void {
    const existing = this.loadProposals();
    const idx = existing.findIndex((p) => p.id === proposal.id);
    let updated: Proposal[];
    if (idx === -1) {
      updated = [...existing, proposal];
    } else {
      updated = [...existing];
      updated[idx] = proposal;
    }
    writeJsonState('proposals.json', updated);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Internal apply result that includes optional ack event IDs for patching.
 * These IDs are used to patch rsHashAfter on ack/hazard events after apply.
 */
interface InternalApplyResult {
  readonly applied: boolean;
  readonly ackEpoch: number;
  readonly error?: string | undefined;
  readonly ackEventId?: string | undefined;
  readonly hazardEventIds?: ReadonlyArray<string> | undefined;
}

/**
 * Project a full Proposal to a ProposalSummary for list display.
 */
function toSummary(proposal: Proposal): ProposalSummary {
  return {
    id: proposal.id,
    createdAt: proposal.createdAt,
    status: proposal.status,
    kind: proposal.kind,
    changeSummary: proposal.preview.changeSummary,
    createdBy: proposal.createdBy,
  };
}
