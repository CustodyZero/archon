/**
 * Archon Kernel — Restriction Composition Tests
 *
 * Verifies that intrinsic restrictions compose monotonically through
 * the module dependency DAG (I2: restriction monotonicity).
 *
 * All tests are pure: no I/O.
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 * @see docs/specs/formal_governance.md §5 (I2)
 */

import { describe, it, expect } from 'vitest';
import { composeRestrictionsForModule } from '../src/composition/restriction-composer.js';
import { CapabilityType, RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash, CapabilityDescriptor } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDescriptor(moduleId: string): CapabilityDescriptor {
  return {
    module_id: moduleId,
    capability_id: `${moduleId}-cap`,
    type: CapabilityType.FsRead,
    tier: RiskTier.T1,
    params_schema: {},
    ack_required: false,
    default_enabled: false,
    hazards: [],
  };
}

function makeManifest(
  id: string,
  opts?: {
    intrinsic_restrictions?: string[];
    module_dependencies?: string[];
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
    capability_descriptors: [makeDescriptor(id)],
    intrinsic_restrictions: opts?.intrinsic_restrictions ?? [],
    hazard_declarations: [],
    suggested_profiles: [],
    module_dependencies: opts?.module_dependencies,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composition-restriction/compose', () => {
  it('module with no deps and no restrictions returns empty', () => {
    const modA = makeManifest('a');
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);

    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toEqual([]);
    expect(result.contributingModules).toEqual([]);
  });

  it('module with own intrinsic restrictions returns them', () => {
    const modA = makeManifest('a', {
      intrinsic_restrictions: ['allow fs.read where path matches "/safe/**"'],
    });
    const modules = new Map([['a', modA]]);
    const enabled = new Set(['a']);

    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0]).toContain('fs.read');
    expect(result.contributingModules).toEqual(['a']);
  });

  it('dependency restrictions compose onto dependent (dependency first)', () => {
    const modB = makeManifest('b', {
      intrinsic_restrictions: ['allow fs.write where path matches "/safe/**"'],
    });
    const modA = makeManifest('a', {
      intrinsic_restrictions: ['allow fs.read where path matches "/docs/**"'],
      module_dependencies: ['b'],
    });
    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a', 'b']);

    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toHaveLength(2);
    // B's restrictions come first (dependency-first ordering)
    expect(result.restrictions[0]).toContain('fs.write');
    expect(result.restrictions[1]).toContain('fs.read');
    expect(result.contributingModules).toEqual(['b', 'a']);
  });

  it('transitive dependency restrictions are included', () => {
    const modC = makeManifest('c', {
      intrinsic_restrictions: ['deny fs.delete where path matches "/protected/**"'],
    });
    const modB = makeManifest('b', {
      module_dependencies: ['c'],
    });
    const modA = makeManifest('a', {
      module_dependencies: ['b'],
    });
    const modules = new Map([['a', modA], ['b', modB], ['c', modC]]);
    const enabled = new Set(['a', 'b', 'c']);

    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0]).toContain('fs.delete');
    expect(result.contributingModules).toEqual(['c']);
  });

  it('duplicate restrictions are deduplicated', () => {
    const sharedRestriction = 'allow fs.read where path matches "/safe/**"';
    const modB = makeManifest('b', { intrinsic_restrictions: [sharedRestriction] });
    const modC = makeManifest('c', { intrinsic_restrictions: [sharedRestriction] });
    const modA = makeManifest('a', { module_dependencies: ['b', 'c'] });
    const modules = new Map([['a', modA], ['b', modB], ['c', modC]]);
    const enabled = new Set(['a', 'b', 'c']);

    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toHaveLength(1);
  });

  it('disabled dependency restrictions are excluded', () => {
    const modB = makeManifest('b', {
      intrinsic_restrictions: ['allow fs.write where path matches "/safe/**"'],
    });
    const modA = makeManifest('a', { module_dependencies: ['b'] });
    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a']); // b is NOT enabled

    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toEqual([]);
  });

  it('handles cycles gracefully via visited set', () => {
    const modA = makeManifest('a', {
      intrinsic_restrictions: ['allow fs.read where path matches "/a/**"'],
      module_dependencies: ['b'],
    });
    const modB = makeManifest('b', {
      intrinsic_restrictions: ['allow fs.write where path matches "/b/**"'],
      module_dependencies: ['a'],
    });
    const modules = new Map([['a', modA], ['b', modB]]);
    const enabled = new Set(['a', 'b']);

    // Should not throw.
    const result = composeRestrictionsForModule('a', modules, enabled);
    expect(result.restrictions).toHaveLength(2);
  });

  it('monotonicity: more dependencies = more restrictions (tighter)', () => {
    const modC = makeManifest('c', {
      intrinsic_restrictions: ['allow fs.read where path matches "/narrow/**"'],
    });
    const modB = makeManifest('b', {
      intrinsic_restrictions: ['allow fs.write where path matches "/safe/**"'],
    });
    const modA_without = makeManifest('a', {});
    const modA_with = makeManifest('a', { module_dependencies: ['b', 'c'] });

    const modules_without = new Map([['a', modA_without]]);
    const modules_with = new Map([['a', modA_with], ['b', modB], ['c', modC]]);
    const enabled = new Set(['a', 'b', 'c']);

    const r_without = composeRestrictionsForModule('a', modules_without, enabled);
    const r_with = composeRestrictionsForModule('a', modules_with, enabled);

    // With dependencies: more restrictions (monotonic tightening)
    expect(r_with.restrictions.length).toBeGreaterThan(r_without.restrictions.length);
  });
});
