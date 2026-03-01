/**
 * Archon Runtime Host — P8 Isolation Invariant Tests
 *
 * Verifies that concurrent ProjectRuntime instances are strictly isolated:
 *
 *   INV-U1: Module state in A is not visible in B
 *   INV-U2: Log writes to A do not appear in B
 *   INV-U3: Proposal state in A is not visible in B
 *   INV-U4: Drift detection in A does not affect B
 *   INV-U5: Snapshot hashes differ when project state differs
 *   INV-U6: Concurrent log writes to A and B do not interleave
 *   INV-U7: Supervisor shutdown of A does not terminate B
 *
 * All invariants are P0 critical — any failure blocks merge.
 *
 * Tests are pure: MemoryStateIO only, no filesystem I/O, no clock dependency.
 */

import { describe, it, expect } from 'vitest';
import type { DecisionLog, RuleSnapshotHash } from '@archon/kernel';
import { DecisionOutcome, CapabilityType } from '@archon/kernel';
import { MemoryStateIO } from '../src/state/state-io.js';
import { makeTestContext } from '../src/context/event-envelope.js';
import { ProjectRuntime } from '../src/runtime/project-runtime.js';
import { RuntimeSupervisor } from '../src/runtime/runtime-supervisor.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCtx(projectId: string) {
  return makeTestContext({ project_id: projectId });
}

function makeDecisionLog(projectId: string): DecisionLog {
  return {
    agent_id: 'test-agent',
    proposed_action: {
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      params: { path: '/tmp/test' },
      project_id: projectId,
    },
    decision: DecisionOutcome.Permit,
    triggered_rules: [],
    rs_hash: 'test-rs-hash' as unknown as RuleSnapshotHash,
    input_hash: 'test-input-hash',
    output_hash: null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a valid JSONL event with device_id for the drift detector.
 * Events without device_id trigger LEGACY_EVENT_SCHEMA drift,
 * which would confound the drift isolation tests.
 */
function makeCleanEvent(eventId: string): string {
  return JSON.stringify({
    event_id: eventId,
    timestamp: '2026-01-01T00:00:00.000Z',
    device_id: 'test-device-id',
    event_type: 'governance.decision',
  });
}

function makeDuplicateEvents(eventId: string): [string, string] {
  const line = makeCleanEvent(eventId);
  return [line, line];
}

// ---------------------------------------------------------------------------
// INV-U1: Module state written to A is not visible in B
// ---------------------------------------------------------------------------

describe('INV-U1: module state in A is not visible in B', () => {
  it('writing enabled-modules.json to A stateIO does not affect B stateIO', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Simulate what ModuleRegistry.enable() would write to A's stateIO.
    runtimeA.stateIO.writeJson('enabled-modules.json', ['filesystem']);

    // B's stateIO must have no module state.
    const modulesInB = runtimeB.stateIO.readJson<string[]>('enabled-modules.json', []);
    expect(modulesInB).toHaveLength(0);
  });

  it('writing capability state to A does not appear in B', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Simulate CapabilityRegistry.enable() writing to A.
    runtimeA.stateIO.writeJson('enabled-capabilities.json', ['fs.read', 'fs.list']);

    // B has no capability state.
    const capsInB = runtimeB.stateIO.readJson<string[]>('enabled-capabilities.json', []);
    expect(capsInB).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// INV-U2: Log writes to A do not appear in B
// ---------------------------------------------------------------------------

describe('INV-U2: log writes to A do not appear in B', () => {
  it('appending a decision log to A leaves B log empty', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    runtimeA.logSink.append(makeDecisionLog('project-a'));

    // A has a log entry.
    const aLog = stateIOA.readLogRaw('decisions.jsonl');
    expect(aLog.length).toBeGreaterThan(0);

    // B's log is untouched.
    const bLog = stateIOB.readLogRaw('decisions.jsonl');
    expect(bLog).toBe('');
  });

  it('log content for A does not contain project-b attribution', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeB.logSink.append(makeDecisionLog('project-b'));

    const aLines = stateIOA.readLines('decisions.jsonl');
    expect(aLines).toHaveLength(1);
    const aEnvelope = JSON.parse(aLines[0]!) as Record<string, unknown>;
    expect(aEnvelope['project_id']).toBe('project-a');
    // A's log must not contain project-b attribution.
    expect(aEnvelope['project_id']).not.toBe('project-b');
  });
});

// ---------------------------------------------------------------------------
// INV-U3: Proposal state in A is not visible in B
// ---------------------------------------------------------------------------

describe('INV-U3: proposal state in A is not visible in B', () => {
  it('writing proposals.json to A stateIO does not affect B', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Simulate what ProposalQueue.propose() writes to A's stateIO.
    runtimeA.stateIO.writeJson('proposals.json', [
      { id: 'proposal-1', status: 'pending', kind: 'enable_capability' },
    ]);

    // B has no proposals.
    const bProposals = runtimeB.stateIO.readJson<unknown[]>('proposals.json', []);
    expect(bProposals).toHaveLength(0);
  });

  it('proposal-events.jsonl written to A does not appear in B', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    runtimeA.stateIO.appendLine('proposal-events.jsonl', '{"event_id":"ev-1","proposal_id":"p-1"}');

    // B has no proposal events.
    const bEvents = runtimeB.stateIO.readLogRaw('proposal-events.jsonl');
    expect(bEvents).toBe('');
  });
});

// ---------------------------------------------------------------------------
// INV-U4: Drift detection in A does not affect B
// ---------------------------------------------------------------------------

describe('INV-U4: drift detection in A does not affect B', () => {
  it('duplicate events in A trigger drift; B drift status remains none', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Write duplicate events to A to trigger DUPLICATES_PRESENT drift.
    const [line1, line2] = makeDuplicateEvents('DUPLICATE-EVENT-ID');
    stateIOA.appendLine('decisions.jsonl', line1);
    stateIOA.appendLine('decisions.jsonl', line2);

    // A should have non-clean drift status.
    const driftA = runtimeA.getDriftStatus();
    expect(driftA.status).not.toBe('none');

    // B has no logs — drift must be none.
    const driftB = runtimeB.getDriftStatus();
    expect(driftB.status).toBe('none');
  });

  it('getDriftStatus reads only this runtime stateIO, not global state', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Write clean event to A.
    stateIOA.appendLine('decisions.jsonl', makeCleanEvent('EVENT-A-1'));
    // Write duplicate events to A.
    const [dup1, dup2] = makeDuplicateEvents('EVENT-A-DUP');
    stateIOA.appendLine('decisions.jsonl', dup1);
    stateIOA.appendLine('decisions.jsonl', dup2);

    // Write clean event to B only.
    stateIOB.appendLine('decisions.jsonl', makeCleanEvent('EVENT-B-1'));

    const driftA = runtimeA.getDriftStatus();
    const driftB = runtimeB.getDriftStatus();

    // A has duplicates → not clean.
    expect(driftA.status).not.toBe('none');
    // B is clean.
    expect(driftB.status).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// INV-U5: Snapshot hashes differ when project state differs
// ---------------------------------------------------------------------------

describe('INV-U5: snapshot hash in A differs from B when rules differ', () => {
  it('different enabled capabilities produce different hashes', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    const { hash: hashA } = runtimeA.buildSnapshot([], [CapabilityType.FsRead], [], 0);
    const { hash: hashB } = runtimeB.buildSnapshot([], [CapabilityType.FsWrite], [], 0);

    expect(hashA).not.toBe(hashB);
  });

  it('different project_ids produce different hashes even for identical state', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Identical governance state; only project_id differs.
    const { hash: hashA } = runtimeA.buildSnapshot([], [], [], 0);
    const { hash: hashB } = runtimeB.buildSnapshot([], [], [], 0);

    expect(hashA).not.toBe(hashB);
  });

  it('same project_id with same state produces the same hash (determinism)', () => {
    const stateIO1 = new MemoryStateIO();
    const stateIO2 = new MemoryStateIO();
    const runtime1 = new ProjectRuntime('project-x', makeCtx('project-x'), stateIO1);
    const runtime2 = new ProjectRuntime('project-x', makeCtx('project-x'), stateIO2);

    // Fixed clock: both calls must share the same constructed_at value.
    // Without this, two sequential build() calls that cross a millisecond
    // boundary produce different SHA-256 hashes (constructed_at is hashed).
    const fixedClock = () => '2026-01-01T00:00:00.000Z';

    const { hash: hash1 } = runtime1.buildSnapshot([], [CapabilityType.FsRead], [], 0, undefined, fixedClock);
    const { hash: hash2 } = runtime2.buildSnapshot([], [CapabilityType.FsRead], [], 0, undefined, fixedClock);

    // Same inputs → same hash (I4: snapshot determinism).
    expect(hash1).toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// INV-U6: Concurrent log writes do not interleave
// ---------------------------------------------------------------------------

describe('INV-U6: concurrent log writes to A and B do not interleave', () => {
  it('A log contains only A entries; B log contains only B entries', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Write distinct content to each stateIO.
    stateIOA.appendLine('decisions.jsonl', '{"event_id":"A1","source":"project-a"}');
    stateIOB.appendLine('decisions.jsonl', '{"event_id":"B1","source":"project-b"}');
    stateIOA.appendLine('decisions.jsonl', '{"event_id":"A2","source":"project-a"}');
    stateIOB.appendLine('decisions.jsonl', '{"event_id":"B2","source":"project-b"}');

    const aContent = stateIOA.readLogRaw('decisions.jsonl');
    const bContent = stateIOB.readLogRaw('decisions.jsonl');

    // A has A entries.
    expect(aContent).toContain('A1');
    expect(aContent).toContain('A2');
    // A does not contain B entries.
    expect(aContent).not.toContain('B1');
    expect(aContent).not.toContain('B2');

    // B has B entries.
    expect(bContent).toContain('B1');
    expect(bContent).toContain('B2');
    // B does not contain A entries.
    expect(bContent).not.toContain('A1');
    expect(bContent).not.toContain('A2');
  });

  it('logSink appends carry correct project_id in envelope', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeB.logSink.append(makeDecisionLog('project-b'));

    const aLines = stateIOA.readLines('decisions.jsonl');
    const bLines = stateIOB.readLines('decisions.jsonl');

    const aEnv = JSON.parse(aLines[0]!) as Record<string, unknown>;
    const bEnv = JSON.parse(bLines[0]!) as Record<string, unknown>;

    expect(aEnv['project_id']).toBe('project-a');
    expect(bEnv['project_id']).toBe('project-b');
  });
});

// ---------------------------------------------------------------------------
// INV-U7: Supervisor shutdown of A does not terminate B
// ---------------------------------------------------------------------------

describe('INV-U7: supervisor shutdown of A does not terminate B', () => {
  it('shutting down A leaves B accessible via getProjectRuntime', async () => {
    const supervisor = new RuntimeSupervisor();
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    supervisor.createProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = supervisor.createProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    await supervisor.shutdownProjectRuntime('project-a');

    // A is removed from the supervisor.
    expect(supervisor.getProjectRuntime('project-a')).toBeUndefined();

    // B is still accessible.
    expect(supervisor.getProjectRuntime('project-b')).toBe(runtimeB);
  });

  it('B remains operational after A shutdown', async () => {
    const supervisor = new RuntimeSupervisor();
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    supervisor.createProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = supervisor.createProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    await supervisor.shutdownProjectRuntime('project-a');

    // B can still build snapshots.
    const { hash } = runtimeB.buildSnapshot([], [CapabilityType.FsRead], [], 0);
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64); // SHA-256 hex

    // B can still compute drift status.
    const drift = runtimeB.getDriftStatus();
    expect(drift.status).toBe('none');
  });

  it('listActiveRuntimes reflects shutdown correctly', async () => {
    const supervisor = new RuntimeSupervisor();
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    supervisor.createProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    supervisor.createProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    expect(supervisor.listActiveRuntimes()).toContain('project-a');
    expect(supervisor.listActiveRuntimes()).toContain('project-b');

    await supervisor.shutdownProjectRuntime('project-a');

    expect(supervisor.listActiveRuntimes()).not.toContain('project-a');
    expect(supervisor.listActiveRuntimes()).toContain('project-b');
  });
});
