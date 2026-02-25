/**
 * Archon Restriction DSL — Compiler Tests
 *
 * restriction-compiler/structured-determinism: compileStructured() is deterministic
 * restriction-compiler/dsl-determinism: compileDSL() is deterministic
 * restriction-compiler/structured-dsl-equivalence: structured and DSL produce identical ir_hash
 * restriction-compiler/snapshot-sensitivity: adding a restriction changes RS_hash
 * restriction-compiler/snapshot-stability: identical restrictions produce same RS_hash
 *
 * Tests are pure: no I/O, no clock dependency, no state.
 */

import { describe, it, expect } from 'vitest';
import { compileStructured, compileDSL } from '@archon/restriction-dsl';
import { CapabilityType } from '@archon/restriction-dsl';
import { SnapshotBuilder } from '../src/snapshot/builder.js';
import { RiskTier } from '../src/index.js';
import type { ModuleManifest, ModuleHash } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_CLOCK = () => '2026-01-01T00:00:00.000Z';

const EMPTY_MANIFEST: ModuleManifest = {
  module_id: 'test-module',
  module_name: 'Test Module',
  version: '0.0.1',
  description: 'Test fixture',
  author: 'test',
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

const builder = new SnapshotBuilder();

// ---------------------------------------------------------------------------
// restriction-compiler/structured-determinism
// ---------------------------------------------------------------------------

describe('restriction-compiler: compileStructured() is deterministic', () => {
  it('produces identical CompiledDRR for identical input', () => {
    const rule = {
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow' as const,
      conditions: [{ field: 'capability.params.path', op: 'matches' as const, value: './docs/**' }],
    };

    const a = compileStructured(rule);
    const b = compileStructured(rule);

    expect(a).toEqual(b);
    expect(a.ir_hash).toBe(b.ir_hash);
  });

  it('conditions are sorted canonically regardless of input order', () => {
    const ruleA = {
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow' as const,
      conditions: [
        { field: 'capability.params.path', op: 'matches' as const, value: './docs/**' },
        { field: 'capability.params.path', op: 'matches' as const, value: './src/**' },
      ],
    };
    const ruleB = {
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow' as const,
      // Same conditions in reverse order
      conditions: [
        { field: 'capability.params.path', op: 'matches' as const, value: './src/**' },
        { field: 'capability.params.path', op: 'matches' as const, value: './docs/**' },
      ],
    };

    const a = compileStructured(ruleA);
    const b = compileStructured(ruleB);

    // ir_hash must be identical — conditions are sorted before hashing
    expect(a.ir_hash).toBe(b.ir_hash);
    // conditions in output are sorted
    expect(a.conditions[0]!.value).toBe('./docs/**');
    expect(a.conditions[1]!.value).toBe('./src/**');
  });
});

// ---------------------------------------------------------------------------
// restriction-compiler/dsl-determinism
// ---------------------------------------------------------------------------

describe('restriction-compiler: compileDSL() is deterministic', () => {
  it('produces identical CompiledDRR for identical DSL source', () => {
    const source = 'allow fs.read where capability.params.path matches "./docs/**"';
    const a = compileDSL('drr:1', source);
    const b = compileDSL('drr:1', source);

    expect(a).toEqual(b);
    expect(a.ir_hash).toBe(b.ir_hash);
  });

  it('id does not affect ir_hash', () => {
    const source = 'allow fs.read where capability.params.path matches "./docs/**"';
    const a = compileDSL('drr:1', source);
    const b = compileDSL('drr:999', source);

    // Different ids → different CompiledDRR objects
    expect(a.id).not.toBe(b.id);
    // But the semantic content (ir_hash) is identical
    expect(a.ir_hash).toBe(b.ir_hash);
  });

  it('rejects malformed DSL source', () => {
    expect(() => compileDSL('drr:1', 'not a valid rule')).toThrow(/DSL parse error/);
  });

  it('rejects unknown capability type in DSL', () => {
    expect(() =>
      compileDSL('drr:1', 'allow not.a.real.type where capability.params.path matches "./docs/**"'),
    ).toThrow(/DSL parse error.*[Uu]nknown capability type/);
  });
});

// ---------------------------------------------------------------------------
// restriction-compiler/structured-dsl-equivalence
// ---------------------------------------------------------------------------

describe('restriction-compiler: structured and DSL inputs produce identical ir_hash', () => {
  it('compileStructured and compileDSL agree on ir_hash for equivalent rules', () => {
    const structuredRule = {
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow' as const,
      conditions: [{ field: 'capability.params.path', op: 'matches' as const, value: './docs/**' }],
    };
    const dslSource = 'allow fs.read where capability.params.path matches "./docs/**"';

    const fromStructured = compileStructured(structuredRule);
    const fromDSL = compileDSL('drr:1', dslSource);

    expect(fromStructured.ir_hash).toBe(fromDSL.ir_hash);
    expect(fromStructured.effect).toBe(fromDSL.effect);
    expect(fromStructured.capabilityType).toBe(fromDSL.capabilityType);
    expect(fromStructured.conditions).toEqual(fromDSL.conditions);
  });

  it('deny rules also agree between structured and DSL', () => {
    const structuredRule = {
      id: 'drr:1',
      capabilityType: CapabilityType.FsWrite,
      effect: 'deny' as const,
      conditions: [{ field: 'capability.params.path', op: 'matches' as const, value: './config/**' }],
    };
    const dslSource = 'deny fs.write where capability.params.path matches "./config/**"';

    const fromStructured = compileStructured(structuredRule);
    const fromDSL = compileDSL('drr:1', dslSource);

    expect(fromStructured.ir_hash).toBe(fromDSL.ir_hash);
  });
});

// ---------------------------------------------------------------------------
// restriction-compiler/snapshot-sensitivity
// ---------------------------------------------------------------------------

describe('restriction-compiler: restriction changes cause RS_hash to change', () => {
  it('snapshot without restrictions differs from snapshot with restrictions', () => {
    const withoutRestrictions = builder.build(
      [EMPTY_MANIFEST],
      [CapabilityType.FsRead],
      [],  // no DRRs
      '0.0.1',
      '',
      'test-project',
      FIXED_CLOCK,
    );

    const drr = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });

    const withRestrictions = builder.build(
      [EMPTY_MANIFEST],
      [CapabilityType.FsRead],
      [drr],  // one DRR
      '0.0.1',
      '',
      'test-project',
      FIXED_CLOCK,
    );

    const hashA = builder.hash(withoutRestrictions);
    const hashB = builder.hash(withRestrictions);

    expect(hashA).not.toBe(hashB);
  });

  it('changing a restriction condition changes RS_hash', () => {
    const drr1 = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });
    const drr2 = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './src/**' }],
    });

    const snapshotA = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr1], '0.0.1', '', 'test-project', FIXED_CLOCK);
    const snapshotB = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr2], '0.0.1', '', 'test-project', FIXED_CLOCK);

    expect(builder.hash(snapshotA)).not.toBe(builder.hash(snapshotB));
  });
});

// ---------------------------------------------------------------------------
// restriction-compiler/snapshot-stability
// ---------------------------------------------------------------------------

describe('restriction-compiler: identical restrictions produce identical RS_hash', () => {
  it('rebuilding with identical DRRs produces the same RS_hash', () => {
    const drr = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });

    const snapshotA = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr], '0.0.1', '', 'test-project', FIXED_CLOCK);
    const snapshotB = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr], '0.0.1', '', 'test-project', FIXED_CLOCK);

    expect(builder.hash(snapshotA)).toBe(builder.hash(snapshotB));
  });

  it('DRR id is part of snapshot serialization: same id → same RS_hash; different id → different RS_hash', () => {
    // id IS included in snapshot serialization (drr_canonical contains the full CompiledDRR),
    // so two DRRs with identical content but different ids produce different RS_hashes.
    const drr1 = compileStructured({
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });
    const drr2 = compileStructured({
      id: 'drr:2',
      capabilityType: CapabilityType.FsRead,
      effect: 'allow',
      conditions: [{ field: 'capability.params.path', op: 'matches', value: './docs/**' }],
    });

    const snapshotA = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr1], '0.0.1', '', 'test-project', FIXED_CLOCK);
    const snapshotB = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr1], '0.0.1', '', 'test-project', FIXED_CLOCK);
    const snapshotC = builder.build([EMPTY_MANIFEST], [CapabilityType.FsRead], [drr2], '0.0.1', '', 'test-project', FIXED_CLOCK);

    // Same DRR repeated → identical RS_hash
    expect(builder.hash(snapshotA)).toBe(builder.hash(snapshotB));
    // Different id (drr:2 vs drr:1) → different RS_hash
    expect(builder.hash(snapshotA)).not.toBe(builder.hash(snapshotC));
  });
});
