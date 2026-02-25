/**
 * Archon Module Loader — ProposalQueue Tests
 *
 * Unit tests (U1–U6):
 *   U1: propose() creates a 'pending' proposal with correct preview
 *   U2: approveProposal() rejects agent-class approvers
 *   U3: approveProposal() for enable_capability (T3) requires typed ack phrase
 *   U4: approveProposal() for enable_capability succeeds with correct T3 phrase
 *   U5: rejectProposal() transitions to 'rejected' with reason recorded
 *   U6: approveProposal() on a non-pending proposal returns applied=false
 *
 * Invariant tests (I1–I4):
 *   I1: proposal stays 'pending' on recoverable error (wrong ack phrase)
 *   I2: agent cannot approve; human can approve the same proposal
 *   I3: state is NOT mutated on failed apply (capability stays disabled)
 *   I4: rsHashAfter is computed and stored on successful apply
 *
 * P4 (Project Scoping): Each test creates an isolated MemoryStateIO instance.
 * No filesystem I/O, no ARCHON_STATE_DIR — state is fully in-memory and
 * scoped to the test. This is the correct isolation pattern post-P4.
 *
 * Tests are pure: no file I/O.
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier, buildExpectedAckPhrase, SnapshotBuilderImpl } from '@archon/kernel';
import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import type { ProposedBy } from '@archon/kernel';
import { ModuleStatus } from '@archon/kernel';
import { MemoryStateIO } from '@archon/runtime-host';
import { ModuleRegistry } from '../src/registry.js';
import { CapabilityRegistry } from '../src/capability-registry.js';
import { RestrictionRegistry } from '../src/restriction-registry.js';
import { AckStore } from '../src/ack-store.js';
import { ProposalQueue } from '../src/proposal-queue.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HUMAN_PROPOSER: ProposedBy = { kind: 'cli', id: 'operator' };
const AGENT_PROPOSER: ProposedBy = { kind: 'agent', id: 'agent-1' };

/** Minimal manifest with fs.read (T1) and fs.delete (T3). */
const FILESYSTEM_MANIFEST: ModuleManifest = {
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

/** Build a fresh set of registries with the filesystem module registered and enabled. */
function buildRegistries(stateIO: MemoryStateIO): {
  moduleRegistry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
  ackStore: AckStore;
} {
  const moduleRegistry = new ModuleRegistry(stateIO);
  moduleRegistry.register(FILESYSTEM_MANIFEST);
  moduleRegistry.enable('filesystem', { confirmed: true });
  const capabilityRegistry = new CapabilityRegistry(moduleRegistry, stateIO);
  const restrictionRegistry = new RestrictionRegistry(stateIO);
  const ackStore = new AckStore(stateIO);
  return { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore };
}

/** Build a ProposalQueue with a deterministic snapshot hash stub. */
function buildQueue(
  moduleRegistry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  restrictionRegistry: RestrictionRegistry,
  stateIO: MemoryStateIO,
  ackStore: AckStore,
  hashStub: () => string = () => 'test-rs-hash-after',
): ProposalQueue {
  return new ProposalQueue(
    moduleRegistry,
    capabilityRegistry,
    restrictionRegistry,
    hashStub,
    stateIO,
    ackStore,
  );
}

/**
 * Minimal manifest with exec.run (T2).
 * Declared as T2 to avoid typed-ack requirements in tests.
 * Used to trigger the (exec.run, fs.read) hazard pair in the HAZARD_MATRIX.
 */
const EXEC_MODULE_MANIFEST: ModuleManifest = {
  module_id: 'exec',
  module_name: 'Exec Module',
  version: '0.0.1',
  description: 'Test fixture for exec capabilities',
  author: 'test',
  license: 'Apache-2.0',
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'exec',
      capability_id: 'exec.run',
      type: CapabilityType.ExecRun,
      tier: RiskTier.T2,
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

/**
 * Build registries with both filesystem and exec modules registered and enabled.
 * Required for hazard-pair tests that need (exec.run, fs.read) from the HAZARD_MATRIX.
 */
function buildRegistriesWithExec(stateIO: MemoryStateIO): {
  moduleRegistry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
  ackStore: AckStore;
} {
  const moduleRegistry = new ModuleRegistry(stateIO);
  moduleRegistry.register(FILESYSTEM_MANIFEST);
  moduleRegistry.enable('filesystem', { confirmed: true });
  moduleRegistry.register(EXEC_MODULE_MANIFEST);
  moduleRegistry.enable('exec', { confirmed: true });
  const capabilityRegistry = new CapabilityRegistry(moduleRegistry, stateIO);
  const restrictionRegistry = new RestrictionRegistry(stateIO);
  const ackStore = new AckStore(stateIO);
  return { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore };
}

/**
 * Build a real snapshot hash factory using SnapshotBuilderImpl.
 * Closes over the live registries — hash changes when registry state changes.
 * Used by P1-5 to verify the hash actually differs before and after approval.
 *
 * P4: uses 'test-project' as projectId so the snapshot signature includes a
 * project binding, matching the production path.
 */
function buildRealHashFn(
  moduleRegistry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  ackStore: AckStore,
): () => string {
  return () => {
    const builder = new SnapshotBuilderImpl();
    const snapshot = builder.build(
      moduleRegistry.listEnabled(),
      capabilityRegistry.listEnabledCapabilities(),
      [],
      '0.0.1',
      '',
      'test-project',
      undefined,
      ackStore.getAckEpoch(),
    );
    return builder.hash(snapshot);
  };
}

// ---------------------------------------------------------------------------
// U1: propose() creates a pending proposal with correct preview
// ---------------------------------------------------------------------------

describe('proposal-queue: U1 — propose() creates pending proposal with correct preview', () => {
  it('creates a proposal in pending status', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    expect(proposal.status).toBe('pending');
    expect(proposal.kind).toBe('enable_capability');
    expect(proposal.createdBy).toEqual(HUMAN_PROPOSER);
  });

  it('assigns a unique non-empty id', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const p1 = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );
    const p2 = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    expect(p1.id).toBeTruthy();
    expect(p2.id).toBeTruthy();
    expect(p1.id).not.toBe(p2.id);
  });

  it('preview for T1 capability has requiresTypedAck=false', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    expect(proposal.preview.requiresTypedAck).toBe(false);
    expect(proposal.preview.requiresHazardConfirm).toBe(false);
    expect(proposal.preview.changeSummary).toContain('fs.read');
  });

  it('preview for T3 capability has requiresTypedAck=true with expected phrase', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    expect(proposal.preview.requiresTypedAck).toBe(true);
    expect(proposal.preview.requiredAckPhrase).toBe('I ACCEPT T3 RISK (fs.delete)');
    expect(proposal.preview.changeSummary).toContain('fs.delete');
  });

  it('agents may submit proposals (propose() does not restrict by kind)', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      AGENT_PROPOSER,
    );

    expect(proposal.status).toBe('pending');
    expect(proposal.createdBy.kind).toBe('agent');
  });

  it('proposal is retrievable via getProposal after creation', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const created = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const retrieved = queue.getProposal(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('proposal appears in listProposals() after creation', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const list = queue.listProposals();
    expect(list.some((p) => p.id === proposal.id)).toBe(true);
  });

  // P0-1: propose() must not mutate any registry state.
  it('propose() does not enable the capability or alter module status', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    // Preconditions.
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
    expect(moduleRegistry.getStatus('filesystem')).toBe(ModuleStatus.Enabled);

    queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    // propose() is pure submission — no side effects on registries.
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
    expect(moduleRegistry.getStatus('filesystem')).toBe(ModuleStatus.Enabled);
  });
});

// ---------------------------------------------------------------------------
// U2: approveProposal() rejects agent-class approvers
// ---------------------------------------------------------------------------

describe('proposal-queue: U2 — approveProposal() rejects agent-class approvers', () => {
  it('returns applied=false when approver.kind is agent', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, AGENT_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('human-class');
    expect(result.error).toContain('agent');
  });

  it('proposal stays pending after agent-approve attempt', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, {}, AGENT_PROPOSER);

    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// U3: approveProposal() for T3 capability requires typed ack phrase
// ---------------------------------------------------------------------------

describe('proposal-queue: U3 — approveProposal() T3 requires typed ack phrase', () => {
  it('returns applied=false when no ack phrase provided for T3', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('T3');
  });

  it('returns applied=false for incorrect ack phrase for T3', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(
      proposal.id,
      { typedAckPhrase: 'wrong phrase' },
      HUMAN_PROPOSER,
    );

    expect(result.applied).toBe(false);
    expect(result.error).toContain('I ACCEPT T3 RISK (fs.delete)');
  });

  it('proposal stays pending after wrong ack phrase (recoverable)', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, { typedAckPhrase: 'wrong' }, HUMAN_PROPOSER);

    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// U4: approveProposal() succeeds with correct T3 phrase
// ---------------------------------------------------------------------------

describe('proposal-queue: U4 — approveProposal() succeeds with correct T3 phrase', () => {
  it('returns applied=true for correct T3 ack phrase', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    const result = queue.approveProposal(proposal.id, { typedAckPhrase: phrase }, HUMAN_PROPOSER);

    expect(result.applied).toBe(true);
    expect(result.rsHashAfter).toBe('test-rs-hash-after');
  });

  it('capability is enabled after successful approval', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    queue.approveProposal(proposal.id, { typedAckPhrase: phrase }, HUMAN_PROPOSER);

    expect(capabilityRegistry.isEnabled(CapabilityType.FsDelete)).toBe(true);
  });

  it('proposal transitions to applied after successful approval', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    queue.approveProposal(proposal.id, { typedAckPhrase: phrase }, HUMAN_PROPOSER);

    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('applied');
    expect(updated?.approvedBy).toEqual(HUMAN_PROPOSER);
    expect(updated?.approvedAt).toBeTruthy();
    expect(updated?.rsHashAfter).toBe('test-rs-hash-after');
  });

  it('approve enable_module proposal successfully', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    // Register a second module (not yet enabled)
    const secondManifest: ModuleManifest = {
      ...FILESYSTEM_MANIFEST,
      module_id: 'module-b',
      module_name: 'Module B',
      capability_descriptors: FILESYSTEM_MANIFEST.capability_descriptors.map((d) => ({
        ...d,
        module_id: 'module-b',
      })),
    };
    moduleRegistry.register(secondManifest);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_module', moduleId: 'module-b' },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(true);
    expect(moduleRegistry.getStatus('module-b')).toBe(ModuleStatus.Enabled);
  });

  it('approve set_restrictions proposal successfully', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const rule = {
      id: 'drr:1',
      capabilityType: CapabilityType.FsRead,
      effect: 'deny' as const,
      conditions: [],
    };

    const proposal = queue.propose(
      { kind: 'set_restrictions', rules: [rule] },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(true);
    const rules = restrictionRegistry.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe('drr:1');
  });
});

// ---------------------------------------------------------------------------
// U5: rejectProposal() transitions to rejected with reason
// ---------------------------------------------------------------------------

describe('proposal-queue: U5 — rejectProposal() transitions to rejected', () => {
  it('transitions proposal to rejected status', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const rejected = queue.rejectProposal(proposal.id, HUMAN_PROPOSER, 'Not needed now');

    expect(rejected).toBeDefined();
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.rejectedBy).toEqual(HUMAN_PROPOSER);
    expect(rejected?.rejectionReason).toBe('Not needed now');
  });

  it('capability is NOT enabled after rejection', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.rejectProposal(proposal.id, HUMAN_PROPOSER);

    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
  });

  it('returns undefined for unknown proposal id', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const result = queue.rejectProposal('non-existent-id', HUMAN_PROPOSER);

    expect(result).toBeUndefined();
  });

  it('agent cannot reject proposals — returns undefined', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const result = queue.rejectProposal(proposal.id, AGENT_PROPOSER);

    expect(result).toBeUndefined();
    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// U6: approveProposal() on non-pending proposal returns applied=false
// ---------------------------------------------------------------------------

describe('proposal-queue: U6 — approveProposal() on non-pending proposal returns error', () => {
  it('returns applied=false for already-applied proposal', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    // Approve once (T1 — no ack phrase needed).
    queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    // Try to approve again.
    const second = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(second.applied).toBe(false);
    expect(second.error).toContain('not pending');
  });

  it('returns applied=false for rejected proposal', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.rejectProposal(proposal.id, HUMAN_PROPOSER);

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('not pending');
  });

  it('returns applied=false for unknown proposal id', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const result = queue.approveProposal('non-existent-id', {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// I1: proposal stays pending on recoverable error
// ---------------------------------------------------------------------------

describe('proposal-queue: I1 — proposal stays pending on recoverable error', () => {
  it('wrong ack phrase: proposal status remains pending', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    // Try with wrong phrase.
    queue.approveProposal(proposal.id, { typedAckPhrase: 'incorrect' }, HUMAN_PROPOSER);

    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('pending');
  });

  it('wrong ack phrase: proposal can be retried with correct phrase', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    // First attempt: wrong phrase.
    queue.approveProposal(proposal.id, { typedAckPhrase: 'wrong' }, HUMAN_PROPOSER);

    // Second attempt: correct phrase.
    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    const second = queue.approveProposal(proposal.id, { typedAckPhrase: phrase }, HUMAN_PROPOSER);

    expect(second.applied).toBe(true);
    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('applied');
  });

  it('agent-approve attempt: proposal status remains pending', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, {}, AGENT_PROPOSER);

    const updated = queue.getProposal(proposal.id);
    expect(updated?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// I2: agent cannot approve; human can approve the same proposal
// ---------------------------------------------------------------------------

describe('proposal-queue: I2 — authority rule: agent cannot approve; human can', () => {
  it('human approver succeeds after agent was denied', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      AGENT_PROPOSER, // agent proposes
    );

    // Agent tries to approve — should fail.
    const agentResult = queue.approveProposal(proposal.id, {}, AGENT_PROPOSER);
    expect(agentResult.applied).toBe(false);

    // Human approves the same proposal — should succeed.
    const humanResult = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);
    expect(humanResult.applied).toBe(true);
  });

  it('ProposerKind human, cli, and ui are all permitted to approve', () => {
    const kinds: Array<ProposedBy['kind']> = ['human', 'cli', 'ui'];
    for (const kind of kinds) {
      const stateIO = new MemoryStateIO();
      const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
      const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

      const proposal = queue.propose(
        { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
        HUMAN_PROPOSER,
      );

      const result = queue.approveProposal(proposal.id, {}, { kind, id: 'test-actor' });
      expect(result.applied).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// I3: state is NOT mutated on failed apply
// ---------------------------------------------------------------------------

describe('proposal-queue: I3 — no state mutation on failed apply', () => {
  it('capability stays disabled after wrong ack phrase', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, { typedAckPhrase: 'wrong' }, HUMAN_PROPOSER);

    expect(capabilityRegistry.isEnabled(CapabilityType.FsDelete)).toBe(false);
  });

  it('module stays disabled after agent-approve attempt', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    // Register module-b (not enabled).
    const secondManifest: ModuleManifest = {
      ...FILESYSTEM_MANIFEST,
      module_id: 'module-b',
      module_name: 'Module B',
      capability_descriptors: FILESYSTEM_MANIFEST.capability_descriptors.map((d) => ({
        ...d,
        module_id: 'module-b',
      })),
    };
    moduleRegistry.register(secondManifest);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_module', moduleId: 'module-b' },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, {}, AGENT_PROPOSER);

    expect(moduleRegistry.getStatus('module-b')).toBe(ModuleStatus.Disabled);
  });
});

// ---------------------------------------------------------------------------
// I4: rsHashAfter is computed and stored on successful apply
// ---------------------------------------------------------------------------

describe('proposal-queue: I4 — rsHashAfter is computed and stored on successful apply', () => {
  it('rsHashAfter in ApproveResult matches the injected buildSnapshotHash return value', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const expectedHash = 'mock-hash-12345';
    const queue = buildQueue(
      moduleRegistry,
      capabilityRegistry,
      restrictionRegistry,
      stateIO,
      ackStore,
      () => expectedHash,
    );

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.rsHashAfter).toBe(expectedHash);
  });

  it('rsHashAfter is stored on the persisted Proposal after apply', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const expectedHash = 'stored-hash-67890';
    const queue = buildQueue(
      moduleRegistry,
      capabilityRegistry,
      restrictionRegistry,
      stateIO,
      ackStore,
      () => expectedHash,
    );

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    const updated = queue.getProposal(proposal.id);
    expect(updated?.rsHashAfter).toBe(expectedHash);
  });

  it('buildSnapshotHash is called once per successful apply', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    let callCount = 0;
    const hashStub = (): string => {
      callCount += 1;
      return `hash-${callCount}`;
    };
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore, hashStub);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P3-I4: enforcement uses current governance state at approve time, not stored preview
// ---------------------------------------------------------------------------

describe('proposal-queue: P3-I4 — approval enforces current state, not stored preview', () => {
  it('hazard introduced after propose is enforced at approve time (without confirmation → denied)', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistriesWithExec(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    // At propose time: ExecRun is NOT capability-enabled.
    // No hazard triggered → preview records hazardsTriggered = [].
    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    expect(proposal.preview.requiresHazardConfirm).toBe(false);
    expect(proposal.preview.hazardsTriggered).toHaveLength(0);

    // State change after proposal creation: enable ExecRun directly.
    // Now the (exec.run, fs.read) hazard pair is active.
    capabilityRegistry.enableCapability(CapabilityType.ExecRun, { confirmed: true });

    // Approve without hazard confirmation — must fail because current state
    // has ExecRun enabled, regardless of the stored preview.
    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('Hazard pair');
    // FsRead must NOT be enabled — enforcement correctly blocked it.
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
    // Proposal stays pending (recoverable error).
    expect(queue.getProposal(proposal.id)?.status).toBe('pending');
  });

  it('hazard introduced after propose succeeds with hazard confirmation at approve time', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistriesWithExec(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    // Enable ExecRun after proposal creation.
    capabilityRegistry.enableCapability(CapabilityType.ExecRun, { confirmed: true });

    // Approve with explicit hazard confirmation for the newly-triggered pair.
    const result = queue.approveProposal(
      proposal.id,
      { hazardConfirmedPairs: [[CapabilityType.ExecRun, CapabilityType.FsRead]] },
      HUMAN_PROPOSER,
    );

    expect(result.applied).toBe(true);
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P0-3: hazard pair enforcement through proposal approval path
// ---------------------------------------------------------------------------

describe('proposal-queue: P0-3 — hazard pair enforcement through proposal path', () => {
  it('approval without hazard confirmation fails when hazard pair is triggered', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistriesWithExec(stateIO);
    // Pre-enable ExecRun so (exec.run, fs.read) is triggered when FsRead is proposed.
    capabilityRegistry.enableCapability(CapabilityType.ExecRun, { confirmed: true });

    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);
    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    // Preview must reflect the triggered hazard.
    expect(proposal.preview.requiresHazardConfirm).toBe(true);
    expect(proposal.preview.hazardsTriggered).toHaveLength(1);

    // Approve without hazard confirmation.
    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('Hazard pair');
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
    expect(queue.getProposal(proposal.id)?.status).toBe('pending');
  });

  it('approval with hazard confirmation succeeds', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistriesWithExec(stateIO);
    capabilityRegistry.enableCapability(CapabilityType.ExecRun, { confirmed: true });

    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);
    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(
      proposal.id,
      { hazardConfirmedPairs: [[CapabilityType.ExecRun, CapabilityType.FsRead]] },
      HUMAN_PROPOSER,
    );

    expect(result.applied).toBe(true);
    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(true);
    expect(queue.getProposal(proposal.id)?.status).toBe('applied');
  });

  it('proposal stays pending after failed approval (hazard not confirmed), then succeeds on retry', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistriesWithExec(stateIO);
    capabilityRegistry.enableCapability(CapabilityType.ExecRun, { confirmed: true });

    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);
    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    // First attempt: no hazard confirmation → denied, stays pending.
    const first = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);
    expect(first.applied).toBe(false);
    expect(queue.getProposal(proposal.id)?.status).toBe('pending');

    // Second attempt: with hazard confirmation → succeeds.
    const second = queue.approveProposal(
      proposal.id,
      { hazardConfirmedPairs: [[CapabilityType.ExecRun, CapabilityType.FsRead]] },
      HUMAN_PROPOSER,
    );
    expect(second.applied).toBe(true);
    expect(queue.getProposal(proposal.id)?.status).toBe('applied');
  });
});

// ---------------------------------------------------------------------------
// P1-4: deterministic proposal persistence
// ---------------------------------------------------------------------------

describe('proposal-queue: P1-4 — deterministic proposal persistence', () => {
  it('loading proposals twice returns identical data in the same order', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );
    queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      AGENT_PROPOSER,
    );

    const list1 = queue.listProposals();
    const list2 = queue.listProposals();

    expect(list1).toHaveLength(2);
    expect(list1.map((p) => p.id)).toEqual(list2.map((p) => p.id));
    expect(list1.map((p) => p.status)).toEqual(list2.map((p) => p.status));
  });

  it('listProposals returns results sorted by createdAt descending', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );
    queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const list = queue.listProposals();
    expect(list).toHaveLength(2);

    // Verify descending order: each createdAt must be >= the next entry.
    // (Two proposals created in the same millisecond are equal — not a violation.)
    for (let i = 0; i + 1 < list.length; i++) {
      const curr = list[i];
      const next = list[i + 1];
      expect(curr).toBeDefined();
      expect(next).toBeDefined();
      expect(curr!.createdAt >= next!.createdAt).toBe(true);
    }
  });

  it('listProposals filters by status correctly after a mix of outcomes', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore);

    const p1 = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );
    const p2 = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    // Apply p1.
    queue.approveProposal(p1.id, {}, HUMAN_PROPOSER);
    // Leave p2 pending.

    const pending = queue.listProposals({ status: 'pending' });
    const applied = queue.listProposals({ status: 'applied' });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(p2.id);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.id).toBe(p1.id);
  });
});

// ---------------------------------------------------------------------------
// P1-5: RS_hash changes after successful approval (real SnapshotBuilderImpl)
// ---------------------------------------------------------------------------

describe('proposal-queue: P1-5 — RS_hash changes after successful approval', () => {
  it('hash before and after approval are different (real builder)', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const hashFn = buildRealHashFn(moduleRegistry, capabilityRegistry, ackStore);
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore, hashFn);

    const hashBefore = hashFn();

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(true);

    const hashAfter = hashFn();
    expect(hashBefore).not.toBe(hashAfter);
    expect(result.rsHashAfter).toBe(hashAfter);
  });

  it('hash is stable across multiple reads with unchanged state', () => {
    const stateIO = new MemoryStateIO();
    const { moduleRegistry, capabilityRegistry, restrictionRegistry, ackStore } = buildRegistries(stateIO);
    const hashFn = buildRealHashFn(moduleRegistry, capabilityRegistry, ackStore);
    buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, stateIO, ackStore, hashFn);

    const hash1 = hashFn();
    const hash2 = hashFn();

    expect(hash1).toBe(hash2);
  });
});
