/**
 * Archon Module Loader — ModuleLoader Tests
 *
 * Tests for ModuleLoader.load() — the full validation pipeline.
 *
 * Unit tests:
 *   L-U1: successful load with valid manifest (empty hash, dev mode)
 *   L-U2: hash verification skipped for empty hash
 *   L-U3: hash verification passes for correct non-empty hash
 *   L-U4: hash verification fails for incorrect non-empty hash
 *   L-U5: DSL validation passes for valid restriction strings
 *   L-U6: DSL validation fails for invalid restriction strings
 *   L-U7: manifest structure validation failure rejects load
 *   L-U8: I1 rejection — default_enabled: true
 *   L-U9: I7 rejection — unknown capability type
 *   L-U10: successful load returns module_id
 *
 * Tests are pure: no file I/O, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier } from '@archon/kernel';
import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { ModuleLoader, computeManifestHash } from '../src/loader.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid manifest fixture with empty hash (dev mode). */
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

/**
 * Build a manifest with a correct computed hash.
 * Constructs the manifest without hash, computes the hash, then sets it.
 */
function makeHashedManifest(): ModuleManifest {
  const base = makeValidManifest();
  const hash = computeManifestHash(base) as ModuleHash;
  return { ...base, hash };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModuleLoader — load()', () => {
  const loader = new ModuleLoader();

  // L-U1 / L-U2
  it('successfully loads a valid manifest with empty hash (dev mode)', () => {
    const result = loader.load(makeValidManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.module_id).toBe('test-module');
  });

  // L-U3
  it('passes hash verification for correct non-empty hash', () => {
    const manifest = makeHashedManifest();
    const result = loader.load(manifest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.module_id).toBe('test-module');
  });

  // L-U4
  it('fails hash verification for incorrect non-empty hash', () => {
    const manifest = {
      ...makeValidManifest(),
      hash: 'incorrect-hash-value' as ModuleHash,
    };
    const result = loader.load(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Hash verification failed');
    expect(result.details).toContain('incorrect-hash-value');
  });

  // L-U5
  it('passes DSL validation for valid restriction strings', () => {
    const manifest = {
      ...makeValidManifest(),
      capability_descriptors: [
        {
          module_id: 'test-module',
          capability_id: 'fs.write',
          type: CapabilityType.FsWrite,
          tier: RiskTier.T2,
          params_schema: {},
          ack_required: false,
          default_enabled: false,
          hazards: [],
        },
      ],
      intrinsic_restrictions: [
        'deny fs.write where path matches "./secrets/**"',
      ],
    };
    const result = loader.load(manifest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.module_id).toBe('test-module');
  });

  // L-U6
  it('fails DSL validation for invalid restriction strings', () => {
    const manifest = {
      ...makeValidManifest(),
      intrinsic_restrictions: ['not valid dsl syntax at all'],
    };
    const result = loader.load(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('DSL validation');
  });

  // L-U7
  it('rejects manifest with structural validation failure', () => {
    const manifest = {
      ...makeValidManifest(),
      version: 'not-semver',
    };
    const result = loader.load(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Manifest validation failed');
  });

  // L-U8: I1 rejection
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
    const result = loader.load(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // I1 is caught by validateManifest now
    expect(result.reason).toContain('Manifest validation failed');
  });

  // L-U9: I7 rejection
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
    const result = loader.load(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Manifest validation failed');
  });

  // L-U10
  it('returns the correct module_id on success', () => {
    const manifest = { ...makeValidManifest(), module_id: 'my-custom-module' };
    // Must also update the capability descriptor's module_id for consistency
    const result = loader.load({
      ...manifest,
      capability_descriptors: manifest.capability_descriptors.map(
        (d) => ({ ...d, module_id: 'my-custom-module' }),
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.module_id).toBe('my-custom-module');
  });
});

describe('computeManifestHash()', () => {
  it('produces deterministic output for the same manifest', () => {
    const manifest = makeValidManifest();
    const hash1 = computeManifestHash(manifest);
    const hash2 = computeManifestHash(manifest);
    expect(hash1).toBe(hash2);
  });

  it('produces different output for different manifests', () => {
    const manifest1 = makeValidManifest();
    const manifest2 = { ...makeValidManifest(), module_id: 'different-module' };
    const hash1 = computeManifestHash(manifest1);
    const hash2 = computeManifestHash(manifest2);
    expect(hash1).not.toBe(hash2);
  });

  it('produces a hex string', () => {
    const hash = computeManifestHash(makeValidManifest());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
