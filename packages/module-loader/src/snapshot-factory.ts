/**
 * Archon Module Loader — Snapshot Factory
 *
 * P8.1: Fix P1-2 — reduce buildSnapshot() call-site verbosity.
 *
 * buildSnapshotForProject() replaces the inline SnapshotBuilderImpl.build()
 * call that previously appeared at every CLI command and Desktop IPC handler
 * call site. It collects the necessary state from the module-loader registries
 * and delegates to SnapshotBuilderImpl.
 *
 * Canonicalization is enforced by SnapshotBuilderImpl.build():
 *   - Modules sorted by module_id
 *   - Capabilities sorted alphabetically
 *   - DRRs sorted by (capabilityType, effect, ir_hash, id)
 *   - fs_roots sorted by id; net_allowlist sorted alphabetically
 *   - secrets_epoch and exec_cwd_root_id are scalar (no sorting required)
 *
 * Usage:
 *   import { buildSnapshotForProject } from '@archon/module-loader';
 *   const { snapshot, hash } = buildSnapshotForProject({ projectId, registry, ... });
 *
 * @see docs/specs/architecture.md §3 (snapshot model)
 * @see docs/specs/authority_and_composition_spec.md §6.1 (snapshot construction)
 */

import { SnapshotBuilderImpl } from '@archon/kernel';
import type { RuleSnapshot, RuleSnapshotHash } from '@archon/kernel';
import { ARCHON_VERSION } from '@archon/runtime-host';
import { ModuleRegistry } from './registry.js';
import { CapabilityRegistry } from './capability-registry.js';
import { RestrictionRegistry } from './restriction-registry.js';
import { AckStore } from './ack-store.js';
import { ResourceConfigStore } from './resource-config-store.js';

// ---------------------------------------------------------------------------
// SnapshotForProjectParams
// ---------------------------------------------------------------------------

/**
 * Parameters for buildSnapshotForProject().
 *
 * All registry instances must be bound to the same project-scoped StateIO.
 * resourceConfigStore is optional for backward compatibility — if absent,
 * EMPTY_RESOURCE_CONFIG is used (matching pre-P5 behaviour).
 */
export interface SnapshotForProjectParams {
  /** The project ID to embed in the snapshot. Determines project-specific RS_hash. */
  readonly projectId: string;
  /** Module registry for the project. Must be bound to the correct StateIO. */
  readonly registry: ModuleRegistry;
  /** Capability registry for the project. Must be bound to the correct StateIO. */
  readonly capabilityRegistry: CapabilityRegistry;
  /** Restriction registry for the project. Must be bound to the correct StateIO. */
  readonly restrictionRegistry: RestrictionRegistry;
  /** Ack store for the project. Provides ackEpoch (I4, I5). */
  readonly ackStore: AckStore;
  /**
   * Resource configuration store for the project (P5).
   *
   * Optional for backward compatibility. If absent, EMPTY_RESOURCE_CONFIG is
   * used, which matches pre-P5 snapshot behaviour. Production callers should
   * always pass this to ensure RS_hash incorporates resource configuration (I4).
   */
  readonly resourceConfigStore?: ResourceConfigStore;
}

// ---------------------------------------------------------------------------
// buildSnapshotForProject
// ---------------------------------------------------------------------------

/**
 * Build the current RuleSnapshot for a project from registry state.
 *
 * Calls all registries to read the current enabled state, then delegates
 * to SnapshotBuilderImpl for deterministic snapshot construction and hashing.
 *
 * Canonicalization rules (applied internally by SnapshotBuilderImpl.build()):
 *   - Modules sorted by module_id
 *   - Capabilities sorted alphabetically
 *   - DRRs sorted by (capabilityType, effect, ir_hash, id)
 *   - fs_roots sorted by id; net_allowlist sorted alphabetically
 *
 * P8.1: This factory is the single authoritative call site for snapshot
 * construction. CLI commands and Desktop IPC handlers use this instead of
 * calling SnapshotBuilderImpl.build() directly, eliminating duplicated
 * multi-argument call sites.
 *
 * @param params - Registry instances and project ID (see SnapshotForProjectParams)
 * @returns { snapshot, hash } — immutable snapshot and its SHA-256 hash
 */
export function buildSnapshotForProject(
  params: SnapshotForProjectParams,
): { snapshot: RuleSnapshot; hash: RuleSnapshotHash } {
  const builder = new SnapshotBuilderImpl();
  const snapshot = builder.build(
    params.registry.listEnabled(),
    params.capabilityRegistry.listEnabledCapabilities(),
    params.restrictionRegistry.compileAll(),
    ARCHON_VERSION,
    '',
    params.projectId,
    undefined,
    params.ackStore.getAckEpoch(),
    // P5: undefined → SnapshotBuilderImpl defaults to EMPTY_RESOURCE_CONFIG (backward compat)
    params.resourceConfigStore?.getResourceConfig(),
  );
  return { snapshot, hash: builder.hash(snapshot) };
}
