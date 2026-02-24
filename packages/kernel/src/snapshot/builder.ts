/**
 * Archon Kernel — Snapshot Builder
 *
 * The SnapshotBuilder constructs and hashes Rule Snapshots.
 *
 * The Rule Snapshot is the unit of determinism. Every evaluation must occur
 * against a snapshot. Rule changes require rebuilding the snapshot before
 * further evaluation — no floating rule state.
 *
 * @see docs/specs/architecture.md §3 (snapshot model)
 * @see docs/specs/authority_and_composition_spec.md §6 (snapshot determinism model)
 * @see docs/specs/formal_governance.md §10 (snapshot determinism formalism)
 */

import { createHash } from 'node:crypto';
import type { SnapshotBuilder as ISnapshotBuilder } from '../types/snapshot.js';
import type { RuleSnapshot, RuleSnapshotHash } from '../types/snapshot.js';
import type { ModuleManifest } from '../types/module.js';
import type { CapabilityType } from '../types/capability.js';
import type { CompiledDRR } from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Internal: Canonical JSON for deterministic hashing
// ---------------------------------------------------------------------------

/**
 * Produces a canonical JSON string with deterministic key ordering.
 *
 * Standard JSON.stringify does not guarantee property ordering. This function
 * sorts object keys alphabetically at every level to produce a stable,
 * canonical representation. Identical data structures produce identical strings
 * regardless of property insertion order.
 *
 * Used by hash() to satisfy Invariant I4 (snapshot determinism):
 * identical snapshot content must always produce identical RS_hash.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalize).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => {
    const v = obj[k];
    return `${JSON.stringify(k)}:${canonicalize(v)}`;
  });
  return '{' + pairs.join(',') + '}';
}

// ---------------------------------------------------------------------------
// SnapshotBuilder Implementation
// ---------------------------------------------------------------------------

/**
 * Constructs and hashes Rule Snapshots.
 *
 * Implements the ISnapshotBuilder interface from types/snapshot.ts.
 *
 * build() constructs a canonical, immutable RuleSnapshot:
 * - Modules are sorted by module_id (stable ordering for I4)
 * - Capabilities are sorted alphabetically (stable ordering for I4)
 * - DRRs are sorted by (capabilityType, effect, ir_hash, id) (stable ordering for I4)
 * - constructed_at is injectable via clockFn for deterministic testing
 *
 * hash() is a pure deterministic function: SHA-256 over canonical JSON.
 *
 * @see docs/specs/authority_and_composition_spec.md §6.1 (snapshot construction)
 * @see docs/specs/authority_and_composition_spec.md §6.2 (snapshot hash)
 */
export class SnapshotBuilder implements ISnapshotBuilder {
  /**
   * Build an immutable Rule Snapshot from the current rule state.
   *
   * RS = Build(CCM_enabled, enabled_capabilities, DRR_canonical, EngineVersion, Config)
   *
   * Modules are sorted by module_id for stable ordering (Invariant I4).
   * Capability types are sorted alphabetically for stable ordering (I4).
   * DRRs are sorted by (capabilityType, effect, ir_hash, id) for stable ordering (I4).
   * constructed_at is provided by clockFn — injectable for deterministic tests.
   *
   * The caller does not need to pre-sort any of these arrays. Canonicalization
   * is enforced here, at the builder boundary, so RS_hash is stable regardless
   * of input ordering.
   *
   * @param ackEpoch - Count of T3 acknowledgment events (default 0). Incorporated into
   *   the hash so RS_hash changes after each T3 capability acknowledgment (Invariants I4, I5).
   *   Pass the result of getAckEpoch() from @archon/module-loader in production callers.
   *
   * @see docs/specs/authority_and_composition_spec.md §6.1
   */
  build(
    enabled: ReadonlyArray<ModuleManifest>,
    enabledCapabilities: ReadonlyArray<CapabilityType>,
    drr: ReadonlyArray<CompiledDRR>,
    engineVersion: string,
    configHash: string,
    clockFn: () => string = () => new Date().toISOString(),
    ackEpoch: number = 0,
  ): RuleSnapshot {
    // Sort modules by module_id for stable, canonical ordering (I4).
    const sortedModules = [...enabled].sort((a, b) =>
      a.module_id.localeCompare(b.module_id),
    );
    // Sort capability types alphabetically for stable ordering (I4).
    const sortedCapabilities = [...enabledCapabilities].sort();
    // Sort DRRs by (capabilityType, effect, ir_hash, id) for stable ordering (I4).
    // All four tiebreaker fields are required for strict determinism: two DRRs
    // with identical capabilityType+effect+ir_hash but different ids must land
    // in a consistent order.
    const sortedDRR = [...drr].sort(
      (a, b) =>
        a.capabilityType.localeCompare(b.capabilityType) ||
        a.effect.localeCompare(b.effect) ||
        a.ir_hash.localeCompare(b.ir_hash) ||
        a.id.localeCompare(b.id),
    );

    return {
      ccm_enabled: sortedModules,
      enabled_capabilities: sortedCapabilities,
      drr_canonical: sortedDRR,
      engine_version: engineVersion,
      config_hash: configHash,
      constructed_at: clockFn(),
      ack_epoch: ackEpoch,
    };
  }

  /**
   * Compute the SHA-256 hash of a Rule Snapshot.
   *
   * RS_hash = Hash(CCM_hashes, DRR_hash, EngineVersion, ConfigHash)
   *
   * This method IS fully implemented. It is a pure deterministic function:
   * SHA-256 over the canonical JSON serialization (sorted keys) of the
   * snapshot. Identical snapshots always produce identical hashes (I4).
   *
   * Returns a branded RuleSnapshotHash — not a plain string. The brand
   * prevents accidental use of plain strings as snapshot hashes elsewhere
   * in the codebase.
   *
   * @param snapshot - The RuleSnapshot to hash
   * @returns RuleSnapshotHash — branded SHA-256 hex digest
   *
   * @see docs/specs/authority_and_composition_spec.md §6.2
   * @see docs/specs/formal_governance.md §10 (snapshot determinism)
   */
  hash(snapshot: RuleSnapshot): RuleSnapshotHash {
    const canonical = canonicalize(snapshot as unknown);
    const hex = createHash('sha256').update(canonical).digest('hex');
    // Type assertion is the authorized path to produce a RuleSnapshotHash.
    // Only this implementation may perform this assertion.
    return hex as RuleSnapshotHash;
  }
}
