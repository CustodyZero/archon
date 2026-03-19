/**
 * Archon Kernel — Composition Resolver Tests
 *
 * Verifies composition-aware capability resolution:
 * effective capability sets through DAG traversal.
 *
 * All tests are pure: no I/O.
 *
 * @see docs/specs/module_api.md §3 (capability resolution traversal)
 */

import { describe, it, expect } from 'vitest';
import { resolveEffectiveCapabilities } from '../src/composition/resolver.js';
import { CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityDescriptor } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeDescriptor(
  moduleId: string,
  capId: string,
  type: CapabilityType,
): CapabilityDescriptor {
  return {
    module_id: moduleId,
    capability_id: capId,
    type,
    tier: RiskTier.T1,
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
    intrinsic_restrictions: [],
    hazard_declarations: [],
    suggested_profiles: [],
    module_dependencies: opts?.module_dependencies,
    provider_dependencies: opts?.provider_dependencies,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composition-resolver/effective-capabilities', () => {
  it('module with no dependencies: effective = own capabilities', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'read', CapabilityType.FsRead),
    ]);
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);
    const enabledTypes = new Set([CapabilityType.FsRead]);

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(1);
    expect(result.effectiveCapabilities[0]!.capability_id).toBe('read');
    expect(result.reachableModuleIds).toEqual(['a']);
  });

  it('module A depends on B: A effective includes B capabilities', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'write', CapabilityType.FsWrite),
    ], { module_dependencies: ['b'] });
    const modB = makeManifest('b', [
      makeDescriptor('b', 'read', CapabilityType.FsRead),
    ]);
    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a', 'b']);
    const enabledTypes = new Set([CapabilityType.FsRead, CapabilityType.FsWrite]);

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(2);
    const ids = result.effectiveCapabilities.map((d) => d.capability_id);
    expect(ids).toContain('write');
    expect(ids).toContain('read');
    expect(result.reachableModuleIds).toContain('a');
    expect(result.reachableModuleIds).toContain('b');
  });

  it('provider dependency: A requires LlmInfer, provider P provides it', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'chat', CapabilityType.LlmInfer),
    ], { provider_dependencies: [CapabilityType.NetFetchHttp] });
    const modP = makeManifest('provider.http', [
      makeDescriptor('provider.http', 'fetch', CapabilityType.NetFetchHttp),
    ]);
    const modules = new Map([['a', modA], ['provider.http', modP]]);
    const enabled = new Set(['a', 'provider.http']);
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(2);
    const ids = result.effectiveCapabilities.map((d) => d.capability_id);
    expect(ids).toContain('chat');
    expect(ids).toContain('fetch');
  });

  it('disabled dependency module: capabilities excluded', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'write', CapabilityType.FsWrite),
    ], { module_dependencies: ['b'] });
    const modB = makeManifest('b', [
      makeDescriptor('b', 'read', CapabilityType.FsRead),
    ]);
    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a']); // b is NOT enabled
    const enabledTypes = new Set([CapabilityType.FsRead, CapabilityType.FsWrite]);

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(1);
    expect(result.effectiveCapabilities[0]!.capability_id).toBe('write');
    expect(result.reachableModuleIds).toEqual(['a']);
  });

  it('disabled capability type: descriptors excluded', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'write', CapabilityType.FsWrite),
      makeDescriptor('a', 'read', CapabilityType.FsRead),
    ]);
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);
    const enabledTypes = new Set([CapabilityType.FsRead]); // FsWrite not enabled

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(1);
    expect(result.effectiveCapabilities[0]!.capability_id).toBe('read');
  });

  it('deduplication: same descriptor reachable via two paths counted once', () => {
    const modD = makeManifest('d', [
      makeDescriptor('d', 'shared', CapabilityType.FsRead),
    ]);
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ], { module_dependencies: ['d'] });
    const modC = makeManifest('c', [
      makeDescriptor('c', 'c-cap', CapabilityType.NetFetchHttp),
    ], { module_dependencies: ['d'] });
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.LlmInfer),
    ], { module_dependencies: ['b', 'c'] });

    const modules = new Map([['a', modA], ['b', modB], ['c', modC], ['d', modD]]);
    const enabled = new Set(['a', 'b', 'c', 'd']);
    const enabledTypes = new Set([
      CapabilityType.LlmInfer, CapabilityType.FsRead,
      CapabilityType.FsWrite, CapabilityType.NetFetchHttp,
    ]);

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    // d's "shared" capability should appear exactly once
    const sharedCount = result.effectiveCapabilities.filter(
      (d) => d.capability_id === 'shared',
    ).length;
    expect(sharedCount).toBe(1);
    expect(result.effectiveCapabilities).toHaveLength(4);
  });

  it('handles cycle gracefully via visited set', () => {
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ], { module_dependencies: ['a'] });

    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a', 'b']);
    const enabledTypes = new Set([CapabilityType.FsRead, CapabilityType.FsWrite]);

    // Should not throw — visited set prevents infinite loop.
    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(2);
  });

  it('output is sorted by (module_id, capability_id) for determinism', () => {
    const modA = makeManifest('z-module', [
      makeDescriptor('z-module', 'beta', CapabilityType.FsRead),
      makeDescriptor('z-module', 'alpha', CapabilityType.FsWrite),
    ], { module_dependencies: ['a-module'] });
    const modB = makeManifest('a-module', [
      makeDescriptor('a-module', 'gamma', CapabilityType.NetFetchHttp),
    ]);
    const modules = new Map([['z-module', modA], ['a-module', modB]]);
    const enabled = new Set(['z-module', 'a-module']);
    const enabledTypes = new Set([CapabilityType.FsRead, CapabilityType.FsWrite, CapabilityType.NetFetchHttp]);

    const result = resolveEffectiveCapabilities('z-module', modules, enabled, enabledTypes);
    const moduleIds = result.effectiveCapabilities.map((d) => d.module_id);
    // a-module descriptors should come before z-module descriptors
    expect(moduleIds[0]).toBe('a-module');
  });

  it('module not in modules map returns empty', () => {
    const modules = new Map<string, ModuleManifest>();
    const enabled = new Set(['missing']);
    const enabledTypes = new Set<CapabilityType>();

    const result = resolveEffectiveCapabilities('missing', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(0);
    expect(result.reachableModuleIds).toHaveLength(0);
  });

  it('transitive chain A→B→C resolves all capabilities', () => {
    const modC = makeManifest('c', [
      makeDescriptor('c', 'c-cap', CapabilityType.SecretsUse),
    ]);
    const modB = makeManifest('b', [
      makeDescriptor('b', 'b-cap', CapabilityType.FsWrite),
    ], { module_dependencies: ['c'] });
    const modA = makeManifest('a', [
      makeDescriptor('a', 'a-cap', CapabilityType.FsRead),
    ], { module_dependencies: ['b'] });

    const modules = new Map([['a', modA], ['b', modB], ['c', modC]]);
    const enabled = new Set(['a', 'b', 'c']);
    const enabledTypes = new Set([CapabilityType.FsRead, CapabilityType.FsWrite, CapabilityType.SecretsUse]);

    const result = resolveEffectiveCapabilities('a', modules, enabled, enabledTypes);
    expect(result.effectiveCapabilities).toHaveLength(3);
    expect(result.reachableModuleIds.sort()).toEqual(['a', 'b', 'c']);
  });
});
