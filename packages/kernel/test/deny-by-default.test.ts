/**
 * Archon Kernel — Deny-by-Default Tests
 *
 * Verifies Invariant I1: no capability executes without explicit enablement.
 *
 * deny-by-default/empty-snapshot: Empty snapshot (no modules, no capabilities) → Deny
 * deny-by-default/capability-not-enabled: Module enabled, capability type not in enabled_capabilities → Deny
 * deny-by-default/capability-containment: Module enabled + capability type enabled → Permit
 *
 * These tests are pure: no file I/O, no network, no clock dependency.
 * The kernel is side-effect free; tests verify it directly without mocks.
 */

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../src/validation/engine.js';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { DecisionOutcome, CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityInstance } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal module manifest for test use. No I/O involved. */
const TEST_MANIFEST: ModuleManifest = {
  module_id: 'test-module',
  module_name: 'Test Module',
  version: '0.0.1',
  description: 'Minimal test fixture module',
  author: 'test',
  license: 'Apache-2.0',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'test-module',
      capability_id: 'test.fs.read',
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

/** Proposed action: fs.read from test-module. */
const FS_READ_ACTION: CapabilityInstance = {
  module_id: 'test-module',
  capability_id: 'test.fs.read',
  type: CapabilityType.FsRead,
  tier: RiskTier.T1,
  params: { path: '/tmp/test.txt' },
};

const builder = new SnapshotBuilder();
const engine = new ValidationEngine();

// ---------------------------------------------------------------------------
// deny-by-default/empty-snapshot
// ---------------------------------------------------------------------------

describe('deny-by-default: empty snapshot', () => {
  it('denies fs.read when no modules and no capabilities are enabled', () => {
    const snapshot = builder.build(
      [],    // no enabled modules
      [],    // no enabled capabilities
      [],
      '0.0.1',
      '',
      () => '2026-01-01T00:00:00.000Z',
    );

    const result = engine.evaluate(FS_READ_ACTION, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toEqual([]);
  });

  it('denies any capability type when snapshot is empty', () => {
    const snapshot = builder.build([], [], [], '0.0.1', '', () => '2026-01-01T00:00:00.000Z');

    const allTypes: CapabilityInstance[] = Object.values(CapabilityType).map((t) => ({
      module_id: 'test-module',
      capability_id: `test.${t}`,
      type: t,
      tier: RiskTier.T1,
      params: {},
    }));

    for (const action of allTypes) {
      expect(engine.evaluate(action, snapshot).outcome).toBe(DecisionOutcome.Deny);
    }
  });
});

// ---------------------------------------------------------------------------
// deny-by-default/capability-not-enabled
// ---------------------------------------------------------------------------

describe('deny-by-default: module enabled, capability type not enabled', () => {
  it('denies fs.read when module is in ccm_enabled but fs.read not in enabled_capabilities', () => {
    const snapshot = builder.build(
      [TEST_MANIFEST],       // module enabled
      [],                    // capability type NOT enabled
      [],
      '0.0.1',
      '',
      () => '2026-01-01T00:00:00.000Z',
    );

    const result = engine.evaluate(FS_READ_ACTION, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
  });

  it('denies when a different capability type is enabled but not the requested one', () => {
    const snapshot = builder.build(
      [TEST_MANIFEST],
      [CapabilityType.FsList],  // fs.list enabled — not fs.read
      [],
      '0.0.1',
      '',
      () => '2026-01-01T00:00:00.000Z',
    );

    // fs.read should still be denied
    expect(engine.evaluate(FS_READ_ACTION, snapshot).outcome).toBe(DecisionOutcome.Deny);
  });
});

// ---------------------------------------------------------------------------
// deny-by-default/capability-containment
// ---------------------------------------------------------------------------

describe('deny-by-default: capability containment — module and capability both enabled', () => {
  it('permits fs.read when module is enabled and fs.read is in enabled_capabilities', () => {
    const snapshot = builder.build(
      [TEST_MANIFEST],               // module enabled
      [CapabilityType.FsRead],       // capability type enabled
      [],
      '0.0.1',
      '',
      () => '2026-01-01T00:00:00.000Z',
    );

    const result = engine.evaluate(FS_READ_ACTION, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
    expect(result.triggered_rules).toEqual([]);
  });

  it('denies action from unregistered module even if capability type is enabled', () => {
    const snapshot = builder.build(
      [TEST_MANIFEST],              // test-module enabled
      [CapabilityType.FsRead],      // fs.read enabled
      [],
      '0.0.1',
      '',
      () => '2026-01-01T00:00:00.000Z',
    );

    // Action claims a different module_id not in ccm_enabled
    const spoofedAction: CapabilityInstance = {
      module_id: 'unregistered-module',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: '/tmp/test.txt' },
    };

    expect(engine.evaluate(spoofedAction, snapshot).outcome).toBe(DecisionOutcome.Deny);
  });

  it('denies action with unknown capability_type regardless of module enablement', () => {
    const snapshot = builder.build(
      [TEST_MANIFEST],
      [CapabilityType.FsRead],
      [],
      '0.0.1',
      '',
      () => '2026-01-01T00:00:00.000Z',
    );

    const unknownTypeAction: CapabilityInstance = {
      module_id: 'test-module',
      capability_id: 'test.fs.read',
      type: 'not.a.real.type' as CapabilityType,  // I7: taxonomy violation
      tier: RiskTier.T1,
      params: {},
    };

    expect(engine.evaluate(unknownTypeAction, snapshot).outcome).toBe(DecisionOutcome.Deny);
  });
});
