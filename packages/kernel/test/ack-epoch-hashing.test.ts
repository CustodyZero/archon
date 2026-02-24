/**
 * Archon Kernel — Ack Epoch Snapshot Hashing Tests
 *
 * Verifies Invariant I1 (governance): ack_epoch is incorporated into
 * the Rule Snapshot hash (RS_hash).
 *
 * ack-epoch-hash/sensitivity:
 *   RS_hash must differ when ack_epoch differs — same snapshot content
 *   otherwise identical.
 *
 * ack-epoch-hash/stability:
 *   RS_hash must be identical when ack_epoch is the same — determinism
 *   is preserved across repeated builds.
 *
 * ack-epoch-hash/monotonicity:
 *   ack_epoch is incorporated as a non-negative integer. RS_hash changes
 *   at every increment.
 *
 * These tests verify the kernel-level invariant: SnapshotBuilder.build()
 * must include ack_epoch in the canonical hash input. They do not test
 * the module-loader ack event logic (that is in module-loader/test/).
 *
 * Tests are pure: no I/O, no state, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_CLOCK = () => '2026-01-01T00:00:00.000Z';

const MODULE_A: ModuleManifest = {
  module_id: 'module-a',
  module_name: 'Module A',
  version: '0.0.1',
  description: 'Test fixture',
  author: 'test',
  license: 'Apache-2.0',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'module-a',
      capability_id: 'a.fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
  ],
  intrinsic_restrictions: [],
  hazard_declarations: [],
  suggested_profiles: [],
};

const builder = new SnapshotBuilder();

// ---------------------------------------------------------------------------
// ack-epoch-hash/sensitivity
// ---------------------------------------------------------------------------

describe('ack-epoch-hash: sensitivity — RS_hash changes when ack_epoch changes', () => {
  it('RS_hash differs when ack_epoch is 0 vs 1', () => {
    const s0 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 0,
    );
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 1,
    );

    expect(builder.hash(s0)).not.toBe(builder.hash(s1));
  });

  it('RS_hash differs when ack_epoch increments from N to N+1', () => {
    const sN = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 5,
    );
    const sN1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 6,
    );

    expect(builder.hash(sN)).not.toBe(builder.hash(sN1));
  });

  it('every increment of ack_epoch produces a distinct RS_hash', () => {
    const hashes = [0, 1, 2, 3, 4].map((epoch) => {
      const s = builder.build(
        [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, epoch,
      );
      return builder.hash(s);
    });

    // All five hashes are distinct.
    const unique = new Set(hashes);
    expect(unique.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// ack-epoch-hash/stability
// ---------------------------------------------------------------------------

describe('ack-epoch-hash: stability — identical ack_epoch produces identical RS_hash', () => {
  it('rebuilding with the same ack_epoch=0 produces identical RS_hash', () => {
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 0,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 0,
    );

    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('rebuilding with the same ack_epoch=3 produces identical RS_hash', () => {
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 3,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 3,
    );

    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('ack_epoch=0 default is the same as explicitly passing 0', () => {
    // builder.build() with 6 args (no ackEpoch) defaults to 0.
    const sDefault = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );
    const sExplicit = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 0,
    );

    expect(builder.hash(sDefault)).toBe(builder.hash(sExplicit));
  });
});

// ---------------------------------------------------------------------------
// ack-epoch-hash/monotonicity
// ---------------------------------------------------------------------------

describe('ack-epoch-hash: monotonicity — ack_epoch is stored in snapshot', () => {
  it('snapshot.ack_epoch field reflects the value passed to build()', () => {
    const s5 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 5,
    );

    expect(s5.ack_epoch).toBe(5);
  });

  it('snapshot.ack_epoch=0 is the default', () => {
    const s = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );

    expect(s.ack_epoch).toBe(0);
  });

  it('ack_epoch change is independent of other snapshot fields (only hash changes, not content)', () => {
    const s0 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 0,
    );
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK, 1,
    );

    // All fields except ack_epoch are identical.
    expect(s0.ccm_enabled).toEqual(s1.ccm_enabled);
    expect(s0.enabled_capabilities).toEqual(s1.enabled_capabilities);
    expect(s0.drr_canonical).toEqual(s1.drr_canonical);
    expect(s0.engine_version).toBe(s1.engine_version);
    expect(s0.config_hash).toBe(s1.config_hash);
    expect(s0.constructed_at).toBe(s1.constructed_at);
    // Only ack_epoch differs.
    expect(s0.ack_epoch).toBe(0);
    expect(s1.ack_epoch).toBe(1);
    // Therefore the hashes must differ.
    expect(builder.hash(s0)).not.toBe(builder.hash(s1));
  });
});
