/**
 * Archon Kernel — Restriction Monotonicity Test (I1/I2 structural)
 *
 * Verifies the structural invariant: the effective capability set under a
 * more restrictive snapshot is always a subset of the effective capability set
 * under a less restrictive snapshot.
 *
 * Formal statement (formal_governance.md §5 I2):
 *   If R2 = R1 ∧ extraRestriction
 *   then EffectiveCapabilities(R2) ⊆ EffectiveCapabilities(R1)
 *
 * Since the full restriction DSL (I2) is not yet implemented, this test
 * exercises the structural foundation: deny-by-default (I1) already enforces
 * a deterministic filter — adding a capability to enabled_capabilities can
 * only expand the permitted set, removing one can only reduce it.
 *
 * The test constructs two snapshots: a "broader" set and a "narrower" subset,
 * then verifies for all tested actions that:
 *   permitted(narrower) ⊆ permitted(broader)
 *
 * This is the monotonicity invariant stated as a containment property.
 */

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../src/validation/engine.js';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { DecisionOutcome, CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityInstance } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_CLOCK = () => '2026-01-01T00:00:00.000Z';

const FS_MODULE: ModuleManifest = {
  module_id: 'fs-module',
  module_name: 'FS Module',
  version: '0.0.1',
  description: 'Test fixture',
  author: 'test',
  license: 'Apache-2.0',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'fs-module',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'fs-module',
      capability_id: 'fs.list',
      type: CapabilityType.FsList,
      tier: RiskTier.T1,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'fs-module',
      capability_id: 'fs.write',
      type: CapabilityType.FsWrite,
      tier: RiskTier.T2,
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

const TEST_ACTIONS: CapabilityInstance[] = [
  {
    module_id: 'fs-module',
    capability_id: 'fs.read',
    type: CapabilityType.FsRead,
    tier: RiskTier.T1,
    params: { path: '/tmp/a' },
  },
  {
    module_id: 'fs-module',
    capability_id: 'fs.list',
    type: CapabilityType.FsList,
    tier: RiskTier.T1,
    params: { path: '/tmp' },
  },
  {
    module_id: 'fs-module',
    capability_id: 'fs.write',
    type: CapabilityType.FsWrite,
    tier: RiskTier.T2,
    params: { path: '/tmp/b', content: 'x' },
  },
];

const builder = new SnapshotBuilder();
const engine = new ValidationEngine();

/**
 * Compute the set of permitted action indices for a given snapshot.
 */
function permittedSet(snapshot: ReturnType<typeof builder.build>): Set<number> {
  const permitted = new Set<number>();
  TEST_ACTIONS.forEach((action, i) => {
    if (engine.evaluate(action, snapshot) === DecisionOutcome.Permit) {
      permitted.add(i);
    }
  });
  return permitted;
}

// ---------------------------------------------------------------------------
// I1 structural: Restriction monotonicity
// ---------------------------------------------------------------------------

describe('I1/I2 structural: restriction monotonicity', () => {
  it('permitted(broader) ⊇ permitted(narrower) — subset relation holds', () => {
    // Broader: all three capability types enabled
    const broader = builder.build(
      [FS_MODULE],
      [CapabilityType.FsRead, CapabilityType.FsList, CapabilityType.FsWrite],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );

    // Narrower: only fs.read enabled
    const narrower = builder.build(
      [FS_MODULE],
      [CapabilityType.FsRead],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );

    const broaderPermitted = permittedSet(broader);
    const narrowerPermitted = permittedSet(narrower);

    // narrower ⊆ broader
    for (const idx of narrowerPermitted) {
      expect(broaderPermitted.has(idx)).toBe(true);
    }
  });

  it('adding a capability to enabled_capabilities never reduces the permitted set', () => {
    const base = builder.build(
      [FS_MODULE],
      [CapabilityType.FsRead],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );
    const expanded = builder.build(
      [FS_MODULE],
      [CapabilityType.FsRead, CapabilityType.FsList],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );

    const basePermitted = permittedSet(base);
    const expandedPermitted = permittedSet(expanded);

    // base ⊆ expanded
    for (const idx of basePermitted) {
      expect(expandedPermitted.has(idx)).toBe(true);
    }
    // expanded may have additional permits
    expect(expandedPermitted.size).toBeGreaterThanOrEqual(basePermitted.size);
  });

  it('removing a capability from enabled_capabilities never increases the permitted set', () => {
    const full = builder.build(
      [FS_MODULE],
      [CapabilityType.FsRead, CapabilityType.FsList, CapabilityType.FsWrite],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );
    const reduced = builder.build(
      [FS_MODULE],
      [CapabilityType.FsRead],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );

    const fullPermitted = permittedSet(full);
    const reducedPermitted = permittedSet(reduced);

    // reduced ⊆ full
    for (const idx of reducedPermitted) {
      expect(fullPermitted.has(idx)).toBe(true);
    }
    expect(reducedPermitted.size).toBeLessThanOrEqual(fullPermitted.size);
  });

  it('empty capability set permits nothing — base case of monotonicity', () => {
    const empty = builder.build(
      [FS_MODULE],
      [],
      [],
      '0.0.1',
      '',
      FIXED_CLOCK,
    );

    const permitted = permittedSet(empty);
    expect(permitted.size).toBe(0);
  });
});
