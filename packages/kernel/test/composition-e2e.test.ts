/**
 * Archon Kernel — End-to-End Composition Tests
 *
 * Exercises multi-module composition through the full pipeline:
 * manifest → DAG → capability resolution → restriction composition →
 * snapshot build → ValidationEngine.evaluate()
 *
 * These tests verify that governance invariants hold through composition:
 * - I1: deny-by-default extends to composed capabilities
 * - I2: restrictions from dependencies tighten the effective set
 * - I4: snapshot determinism with composition topology
 * - I6: delegation non-escalation through composition chains
 *
 * All tests are pure: no I/O.
 */

import { describe, it, expect } from 'vitest';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { ValidationEngine } from '../src/validation/engine.js';
import { resolveEffectiveCapabilities } from '../src/composition/resolver.js';
import { composeRestrictionsForModule } from '../src/composition/restriction-composer.js';
import { validateAuthorityBounds } from '../src/composition/authority.js';
import { buildCompositionGraph, detectCycles } from '../src/composition/graph.js';
import { CapabilityType, RiskTier } from '../src/index.js';
import type {
  ModuleManifest,
  ModuleHash,
  CapabilityDescriptor,
  CapabilityInstance,
} from '../src/index.js';
import { compileDSL } from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_CLOCK = () => '2026-03-19T00:00:00.000Z';
const TEST_PROJECT = 'e2e-composition';

function makeDescriptor(
  moduleId: string,
  capId: string,
  type: CapabilityType,
  tier: RiskTier = RiskTier.T1,
): CapabilityDescriptor {
  return {
    module_id: moduleId,
    capability_id: capId,
    type,
    tier,
    params_schema: {},
    ack_required: false,
    default_enabled: false,
    hazards: [],
  };
}

function makeManifest(
  id: string,
  descriptors: CapabilityDescriptor[],
  opts?: {
    module_dependencies?: string[];
    provider_dependencies?: CapabilityType[];
    intrinsic_restrictions?: string[];
  },
): ModuleManifest {
  return {
    module_id: id,
    module_name: id,
    version: '0.0.1',
    description: 'test',
    author: 'test',
    license: 'Apache-2.0',
    hash: '' as ModuleHash,
    capability_descriptors: descriptors,
    intrinsic_restrictions: opts?.intrinsic_restrictions ?? [],
    hazard_declarations: [],
    suggested_profiles: [],
    module_dependencies: opts?.module_dependencies,
    provider_dependencies: opts?.provider_dependencies,
  };
}

function makeAction(
  moduleId: string,
  capId: string,
  type: CapabilityType,
  params: Record<string, unknown> = {},
): CapabilityInstance {
  return {
    project_id: TEST_PROJECT,
    module_id: moduleId,
    capability_id: capId,
    type,
    tier: RiskTier.T1,
    params,
  };
}

// ---------------------------------------------------------------------------
// E2E Scenarios
// ---------------------------------------------------------------------------

describe('composition-e2e/full-pipeline', () => {
  const builder = new SnapshotBuilder();
  const engine = new ValidationEngine();

  it('multi-module: action permitted through composition chain', () => {
    // Setup: A depends on B. B declares fs.write. A declares fs.read.
    // Both enabled. Action from B (fs.write) should be permitted.
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-write', CapabilityType.FsWrite),
    ]);
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-read', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    const snapshot = builder.build(
      [modA, modB],
      [CapabilityType.FsRead, CapabilityType.FsWrite],
      [],
      '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    );

    const action = makeAction('b', 'b-write', CapabilityType.FsWrite, { path: '/safe/file.txt' });
    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe('Permit');
  });

  it('multi-module: action denied when capability type not enabled', () => {
    // A depends on B. B declares ExecRun. ExecRun is NOT in enabled_capabilities.
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-exec', CapabilityType.ExecRun),
    ]);
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-read', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    const snapshot = builder.build(
      [modA, modB],
      [CapabilityType.FsRead], // ExecRun NOT enabled
      [],
      '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    );

    const action = makeAction('b', 'b-exec', CapabilityType.ExecRun);
    const result = engine.evaluate(action, snapshot);
    expect(result.outcome).toBe('Deny');
  });

  it('composition with restrictions: dependency restriction applies', () => {
    // B has intrinsic restriction: allow fs.write only to /safe/**
    // A depends on B. Action on B writing to /unsafe/file.txt should be denied.
    const allowRule = 'allow fs.write where capability.params.path matches "/safe/**"';
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-write', CapabilityType.FsWrite),
    ], { intrinsic_restrictions: [allowRule] });
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-read', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    // Compile the restriction to a DRR.
    const compiledDRR = compileDSL('intrinsic:b:0', allowRule);

    const snapshot = builder.build(
      [modA, modB],
      [CapabilityType.FsRead, CapabilityType.FsWrite],
      [compiledDRR],
      '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    );

    // Action matching the allow pattern: should be permitted.
    const safeAction = makeAction('b', 'b-write', CapabilityType.FsWrite, {
      path: '/safe/file.txt',
    });
    expect(engine.evaluate(safeAction, snapshot).outcome).toBe('Permit');

    // Action NOT matching the allow pattern: should be denied (allowlist exhaustion).
    const unsafeAction = makeAction('b', 'b-write', CapabilityType.FsWrite, {
      path: '/unsafe/file.txt',
    });
    expect(engine.evaluate(unsafeAction, snapshot).outcome).toBe('Deny');
  });

  it('restriction composition: verify restrictions collect from chain', () => {
    // C has restriction on fs.read
    // B depends on C, has restriction on fs.write
    // A depends on B
    // A's composed restrictions should include both C's and B's
    const modC = makeManifest('c', [
      makeDescriptor('c', 'c-cap', CapabilityType.FsRead),
    ], { intrinsic_restrictions: ['allow fs.read where path matches "/read-safe/**"'] });
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ], {
      module_dependencies: ['c'],
      intrinsic_restrictions: ['allow fs.write where path matches "/write-safe/**"'],
    });
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.LlmInfer),
    ], { module_dependencies: ['b'] });

    const modules = new Map([['a', modA], ['b', modB], ['c', modC]]);
    const enabled = new Set(['a', 'b', 'c']);

    const composed = composeRestrictionsForModule('a', modules, enabled);
    // Both C's and B's restrictions should be present
    expect(composed.restrictions).toHaveLength(2);
    expect(composed.contributingModules).toEqual(['c', 'b']);
  });

  it('snapshot determinism (I4): composition produces stable hash', () => {
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ]);
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    const hash1 = builder.hash(builder.build(
      [modA, modB],
      [CapabilityType.FsRead, CapabilityType.FsWrite],
      [], '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    ));

    // Same inputs, different array order.
    const hash2 = builder.hash(builder.build(
      [modB, modA],
      [CapabilityType.FsWrite, CapabilityType.FsRead],
      [], '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    ));

    expect(hash1).toBe(hash2);
  });

  it('snapshot sensitivity: adding composition changes hash', () => {
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ]);
    const modA_without = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ]);
    const modA_with = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    const hash_without = builder.hash(builder.build(
      [modA_without, modB],
      [CapabilityType.FsRead, CapabilityType.FsWrite],
      [], '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    ));

    const hash_with = builder.hash(builder.build(
      [modA_with, modB],
      [CapabilityType.FsRead, CapabilityType.FsWrite],
      [], '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    ));

    // With composition, module ordering changes (topological vs lexicographic).
    // The manifest also differs (module_dependencies field present).
    // Either or both cause the hash to differ.
    expect(hash_without).not.toBe(hash_with);
  });

  it('capability resolution: effective set computed through DAG', () => {
    const modC = makeManifest('c', [
      makeDescriptor('c', 'c-cap', CapabilityType.NetFetchHttp),
    ]);
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ], { module_dependencies: ['c'] });
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    const modules = new Map([['a', modA], ['b', modB], ['c', modC]]);
    const enabled = new Set(['a', 'b', 'c']);
    const enabledTypes = new Set([
      CapabilityType.FsRead, CapabilityType.FsWrite, CapabilityType.NetFetchHttp,
    ]);

    const resolved = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(resolved.effectiveCapabilities).toHaveLength(3);
    expect(resolved.reachableModuleIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('authority bounding: valid composition passes', () => {
    const modB = makeManifest('b', [CapabilityType.FsRead]);
    const modA = makeManifest('a', [CapabilityType.FsRead, CapabilityType.FsWrite], {
      module_dependencies: ['b'],
    });
    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a', 'b']);

    const authority = validateAuthorityBounds(modules, enabled);
    expect(authority.ok).toBe(true);
  });

  it('graph validation: cycle rejected before snapshot build', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ], { module_dependencies: ['a'] });

    const graph = buildCompositionGraph([modA, modB]);
    const cycleResult = detectCycles(graph);
    expect(cycleResult.hasCycle).toBe(true);
  });

  it('I6: delegation through composition respects authority bounds', () => {
    // Module A has agent.spawn capability.
    // Module A depends on B which has fs.write.
    // Spawning an agent with delegated_capabilities=['fs.write'] should be
    // permitted because fs.write is in the snapshot's enabled capabilities.
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-write', CapabilityType.FsWrite),
    ]);
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-spawn', CapabilityType.AgentSpawn),
    ], { module_dependencies: ['b'] });

    const snapshot = builder.build(
      [modA, modB],
      [CapabilityType.AgentSpawn, CapabilityType.FsWrite],
      [],
      '0.1.0', '', TEST_PROJECT, FIXED_CLOCK,
    );

    // Delegation within bounds: should be permitted.
    const validDelegation = makeAction('a', 'a-spawn', CapabilityType.AgentSpawn, {
      delegated_capabilities: ['fs.write'],
    });
    expect(engine.evaluate(validDelegation, snapshot).outcome).toBe('Permit');

    // Delegation outside bounds: ExecRun not enabled.
    const escalation = makeAction('a', 'a-spawn', CapabilityType.AgentSpawn, {
      delegated_capabilities: ['exec.run'],
    });
    expect(engine.evaluate(escalation, snapshot).outcome).toBe('Deny');
  });
});
