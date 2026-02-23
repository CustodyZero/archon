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
import { NotImplementedError } from '@archon/restriction-dsl';

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
 * build() is a stub — it throws NotImplementedError. The snapshot
 * construction logic must include canonicalization of all CCM hashes and
 * DRR content before returning an RS.
 *
 * hash() IS implemented. It is a pure deterministic function: SHA-256 over
 * canonical JSON of the snapshot. This function has no governance implications
 * and is safe to implement in the initial commit.
 *
 * @see docs/specs/authority_and_composition_spec.md §6.1 (snapshot construction)
 * @see docs/specs/authority_and_composition_spec.md §6.2 (snapshot hash)
 */
export class SnapshotBuilder implements ISnapshotBuilder {
  /**
   * Build an immutable Rule Snapshot from the current rule state.
   *
   * RS = Build(CCM_enabled, DRR_canonical, EngineVersion, Config)
   *
   * @throws {NotImplementedError} — stub implementation
   *   Will implement:
   *   - Sort and canonicalize enabled module manifests by module_id
   *   - Extract and order CCM hashes for snapshot hash input
   *   - Canonicalize DRR entries
   *   - Construct immutable RuleSnapshot with constructed_at timestamp
   *   - The snapshot must be valid input for hash()
   *
   * @see docs/specs/authority_and_composition_spec.md §6.1
   */
  build(
    _enabled: ReadonlyArray<ModuleManifest>,
    _drr: ReadonlyArray<unknown>,
    _engineVersion: string,
    _configHash: string,
  ): RuleSnapshot {
    // TODO: sort enabled modules by module_id for stable ordering
    // TODO: extract module hashes for RS_hash computation
    // TODO: canonicalize DRR entries (must already be validated before reaching here)
    // TODO: construct immutable RuleSnapshot object
    // TODO: set constructed_at to current ISO 8601 timestamp
    throw new NotImplementedError(
      'authority_and_composition_spec.md §6.1 (snapshot construction)',
    );
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
