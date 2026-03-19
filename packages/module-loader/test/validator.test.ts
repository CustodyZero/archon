/**
 * Archon Module Loader — ModuleValidator Tests
 *
 * Tests for ModuleValidator.validateManifest() and validateCapabilityTypes().
 *
 * Unit tests:
 *   V-U1: valid manifest is accepted
 *   V-U2: null/undefined/non-object manifest is rejected
 *   V-U3: missing required string fields are rejected
 *   V-U4: empty string fields are rejected
 *   V-U5: invalid semver version is rejected
 *   V-U6: missing capability_descriptors is rejected
 *   V-U7: empty capability_descriptors array is rejected
 *   V-U8: unknown capability type is rejected (I7)
 *   V-U9: default_enabled: true is rejected (I1)
 *   V-U10: invalid params_schema is rejected
 *   V-U11: non-string intrinsic_restrictions are rejected
 *   V-U12: hazard_declarations with unknown types are rejected
 *   V-U13: multiple errors are accumulated
 *
 * Tests are pure: no file I/O, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier } from '@archon/kernel';
import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { ModuleValidator } from '../src/validator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid manifest fixture for tests. */
function makeValidManifest(): ModuleManifest {
  return {
    module_id: 'test-module',
    module_name: 'Test Module',
    version: '1.0.0',
    description: 'A test module',
    author: 'test-author',
    license: 'Apache-2.0',
    hash: '' as ModuleHash,
    capability_descriptors: [
      {
        module_id: 'test-module',
        capability_id: 'fs.read',
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModuleValidator — validateManifest()', () => {
  const validator = new ModuleValidator();

  // V-U1
  it('accepts a valid manifest', () => {
    const result = validator.validateManifest(makeValidManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.module_id).toBe('test-module');
  });

  // V-U2
  it('rejects null manifest', () => {
    const result = validator.validateManifest(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('non-null object');
  });

  it('rejects undefined manifest', () => {
    const result = validator.validateManifest(undefined);
    expect(result.ok).toBe(false);
  });

  it('rejects non-object manifest', () => {
    const result = validator.validateManifest('not-an-object');
    expect(result.ok).toBe(false);
  });

  // V-U3
  it('rejects manifest missing module_id', () => {
    const manifest = makeValidManifest();
    const { module_id: _, ...rest } = manifest;
    const result = validator.validateManifest(rest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('module_id'))).toBe(true);
  });

  it('rejects manifest missing module_name', () => {
    const manifest = makeValidManifest();
    const { module_name: _, ...rest } = manifest;
    const result = validator.validateManifest(rest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('module_name'))).toBe(true);
  });

  // V-U4
  it('rejects manifest with empty string module_id', () => {
    const manifest = { ...makeValidManifest(), module_id: '' };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('module_id'))).toBe(true);
  });

  // V-U5
  it('rejects manifest with invalid semver version', () => {
    const manifest = { ...makeValidManifest(), version: 'not-semver' };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('semver'))).toBe(true);
  });

  it('accepts valid semver version X.Y.Z', () => {
    const manifest = { ...makeValidManifest(), version: '0.1.0' };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(true);
  });

  it('rejects version with extra parts like 1.2.3.4', () => {
    const manifest = { ...makeValidManifest(), version: '1.2.3.4' };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
  });

  // V-U6 / V-U7
  it('rejects manifest with missing capability_descriptors', () => {
    const manifest = makeValidManifest();
    const { capability_descriptors: _, ...rest } = manifest;
    const result = validator.validateManifest(rest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('capability_descriptors'))).toBe(true);
  });

  it('rejects manifest with empty capability_descriptors', () => {
    const manifest = { ...makeValidManifest(), capability_descriptors: [] };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('capability_descriptors'))).toBe(true);
  });

  // V-U8: I7 enforcement
  it('rejects manifest with unknown capability type (I7)', () => {
    const manifest = {
      ...makeValidManifest(),
      capability_descriptors: [
        {
          module_id: 'test-module',
          capability_id: 'unknown.cap',
          type: 'nonexistent.type' as CapabilityType,
          tier: RiskTier.T1,
          params_schema: {},
          ack_required: false,
          default_enabled: false,
          hazards: [],
        },
      ],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('Unknown capability type'))).toBe(true);
  });

  // V-U9: I1 enforcement
  it('rejects manifest with default_enabled: true (I1)', () => {
    const manifest = {
      ...makeValidManifest(),
      capability_descriptors: [
        {
          module_id: 'test-module',
          capability_id: 'fs.read',
          type: CapabilityType.FsRead,
          tier: RiskTier.T1,
          params_schema: {},
          ack_required: false,
          default_enabled: true,
          hazards: [],
        },
      ],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('I1') || e.message.includes('default_enabled'))).toBe(true);
  });

  // V-U10
  it('rejects manifest with null params_schema', () => {
    const manifest = {
      ...makeValidManifest(),
      capability_descriptors: [
        {
          module_id: 'test-module',
          capability_id: 'fs.read',
          type: CapabilityType.FsRead,
          tier: RiskTier.T1,
          params_schema: null as unknown as Record<string, unknown>,
          ack_required: false,
          default_enabled: false,
          hazards: [],
        },
      ],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('params_schema'))).toBe(true);
  });

  // V-U11
  it('rejects manifest with non-string intrinsic_restrictions', () => {
    const manifest = {
      ...makeValidManifest(),
      intrinsic_restrictions: [42 as unknown as string],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('intrinsic_restrictions'))).toBe(true);
  });

  // V-U12
  it('rejects hazard_declarations with unknown capability types', () => {
    const manifest = {
      ...makeValidManifest(),
      hazard_declarations: [
        { type_a: 'unknown.type' as CapabilityType, type_b: CapabilityType.FsRead },
      ],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('hazard_declarations'))).toBe(true);
  });

  // V-U14: module_dependencies validation
  it('accepts manifest with valid module_dependencies', () => {
    const manifest = {
      ...makeValidManifest(),
      module_dependencies: ['other-module', 'another-module'],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(true);
  });

  it('accepts manifest without module_dependencies (backward compat)', () => {
    const result = validator.validateManifest(makeValidManifest());
    expect(result.ok).toBe(true);
  });

  it('rejects module_dependencies as non-array', () => {
    const manifest = {
      ...makeValidManifest(),
      module_dependencies: 'not-an-array' as unknown,
    };
    const result = validator.validateManifest(manifest as unknown as ModuleManifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('module_dependencies'))).toBe(true);
  });

  it('rejects module_dependencies with empty string entry', () => {
    const manifest = {
      ...makeValidManifest(),
      module_dependencies: [''],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('non-empty string'))).toBe(true);
  });

  it('rejects module_dependencies with self-reference', () => {
    const manifest = {
      ...makeValidManifest(),
      module_dependencies: ['test-module'],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('self-dependency'))).toBe(true);
  });

  // V-U15: provider_dependencies validation
  it('accepts manifest with valid provider_dependencies', () => {
    const manifest = {
      ...makeValidManifest(),
      provider_dependencies: [CapabilityType.NetFetchHttp],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(true);
  });

  it('rejects provider_dependencies with unknown capability type (I7)', () => {
    const manifest = {
      ...makeValidManifest(),
      provider_dependencies: ['unknown.type' as CapabilityType],
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('provider_dependencies'))).toBe(true);
    expect(result.errors.some((e) => e.message.includes('unknown capability type'))).toBe(true);
  });

  it('rejects provider_dependencies as non-array', () => {
    const manifest = {
      ...makeValidManifest(),
      provider_dependencies: 'not-an-array' as unknown,
    };
    const result = validator.validateManifest(manifest as unknown as ModuleManifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes('provider_dependencies'))).toBe(true);
  });

  // V-U13
  it('accumulates multiple errors', () => {
    const manifest = {
      ...makeValidManifest(),
      module_id: '',
      module_name: '',
      version: 'bad',
    };
    const result = validator.validateManifest(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // At least module_id, module_name, and version errors
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('ModuleValidator — validateCapabilityTypes()', () => {
  const validator = new ModuleValidator();

  it('accepts valid capability types', () => {
    const descriptors = [
      {
        module_id: 'test',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        tier: RiskTier.T1,
        params_schema: {},
        ack_required: false,
        default_enabled: false,
        hazards: [],
      },
    ];
    const result = validator.validateCapabilityTypes(descriptors);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown capability types', () => {
    const descriptors = [
      {
        module_id: 'test',
        capability_id: 'unknown',
        type: 'not.a.real.type' as CapabilityType,
        tier: RiskTier.T1,
        params_schema: {},
        ack_required: false,
        default_enabled: false,
        hazards: [],
      },
    ];
    const result = validator.validateCapabilityTypes(descriptors);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('Unknown capability type');
  });
});
