/**
 * Archon Module Loader — Composition Graph Validator Tests
 *
 * Verifies set-level composition validation: referential integrity,
 * acyclicity, and provider_dependency satisfaction.
 *
 * @see docs/specs/module_api.md §4.1
 */

import { describe, it, expect } from 'vitest';
import { validateCompositionGraph } from '../src/composition-validator.js';
import { CapabilityType, RiskTier } from '@archon/kernel';
import type { ModuleManifest, ModuleHash, CapabilityDescriptor, ProviderDependency } from '@archon/kernel';

// ---------------------------------------------------------------------------
// Helpers
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
    module_dependencies?: string[];
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
    module_dependencies: opts?.module_dependencies,
    provider_dependencies: opts?.provider_dependencies,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composition-validator', () => {
  it('valid acyclic graph with no dependencies passes', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead),
      makeManifest('b', CapabilityType.FsWrite),
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('valid acyclic graph with dependencies passes', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, { module_dependencies: ['b'] }),
      makeManifest('b', CapabilityType.FsWrite),
    ]);
    expect(result.ok).toBe(true);
  });

  it('missing module_dependency reference fails', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, { module_dependencies: ['missing'] }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.message).toContain('missing');
    expect(result.errors[0]!.message).toContain('not in the module set');
  });

  it('cycle detected fails with cycle path', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, { module_dependencies: ['b'] }),
      makeManifest('b', CapabilityType.FsWrite, { module_dependencies: ['a'] }),
    ]);
    expect(result.ok).toBe(false);
    const cycleError = result.errors.find((e) => e.message.includes('cycle'));
    expect(cycleError).toBeDefined();
  });

  it('unsatisfied provider_dependency fails', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, {
        provider_dependencies: [{ type: CapabilityType.NetEgressRaw, required: true, reason: 'Raw network egress for test' }],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.message).toContain('net.egress.raw');
    expect(result.errors[0]!.message).toContain('no module in the set provides it');
  });

  it('satisfied provider_dependency passes', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, {
        provider_dependencies: [{ type: CapabilityType.NetFetchHttp, required: true, reason: 'HTTP fetch for test' }],
      }),
      makeManifest('provider.http', CapabilityType.NetFetchHttp),
    ]);
    expect(result.ok).toBe(true);
  });

  it('multiple errors reported together', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, {
        module_dependencies: ['missing1', 'missing2'],
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('empty module set passes', () => {
    const result = validateCompositionGraph([]);
    expect(result.ok).toBe(true);
  });

  it('diamond dependency (valid) passes', () => {
    const result = validateCompositionGraph([
      makeManifest('a', CapabilityType.FsRead, { module_dependencies: ['b', 'c'] }),
      makeManifest('b', CapabilityType.FsWrite, { module_dependencies: ['d'] }),
      makeManifest('c', CapabilityType.NetFetchHttp, { module_dependencies: ['d'] }),
      makeManifest('d', CapabilityType.LlmInfer),
    ]);
    expect(result.ok).toBe(true);
  });
});
