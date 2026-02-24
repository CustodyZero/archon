/**
 * Archon Kernel — Snapshot Hashing Tests (U4, U5)
 *
 * Verifies Invariant I4: snapshot determinism.
 *
 * U4: Rebuilding a snapshot with identical inputs always produces the same RS_hash.
 * U5: Changing the enabled capability set always produces a different RS_hash.
 *
 * The clock is injected as a fixed string to eliminate timestamp non-determinism.
 * All tests are pure: no I/O.
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
// U4 — Snapshot hashing stability
// ---------------------------------------------------------------------------

describe('U4: snapshot hashing stability', () => {
  it('produces identical RS_hash for identical inputs built twice', () => {
    const inputs = {
      enabled: [MODULE_A] as const,
      capabilities: [CapabilityType.FsRead] as const,
      drr: [] as const,
      engineVersion: '0.0.1',
      configHash: 'abc123',
    };

    const s1 = builder.build(
      inputs.enabled, inputs.capabilities, inputs.drr,
      inputs.engineVersion, inputs.configHash, FIXED_CLOCK,
    );
    const s2 = builder.build(
      inputs.enabled, inputs.capabilities, inputs.drr,
      inputs.engineVersion, inputs.configHash, FIXED_CLOCK,
    );

    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('produces identical RS_hash regardless of module insertion order in input array', () => {
    const MODULE_B: ModuleManifest = {
      ...MODULE_A,
      module_id: 'module-b',
      module_name: 'Module B',
      capability_descriptors: [{
        ...MODULE_A.capability_descriptors[0]!,
        module_id: 'module-b',
        capability_id: 'b.fs.list',
        type: CapabilityType.FsList,
      }],
    };

    const s1 = builder.build(
      [MODULE_A, MODULE_B], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_B, MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );

    // build() sorts modules by module_id, so order must not matter
    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('produces identical RS_hash regardless of capability type array insertion order', () => {
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead, CapabilityType.FsList], [], '0.0.1', '', FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsList, CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );

    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });
});

// ---------------------------------------------------------------------------
// U5 — Snapshot hashing sensitivity
// ---------------------------------------------------------------------------

describe('U5: snapshot hashing sensitivity', () => {
  it('produces different RS_hash when a capability is added', () => {
    const base = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );
    const withExtra = builder.build(
      [MODULE_A], [CapabilityType.FsRead, CapabilityType.FsList], [], '0.0.1', '', FIXED_CLOCK,
    );

    expect(builder.hash(base)).not.toBe(builder.hash(withExtra));
  });

  it('produces different RS_hash when a capability is removed', () => {
    const full = builder.build(
      [MODULE_A], [CapabilityType.FsRead, CapabilityType.FsList], [], '0.0.1', '', FIXED_CLOCK,
    );
    const reduced = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );

    expect(builder.hash(full)).not.toBe(builder.hash(reduced));
  });

  it('produces different RS_hash when a module is added', () => {
    const MODULE_B: ModuleManifest = {
      ...MODULE_A,
      module_id: 'module-b',
      module_name: 'Module B',
      capability_descriptors: [],
    };

    const without = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );
    const withB = builder.build(
      [MODULE_A, MODULE_B], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK,
    );

    expect(builder.hash(without)).not.toBe(builder.hash(withB));
  });

  it('produces different RS_hash when engine_version changes', () => {
    const v1 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', FIXED_CLOCK);
    const v2 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.2', '', FIXED_CLOCK);

    expect(builder.hash(v1)).not.toBe(builder.hash(v2));
  });

  it('produces different RS_hash when config_hash changes', () => {
    const c1 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', 'config-hash-A', FIXED_CLOCK);
    const c2 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', 'config-hash-B', FIXED_CLOCK);

    expect(builder.hash(c1)).not.toBe(builder.hash(c2));
  });

  it('produces different RS_hash when the clock changes (constructed_at differs)', () => {
    const t1 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', () => '2026-01-01T00:00:00.000Z');
    const t2 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', () => '2026-01-02T00:00:00.000Z');

    expect(builder.hash(t1)).not.toBe(builder.hash(t2));
  });
});
