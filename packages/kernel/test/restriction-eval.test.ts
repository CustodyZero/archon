/**
 * Archon Kernel — Restriction Evaluation Tests
 *
 * restriction-eval/allow-permits: allow rule permits matching path
 * restriction-eval/allowlist-denies: allow rule denies non-matching path (allowlist policy)
 * restriction-eval/monotonicity: with restrictions, permitted(restricted) ⊆ permitted(unrestricted)
 *
 * These tests verify the full path: engine.evaluate() → evaluateDRRs() → matchesGlob()
 *
 * Tests are pure: no I/O, no state, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from '../src/validation/engine.js';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { DecisionOutcome, CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityInstance } from '../src/index.js';
import { compileStructured } from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_CLOCK = () => '2026-01-01T00:00:00.000Z';
const TEST_PROJECT = 'test-project';

const FS_MODULE: ModuleManifest = {
  module_id: 'filesystem',
  module_name: 'Filesystem Module',
  version: '0.0.1',
  description: 'Test fixture',
  author: 'test',
  license: 'Apache-2.0',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params_schema: {},
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'filesystem',
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

const builder = new SnapshotBuilder();
const engine = new ValidationEngine();

/** Helper: build a snapshot with both module + capability enabled and given DRRs. */
function buildWithDRRs(
  drrs: ReturnType<typeof compileStructured>[],
) {
  return builder.build(
    [FS_MODULE],
    [CapabilityType.FsRead, CapabilityType.FsWrite],
    drrs,
    '0.0.1',
    '',
    TEST_PROJECT,
    FIXED_CLOCK,
  );
}

const DOCS_ALLOW_DRR = compileStructured({
  id: 'drr:1',
  capabilityType: CapabilityType.FsRead,
  effect: 'allow',
  conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
});

// ---------------------------------------------------------------------------
// restriction-eval/allow-permits
// ---------------------------------------------------------------------------

describe('restriction-eval: allow rule permits matching path', () => {
  it('permits fs.read for a path that matches the allow rule', () => {
    const snapshot = buildWithDRRs([DOCS_ALLOW_DRR]);

    const action: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './docs/specs/capabilities.md' },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Permit);
    expect(result.triggered_rules).toContain('drr:1');
  });

  it('permits when path matches allow rule with nested directories', () => {
    const snapshot = buildWithDRRs([DOCS_ALLOW_DRR]);

    const action: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './docs/a/b/c/deep.txt' },
    };

    expect(engine.evaluate(action, snapshot).outcome).toBe(DecisionOutcome.Permit);
  });

  it('permits when no restrictions exist for the action type (unrestricted)', () => {
    // Write has no DRRs — no restrictions → permit
    const snapshot = buildWithDRRs([DOCS_ALLOW_DRR]); // only fs.read has a DRR

    const writeAction: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.write',
      type: CapabilityType.FsWrite,
      tier: RiskTier.T2,
      params: { path: './anything/at/all.txt' },
    };

    // fs.write has no restrictions → permit (no DRRs apply to this type)
    expect(engine.evaluate(writeAction, snapshot).outcome).toBe(DecisionOutcome.Permit);
  });
});

// ---------------------------------------------------------------------------
// restriction-eval/allowlist-denies
// ---------------------------------------------------------------------------

describe('restriction-eval: allow rule denies non-matching path (allowlist policy)', () => {
  it('denies fs.read for a path that does not match the allow rule', () => {
    const snapshot = buildWithDRRs([DOCS_ALLOW_DRR]);

    const action: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './package.json' },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    // No triggered rule — denied by allowlist exhaustion, not a specific deny rule
    expect(result.triggered_rules).toEqual([]);
  });

  it('denies fs.read for a path at root that does not match docs/**', () => {
    const snapshot = buildWithDRRs([DOCS_ALLOW_DRR]);

    const action: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './src/index.ts' },
    };

    expect(engine.evaluate(action, snapshot).outcome).toBe(DecisionOutcome.Deny);
  });

  it('deny rule blocks a matching path even when no allow rules exist', () => {
    const denySecrets = compileStructured({
      id: 'drr:2',
      capabilityType: CapabilityType.FsRead,
      effect: 'deny',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './.env*' }],
    });

    const snapshot = buildWithDRRs([denySecrets]);

    const action: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './.env.local' },
    };

    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe(DecisionOutcome.Deny);
    expect(result.triggered_rules).toContain('drr:2');
  });

  it('deny rule does not block a non-matching path (only deny rules, no allow)', () => {
    const denySecrets = compileStructured({
      id: 'drr:2',
      capabilityType: CapabilityType.FsRead,
      effect: 'deny',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './.env*' }],
    });

    const snapshot = buildWithDRRs([denySecrets]);

    const action: CapabilityInstance = {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './docs/readme.md' },
    };

    // Deny rule doesn't match this path, no allow rules → permit
    expect(engine.evaluate(action, snapshot).outcome).toBe(DecisionOutcome.Permit);
  });
});

// ---------------------------------------------------------------------------
// restriction-eval/monotonicity
// ---------------------------------------------------------------------------

describe('restriction-eval: monotonicity — restricted ⊆ unrestricted', () => {
  const TEST_ACTIONS: CapabilityInstance[] = [
    {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './docs/specs/capabilities.md' },
    },
    {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './package.json' },
    },
    {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params: { path: './src/index.ts' },
    },
    {
      project_id: TEST_PROJECT,
      module_id: 'filesystem',
      capability_id: 'fs.write',
      type: CapabilityType.FsWrite,
      tier: RiskTier.T2,
      params: { path: './output/result.json' },
    },
  ];

  function permittedSet(snapshot: ReturnType<typeof builder.build>): Set<number> {
    const permitted = new Set<number>();
    TEST_ACTIONS.forEach((action, i) => {
      if (engine.evaluate(action, snapshot).outcome === DecisionOutcome.Permit) {
        permitted.add(i);
      }
    });
    return permitted;
  }

  it('permitted(restricted) ⊆ permitted(unrestricted)', () => {
    const unrestricted = buildWithDRRs([]);
    const restricted = buildWithDRRs([DOCS_ALLOW_DRR]);

    const unrestrictedPermitted = permittedSet(unrestricted);
    const restrictedPermitted = permittedSet(restricted);

    // Restricted set must be a subset of unrestricted
    for (const idx of restrictedPermitted) {
      expect(unrestrictedPermitted.has(idx)).toBe(true);
    }
  });

  it('adding a deny rule never increases the permitted set', () => {
    const noRestrictions = buildWithDRRs([]);
    const withDeny = buildWithDRRs([
      compileStructured({
        id: 'drr:1',
        capabilityType: CapabilityType.FsRead,
        effect: 'deny',
        conditions: [{ field: 'capability.params.path', op: 'matches', value: './**' }],
      }),
    ]);

    const basePermitted = permittedSet(noRestrictions);
    const deniedPermitted = permittedSet(withDeny);

    // Deny rule can only reduce, never increase
    expect(deniedPermitted.size).toBeLessThanOrEqual(basePermitted.size);
    for (const idx of deniedPermitted) {
      expect(basePermitted.has(idx)).toBe(true);
    }
  });

  it('allow rule can only reduce or maintain the permitted set (never expand beyond I1)', () => {
    // Adding an allow rule restricts to a subset of what was already permitted.
    // It cannot permit capabilities that were denied by I1.
    const noRestrictions = buildWithDRRs([]);
    const withAllow = buildWithDRRs([DOCS_ALLOW_DRR]);

    const basePermitted = permittedSet(noRestrictions);
    const allowPermitted = permittedSet(withAllow);

    // Allow rule can only restrict, never expand
    expect(allowPermitted.size).toBeLessThanOrEqual(basePermitted.size);
    for (const idx of allowPermitted) {
      expect(basePermitted.has(idx)).toBe(true);
    }
  });
});
