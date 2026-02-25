/**
 * Archon Kernel — Rule Snapshot Types
 *
 * Defines the Rule Snapshot (RS) — the immutable, hashed evaluation bundle
 * that is the unit of determinism in Archon.
 *
 * Every evaluation occurs against a Rule Snapshot. Identical snapshot and
 * identical proposed action always produce identical decision (Invariant I4).
 *
 * @see docs/specs/architecture.md §3 (snapshot model)
 * @see docs/specs/authority_and_composition_spec.md §6 (snapshot determinism model)
 * @see docs/specs/formal_governance.md §10 (snapshot determinism formalism)
 */

import type { ModuleManifest } from './module.js';
import type { CapabilityType } from './capability.js';
import type { CompiledDRR } from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Branded Types
// ---------------------------------------------------------------------------

/**
 * Opaque brand symbol for RuleSnapshotHash.
 * Prevents plain strings from being used as snapshot hashes.
 */
declare const __ruleSnapshotHashBrand: unique symbol;

/**
 * A branded string representing a SHA-256 hash of a Rule Snapshot.
 *
 * This type cannot be constructed from a plain string without an explicit
 * type assertion. The assertion must only occur in the SnapshotBuilder
 * implementation after computing the hash.
 *
 * RS_hash = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)
 *
 * @see docs/specs/authority_and_composition_spec.md §6.2
 */
export type RuleSnapshotHash = string & {
  readonly [__ruleSnapshotHashBrand]: 'RuleSnapshotHash';
};

// ---------------------------------------------------------------------------
// Rule Snapshot
// ---------------------------------------------------------------------------

/**
 * An immutable Rule Snapshot (RS) — the evaluation bundle constructed from
 * the full rule state at a point in time.
 *
 * RS = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)
 *
 * Snapshot properties:
 * - Immutable once constructed (all fields readonly)
 * - Rebuilt whenever module toggles or DRR change (no floating rule state)
 * - Hashed with SHA-256 over canonical JSON
 * - Every decision log records the RS_hash that produced it
 *
 * Modules cannot alter RS construction. The kernel is the sole authority
 * for snapshot building.
 *
 * @see docs/specs/architecture.md §3
 * @see docs/specs/authority_and_composition_spec.md §6
 * @see docs/specs/formal_governance.md §10
 */
export interface RuleSnapshot {
  /**
   * The project this snapshot belongs to (P4: Project Scoping).
   *
   * Used by the ValidationEngine to enforce governance isolation: an action
   * whose `project_id` does not match the snapshot's `project_id` is Denied
   * with triggered_rules=['project_mismatch'].
   *
   * All registries (module, capability, restriction) are scoped to this project.
   * RS_hash changes when project_id changes — this is correct: different projects
   * have different governance states even if module/capability sets happen to match.
   */
  readonly project_id: string;
  /** The set of currently enabled module manifests. */
  readonly ccm_enabled: ReadonlyArray<ModuleManifest>;
  /**
   * The set of explicitly enabled capability types.
   * A capability type must appear here AND in an enabled module's descriptors
   * before the validation engine will permit it (Invariant I1).
   */
  readonly enabled_capabilities: ReadonlyArray<CapabilityType>;
  /**
   * Canonicalized Dynamic Restriction Rules, compiled from operator-authored rules.
   *
   * Each CompiledDRR carries its own ir_hash over semantic content (effect +
   * capabilityType + conditions). Including these in the snapshot ensures
   * RS_hash changes whenever restrictions change (Invariant I4).
   *
   * The ValidationEngine evaluates these against proposed actions (Invariant I2).
   */
  readonly drr_canonical: ReadonlyArray<CompiledDRR>;
  /** Version of the kernel enforcement engine. Part of the hash input. */
  readonly engine_version: string;
  /** SHA-256 hash of the runtime configuration. Part of the hash input. */
  readonly config_hash: string;
  /** ISO 8601 timestamp of snapshot construction. */
  readonly constructed_at: string;
  /**
   * Monotonically increasing count of T3 capability acknowledgment events
   * recorded since the operator initialized this installation.
   *
   * Incorporated into the snapshot hash so RS_hash changes after each T3
   * capability is acknowledged and enabled (Invariants I4, I5).
   *
   * Zero means no T3 capabilities have been acknowledged. Defaults to 0 if
   * no ack-epoch parameter is provided to SnapshotBuilder.build().
   */
  readonly ack_epoch: number;
}

// ---------------------------------------------------------------------------
// Snapshot Builder Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the Rule Snapshot builder.
 *
 * The SnapshotBuilder is the sole authorized path for constructing a
 * RuleSnapshot. Modules cannot construct snapshots directly.
 *
 * The implementation lives in packages/kernel/src/snapshot/builder.ts.
 *
 * @see docs/specs/architecture.md §3
 * @see docs/specs/authority_and_composition_spec.md §6.1
 */
export interface SnapshotBuilder {
  /**
   * Build an immutable Rule Snapshot from the current rule state.
   *
   * Must be called whenever module toggles, capability enablement, or DRR
   * change, before any further evaluation. Rule changes require snapshot rebuild.
   *
   * @param enabled - Currently enabled module manifests
   * @param enabledCapabilities - Explicitly enabled capability types
   * @param drr - Compiled Dynamic Restriction Rules from the RestrictionRegistry
   * @param engineVersion - Current engine version string
   * @param configHash - SHA-256 hash of current runtime config
   * @param clockFn - Injectable clock for deterministic timestamp (default: Date.toISOString)
   * @returns An immutable RuleSnapshot
   */
  build(
    enabled: ReadonlyArray<ModuleManifest>,
    enabledCapabilities: ReadonlyArray<CapabilityType>,
    drr: ReadonlyArray<CompiledDRR>,
    engineVersion: string,
    configHash: string,
    projectId: string,
    clockFn?: () => string,
    ackEpoch?: number,
  ): RuleSnapshot;

  /**
   * Compute the SHA-256 hash of a Rule Snapshot.
   *
   * RS_hash = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)
   *
   * The hash is computed over canonical JSON (sorted keys) of the snapshot.
   * Returns a branded RuleSnapshotHash — not a plain string.
   *
   * @param snapshot - The snapshot to hash
   * @returns RuleSnapshotHash — branded SHA-256 hex digest
   */
  hash(snapshot: RuleSnapshot): RuleSnapshotHash;
}
