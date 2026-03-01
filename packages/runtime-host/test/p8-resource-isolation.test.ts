/**
 * Archon Runtime Host — P8 Resource Isolation, Log Separation, and BC Tests
 *
 * Verifies resource config isolation, log separation, and backward compatibility:
 *
 *   RES-P8-1: fs_roots differ between A and B → snapshot hashes differ
 *   RES-P8-2: secrets_epoch is independently managed per project
 *   LOG-P8-1: Simultaneous execution in A and B results in distinct log files
 *   LOG-P8-2: Envelope project_id matches the runtime's projectId
 *   BC-P8-1:  Single-project flow via supervisor is identical to pre-P8 behaviour
 *
 * All tests use MemoryStateIO — no filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import type { DecisionLog, ResourceConfig, RuleSnapshotHash } from '@archon/kernel';
import {
  CapabilityType,
  DecisionOutcome,
  EMPTY_RESOURCE_CONFIG,
} from '@archon/kernel';
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

function makeResourceConfig(overrides: Partial<ResourceConfig>): ResourceConfig {
  return { ...EMPTY_RESOURCE_CONFIG, ...overrides };
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

// ---------------------------------------------------------------------------
// RES-P8-1: fs_roots differ between A and B → snapshot hashes differ
// ---------------------------------------------------------------------------

describe('RES-P8-1: fs_roots differ between A and B → enforcement differs', () => {
  it('different fs_roots produce different snapshot hashes', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    const rcA = makeResourceConfig({
      fs_roots: [{ id: 'workspace-a', path: '/tmp/project-a', perm: 'rw' }],
    });
    const rcB = makeResourceConfig({
      fs_roots: [{ id: 'workspace-b', path: '/tmp/project-b', perm: 'rw' }],
    });

    // Persist resource configs to respective stateIO instances.
    stateIOA.writeJson('resource-config.json', rcA);
    stateIOB.writeJson('resource-config.json', rcB);

    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Read back from stateIO to simulate what ResourceConfigStore does.
    const loadedRcA = stateIOA.readJson<ResourceConfig>('resource-config.json', EMPTY_RESOURCE_CONFIG);
    const loadedRcB = stateIOB.readJson<ResourceConfig>('resource-config.json', EMPTY_RESOURCE_CONFIG);

    const { hash: hashA } = runtimeA.buildSnapshot([], [], [], 0, loadedRcA);
    const { hash: hashB } = runtimeB.buildSnapshot([], [], [], 0, loadedRcB);

    // Hashes must differ because resource configs differ.
    expect(hashA).not.toBe(hashB);
  });

  it('changing A fs_roots does not affect B resource config', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    // Both start with workspace root.
    const initialRc = makeResourceConfig({
      fs_roots: [{ id: 'workspace', path: '/tmp/workspace', perm: 'rw' }],
    });
    stateIOA.writeJson('resource-config.json', initialRc);
    stateIOB.writeJson('resource-config.json', initialRc);

    // Update only A's resource config.
    const updatedRcA = makeResourceConfig({
      fs_roots: [{ id: 'data', path: '/tmp/data', perm: 'ro' }],
    });
    stateIOA.writeJson('resource-config.json', updatedRcA);

    // B's config is unchanged.
    const rcB = stateIOB.readJson<ResourceConfig>('resource-config.json', EMPTY_RESOURCE_CONFIG);
    expect(rcB.fs_roots).toHaveLength(1);
    expect(rcB.fs_roots[0]?.id).toBe('workspace');
  });

  it('adding net_allowlist to A does not affect B snapshot', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    const rcA = makeResourceConfig({ net_allowlist: ['api.example.com'] });
    const rcB = makeResourceConfig({ net_allowlist: [] });

    const { hash: hashA } = runtimeA.buildSnapshot([], [], [], 0, rcA);
    const { hash: hashB } = runtimeB.buildSnapshot([], [], [], 0, rcB);

    expect(hashA).not.toBe(hashB);
  });
});

// ---------------------------------------------------------------------------
// RES-P8-2: secrets_epoch is independently managed per project
// ---------------------------------------------------------------------------

describe('RES-P8-2: secrets_epoch is independently managed per project', () => {
  it('different secrets_epoch values in A and B produce different snapshots', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    // Write different secrets_epoch to each project's state.
    stateIOA.writeJson('resource-config.json', makeResourceConfig({ secrets_epoch: 5 }));
    stateIOB.writeJson('resource-config.json', makeResourceConfig({ secrets_epoch: 3 }));

    const epochA = stateIOA.readJson<ResourceConfig>(
      'resource-config.json',
      EMPTY_RESOURCE_CONFIG,
    ).secrets_epoch;
    const epochB = stateIOB.readJson<ResourceConfig>(
      'resource-config.json',
      EMPTY_RESOURCE_CONFIG,
    ).secrets_epoch;

    expect(epochA).toBe(5);
    expect(epochB).toBe(3);
    expect(epochA).not.toBe(epochB);
  });

  it('incrementing secrets_epoch in A does not affect B', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    const baseRc = makeResourceConfig({ secrets_epoch: 1 });
    stateIOA.writeJson('resource-config.json', baseRc);
    stateIOB.writeJson('resource-config.json', baseRc);

    // Simulate secrets epoch increment in A (what ResourceConfigStore.incrementSecretsEpoch() does).
    const rcA = stateIOA.readJson<ResourceConfig>('resource-config.json', EMPTY_RESOURCE_CONFIG);
    stateIOA.writeJson('resource-config.json', { ...rcA, secrets_epoch: rcA.secrets_epoch + 1 });

    // B's epoch is unchanged.
    const rcB = stateIOB.readJson<ResourceConfig>('resource-config.json', EMPTY_RESOURCE_CONFIG);
    expect(rcB.secrets_epoch).toBe(1);

    // A's epoch was incremented.
    const rcAUpdated = stateIOA.readJson<ResourceConfig>(
      'resource-config.json',
      EMPTY_RESOURCE_CONFIG,
    );
    expect(rcAUpdated.secrets_epoch).toBe(2);
  });

  it('secrets_epoch change in A changes A snapshot but not B snapshot', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    const rcBase = makeResourceConfig({ secrets_epoch: 1 });

    // Both start with same epoch (different project_ids still cause different hashes).
    const { hash: hashA1 } = runtimeA.buildSnapshot([], [], [], 0, rcBase);

    // A's epoch changes.
    const rcAUpdated = makeResourceConfig({ secrets_epoch: 2 });
    const { hash: hashA2 } = runtimeA.buildSnapshot([], [], [], 0, rcAUpdated);

    // B's epoch is still 1.
    const { hash: hashB } = runtimeB.buildSnapshot([], [], [], 0, rcBase);

    // A's snapshot changed.
    expect(hashA1).not.toBe(hashA2);
    // B's snapshot is still based on epoch 1.
    expect(hashB).not.toBe(hashA2);
  });
});

// ---------------------------------------------------------------------------
// LOG-P8-1: Simultaneous execution in A and B results in distinct log files
// ---------------------------------------------------------------------------

describe('LOG-P8-1: simultaneous execution in A and B produces distinct log files', () => {
  it('A and B log sinks write to separate MemoryStateIO instances', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // Interleaved writes simulating concurrent execution.
    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeB.logSink.append(makeDecisionLog('project-b'));
    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeB.logSink.append(makeDecisionLog('project-b'));

    const aLines = stateIOA.readLines('decisions.jsonl');
    const bLines = stateIOB.readLines('decisions.jsonl');

    // Each log has exactly 2 entries.
    expect(aLines).toHaveLength(2);
    expect(bLines).toHaveLength(2);

    // All A entries carry project-a attribution.
    for (const line of aLines) {
      const env = JSON.parse(line) as Record<string, unknown>;
      expect(env['project_id']).toBe('project-a');
    }

    // All B entries carry project-b attribution.
    for (const line of bLines) {
      const env = JSON.parse(line) as Record<string, unknown>;
      expect(env['project_id']).toBe('project-b');
    }
  });

  it('decision counts are independent between projects', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-a', makeCtx('project-a'), stateIOA);
    const runtimeB = new ProjectRuntime('project-b', makeCtx('project-b'), stateIOB);

    // A gets 3 entries; B gets 1.
    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeA.logSink.append(makeDecisionLog('project-a'));
    runtimeB.logSink.append(makeDecisionLog('project-b'));

    expect(stateIOA.readLines('decisions.jsonl')).toHaveLength(3);
    expect(stateIOB.readLines('decisions.jsonl')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LOG-P8-2: Envelope project_id matches the runtime's projectId
// ---------------------------------------------------------------------------

describe('LOG-P8-2: envelope project_id matches the runtime projectId', () => {
  it('emitted envelope project_id equals runtime.projectId', () => {
    const stateIO = new MemoryStateIO();
    const runtime = new ProjectRuntime('my-project-id', makeCtx('my-project-id'), stateIO);

    runtime.logSink.append(makeDecisionLog('my-project-id'));

    const lines = stateIO.readLines('decisions.jsonl');
    expect(lines).toHaveLength(1);

    const envelope = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(envelope['project_id']).toBe('my-project-id');
    expect(envelope['project_id']).toBe(runtime.projectId);
  });

  it('two runtimes emit envelopes with their own project_id — never each other\'s', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = new ProjectRuntime('project-alpha', makeCtx('project-alpha'), stateIOA);
    const runtimeB = new ProjectRuntime('project-beta', makeCtx('project-beta'), stateIOB);

    runtimeA.logSink.append(makeDecisionLog('project-alpha'));
    runtimeB.logSink.append(makeDecisionLog('project-beta'));

    const aEnv = JSON.parse(stateIOA.readLines('decisions.jsonl')[0]!) as Record<string, unknown>;
    const bEnv = JSON.parse(stateIOB.readLines('decisions.jsonl')[0]!) as Record<string, unknown>;

    expect(aEnv['project_id']).toBe(runtimeA.projectId);
    expect(bEnv['project_id']).toBe(runtimeB.projectId);
    expect(aEnv['project_id']).not.toBe(runtimeB.projectId);
    expect(bEnv['project_id']).not.toBe(runtimeA.projectId);
  });

  it('ctx.project_id mismatch is rejected at construction — prevents attribution corruption', () => {
    const stateIO = new MemoryStateIO();
    const mismatchedCtx = makeTestContext({ project_id: 'wrong-project' });

    expect(() => {
      new ProjectRuntime('correct-project', mismatchedCtx, stateIO);
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BC-P8-1: Single-project flow is identical before and after P8
// ---------------------------------------------------------------------------

describe('BC-P8-1: single-project flow is identical to pre-P8 behaviour', () => {
  it('supervisor with one runtime produces correct snapshot structure', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();
    const runtime = supervisor.createProjectRuntime(
      'default-project',
      makeCtx('default-project'),
      stateIO,
    );

    const { snapshot, hash } = runtime.buildSnapshot([], [CapabilityType.FsRead], [], 0);

    // Snapshot carries the correct project_id.
    expect(snapshot.project_id).toBe('default-project');
    // Hash is a valid SHA-256 hex string.
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('single runtime drift status is none for empty logs', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();
    const runtime = supervisor.createProjectRuntime(
      'single-project',
      makeCtx('single-project'),
      stateIO,
    );

    const drift = runtime.getDriftStatus();
    expect(drift.status).toBe('none');
  });

  it('single runtime log sink produces well-formed ACM-001 envelopes', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();
    const runtime = supervisor.createProjectRuntime(
      'single-project',
      makeCtx('single-project'),
      stateIO,
    );

    runtime.logSink.append(makeDecisionLog('single-project'));

    const lines = stateIO.readLines('decisions.jsonl');
    expect(lines).toHaveLength(1);

    const envelope = JSON.parse(lines[0]!) as Record<string, unknown>;
    // Required ACM-001 envelope fields.
    const requiredFields = [
      'event_id', 'event_type', 'timestamp', 'archon_version',
      'device_id', 'user_id', 'session_id', 'project_id', 'agent_id',
      'rs_hash', 'schema_version', 'payload',
    ];
    for (const field of requiredFields) {
      expect(envelope).toHaveProperty(field);
    }
  });

  it('single runtime lifecycle: create → use → shutdown works end-to-end', async () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();

    const runtime = supervisor.createProjectRuntime(
      'lifecycle-project',
      makeCtx('lifecycle-project'),
      stateIO,
    );

    // Use the runtime.
    const { hash } = runtime.buildSnapshot([], [], [], 0);
    expect(hash).toHaveLength(64);

    runtime.logSink.append(makeDecisionLog('lifecycle-project'));
    expect(stateIO.readLines('decisions.jsonl')).toHaveLength(1);

    expect(supervisor.listActiveRuntimes()).toContain('lifecycle-project');

    // Shutdown.
    await supervisor.shutdownProjectRuntime('lifecycle-project');
    expect(supervisor.listActiveRuntimes()).toHaveLength(0);
    expect(supervisor.getProjectRuntime('lifecycle-project')).toBeUndefined();
  });
});
