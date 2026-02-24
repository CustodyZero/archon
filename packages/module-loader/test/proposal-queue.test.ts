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
 * All tests use an isolated temp state directory to prevent cross-test contamination.
 * State isolation is enforced via the ARCHON_STATE_DIR environment variable.
 * Each test starts with a fresh empty state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CapabilityType, RiskTier, buildExpectedAckPhrase } from '@archon/kernel';
import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import type { ProposedBy } from '@archon/kernel';
import { ModuleStatus } from '@archon/kernel';
import { ModuleRegistry } from '../src/registry.js';
import { CapabilityRegistry } from '../src/capability-registry.js';
import { RestrictionRegistry } from '../src/restriction-registry.js';
import { ProposalQueue } from '../src/proposal-queue.js';

// ---------------------------------------------------------------------------
// Test state isolation
// ---------------------------------------------------------------------------

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'archon-pq-test-'));
  process.env['ARCHON_STATE_DIR'] = stateDir;
});

afterEach(() => {
  delete process.env['ARCHON_STATE_DIR'];
  rmSync(stateDir, { recursive: true, force: true });
});

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
function buildRegistries(): {
  moduleRegistry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
} {
  const moduleRegistry = new ModuleRegistry();
  moduleRegistry.register(FILESYSTEM_MANIFEST);
  moduleRegistry.enable('filesystem', { confirmed: true });
  const capabilityRegistry = new CapabilityRegistry(moduleRegistry);
  const restrictionRegistry = new RestrictionRegistry();
  return { moduleRegistry, capabilityRegistry, restrictionRegistry };
}

/** Build a ProposalQueue with a deterministic snapshot hash stub. */
function buildQueue(
  moduleRegistry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  restrictionRegistry: RestrictionRegistry,
  hashStub: () => string = () => 'test-rs-hash-after',
): ProposalQueue {
  return new ProposalQueue(
    moduleRegistry,
    capabilityRegistry,
    restrictionRegistry,
    hashStub,
  );
}

// ---------------------------------------------------------------------------
// U1: propose() creates a pending proposal with correct preview
// ---------------------------------------------------------------------------

describe('proposal-queue: U1 — propose() creates pending proposal with correct preview', () => {
  it('creates a proposal in pending status', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    expect(proposal.status).toBe('pending');
    expect(proposal.kind).toBe('enable_capability');
    expect(proposal.createdBy).toEqual(HUMAN_PROPOSER);
  });

  it('assigns a unique non-empty id', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    expect(proposal.preview.requiresTypedAck).toBe(false);
    expect(proposal.preview.requiresHazardConfirm).toBe(false);
    expect(proposal.preview.changeSummary).toContain('fs.read');
  });

  it('preview for T3 capability has requiresTypedAck=true with expected phrase', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    expect(proposal.preview.requiresTypedAck).toBe(true);
    expect(proposal.preview.requiredAckPhrase).toBe('I ACCEPT T3 RISK (fs.delete)');
    expect(proposal.preview.changeSummary).toContain('fs.delete');
  });

  it('agents may submit proposals (propose() does not restrict by kind)', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      AGENT_PROPOSER,
    );

    expect(proposal.status).toBe('pending');
    expect(proposal.createdBy.kind).toBe('agent');
  });

  it('proposal is retrievable via getProposal after creation', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const created = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const retrieved = queue.getProposal(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('proposal appears in listProposals() after creation', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    const list = queue.listProposals();
    expect(list.some((p) => p.id === proposal.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U2: approveProposal() rejects agent-class approvers
// ---------------------------------------------------------------------------

describe('proposal-queue: U2 — approveProposal() rejects agent-class approvers', () => {
  it('returns applied=false when approver.kind is agent', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('T3');
  });

  it('returns applied=false for incorrect ack phrase for T3', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    const phrase = buildExpectedAckPhrase(RiskTier.T3, CapabilityType.FsDelete);
    queue.approveProposal(proposal.id, { typedAckPhrase: phrase }, HUMAN_PROPOSER);

    expect(capabilityRegistry.isEnabled(CapabilityType.FsDelete)).toBe(true);
  });

  it('proposal transitions to applied after successful approval', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
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
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_module', moduleId: 'module-b' },
      HUMAN_PROPOSER,
    );

    const result = queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(result.applied).toBe(true);
    expect(moduleRegistry.getStatus('module-b')).toBe(ModuleStatus.Enabled);
  });

  it('approve set_restrictions proposal successfully', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.rejectProposal(proposal.id, HUMAN_PROPOSER);

    expect(capabilityRegistry.isEnabled(CapabilityType.FsRead)).toBe(false);
  });

  it('returns undefined for unknown proposal id', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const result = queue.rejectProposal('non-existent-id', HUMAN_PROPOSER);

    expect(result).toBeUndefined();
  });

  it('agent cannot reject proposals — returns undefined', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
      const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
      const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsDelete },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, { typedAckPhrase: 'wrong' }, HUMAN_PROPOSER);

    expect(capabilityRegistry.isEnabled(CapabilityType.FsDelete)).toBe(false);
  });

  it('module stays disabled after agent-approve attempt', () => {
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
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
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry);

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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const expectedHash = 'mock-hash-12345';
    const queue = buildQueue(
      moduleRegistry,
      capabilityRegistry,
      restrictionRegistry,
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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    const expectedHash = 'stored-hash-67890';
    const queue = buildQueue(
      moduleRegistry,
      capabilityRegistry,
      restrictionRegistry,
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
    const { moduleRegistry, capabilityRegistry, restrictionRegistry } = buildRegistries();
    let callCount = 0;
    const hashStub = (): string => {
      callCount += 1;
      return `hash-${callCount}`;
    };
    const queue = buildQueue(moduleRegistry, capabilityRegistry, restrictionRegistry, hashStub);

    const proposal = queue.propose(
      { kind: 'enable_capability', capabilityType: CapabilityType.FsRead },
      HUMAN_PROPOSER,
    );

    queue.approveProposal(proposal.id, {}, HUMAN_PROPOSER);

    expect(callCount).toBe(1);
  });
});
