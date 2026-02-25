/**
 * Archon Module Loader — Proposal Queue
 *
 * Implements the Proposal Queue: a durable, human-approval workflow for
 * governance operations. Operators (CLI, desktop UI) submit proposals for
 * changes; a human approver reviews and explicitly approves or rejects each.
 *
 * Supported change types:
 *   enable_capability         — enable a CapabilityType (calls applyEnableCapability)
 *   disable_capability        — disable a CapabilityType
 *   enable_module             — enable a module in the ModuleRegistry
 *   disable_module            — disable a module
 *   set_restrictions          — replace restriction rules for affected capability types
 *   set_project_fs_roots      — replace per-project filesystem roots (P5)
 *   set_project_net_allowlist — replace per-project network allowlist (P5)
 *   set_project_exec_root     — set per-project exec cwd root ID (P5)
 *   set_secret                — encrypt and store a project secret (P5)
 *   delete_secret             — remove an encrypted secret (P5)
 *   set_secret_mode           — switch secret store encryption mode (P5)
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
 * Persistence (P4: project-scoped):
 *   StateIO.readJson('proposals.json')              — full Proposal array
 *   StateIO.appendLine('proposal-events.jsonl', ...) — append-only audit trail
 *
 * Secret redaction (P5):
 *   set_secret.value and set_secret_mode.passphrase are present in the change
 *   during a propose() call but are stripped before the proposal is persisted.
 *   These fields are never written to proposals.json.
 *   To apply a set_secret proposal, the approver must supply opts.secretValue.
 *   To apply a set_secret_mode proposal switching to portable mode, the approver
 *   must supply opts.secretPassphrase.
 *
 * Injection:
 *   - stateIO:              Project-scoped I/O (proposals.json + proposal-events.jsonl)
 *   - ackStore:             Project-scoped ack event store (T3 acks + hazard acks)
 *   - buildSnapshotHash:    Factory returning RS_hash after a successful apply
 *   - resourceConfigStore:  Optional — required for P5 resource config proposals
 *   - secretStoreApplier:   Optional — required for P5 secret proposals
 *
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change)
 */

import { randomUUID } from 'node:crypto';
import type { CapabilityType } from '@archon/kernel';
import type { StateIO } from '@archon/runtime-host';
import { ulid } from '@archon/runtime-host';
import type { ModuleRegistry } from './registry.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { RestrictionRegistry } from './restriction-registry.js';
import type { AckStore } from './ack-store.js';
import type { ResourceConfigStore } from './resource-config-store.js';
import {
  previewEnableCapability,
  applyEnableCapability,
} from './capability-governance.js';
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
// SecretStoreApplier (P5)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for applying secret store mutations.
 *
 * Defined here so ProposalQueue can depend on it without creating a circular
 * dependency back to runtime-host. The concrete implementation (SecretStore
 * in @archon/runtime-host) satisfies this interface via structural typing.
 *
 * ProposalQueue never holds a direct reference to SecretStore; it only uses
 * this narrow interface for the three secret-mutation operations.
 */
export interface SecretStoreApplier {
  /**
   * Encrypt and store a secret under the given key.
   * The value is encrypted immediately; no plaintext is persisted.
   */
  setSecret(key: string, value: string): void;
  /**
   * Remove the encrypted entry for the given key.
   * No-op if the key does not exist.
   */
  deleteSecret(key: string): void;
  /**
   * Switch the encryption mode for all secrets in the store.
   * Re-encrypts all stored secrets under the new mode.
   *
   * @param mode - Target encryption mode ('device' or 'portable')
   * @param passphrase - Required when switching to 'portable' mode
   */
  setMode(mode: 'device' | 'portable', passphrase?: string): void;
}

// ---------------------------------------------------------------------------
// ProposalQueue
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of governance proposals.
 *
 * All state mutations are persisted via the injected StateIO (to the project's
 * `proposals.json`). Lifecycle events are appended to `proposal-events.jsonl`.
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
    /**
     * Project-scoped I/O for proposals.json and proposal-events.jsonl.
     * P4: each project has its own StateIO; proposals do not cross project boundaries.
     */
    private readonly stateIO: StateIO,
    /**
     * Project-scoped ack event store.
     * P4: T3 ack events and hazard ack events are per-project.
     */
    private readonly ackStore: AckStore,
    /**
     * P5: Project-scoped resource configuration store.
     * Required to apply set_project_fs_roots, set_project_net_allowlist,
     * set_project_exec_root, set_secret, and delete_secret proposals.
     * Optional for backward compatibility with pre-P5 callers.
     */
    private readonly resourceConfigStore?: ResourceConfigStore,
    /**
     * P5: Secret store applier for secret mutation proposals.
     * Required to apply set_secret, delete_secret, and set_secret_mode proposals.
     * Optional for backward compatibility with pre-P5 callers.
     */
    private readonly secretStoreApplier?: SecretStoreApplier,
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
   * P5 secret redaction: set_secret.value and set_secret_mode.passphrase are
   * stripped from the persisted proposal record. These values must be supplied
   * again by the approver via opts.secretValue / opts.secretPassphrase when
   * calling approveProposal().
   *
   * @param change - The governance change to propose
   * @param createdBy - Identity of the entity submitting the proposal
   * @returns The created Proposal (status='pending')
   */
  propose(change: ProposalChange, createdBy: ProposedBy): Proposal {
    const id = randomUUID();
    const now = new Date().toISOString();
    const preview = this.buildPreview(change);

    // Redact sensitive fields before persisting. set_secret.value and
    // set_secret_mode.passphrase must never appear in proposals.json.
    const redactedChange = redactChange(change);

    const proposal: Proposal = {
      id,
      createdAt: now,
      createdBy,
      status: 'pending',
      kind: change.kind as ProposalKind,
      change: redactedChange,
      preview,
    };

    this.saveProposal(proposal);
    this.appendProposalEvent({
      event_id: ulid(),
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
    const filtered =
      filter?.status !== undefined
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
   * P5 secret proposals: set_secret requires opts.secretValue; set_secret_mode
   * switching to portable mode requires opts.secretPassphrase. These values are
   * not stored in the proposal record and must be re-supplied at approval time.
   *
   * @param id - UUIDv4 proposal identifier
   * @param opts - Governance credentials and secret values
   * @param approver - Identity of the entity approving
   * @returns ApproveResult
   */
  approveProposal(
    id: string,
    opts: {
      typedAckPhrase?: string;
      hazardConfirmedPairs?: ReadonlyArray<readonly [CapabilityType, CapabilityType]>;
      /** P5: plaintext secret value — required when approving set_secret proposals. */
      secretValue?: string;
      /** P5: passphrase — required when approving set_secret_mode proposals switching to 'portable'. */
      secretPassphrase?: string;
    },
    approver: ProposedBy,
  ): ApproveResult {
    // Step 1: proposal must exist and be pending.
    const proposal = this.getProposal(id);
    if (proposal === undefined) {
      return {
        applied: false,
        ackEpoch: this.ackStore.getAckEpoch(),
        error: `Proposal not found: ${id}`,
      };
    }
    if (proposal.status !== 'pending') {
      return {
        applied: false,
        ackEpoch: this.ackStore.getAckEpoch(),
        error: `Proposal ${id} is not pending (status: ${proposal.status})`,
      };
    }

    // Step 2: authority check — only human-class proposers may approve.
    if (!HUMAN_PROPOSER_KINDS.has(approver.kind)) {
      return {
        applied: false,
        ackEpoch: this.ackStore.getAckEpoch(),
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
        this.ackStore.patchAckEventRsHash(applyResult.ackEventId, rsHashAfter);
      }
      if (applyResult.hazardEventIds !== undefined) {
        for (const hazardId of applyResult.hazardEventIds) {
          this.ackStore.patchHazardAckEventRsHash(hazardId, rsHashAfter);
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

      this.appendProposalEvent({
        event_id: ulid(),
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

      this.appendProposalEvent({
        event_id: ulid(),
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
        ackEpoch: this.ackStore.getAckEpoch(),
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
  rejectProposal(
    id: string,
    rejector: ProposedBy,
    reason?: string,
  ): Proposal | undefined {
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

    this.appendProposalEvent({
      event_id: ulid(),
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
        const types = [...new Set(change.rules.map((r) => r.capabilityType))]
          .sort()
          .join(', ');
        return {
          changeSummary: `Set ${count} restriction rule${count === 1 ? '' : 's'} for: ${types || '(none)'}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      }
      // P5: Resource scoping proposals
      case 'set_project_fs_roots': {
        const count = change.roots.length;
        return {
          changeSummary: `Set filesystem roots: ${count} root${count === 1 ? '' : 's'}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      }
      case 'set_project_net_allowlist': {
        const count = change.allowlist.length;
        return {
          changeSummary:
            count === 0
              ? 'Set network allowlist: deny all (empty allowlist)'
              : `Set network allowlist: ${count} entr${count === 1 ? 'y' : 'ies'}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      }
      case 'set_project_exec_root':
        return {
          changeSummary:
            change.rootId === null
              ? 'Set exec working directory: workspace default'
              : `Set exec working directory root: ${change.rootId}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      // P5: Secret proposals — key name only; value/passphrase never in preview
      case 'set_secret':
        return {
          changeSummary: `Set secret: ${change.key}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      case 'delete_secret':
        return {
          changeSummary: `Delete secret: ${change.key}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
      case 'set_secret_mode':
        return {
          changeSummary: `Set secret store mode to: ${change.mode}`,
          requiresTypedAck: false,
          hazardsTriggered: [],
          requiresHazardConfirm: false,
        };
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
      secretValue?: string;
      secretPassphrase?: string;
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
          this.ackStore,
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
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };

      case 'enable_module':
        this.moduleRegistry.enable(change.moduleId, { confirmed: true });
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };

      case 'disable_module':
        this.moduleRegistry.disable(change.moduleId, { confirmed: true });
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };

      case 'set_restrictions': {
        // Collect affected capability types; clear their existing rules; add new.
        const affectedTypes = new Set(change.rules.map((r) => r.capabilityType));
        for (const type of affectedTypes) {
          this.restrictionRegistry.clearRules(type, { confirmed: true });
        }
        for (const rule of change.rules) {
          this.restrictionRegistry.addRule(rule, { confirmed: true });
        }
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      // P5: Resource scoping proposals
      case 'set_project_fs_roots': {
        if (this.resourceConfigStore === undefined) {
          throw new Error(
            'ResourceConfigStore is not configured for this ProposalQueue instance. ' +
              'Provide it at construction time to apply set_project_fs_roots proposals.',
          );
        }
        this.resourceConfigStore.setFsRoots(change.roots);
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      case 'set_project_net_allowlist': {
        if (this.resourceConfigStore === undefined) {
          throw new Error(
            'ResourceConfigStore is not configured for this ProposalQueue instance. ' +
              'Provide it at construction time to apply set_project_net_allowlist proposals.',
          );
        }
        this.resourceConfigStore.setNetAllowlist(change.allowlist);
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      case 'set_project_exec_root': {
        if (this.resourceConfigStore === undefined) {
          throw new Error(
            'ResourceConfigStore is not configured for this ProposalQueue instance. ' +
              'Provide it at construction time to apply set_project_exec_root proposals.',
          );
        }
        this.resourceConfigStore.setExecCwdRootId(change.rootId);
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      case 'set_secret': {
        if (this.secretStoreApplier === undefined || this.resourceConfigStore === undefined) {
          throw new Error(
            'SecretStoreApplier and ResourceConfigStore are required for set_secret proposals. ' +
              'Provide them at construction time.',
          );
        }
        if (opts.secretValue === undefined) {
          return {
            applied: false,
            ackEpoch: this.ackStore.getAckEpoch(),
            error:
              'opts.secretValue is required to apply a set_secret proposal. ' +
              'The secret value is not persisted and must be re-supplied at approval time.',
          };
        }
        this.secretStoreApplier.setSecret(change.key, opts.secretValue);
        this.resourceConfigStore.incrementSecretsEpoch();
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      case 'delete_secret': {
        if (this.secretStoreApplier === undefined || this.resourceConfigStore === undefined) {
          throw new Error(
            'SecretStoreApplier and ResourceConfigStore are required for delete_secret proposals. ' +
              'Provide them at construction time.',
          );
        }
        this.secretStoreApplier.deleteSecret(change.key);
        this.resourceConfigStore.incrementSecretsEpoch();
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      case 'set_secret_mode': {
        if (this.secretStoreApplier === undefined) {
          throw new Error(
            'SecretStoreApplier is not configured for this ProposalQueue instance. ' +
              'Provide it at construction time to apply set_secret_mode proposals.',
          );
        }
        if (change.mode === 'portable' && opts.secretPassphrase === undefined) {
          return {
            applied: false,
            ackEpoch: this.ackStore.getAckEpoch(),
            error:
              'opts.secretPassphrase is required to switch to portable mode. ' +
              'The passphrase is not persisted and must be supplied at approval time.',
          };
        }
        this.secretStoreApplier.setMode(change.mode, opts.secretPassphrase);
        return { applied: true, ackEpoch: this.ackStore.getAckEpoch() };
      }

      default: {
        const _exhaustive: never = change;
        return _exhaustive;
      }
    }
  }

  // -------------------------------------------------------------------------
  // State persistence (project-scoped via StateIO)
  // -------------------------------------------------------------------------

  private loadProposals(): Proposal[] {
    return this.stateIO.readJson<Proposal[]>('proposals.json', []);
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
    this.stateIO.writeJson('proposals.json', updated);
  }

  /**
   * Append a proposal lifecycle event to the audit log.
   *
   * Formats the entry as a single JSONL line and delegates to StateIO.appendLine.
   */
  private appendProposalEvent(entry: ProposalEventEntry): void {
    this.stateIO.appendLine('proposal-events.jsonl', JSON.stringify(entry));
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Shape of a proposal lifecycle event written to proposal-events.jsonl.
 *
 * Each event records a single state transition (created, applied, rejected,
 * failed). The `proposalId` ties the event to the full proposal record in
 * proposals.json.
 */
interface ProposalEventEntry {
  readonly event_id: string;
  readonly timestamp: string;
  readonly proposalId: string;
  readonly event: 'created' | 'applied' | 'rejected' | 'failed';
  readonly kind: string;
  readonly actorKind: string;
  readonly actorId: string;
  readonly rsHashAfter?: string | null;
  readonly error?: string;
}

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

/**
 * Strip fields that must never be persisted from proposal change payloads.
 *
 * P5 secret redaction:
 * - set_secret.value: the plaintext secret value — stripped before persistence
 * - set_secret_mode.passphrase: the portable-mode passphrase — stripped before persistence
 *
 * These fields are present during proposal creation (in-memory) so apply handlers
 * can receive them, but they must not be written to proposals.json. Approvers
 * must re-supply these values via opts when calling approveProposal().
 *
 * The cast to ProposalChange is intentional: we are deliberately constructing
 * a persisted form that omits required-at-apply-time fields. The stored proposal
 * is a record for audit, not a reconstitutable apply payload.
 */
function redactChange(change: ProposalChange): ProposalChange {
  if (change.kind === 'set_secret') {
    // Remove 'value' — never persisted. Approver must re-supply at approval time.
    const { value: _redacted, ...rest } = change;
    return rest as ProposalChange;
  }
  if (change.kind === 'set_secret_mode' && change.passphrase !== undefined) {
    // Remove 'passphrase' — never persisted.
    const { passphrase: _redacted, ...rest } = change;
    return rest as ProposalChange;
  }
  return change;
}
