/**
 * Archon Kernel — Snapshot Hashing Tests
 *
 * Verifies Invariant I4: snapshot determinism.
 *
 * snapshot-hash/stability: Rebuilding a snapshot with identical inputs always produces the same RS_hash.
 * snapshot-hash/sensitivity: Changing any input always produces a different RS_hash.
 * snapshot-hash/project-id: Changing project_id always produces a different RS_hash (P4).
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
const TEST_PROJECT = 'test-project';

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
      inputs.engineVersion, inputs.configHash, TEST_PROJECT, FIXED_CLOCK,
    );
    const s2 = builder.build(
      inputs.enabled, inputs.capabilities, inputs.drr,
      inputs.engineVersion, inputs.configHash, TEST_PROJECT, FIXED_CLOCK,
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
      [MODULE_A, MODULE_B], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_B, MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );

    // build() sorts modules by module_id, so order must not matter
    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('produces identical RS_hash regardless of capability type array insertion order', () => {
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead, CapabilityType.FsList], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsList, CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
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
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const withExtra = builder.build(
      [MODULE_A], [CapabilityType.FsRead, CapabilityType.FsList], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );

    expect(builder.hash(base)).not.toBe(builder.hash(withExtra));
  });

  it('produces different RS_hash when a capability is removed', () => {
    const full = builder.build(
      [MODULE_A], [CapabilityType.FsRead, CapabilityType.FsList], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const reduced = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
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
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const withB = builder.build(
      [MODULE_A, MODULE_B], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );

    expect(builder.hash(without)).not.toBe(builder.hash(withB));
  });

  it('produces different RS_hash when engine_version changes', () => {
    const v1 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK);
    const v2 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.2', '', TEST_PROJECT, FIXED_CLOCK);

    expect(builder.hash(v1)).not.toBe(builder.hash(v2));
  });

  it('produces different RS_hash when config_hash changes', () => {
    const c1 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', 'config-hash-A', TEST_PROJECT, FIXED_CLOCK);
    const c2 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', 'config-hash-B', TEST_PROJECT, FIXED_CLOCK);

    expect(builder.hash(c1)).not.toBe(builder.hash(c2));
  });

  it('produces different RS_hash when the clock changes (constructed_at differs)', () => {
    const t1 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, () => '2026-01-01T00:00:00.000Z');
    const t2 = builder.build([MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', TEST_PROJECT, () => '2026-01-02T00:00:00.000Z');

    expect(builder.hash(t1)).not.toBe(builder.hash(t2));
  });
});

// ---------------------------------------------------------------------------
// snapshot-hash/project-id (P4: RS_hash must be project-specific)
// ---------------------------------------------------------------------------

describe('snapshot-hash: project_id — RS_hash must be project-specific (P4)', () => {
  it('produces different RS_hash for different project_ids with otherwise identical inputs', () => {
    const sA = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', 'project-a', FIXED_CLOCK,
    );
    const sB = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', 'project-b', FIXED_CLOCK,
    );

    expect(builder.hash(sA)).not.toBe(builder.hash(sB));
  });

  it('produces identical RS_hash for identical project_ids with identical other inputs', () => {
    const s1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', 'project-a', FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', 'project-a', FIXED_CLOCK,
    );

    expect(builder.hash(s1)).toBe(builder.hash(s2));
  });

  it('snapshot.project_id field reflects the value passed to build()', () => {
    const snapshot = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', 'my-project', FIXED_CLOCK,
    );

    expect(snapshot.project_id).toBe('my-project');
  });

  it('empty string project_id produces different hash from non-empty project_id', () => {
    const sEmpty = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', '', FIXED_CLOCK,
    );
    const sNonEmpty = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [], '0.0.1', '', 'default', FIXED_CLOCK,
    );

    expect(builder.hash(sEmpty)).not.toBe(builder.hash(sNonEmpty));
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
      [MODULE_A], [CapabilityType.FsRead], [drrA, drrB], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const s2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrB, drrA], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
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
      [MODULE_A], [CapabilityType.FsRead], [drrX, drrY, drrZ], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const permuted1 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrZ, drrX, drrY], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );
    const permuted2 = builder.build(
      [MODULE_A], [CapabilityType.FsRead], [drrY, drrZ, drrX], '0.0.1', '', TEST_PROJECT, FIXED_CLOCK,
    );

    expect(builder.hash(permuted1)).toBe(builder.hash(base));
    expect(builder.hash(permuted2)).toBe(builder.hash(base));
  });
});
