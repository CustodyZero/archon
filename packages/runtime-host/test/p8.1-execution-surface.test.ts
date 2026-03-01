/**
 * Archon Runtime Host — P8.1 ExecutionSurface + RuntimeSupervisor.getOrCreate Tests
 *
 * Verifies the P8.1 boundary infrastructure:
 *
 *   P8.1-E1: ProjectRuntime.execute() routes to the injected ExecutionSurface
 *   P8.1-E2: Project A execute() never emits project_id=B (isolation)
 *   P8.1-E3: execute() without an injected surface throws explicitly
 *   P8.1-U1: getOrCreate() returns the same runtime for the same project_id
 *   P8.1-U2: getOrCreate() creates a new runtime if one does not exist
 *   P8.1-U3: getOrCreate() providers are lazy (not called if runtime exists)
 *   P8.1-U4: getOrCreate() result is accessible via getProjectRuntime()
 *
 * All tests use MemoryStateIO — no filesystem I/O.
 * ExecutionSurface is stubbed with a minimal implementation that captures
 * what logSink it received — without importing module-loader.
 */

import { describe, it, expect, vi } from 'vitest';
import { DecisionOutcome, CapabilityType } from '@archon/kernel';
import type { ExecutionRequest, ExecutionResult, ExecutionSurface } from '../src/runtime/execution-surface.js';
import type { LogSink, DecisionLog } from '@archon/kernel';
import type { RuleSnapshot, RuleSnapshotHash } from '@archon/kernel';
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

/**
 * Minimal stub ExecutionSurface that:
 * - Captures the logSink it was called with.
 * - Returns a fixed Deny result (no real gate logic needed for interface tests).
 * - Does NOT import any module-loader code.
 */
class StubExecutionSurface implements ExecutionSurface {
  capturedLogSinks: LogSink[] = [];
  callCount = 0;

  async execute(_req: ExecutionRequest, logSink: LogSink): Promise<ExecutionResult> {
    this.capturedLogSinks.push(logSink);
    this.callCount++;
    return {
      decision: DecisionOutcome.Deny,
      triggeredRules: ['stub-deny'],
    };
  }
}

/**
 * A minimal, empty RuleSnapshot for use in ExecutionRequest fixtures.
 * The gate is stubbed, so the snapshot content does not matter for these tests.
 */
function makeStubSnapshot(): { snapshot: RuleSnapshot; snapshotHash: RuleSnapshotHash } {
  const snapshot: RuleSnapshot = {
    project_id: 'test',
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
  const { snapshot, snapshotHash } = makeStubSnapshot();
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

// ---------------------------------------------------------------------------
// P8.1-E1: execute() routes to the injected ExecutionSurface
// ---------------------------------------------------------------------------

describe('P8.1-E1: execute() routes to injected ExecutionSurface', () => {
  it('calls the injected surface with the request and returns its result', async () => {
    const surface = new StubExecutionSurface();
    const runtime = new ProjectRuntime('proj-x', makeCtx('proj-x'), new MemoryStateIO(), surface);

    const result = await runtime.execute(makeStubRequest('proj-x'));

    expect(surface.callCount).toBe(1);
    expect(result.decision).toBe(DecisionOutcome.Deny);
    expect(result.triggeredRules).toContain('stub-deny');
  });

  it('passes the runtime logSink (not a new instance) to the surface', async () => {
    const surface = new StubExecutionSurface();
    const runtime = new ProjectRuntime('proj-x', makeCtx('proj-x'), new MemoryStateIO(), surface);

    await runtime.execute(makeStubRequest('proj-x'));

    // Surface must have received exactly the logSink that belongs to this runtime.
    expect(surface.capturedLogSinks).toHaveLength(1);
    expect(surface.capturedLogSinks[0]).toBe(runtime.logSink);
  });

  it('routes multiple calls independently — surface call count accumulates', async () => {
    const surface = new StubExecutionSurface();
    const runtime = new ProjectRuntime('proj-x', makeCtx('proj-x'), new MemoryStateIO(), surface);

    await runtime.execute(makeStubRequest('proj-x'));
    await runtime.execute(makeStubRequest('proj-x'));
    await runtime.execute(makeStubRequest('proj-x'));

    expect(surface.callCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// P8.1-E2: Project A execute() never passes project B's logSink
// ---------------------------------------------------------------------------

describe('P8.1-E2: execution requests for project A never emit project_id=B', () => {
  it('two runtimes each pass their own logSink — never the other runtime\'s', async () => {
    const surfaceA = new StubExecutionSurface();
    const surfaceB = new StubExecutionSurface();

    const runtimeA = new ProjectRuntime('proj-a', makeCtx('proj-a'), new MemoryStateIO(), surfaceA);
    const runtimeB = new ProjectRuntime('proj-b', makeCtx('proj-b'), new MemoryStateIO(), surfaceB);

    await runtimeA.execute(makeStubRequest('proj-a'));
    await runtimeB.execute(makeStubRequest('proj-b'));

    // A's surface received A's logSink.
    expect(surfaceA.capturedLogSinks[0]).toBe(runtimeA.logSink);
    // B's surface received B's logSink.
    expect(surfaceB.capturedLogSinks[0]).toBe(runtimeB.logSink);

    // Cross-check: A's logSink was NOT passed to B's surface.
    expect(surfaceB.capturedLogSinks[0]).not.toBe(runtimeA.logSink);
    // Cross-check: B's logSink was NOT passed to A's surface.
    expect(surfaceA.capturedLogSinks[0]).not.toBe(runtimeB.logSink);
  });

  it('interleaved calls still route each request to the correct surface', async () => {
    const surfaceA = new StubExecutionSurface();
    const surfaceB = new StubExecutionSurface();

    const runtimeA = new ProjectRuntime('proj-a', makeCtx('proj-a'), new MemoryStateIO(), surfaceA);
    const runtimeB = new ProjectRuntime('proj-b', makeCtx('proj-b'), new MemoryStateIO(), surfaceB);

    // Interleaved execution calls.
    await runtimeA.execute(makeStubRequest('proj-a'));
    await runtimeB.execute(makeStubRequest('proj-b'));
    await runtimeA.execute(makeStubRequest('proj-a'));

    expect(surfaceA.callCount).toBe(2);
    expect(surfaceB.callCount).toBe(1);
    // All calls to A's surface used A's logSink.
    for (const sink of surfaceA.capturedLogSinks) {
      expect(sink).toBe(runtimeA.logSink);
    }
    // B's surface call used B's logSink.
    expect(surfaceB.capturedLogSinks[0]).toBe(runtimeB.logSink);
  });
});

// ---------------------------------------------------------------------------
// P8.1-E3: execute() without an injected surface throws explicitly
// ---------------------------------------------------------------------------

describe('P8.1-E3: execute() without a surface throws explicitly', () => {
  it('throws when no ExecutionSurface was injected', async () => {
    const runtime = new ProjectRuntime('proj-x', makeCtx('proj-x'), new MemoryStateIO());

    await expect(runtime.execute(makeStubRequest('proj-x'))).rejects.toThrow(
      `ProjectRuntime 'proj-x' has no ExecutionSurface`,
    );
  });

  it('error message identifies the projectId', async () => {
    const runtime = new ProjectRuntime('my-specific-project', makeCtx('my-specific-project'), new MemoryStateIO());

    await expect(runtime.execute(makeStubRequest('my-specific-project'))).rejects.toThrow(
      `'my-specific-project'`,
    );
  });
});

// ---------------------------------------------------------------------------
// P8.1-U1: getOrCreate() returns the same runtime for the same project_id
// ---------------------------------------------------------------------------

describe('P8.1-U1: getOrCreate() returns the same runtime on repeated calls', () => {
  it('second call returns the same object reference as the first', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();

    const first = supervisor.getOrCreate('proj-reuse', () => makeCtx('proj-reuse'), () => stateIO);
    const second = supervisor.getOrCreate('proj-reuse', () => makeCtx('proj-reuse'), () => stateIO);

    expect(first).toBe(second);
  });

  it('ten calls all return the same instance', () => {
    const supervisor = new RuntimeSupervisor();
    const first = supervisor.getOrCreate('proj-x', () => makeCtx('proj-x'), () => new MemoryStateIO());
    for (let i = 0; i < 9; i++) {
      const next = supervisor.getOrCreate('proj-x', () => makeCtx('proj-x'), () => new MemoryStateIO());
      expect(next).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// P8.1-U2: getOrCreate() creates a new runtime if one does not exist
// ---------------------------------------------------------------------------

describe('P8.1-U2: getOrCreate() creates a new runtime if one does not exist', () => {
  it('returns a ProjectRuntime with the correct projectId', () => {
    const supervisor = new RuntimeSupervisor();
    const runtime = supervisor.getOrCreate('new-proj', () => makeCtx('new-proj'), () => new MemoryStateIO());

    expect(runtime.projectId).toBe('new-proj');
  });

  it('creates distinct runtimes for distinct project IDs', () => {
    const supervisor = new RuntimeSupervisor();
    const rA = supervisor.getOrCreate('alpha', () => makeCtx('alpha'), () => new MemoryStateIO());
    const rB = supervisor.getOrCreate('beta', () => makeCtx('beta'), () => new MemoryStateIO());

    expect(rA).not.toBe(rB);
    expect(rA.projectId).toBe('alpha');
    expect(rB.projectId).toBe('beta');
  });
});

// ---------------------------------------------------------------------------
// P8.1-U3: getOrCreate() providers are lazy (not called if runtime exists)
// ---------------------------------------------------------------------------

describe('P8.1-U3: getOrCreate() providers are lazy', () => {
  it('ctxProvider is not called on second invocation', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();

    supervisor.getOrCreate('proj-lazy', () => makeCtx('proj-lazy'), () => stateIO);

    const ctxProviderSpy = vi.fn(() => makeCtx('proj-lazy'));
    const stateIOProviderSpy = vi.fn(() => stateIO);

    supervisor.getOrCreate('proj-lazy', ctxProviderSpy, stateIOProviderSpy);

    // Providers must NOT have been called — runtime already exists.
    expect(ctxProviderSpy).not.toHaveBeenCalled();
    expect(stateIOProviderSpy).not.toHaveBeenCalled();
  });

  it('ctxProvider is called exactly once (on creation)', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();
    const ctxProviderSpy = vi.fn(() => makeCtx('proj-once'));
    const stateIOProviderSpy = vi.fn(() => stateIO);

    supervisor.getOrCreate('proj-once', ctxProviderSpy, stateIOProviderSpy);

    expect(ctxProviderSpy).toHaveBeenCalledTimes(1);
    expect(stateIOProviderSpy).toHaveBeenCalledTimes(1);

    // Second call — providers must not be called again.
    supervisor.getOrCreate('proj-once', ctxProviderSpy, stateIOProviderSpy);

    expect(ctxProviderSpy).toHaveBeenCalledTimes(1);
    expect(stateIOProviderSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// P8.1-U4: getOrCreate() result is accessible via getProjectRuntime()
// ---------------------------------------------------------------------------

describe('P8.1-U4: getOrCreate result is accessible via getProjectRuntime()', () => {
  it('runtime created via getOrCreate is returned by getProjectRuntime', () => {
    const supervisor = new RuntimeSupervisor();
    const runtime = supervisor.getOrCreate('proj-g', () => makeCtx('proj-g'), () => new MemoryStateIO());

    expect(supervisor.getProjectRuntime('proj-g')).toBe(runtime);
  });

  it('getOrCreate result appears in listActiveRuntimes', () => {
    const supervisor = new RuntimeSupervisor();
    supervisor.getOrCreate('proj-list', () => makeCtx('proj-list'), () => new MemoryStateIO());

    expect(supervisor.listActiveRuntimes()).toContain('proj-list');
  });

  it('runtime is removed from supervisor after shutdownProjectRuntime', async () => {
    const supervisor = new RuntimeSupervisor();
    supervisor.getOrCreate('proj-shutdown', () => makeCtx('proj-shutdown'), () => new MemoryStateIO());

    await supervisor.shutdownProjectRuntime('proj-shutdown');

    expect(supervisor.getProjectRuntime('proj-shutdown')).toBeUndefined();
  });
});
