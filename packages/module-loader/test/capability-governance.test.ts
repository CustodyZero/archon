/**
 * Archon Module Loader — Capability Governance Tests
 *
 * Tests for previewEnableCapability() and applyEnableCapability().
 *
 * Unit tests (U1–U6):
 *   U1: previewEnableCapability returns correct T3 preview
 *   U2: applyEnableCapability with no phrase rejects T3 (missing ack)
 *   U3: applyEnableCapability with wrong phrase rejects T3 (exact match required)
 *   U4: applyEnableCapability with correct T3 phrase succeeds
 *   U5: applyEnableCapability with hazard pair triggers confirmation requirement
 *   U6: applyEnableCapability with triggered pair but empty hazardConfirmedPairs rejects
 *
 * Invariant tests (I2–I5 governance, distinct from kernel I1–I7 snapshot invariants):
 *   I2: phrase mismatch is rejected regardless of whitespace or case
 *   I3: triggered hazard pair is rejected when not in confirmedPairs
 *   I4: providing confirmedPairs allows co-enablement to proceed
 *   I5: ack_epoch increments monotonically with each T3 ack
 *
 * P4 (Project Scoping): Each test creates an isolated MemoryStateIO instance.
 * No filesystem I/O, no ARCHON_STATE_DIR — state is fully in-memory and
 * scoped to the test. This is the correct isolation pattern post-P4.
 *
 * Tests are pure: no file I/O, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier, buildExpectedAckPhrase } from '@archon/kernel';
import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { MemoryStateIO } from '@archon/runtime-host';
import { ModuleRegistry } from '../src/registry.js';
import { CapabilityRegistry } from '../src/capability-registry.js';
import { AckStore } from '../src/ack-store.js';
import { previewEnableCapability, applyEnableCapability } from '../src/capability-governance.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a ModuleRegistry with the filesystem module registered and enabled. */
function buildRegistryWithFilesystem(stateIO: MemoryStateIO): ModuleRegistry {
  const registry = new ModuleRegistry(stateIO);
  // Use a minimal manifest with fs.delete (T3) declared.
  const manifest: ModuleManifest = {
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
        capability_id: 'fs.delete',
        type: CapabilityType.FsDelete,
        tier: RiskTier.T3,
        params_schema: {},
        ack_required: true,
        default_enabled: false,
        hazards: [],
      },
    ],
    intrinsic_restrictions: [],
    hazard_declarations: [],
    suggested_profiles: [],
  };
  registry.register(manifest);
  registry.enable('filesystem', { confirmed: true });
  return registry;
}

/** Build a module registry that also declares exec.run (T3) for hazard tests. */
function buildRegistryWithFilesystemAndExec(stateIO: MemoryStateIO): ModuleRegistry {
  const registry = new ModuleRegistry(stateIO);
  const manifest: ModuleManifest = {
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
        capability_id: 'exec.run',
        type: CapabilityType.ExecRun,
        tier: RiskTier.T3,
        params_schema: {},
        ack_required: true,
        default_enabled: false,
        hazards: [],
      },
    ],
    intrinsic_restrictions: [],
    hazard_declarations: [],
    suggested_profiles: [],
  };
  registry.register(manifest);
  registry.enable('filesystem', { confirmed: true });
  return registry;
}

// ---------------------------------------------------------------------------
// capability-governance/U1: preview for T3 capability
// ---------------------------------------------------------------------------

describe('capability-governance: U1 — previewEnableCapability returns correct T3 preview', () => {
  it('returns requiresTypedAck=true and correct phrase for fs.delete (T3)', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);

    const preview = previewEnableCapability(CapabilityType.FsDelete, registry, capabilityRegistry);

    expect(preview.capabilityType).toBe(CapabilityType.FsDelete);
    expect(preview.tier).toBe(RiskTier.T3);
    expect(preview.requiresTypedAck).toBe(true);
    expect(preview.expectedPhrase).toBe('I ACCEPT T3 RISK (fs.delete)');
  });

  it('returns requiresTypedAck=false for fs.read (T1)', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);

    const preview = previewEnableCapability(CapabilityType.FsRead, registry, capabilityRegistry);

    expect(preview.requiresTypedAck).toBe(false);
    expect(preview.expectedPhrase).toBeNull();
    expect(preview.tier).toBe(RiskTier.T1);
  });

  it('reports no active hazard pairs when no hazard partners are enabled', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    // Nothing is enabled yet — no partners.

    const preview = previewEnableCapability(CapabilityType.FsRead, registry, capabilityRegistry);

    expect(preview.activeHazardPairs).toHaveLength(0);
  });

  it('reports active hazard pairs when hazard partner is already enabled', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    // Enable exec.run with required T3 ack so it is in the enabled set.
    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // Now preview fs.read — exec.run is enabled, so (exec.run, fs.read) pair is active.
    const preview = previewEnableCapability(CapabilityType.FsRead, registry, capabilityRegistry);

    expect(preview.activeHazardPairs).toHaveLength(1);
    const pair = preview.activeHazardPairs[0];
    expect(pair?.partnerType).toBe(CapabilityType.ExecRun);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/U2: missing ack phrase rejects T3
// ---------------------------------------------------------------------------

describe('capability-governance: U2 — applyEnableCapability rejects T3 with no ack phrase', () => {
  it('returns applied=false when typedAckPhrase is absent for T3 capability', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      {},
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('T3 typed acknowledgment required');
    // Capability must not have been enabled.
    expect(capabilityRegistry.isEnabled(CapabilityType.FsDelete)).toBe(false);
  });

  it('ack_epoch is unchanged after a rejected T3 apply', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);
    const epochBefore = ackStore.getAckEpoch();

    applyEnableCapability(CapabilityType.FsDelete, {}, registry, capabilityRegistry, ackStore);

    expect(ackStore.getAckEpoch()).toBe(epochBefore);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/U3: wrong ack phrase rejects T3 (exact match required)
// ---------------------------------------------------------------------------

describe('capability-governance: U3 — applyEnableCapability rejects T3 with wrong phrase', () => {
  it('returns applied=false for a near-match phrase', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: 'I acknowledge risk' },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
    expect(result.error).toContain('I ACCEPT T3 RISK (fs.delete)');
  });

  it('returns applied=false for a lowercase version of the correct phrase', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: 'i accept t3 risk (fs.delete)' },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
  });

  it('returns applied=false for phrase with extra whitespace', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: ' I ACCEPT T3 RISK (fs.delete) ' },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // The API does not trim. Exact match only.
    expect(result.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/U4: correct T3 phrase succeeds
// ---------------------------------------------------------------------------

describe('capability-governance: U4 — applyEnableCapability succeeds with correct T3 phrase', () => {
  it('returns applied=true and enables capability for correct phrase', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: phrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(true);
    expect(result.error).toBeUndefined();
    expect(capabilityRegistry.isEnabled(CapabilityType.FsDelete)).toBe(true);
  });

  it('ack_epoch increments by 1 after successful T3 apply', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);
    const epochBefore = ackStore.getAckEpoch();

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: phrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.ackEpoch).toBe(epochBefore + 1);
    expect(ackStore.getAckEpoch()).toBe(epochBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/U5: hazard pair requires confirmation
// ---------------------------------------------------------------------------

describe('capability-governance: U5 — hazard pair triggers confirmation requirement', () => {
  it('enabling fs.read when exec.run is already enabled triggers hazard check', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    // Enable exec.run first (T3 ack required).
    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // Now try to enable fs.read without hazard confirmation.
    const result = applyEnableCapability(
      CapabilityType.FsRead,
      {},
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
    expect(result.error).toContain('Hazard pair');
    expect(result.error).toContain(CapabilityType.ExecRun);
    expect(result.error).toContain(CapabilityType.FsRead);
  });

  it('previewEnableCapability correctly shows the triggered hazard pair', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    // Enable exec.run first.
    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    const preview = previewEnableCapability(CapabilityType.FsRead, registry, capabilityRegistry);

    expect(preview.activeHazardPairs).toHaveLength(1);
    expect(preview.activeHazardPairs[0]?.partnerType).toBe(CapabilityType.ExecRun);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/U6: empty hazardConfirmedPairs rejects triggered pair
// ---------------------------------------------------------------------------

describe('capability-governance: U6 — empty confirmedPairs rejects triggered hazard pair', () => {
  it('returns applied=false when hazardConfirmedPairs is empty array but pair is triggered', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    // Enable exec.run (T3).
    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // Try to enable fs.read with explicitly empty confirmedPairs.
    const result = applyEnableCapability(
      CapabilityType.FsRead,
      { hazardConfirmedPairs: [] },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/I2: exact phrase match is required (non-trivial rejection)
// ---------------------------------------------------------------------------

describe('capability-governance: I2 — typed phrase must match exactly', () => {
  it('rejects empty string as phrase', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: '' },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
  });

  it('rejects phrase for a different capability type', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    // Phrase for exec.run, not fs.delete
    const wrongPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    const result = applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: wrongPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
    // Error message should show the correct expected phrase.
    expect(result.error).toContain('I ACCEPT T3 RISK (fs.delete)');
  });
});

// ---------------------------------------------------------------------------
// capability-governance/I3: hazard pair not confirmed → rejected
// ---------------------------------------------------------------------------

describe('capability-governance: I3 — unconfirmed hazard pair is rejected', () => {
  it('rejects when triggered pair is not present in hazardConfirmedPairs', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // Provide a *different* confirmed pair — the real triggered pair is not included.
    const result = applyEnableCapability(
      CapabilityType.FsRead,
      {
        hazardConfirmedPairs: [[CapabilityType.LlmInfer, CapabilityType.SecretsUse] as const],
      },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/I4: hazard pair confirmed → co-enablement succeeds
// ---------------------------------------------------------------------------

describe('capability-governance: I4 — confirmed hazard pair allows co-enablement', () => {
  it('enables fs.read when exec.run is already enabled and pair is confirmed', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // Provide the triggered pair in hazardConfirmedPairs (order-insensitive).
    const result = applyEnableCapability(
      CapabilityType.FsRead,
      {
        hazardConfirmedPairs: [[CapabilityType.FsRead, CapabilityType.ExecRun] as const],
      },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(true);
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(true);
  });

  it('pair matching is order-insensitive: (B, A) confirms (A, B) pair', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystemAndExec(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    const execPhrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.ExecRun);
    applyEnableCapability(
      CapabilityType.ExecRun,
      { typedAckPhrase: execPhrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    // Matrix has (exec.run, fs.read). Confirm as (fs.read, exec.run) — reversed.
    const result = applyEnableCapability(
      CapabilityType.FsRead,
      {
        hazardConfirmedPairs: [[CapabilityType.ExecRun, CapabilityType.FsRead] as const],
      },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(result.applied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// capability-governance/I5: ack_epoch is monotonically increasing
// ---------------------------------------------------------------------------

describe('capability-governance: I5 — ack_epoch increments monotonically', () => {
  it('ack_epoch starts at 0 with no prior acks', () => {
    const stateIO = new MemoryStateIO();
    const ackStore = new AckStore(stateIO);

    expect(ackStore.getAckEpoch()).toBe(0);
  });

  it('ack_epoch increases by 1 for each successful T3 capability ack', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);

    expect(ackStore.getAckEpoch()).toBe(0);

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: phrase },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(ackStore.getAckEpoch()).toBe(1);
  });

  it('ack_epoch does NOT increase on failed apply (rejected phrase)', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);
    const epochBefore = ackStore.getAckEpoch();

    applyEnableCapability(
      CapabilityType.FsDelete,
      { typedAckPhrase: 'wrong phrase' },
      registry,
      capabilityRegistry,
      ackStore,
    );

    expect(ackStore.getAckEpoch()).toBe(epochBefore);
  });

  it('ack_epoch does NOT increase for T1 capability enablement', () => {
    const stateIO = new MemoryStateIO();
    const registry = buildRegistryWithFilesystem(stateIO);
    const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
    const ackStore = new AckStore(stateIO);
    const epochBefore = ackStore.getAckEpoch();

    applyEnableCapability(
      CapabilityType.FsRead,
      {},
      registry,
      capabilityRegistry,
      ackStore,
    );

    // fs.read is T1 — no ack event recorded.
    expect(ackStore.getAckEpoch()).toBe(epochBefore);
  });
});
