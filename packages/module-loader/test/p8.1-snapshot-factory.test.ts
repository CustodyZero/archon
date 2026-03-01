/**
 * Archon Module Loader — P8.1 Snapshot Factory + GateExecutionSurface Tests
 *
 * Verifies:
 *
 *   P8.1-S1: buildSnapshotForProject() produces a valid 64-char hex hash
 *   P8.1-S2: Same inputs produce the same hash (determinism)
 *   P8.1-S3: Different projectIds produce different hashes
 *   P8.1-S4: Different resourceConfigStore content changes the hash (P5)
 *   P8.1-S5: Factory hash equals the manual SnapshotBuilderImpl result for the same inputs
 *   P8.1-G1: GateExecutionSurface implements ExecutionSurface without importing module-loader internals
 *   P8.1-G2: GateExecutionSurface routes Deny for a capability not in the enabled set (I1)
 *   P8.1-G3: GateExecutionSurface passes the provided logSink to ExecutionGate (logs via the gate)
 *
 * All tests use MemoryStateIO — no filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import {
  CapabilityType,
  SnapshotBuilderImpl,
  DecisionOutcome,
  RiskTier,
} from '@archon/kernel';
import type { ModuleManifest, ModuleHash, KernelAdapters, LogSink, DecisionLog } from '@archon/kernel';
import { ModuleStatus } from '@archon/kernel';
import { MemoryStateIO, makeTestContext, ARCHON_VERSION } from '@archon/runtime-host';
import type { ExecutionRequest } from '@archon/runtime-host';
import type { RuleSnapshotHash, RuleSnapshot } from '@archon/kernel';
import { ModuleRegistry } from '../src/registry.js';
import { CapabilityRegistry } from '../src/capability-registry.js';
import { RestrictionRegistry } from '../src/restriction-registry.js';
import { AckStore } from '../src/ack-store.js';
import { ResourceConfigStore } from '../src/resource-config-store.js';
import { buildSnapshotForProject } from '../src/snapshot-factory.js';
import { GateExecutionSurface } from '../src/execution-surface.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_MANIFEST: ModuleManifest = {
  module_id: 'filesystem',
  module_name: 'Filesystem Module',
  version: '1.0.0',
  description: 'Filesystem access',
  module_hash: 'DEV_SKIP_HASH_VERIFICATION' as ModuleHash,
  capability_descriptors: [
    {
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      ack_required: false,
      description: 'Read files',
    },
  ],
};

function makeRegistries(stateIO: MemoryStateIO) {
  const registry = new ModuleRegistry(stateIO);
  registry.register(MINIMAL_MANIFEST);
  const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
  const restrictionRegistry = new RestrictionRegistry(stateIO);
  const ackStore = new AckStore(stateIO);
  const resourceConfigStore = new ResourceConfigStore(stateIO);
  return { registry, capabilityRegistry, restrictionRegistry, ackStore, resourceConfigStore };
}

function makeStubSnapshot(projectId: string): { snapshot: RuleSnapshot; snapshotHash: RuleSnapshotHash } {
  const snapshot: RuleSnapshot = {
    project_id: projectId,
    ccm_enabled: [],
    enabled_capabilities: [],
    drr_canonical: [],
    engine_version: '0.0.0-test',
    config_hash: '',
    constructed_at: '2026-01-01T00:00:00.000Z',
    ack_epoch: 0,
    resource_config: {
      fs_roots: [],
      net_allowlist: [],
      exec_cwd_root_id: null,
      secrets_epoch: 0,
    },
  };
  return { snapshot, snapshotHash: 'stub-hash' as unknown as RuleSnapshotHash };
}

function makeStubRequest(projectId: string): ExecutionRequest {
  const { snapshot, snapshotHash } = makeStubSnapshot(projectId);
  return {
    agentId: 'test-agent',
    action: {
      project_id: projectId,
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      params: { path: '/tmp/test' },
    },
    snapshot,
    snapshotHash,
  };
}

function makeNoOpAdapters(): KernelAdapters {
  const notImplemented = (): never => {
    throw new Error('Adapter not implemented in test');
  };
  return {
    filesystem: { read: notImplemented, list: notImplemented, write: notImplemented, delete: notImplemented },
    network: { fetchHttp: notImplemented },
    exec: { run: notImplemented },
    secrets: { read: notImplemented, use: notImplemented, injectEnv: notImplemented },
    messaging: { send: notImplemented },
    ui: {
      requestApproval: notImplemented,
      presentRiskAck: notImplemented,
      requestClarification: notImplemented,
    },
  };
}

/** Minimal log sink that captures all appended DecisionLog entries. */
class CapturingLogSink implements LogSink {
  readonly entries: DecisionLog[] = [];
  append(entry: DecisionLog): void {
    this.entries.push(entry);
  }
}

// ---------------------------------------------------------------------------
// P8.1-S1: buildSnapshotForProject() produces a valid SHA-256 hash
// ---------------------------------------------------------------------------

describe('P8.1-S1: buildSnapshotForProject produces a valid 64-char hex hash', () => {
  it('returns a 64-char hex string', () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);

    const { hash } = buildSnapshotForProject({
      projectId: 'test-project',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('snapshot carries the correct project_id', () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);

    const { snapshot } = buildSnapshotForProject({
      projectId: 'my-project',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    expect(snapshot.project_id).toBe('my-project');
  });
});

// ---------------------------------------------------------------------------
// P8.1-S2: Same inputs produce the same hash (determinism)
// ---------------------------------------------------------------------------

describe('P8.1-S2: buildSnapshotForProject is deterministic', () => {
  it('two calls with identical state produce identical hashes', () => {
    const stateIO = new MemoryStateIO();
    const r1 = makeRegistries(stateIO);
    const r2 = makeRegistries(stateIO);

    const { hash: h1 } = buildSnapshotForProject({
      projectId: 'proj',
      registry: r1.registry,
      capabilityRegistry: r1.capabilityRegistry,
      restrictionRegistry: r1.restrictionRegistry,
      ackStore: r1.ackStore,
    });

    const { hash: h2 } = buildSnapshotForProject({
      projectId: 'proj',
      registry: r2.registry,
      capabilityRegistry: r2.capabilityRegistry,
      restrictionRegistry: r2.restrictionRegistry,
      ackStore: r2.ackStore,
    });

    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// P8.1-S3: Different projectIds produce different hashes
// ---------------------------------------------------------------------------

describe('P8.1-S3: different projectIds produce different hashes', () => {
  it('project-a and project-b hashes differ', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const rA = makeRegistries(stateIOA);
    const rB = makeRegistries(stateIOB);

    const { hash: hA } = buildSnapshotForProject({
      projectId: 'project-a',
      registry: rA.registry,
      capabilityRegistry: rA.capabilityRegistry,
      restrictionRegistry: rA.restrictionRegistry,
      ackStore: rA.ackStore,
    });

    const { hash: hB } = buildSnapshotForProject({
      projectId: 'project-b',
      registry: rB.registry,
      capabilityRegistry: rB.capabilityRegistry,
      restrictionRegistry: rB.restrictionRegistry,
      ackStore: rB.ackStore,
    });

    expect(hA).not.toBe(hB);
  });
});

// ---------------------------------------------------------------------------
// P8.1-S4: Different resourceConfigStore content changes the hash (P5)
// ---------------------------------------------------------------------------

describe('P8.1-S4: resourceConfigStore content affects the hash', () => {
  it('hash with resource config differs from hash without (empty config)', () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, resourceConfigStore } =
      makeRegistries(stateIO);

    // Without resourceConfigStore (EMPTY_RESOURCE_CONFIG default).
    const { hash: hashNoRc } = buildSnapshotForProject({
      projectId: 'proj',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    // Set a non-empty resource config.
    resourceConfigStore.setFsRoots([{ id: 'workspace', path: '/tmp/workspace', perm: 'rw' }]);

    const { hash: hashWithRc } = buildSnapshotForProject({
      projectId: 'proj',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
      resourceConfigStore,
    });

    expect(hashNoRc).not.toBe(hashWithRc);
  });
});

// ---------------------------------------------------------------------------
// P8.1-S5: Factory hash equals manual SnapshotBuilderImpl for same inputs
// ---------------------------------------------------------------------------

describe('P8.1-S5: factory hash matches manual SnapshotBuilderImpl for identical inputs', () => {
  it('factory and manual builder produce identical hashes', () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);
    const projectId = 'test-project';

    // Factory result.
    const { hash: factoryHash } = buildSnapshotForProject({
      projectId,
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    // Manual result — must produce the same hash.
    const builder = new SnapshotBuilderImpl();
    const manualSnapshot = builder.build(
      registry.listEnabled(),
      capabilityRegistry.listEnabledCapabilities(),
      restrictionRegistry.compileAll(),
      ARCHON_VERSION,
      '',
      projectId,
      undefined,
      ackStore.getAckEpoch(),
    );
    const manualHash = builder.hash(manualSnapshot);

    expect(factoryHash).toBe(manualHash);
  });
});

// ---------------------------------------------------------------------------
// P8.1-G1: GateExecutionSurface implements ExecutionSurface
// ---------------------------------------------------------------------------

describe('P8.1-G1: GateExecutionSurface implements ExecutionSurface', () => {
  it('can be constructed with an empty handler map and no-op adapters', () => {
    const surface = new GateExecutionSurface(new Map(), makeNoOpAdapters());
    expect(surface).toBeDefined();
    expect(typeof surface.execute).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// P8.1-G2: GateExecutionSurface routes Deny for capability not in enabled set (I1)
// ---------------------------------------------------------------------------

describe('P8.1-G2: GateExecutionSurface denies when capability not in enabled set', () => {
  it('returns Deny for an action with no enabled capability (I1)', async () => {
    // Build a snapshot with no enabled capabilities.
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);

    const { snapshot, hash: snapshotHash } = buildSnapshotForProject({
      projectId: 'test-project',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    const logSink = new CapturingLogSink();
    const surface = new GateExecutionSurface(new Map(), makeNoOpAdapters());

    const req: ExecutionRequest = {
      agentId: 'test-agent',
      action: {
        project_id: 'test-project',
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: { path: '/tmp/test' },
      },
      snapshot,
      snapshotHash,
    };

    const result = await surface.execute(req, logSink);

    // Capability is not enabled → I1 deny.
    expect(result.decision).toBe(DecisionOutcome.Deny);
  });
});

// ---------------------------------------------------------------------------
// P8.1-G3: GateExecutionSurface passes the logSink to ExecutionGate (logs decisions)
// ---------------------------------------------------------------------------

describe('P8.1-G3: GateExecutionSurface uses the provided logSink for decision logging', () => {
  it('decision is logged via the provided logSink after execute()', async () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);

    const { snapshot, hash: snapshotHash } = buildSnapshotForProject({
      projectId: 'test-project',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    const logSink = new CapturingLogSink();
    const surface = new GateExecutionSurface(new Map(), makeNoOpAdapters());

    const req: ExecutionRequest = {
      agentId: 'gate-test-agent',
      action: {
        project_id: 'test-project',
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: { path: '/tmp' },
      },
      snapshot,
      snapshotHash,
    };

    await surface.execute(req, logSink);

    // ExecutionGate must have logged via logSink — at least one entry.
    expect(logSink.entries.length).toBeGreaterThan(0);
  });

  it('two execute() calls produce two log entries in the provided logSink', async () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);

    const { snapshot, hash: snapshotHash } = buildSnapshotForProject({
      projectId: 'test-project',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    const logSink = new CapturingLogSink();
    const surface = new GateExecutionSurface(new Map(), makeNoOpAdapters());

    const req: ExecutionRequest = {
      agentId: 'gate-test-agent',
      action: {
        project_id: 'test-project',
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: { path: '/tmp' },
      },
      snapshot,
      snapshotHash,
    };

    await surface.execute(req, logSink);
    await surface.execute(req, logSink);

    expect(logSink.entries).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// EXEC-U-P8.1: GateExecutionSurface is stateless — no shared ExecutionGate
//
// Each execute() call creates a fresh ExecutionGate bound to the provided
// logSink. Two calls with separate logSinks must not cross-contaminate.
// ---------------------------------------------------------------------------

describe('EXEC-U-P8.1: GateExecutionSurface is stateless (no shared ExecutionGate across calls)', () => {
  it('two execute() calls with separate logSinks each log only to their own sink', async () => {
    const stateIO = new MemoryStateIO();
    const { registry, capabilityRegistry, restrictionRegistry, ackStore } = makeRegistries(stateIO);

    const { snapshot, hash: snapshotHash } = buildSnapshotForProject({
      projectId: 'test-project',
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
    });

    const surface = new GateExecutionSurface(new Map(), makeNoOpAdapters());
    const sink1 = new CapturingLogSink();
    const sink2 = new CapturingLogSink();

    const req: ExecutionRequest = {
      agentId: 'exec-u-test-agent',
      action: {
        project_id: 'test-project',
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: { path: '/tmp' },
      },
      snapshot,
      snapshotHash,
    };

    // Call 1 with sink1, call 2 with sink2.
    await surface.execute(req, sink1);
    await surface.execute(req, sink2);

    // Each sink receives exactly one entry from its own call — no cross-contamination.
    expect(sink1.entries).toHaveLength(1);
    expect(sink2.entries).toHaveLength(1);
  });
});
