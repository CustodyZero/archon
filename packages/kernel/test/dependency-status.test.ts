/**
 * Archon Kernel — Provider Dependency Status Tests
 *
 * Verifies queryable dependency satisfaction functions:
 * getModuleDependencyStatus() and getAllDependencyStatus().
 *
 * Unit tests:
 *   DS-U1: module with no provider_dependencies → functional, empty deps
 *   DS-U2: module not in modules map → functional, empty deps
 *   DS-U3: all required deps satisfied → functional
 *   DS-U4: required dep unsatisfied (type not enabled) → non-functional
 *   DS-U5: required dep unsatisfied (no provider module) → non-functional
 *   DS-U6: optional dep unsatisfied → still functional, in missingOptional
 *   DS-U7: self-providing module does not count as provider
 *   DS-U8: disabled provider module does not satisfy dependency
 *   DS-U9: multiple providers for same type all listed in providedBy
 *   DS-U10: getAllDependencyStatus returns only modules with provider_dependencies
 *   DS-U11: getAllDependencyStatus processes modules in deterministic order
 *   DS-U12: mixed required/optional deps correctly classified
 *
 * Tests are pure: no I/O.
 *
 * @see docs/specs/module_api.md §3 (capability resolution)
 */

import { describe, it, expect } from 'vitest';
import {
  getModuleDependencyStatus,
  getAllDependencyStatus,
} from '../src/composition/dependency-status.js';
import { CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityDescriptor, ProviderDependency } from '../src/index.js';

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
  type: CapabilityType,
  opts?: {
    provider_dependencies?: ProviderDependency[];
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
    capability_descriptors: [makeDescriptor(id, `${id}-cap`, type)],
    intrinsic_restrictions: [],
    hazard_declarations: [],
    suggested_profiles: [],
    provider_dependencies: opts?.provider_dependencies,
  };
}

function dep(type: CapabilityType, required: boolean, reason: string): ProviderDependency {
  return { type, required, reason };
}

// ---------------------------------------------------------------------------
// Tests — getModuleDependencyStatus
// ---------------------------------------------------------------------------

describe('dependency-status/getModuleDependencyStatus', () => {
  // DS-U1
  it('module with no provider_dependencies returns functional with empty deps', () => {
    const modA = makeManifest('a', CapabilityType.FsRead);
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);
    const enabledTypes = new Set([CapabilityType.FsRead]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.moduleId).toBe('a');
    expect(status.functional).toBe(true);
    expect(status.dependencies).toHaveLength(0);
    expect(status.missingRequired).toHaveLength(0);
    expect(status.missingOptional).toHaveLength(0);
  });

  // DS-U2
  it('module not in modules map returns functional with empty deps', () => {
    const modules = new Map<string, ModuleManifest>();
    const enabled = new Set<string>();
    const enabledTypes = new Set<CapabilityType>();

    const status = getModuleDependencyStatus('missing', modules, enabled, enabledTypes);
    expect(status.moduleId).toBe('missing');
    expect(status.functional).toBe(true);
    expect(status.dependencies).toHaveLength(0);
  });

  // DS-U3
  it('all required deps satisfied → functional', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
        dep(CapabilityType.SecretsUse, true, 'API key retrieval'),
      ],
    });
    const modHttp = makeManifest('provider.http', CapabilityType.NetFetchHttp);
    const modSecrets = makeManifest('provider.secrets', CapabilityType.SecretsUse);
    const modules = new Map([['a', modA], ['provider.http', modHttp], ['provider.secrets', modSecrets]]);
    const enabled = new Set(['a', 'provider.http', 'provider.secrets']);
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp, CapabilityType.SecretsUse]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(true);
    expect(status.dependencies).toHaveLength(2);
    expect(status.missingRequired).toHaveLength(0);
    expect(status.missingOptional).toHaveLength(0);

    // Verify providedBy
    const httpDep = status.dependencies.find((d) => d.dependency.type === CapabilityType.NetFetchHttp);
    expect(httpDep).toBeDefined();
    expect(httpDep!.satisfied).toBe(true);
    expect(httpDep!.providedBy).toContain('provider.http');
  });

  // DS-U4
  it('required dep unsatisfied (type not enabled) → non-functional', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    const modHttp = makeManifest('provider.http', CapabilityType.NetFetchHttp);
    const modules = new Map([['a', modA], ['provider.http', modHttp]]);
    const enabled = new Set(['a', 'provider.http']);
    // NetFetchHttp NOT in enabled types
    const enabledTypes = new Set([CapabilityType.LlmInfer]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(false);
    expect(status.missingRequired).toHaveLength(1);
    expect(status.missingRequired[0]!.dependency.type).toBe(CapabilityType.NetFetchHttp);
  });

  // DS-U5
  it('required dep unsatisfied (no provider module) → non-functional', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    // No module provides NetFetchHttp
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(false);
    expect(status.missingRequired).toHaveLength(1);
  });

  // DS-U6
  it('optional dep unsatisfied → still functional, in missingOptional', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, false, 'Optional HTTP caching'),
      ],
    });
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);
    const enabledTypes = new Set([CapabilityType.LlmInfer]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(true);
    expect(status.missingOptional).toHaveLength(1);
    expect(status.missingOptional[0]!.dependency.type).toBe(CapabilityType.NetFetchHttp);
    expect(status.missingRequired).toHaveLength(0);
  });

  // DS-U7
  it('self-providing module does not count as provider', () => {
    // Module declares both LlmInfer and NetFetchHttp, but depends on NetFetchHttp
    // from another module — self should not satisfy its own dependency
    const modA: ModuleManifest = {
      module_id: 'a',
      module_name: 'a',
      version: '0.0.1',
      description: 'test',
      author: 'test',
      license: 'Apache-2.0',
      hash: '' as ModuleHash,
      capability_descriptors: [
        makeDescriptor('a', 'infer', CapabilityType.LlmInfer),
        makeDescriptor('a', 'fetch', CapabilityType.NetFetchHttp),
      ],
      intrinsic_restrictions: [],
      hazard_declarations: [],
      suggested_profiles: [],
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access from another module'),
      ],
    };
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(false);
    expect(status.missingRequired).toHaveLength(1);
  });

  // DS-U8
  it('disabled provider module does not satisfy dependency', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    const modHttp = makeManifest('provider.http', CapabilityType.NetFetchHttp);
    const modules = new Map([['a', modA], ['provider.http', modHttp]]);
    const enabled = new Set(['a']); // provider.http is NOT enabled
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(false);
    expect(status.missingRequired).toHaveLength(1);
  });

  // DS-U9
  it('multiple providers for same type all listed in providedBy (sorted)', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    const modHttp1 = makeManifest('z-provider', CapabilityType.NetFetchHttp);
    const modHttp2 = makeManifest('a-provider', CapabilityType.NetFetchHttp);
    const modules = new Map([['a', modA], ['z-provider', modHttp1], ['a-provider', modHttp2]]);
    const enabled = new Set(['a', 'z-provider', 'a-provider']);
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(true);
    const httpDep = status.dependencies[0]!;
    expect(httpDep.providedBy).toHaveLength(2);
    // Must be sorted for determinism
    expect(httpDep.providedBy[0]).toBe('a-provider');
    expect(httpDep.providedBy[1]).toBe('z-provider');
  });

  // DS-U12
  it('mixed required/optional deps correctly classified', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'Required HTTP'),
        dep(CapabilityType.SecretsUse, true, 'Required secrets'),
        dep(CapabilityType.FsRead, false, 'Optional file caching'),
      ],
    });
    const modHttp = makeManifest('provider.http', CapabilityType.NetFetchHttp);
    // SecretsUse: no provider → required missing
    // FsRead: no provider → optional missing
    const modules = new Map([['a', modA], ['provider.http', modHttp]]);
    const enabled = new Set(['a', 'provider.http']);
    const enabledTypes = new Set([CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const status = getModuleDependencyStatus('a', modules, enabled, enabledTypes);
    expect(status.functional).toBe(false);
    expect(status.missingRequired).toHaveLength(1);
    expect(status.missingRequired[0]!.dependency.type).toBe(CapabilityType.SecretsUse);
    expect(status.missingOptional).toHaveLength(1);
    expect(status.missingOptional[0]!.dependency.type).toBe(CapabilityType.FsRead);
  });
});

// ---------------------------------------------------------------------------
// Tests — getAllDependencyStatus
// ---------------------------------------------------------------------------

describe('dependency-status/getAllDependencyStatus', () => {
  // DS-U10
  it('returns only modules with provider_dependencies', () => {
    const modA = makeManifest('a', CapabilityType.FsRead); // no provider deps
    const modB = makeManifest('b', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    const modHttp = makeManifest('provider.http', CapabilityType.NetFetchHttp);
    const modules = new Map([['a', modA], ['b', modB], ['provider.http', modHttp]]);
    const enabled = new Set(['a', 'b', 'provider.http']);
    const enabledTypes = new Set([CapabilityType.FsRead, CapabilityType.LlmInfer, CapabilityType.NetFetchHttp]);

    const result = getAllDependencyStatus(modules, enabled, enabledTypes);
    // Only 'b' has provider_dependencies
    expect(result.size).toBe(1);
    expect(result.has('b')).toBe(true);
    expect(result.has('a')).toBe(false);
  });

  // DS-U11
  it('processes modules in deterministic order', () => {
    const modZ = makeManifest('z-module', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    const modA = makeManifest('a-module', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.SecretsUse, true, 'Secrets access'),
      ],
    });
    const modules = new Map([['z-module', modZ], ['a-module', modA]]);
    const enabled = new Set(['z-module', 'a-module']);
    const enabledTypes = new Set([CapabilityType.LlmInfer]);

    const result = getAllDependencyStatus(modules, enabled, enabledTypes);
    const keys = [...result.keys()];
    // Must be sorted: a-module before z-module
    expect(keys[0]).toBe('a-module');
    expect(keys[1]).toBe('z-module');
  });

  it('skips modules not in modules map', () => {
    const modules = new Map<string, ModuleManifest>();
    const enabled = new Set(['missing']);
    const enabledTypes = new Set<CapabilityType>();

    const result = getAllDependencyStatus(modules, enabled, enabledTypes);
    expect(result.size).toBe(0);
  });

  it('empty enabled set returns empty map', () => {
    const modA = makeManifest('a', CapabilityType.LlmInfer, {
      provider_dependencies: [
        dep(CapabilityType.NetFetchHttp, true, 'HTTP access'),
      ],
    });
    const modules = new Map([['a', modA]]);
    const enabled = new Set<string>();
    const enabledTypes = new Set<CapabilityType>();

    const result = getAllDependencyStatus(modules, enabled, enabledTypes);
    expect(result.size).toBe(0);
  });
});
