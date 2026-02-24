/**
 * Archon Kernel — Snapshot Hashing Tests
 *
 * Verifies Invariant I4: snapshot determinism.
 *
 * snapshot-hash/stability: Rebuilding a snapshot with identical inputs always produces the same RS_hash.
 * snapshot-hash/sensitivity: Changing any input always produces a different RS_hash.
 *
 * The clock is injected as a fixed string to eliminate timestamp non-determinism.
 * All tests are pure: no I/O.
 */

import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash } from '../src/index.js';
import { compileStructured } from '@archon/restriction-dsl';

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
// snapshot-hash/stability
// ---------------------------------------------------------------------------

describe('snapshot-hash: stability — identical inputs produce identical RS_hash', () => {
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
// snapshot-hash/sensitivity
// ---------------------------------------------------------------------------

describe('snapshot-hash: sensitivity — any input change produces a different RS_hash', () => {
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

// ---------------------------------------------------------------------------
// snapshot-hash/drr-ordering (P1-2: builder must self-enforce DRR sort order)
// ---------------------------------------------------------------------------

describe('snapshot-hash: DRR insertion order must not affect RS_hash', () => {
  it('produces identical RS_hash regardless of DRR insertion order in input array', () => {
    const drrA = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });
    const drrB = compileStructured({
      id: 'drr:2',
      capabilityType: CapabilityType.FsRead,
      effect: 'deny',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './.env*' }],
    });

    // Build twice with the same two DRRs in reversed insertion order.
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrA, drrB], '0.0.1', '', FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrB, drrA], '0.0.1', '', FIXED_CLOCK,
    );

    // SnapshotBuilder.build() must sort DRRs internally (I4).
    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('produces identical RS_hash for three-DRR permutations', () => {
    const drrX = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });
    const drrY = compileStructured({
      id: 'drr:2',
      capabilityType: CapabilityType.FsWrite,
      effect: 'deny',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './config/**' }],
    });
    const drrZ = compileStructured({
      id: 'drr:3',
      capabilityType: CapabilityType.FsList,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './src/**' }],
    });

    const base = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrX, drrY, drrZ], '0.0.1', '', FIXED_CLOCK,
    );
    const permuted1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrZ, drrX, drrY], '0.0.1', '', FIXED_CLOCK,
    );
    const permuted2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrY, drrZ, drrX], '0.0.1', '', FIXED_CLOCK,
    );

    expect(builder.hash(permuted1)).toBe(builder.hash(base));
    expect(builder.hash(permuted2)).toBe(builder.hash(base));
  });
});
