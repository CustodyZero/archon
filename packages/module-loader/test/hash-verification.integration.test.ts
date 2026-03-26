/**
 * Integration tests for ModuleLoader hash verification.
 *
 * These tests exercise the full load pipeline with content tampering
 * scenarios. Unlike the unit tests in loader.test.ts (L-U3, L-U4)
 * which test with a known-wrong hash string, these tests:
 *
 *   1. Construct a valid manifest
 *   2. Compute its correct hash
 *   3. Tamper with manifest content (simulating a supply-chain attack)
 *   4. Verify the loader rejects the tampered manifest
 *
 * This proves that the hash verification is end-to-end correct:
 * any change to manifest content after hashing causes rejection.
 *
 * HV-U1: Baseline — valid module with correct hash loads successfully
 * HV-U2: Tampered description — hash mismatch after content change
 * HV-U3: Tampered capability descriptor — hash mismatch after type change
 * HV-U4: Tampered intrinsic restriction — hash mismatch after DSL change
 * HV-U5: Error message includes both expected and computed hash
 * HV-U6: Added capability descriptor — hash mismatch after expansion
 * HV-U7: Removed capability descriptor — hash mismatch after reduction
 * HV-U8: Property order does not affect hash (determinism)
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier } from '@archon/kernel';
import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { ModuleLoader, computeManifestHash } from '../src/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseManifest(): Omit<ModuleManifest, 'hash'> {
  return {
    module_id: 'integration-test-module',
    module_name: 'Integration Test Module',
    version: '1.0.0',
    description: 'A module for hash verification integration tests',
    author: 'test',
    license: 'Apache-2.0',
    capability_descriptors: [
      {
        module_id: 'integration-test-module',
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
 * Build a manifest with its correct computed hash.
 * This simulates a legitimately published module.
 */
function makeSignedManifest(overrides?: Partial<Omit<ModuleManifest, 'hash'>>): ModuleManifest {
  const base = { ...makeBaseManifest(), ...overrides };
  const hash = computeManifestHash(base as ModuleManifest) as ModuleHash;
  return { ...base, hash } as ModuleManifest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hash verification integration', () => {
  const loader = new ModuleLoader();

  // HV-U1: Baseline — untampered module loads successfully
  it('HV-U1: untampered module with correct hash loads successfully', () => {
    const manifest = makeSignedManifest();
    const result = loader.load(manifest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.module_id).toBe('integration-test-module');
  });

  // HV-U2: Tampered description
  it('HV-U2: tampered description causes hash mismatch rejection', () => {
    const manifest = makeSignedManifest();
    // Tamper: change the description after hashing
    const tampered: ModuleManifest = {
      ...manifest,
      description: 'TAMPERED — this module has been modified',
    };
    const result = loader.load(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('Hash verification failed');
  });

  // HV-U3: Tampered capability type (e.g., escalating from T1 to T3)
  it('HV-U3: tampered capability type causes hash mismatch rejection', () => {
    const manifest = makeSignedManifest();
    // Tamper: change the capability type after hashing
    const tampered: ModuleManifest = {
      ...manifest,
      capability_descriptors: [
        {
          ...manifest.capability_descriptors[0]!,
          type: CapabilityType.ExecRun, // Was FsRead (T1), now ExecRun (T3)
          tier: RiskTier.T3,
        },
      ],
    };
    const result = loader.load(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('Hash verification failed');
  });

  // HV-U4: Tampered intrinsic restriction
  it('HV-U4: tampered intrinsic restriction causes hash mismatch rejection', () => {
    // Start with a module that has a restriction
    const manifest = makeSignedManifest({
      capability_descriptors: [
        {
          module_id: 'integration-test-module',
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
    });
    // Tamper: remove the restriction (weakening security)
    const tampered: ModuleManifest = {
      ...manifest,
      intrinsic_restrictions: [],
    };
    const result = loader.load(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('Hash verification failed');
  });

  // HV-U5: Error message includes expected and computed hash
  it('HV-U5: error details include expected and computed hash values', () => {
    const manifest = makeSignedManifest();
    const tampered: ModuleManifest = {
      ...manifest,
      version: '9.9.9', // Tamper version
    };
    const result = loader.load(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details).toBeDefined();
    // Should contain the original (expected) hash
    expect(result.details).toContain(manifest.hash as string);
    // Should contain the newly computed hash
    const recomputed = computeManifestHash(tampered);
    expect(result.details).toContain(recomputed);
    // The two hashes must be different
    expect(manifest.hash as string).not.toBe(recomputed);
  });

  // HV-U6: Added capability descriptor
  it('HV-U6: adding a capability descriptor causes hash mismatch', () => {
    const manifest = makeSignedManifest();
    const tampered: ModuleManifest = {
      ...manifest,
      capability_descriptors: [
        ...manifest.capability_descriptors,
        {
          module_id: 'integration-test-module',
          capability_id: 'fs.write',
          type: CapabilityType.FsWrite,
          tier: RiskTier.T2,
          params_schema: {},
          ack_required: false,
          default_enabled: false,
          hazards: [],
        },
      ],
    };
    const result = loader.load(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('Hash verification failed');
  });

  // HV-U7: Removed capability descriptor
  it('HV-U7: removing a capability descriptor causes hash mismatch', () => {
    const manifest = makeSignedManifest({
      capability_descriptors: [
        {
          module_id: 'integration-test-module',
          capability_id: 'fs.read',
          type: CapabilityType.FsRead,
          tier: RiskTier.T1,
          params_schema: {},
          ack_required: false,
          default_enabled: false,
          hazards: [],
        },
        {
          module_id: 'integration-test-module',
          capability_id: 'fs.list',
          type: CapabilityType.FsList,
          tier: RiskTier.T0,
          params_schema: {},
          ack_required: false,
          default_enabled: false,
          hazards: [],
        },
      ],
    });
    // Remove one capability
    const tampered: ModuleManifest = {
      ...manifest,
      capability_descriptors: [manifest.capability_descriptors[0]!],
    };
    const result = loader.load(tampered);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('Hash verification failed');
  });

  // HV-U8: Property order does not affect hash (determinism guarantee)
  it('HV-U8: property insertion order does not affect hash computation', () => {
    const manifest1 = makeBaseManifest();
    const manifest2 = {
      version: manifest1.version,
      module_id: manifest1.module_id,
      description: manifest1.description,
      module_name: manifest1.module_name,
      license: manifest1.license,
      author: manifest1.author,
      capability_descriptors: manifest1.capability_descriptors,
      intrinsic_restrictions: manifest1.intrinsic_restrictions,
      hazard_declarations: manifest1.hazard_declarations,
      suggested_profiles: manifest1.suggested_profiles,
    };
    const hash1 = computeManifestHash(manifest1 as ModuleManifest);
    const hash2 = computeManifestHash(manifest2 as ModuleManifest);
    expect(hash1).toBe(hash2);
  });
});
