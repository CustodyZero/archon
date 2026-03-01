/**
 * Archon Runtime Host — RuntimeSupervisor Tests
 *
 * Verifies RuntimeSupervisor lifecycle and routing behaviour:
 *
 *   SUPER-U1: Creating a runtime for an unknown project succeeds
 *   SUPER-U2: Creating a runtime for a duplicate project_id throws
 *   SUPER-U3: getProjectRuntime returns the correct runtime
 *   SUPER-U4: getProjectRuntime returns undefined for unknown project
 *   SUPER-U5: listActiveRuntimes returns all active project IDs
 *   SUPER-U6: shutdownProjectRuntime removes the runtime from the map
 *   SUPER-U7: shutdownProjectRuntime is a no-op for unknown project
 *   SUPER-U8: ProjectRuntime creation enforces ctx.project_id === projectId
 *   SUPER-U9: Multiple runtimes created and shut down independently
 *
 * All tests use MemoryStateIO — no filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import { MemoryStateIO } from '../src/state/state-io.js';
import { makeTestContext } from '../src/context/event-envelope.js';
import { RuntimeSupervisor } from '../src/runtime/runtime-supervisor.js';
import { ProjectRuntime } from '../src/runtime/project-runtime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(projectId: string) {
  return makeTestContext({ project_id: projectId });
}

// ---------------------------------------------------------------------------
// SUPER-U1: Creating a runtime for a new project succeeds
// ---------------------------------------------------------------------------

describe('SUPER-U1: createProjectRuntime for a new project succeeds', () => {
  it('returns a ProjectRuntime with the correct projectId', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();

    const runtime = supervisor.createProjectRuntime('proj-1', makeCtx('proj-1'), stateIO);

    expect(runtime).toBeInstanceOf(ProjectRuntime);
    expect(runtime.projectId).toBe('proj-1');
  });

  it('the returned runtime is immediately accessible via getProjectRuntime', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();

    const runtime = supervisor.createProjectRuntime('proj-2', makeCtx('proj-2'), stateIO);

    expect(supervisor.getProjectRuntime('proj-2')).toBe(runtime);
  });
});

// ---------------------------------------------------------------------------
// SUPER-U2: Creating a runtime for a duplicate project_id throws
// ---------------------------------------------------------------------------

describe('SUPER-U2: createProjectRuntime for a duplicate project_id throws', () => {
  it('throws if called twice with the same projectId', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    supervisor.createProjectRuntime('proj-dup', makeCtx('proj-dup'), stateIOA);

    expect(() => {
      supervisor.createProjectRuntime('proj-dup', makeCtx('proj-dup'), stateIOB);
    }).toThrow(`ProjectRuntime for project 'proj-dup' already exists`);
  });

  it('does not create a second runtime on duplicate; first runtime is preserved', () => {
    const supervisor = new RuntimeSupervisor();
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    const first = supervisor.createProjectRuntime('proj-dup', makeCtx('proj-dup'), stateIOA);

    try {
      supervisor.createProjectRuntime('proj-dup', makeCtx('proj-dup'), stateIOB);
    } catch {
      // Expected
    }

    // First runtime is still the active one.
    expect(supervisor.getProjectRuntime('proj-dup')).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// SUPER-U3: getProjectRuntime returns the correct runtime
// ---------------------------------------------------------------------------

describe('SUPER-U3: getProjectRuntime returns the correct runtime', () => {
  it('returns the exact runtime instance that was created', () => {
    const supervisor = new RuntimeSupervisor();

    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const runtimeA = supervisor.createProjectRuntime('proj-a', makeCtx('proj-a'), stateIOA);
    const runtimeB = supervisor.createProjectRuntime('proj-b', makeCtx('proj-b'), stateIOB);

    expect(supervisor.getProjectRuntime('proj-a')).toBe(runtimeA);
    expect(supervisor.getProjectRuntime('proj-b')).toBe(runtimeB);

    // Each lookup returns the correct runtime, not the other.
    expect(supervisor.getProjectRuntime('proj-a')).not.toBe(runtimeB);
    expect(supervisor.getProjectRuntime('proj-b')).not.toBe(runtimeA);
  });
});

// ---------------------------------------------------------------------------
// SUPER-U4: getProjectRuntime returns undefined for unknown project
// ---------------------------------------------------------------------------

describe('SUPER-U4: getProjectRuntime returns undefined for unknown project', () => {
  it('returns undefined for a project that was never created', () => {
    const supervisor = new RuntimeSupervisor();

    expect(supervisor.getProjectRuntime('nonexistent')).toBeUndefined();
  });

  it('returns undefined after the runtime is shut down', async () => {
    const supervisor = new RuntimeSupervisor();
    const stateIO = new MemoryStateIO();

    supervisor.createProjectRuntime('proj-gone', makeCtx('proj-gone'), stateIO);
    await supervisor.shutdownProjectRuntime('proj-gone');

    expect(supervisor.getProjectRuntime('proj-gone')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SUPER-U5: listActiveRuntimes returns all active project IDs
// ---------------------------------------------------------------------------

describe('SUPER-U5: listActiveRuntimes returns all active project IDs', () => {
  it('empty supervisor has no active runtimes', () => {
    const supervisor = new RuntimeSupervisor();
    expect(supervisor.listActiveRuntimes()).toHaveLength(0);
  });

  it('returns IDs for all created runtimes', () => {
    const supervisor = new RuntimeSupervisor();
    supervisor.createProjectRuntime('alpha', makeCtx('alpha'), new MemoryStateIO());
    supervisor.createProjectRuntime('beta', makeCtx('beta'), new MemoryStateIO());
    supervisor.createProjectRuntime('gamma', makeCtx('gamma'), new MemoryStateIO());

    const ids = supervisor.listActiveRuntimes();
    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
    expect(ids).toContain('gamma');
    expect(ids).toHaveLength(3);
  });

  it('does not expose runtime references — returns only project IDs (strings)', () => {
    const supervisor = new RuntimeSupervisor();
    supervisor.createProjectRuntime('proj-x', makeCtx('proj-x'), new MemoryStateIO());

    const ids = supervisor.listActiveRuntimes();
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// SUPER-U6: shutdownProjectRuntime removes the runtime from the map
// ---------------------------------------------------------------------------

describe('SUPER-U6: shutdownProjectRuntime removes runtime from supervisor', () => {
  it('removes the entry after shutdown', async () => {
    const supervisor = new RuntimeSupervisor();
    supervisor.createProjectRuntime('proj-rm', makeCtx('proj-rm'), new MemoryStateIO());

    await supervisor.shutdownProjectRuntime('proj-rm');

    expect(supervisor.getProjectRuntime('proj-rm')).toBeUndefined();
    expect(supervisor.listActiveRuntimes()).not.toContain('proj-rm');
  });

  it('only removes the target runtime; others remain', async () => {
    const supervisor = new RuntimeSupervisor();
    supervisor.createProjectRuntime('to-remove', makeCtx('to-remove'), new MemoryStateIO());
    const survivor = supervisor.createProjectRuntime(
      'to-survive',
      makeCtx('to-survive'),
      new MemoryStateIO(),
    );

    await supervisor.shutdownProjectRuntime('to-remove');

    expect(supervisor.getProjectRuntime('to-remove')).toBeUndefined();
    expect(supervisor.getProjectRuntime('to-survive')).toBe(survivor);
  });
});

// ---------------------------------------------------------------------------
// SUPER-U7: shutdownProjectRuntime is a no-op for unknown project
// ---------------------------------------------------------------------------

describe('SUPER-U7: shutdownProjectRuntime is a no-op for unknown project', () => {
  it('does not throw for a projectId that was never created', async () => {
    const supervisor = new RuntimeSupervisor();

    await expect(supervisor.shutdownProjectRuntime('nonexistent')).resolves.toBeUndefined();
  });

  it('does not affect other runtimes when shutting down unknown project', async () => {
    const supervisor = new RuntimeSupervisor();
    const runtime = supervisor.createProjectRuntime('proj-ok', makeCtx('proj-ok'), new MemoryStateIO());

    await supervisor.shutdownProjectRuntime('never-existed');

    expect(supervisor.getProjectRuntime('proj-ok')).toBe(runtime);
  });
});

// ---------------------------------------------------------------------------
// SUPER-U8: ProjectRuntime constructor enforces ctx.project_id === projectId
// ---------------------------------------------------------------------------

describe('SUPER-U8: ProjectRuntime rejects mismatched ctx.project_id', () => {
  it('throws if ctx.project_id does not match projectId', () => {
    const stateIO = new MemoryStateIO();
    const ctx = makeTestContext({ project_id: 'other-project' });

    expect(() => {
      new ProjectRuntime('my-project', ctx, stateIO);
    }).toThrow(`ctx.project_id 'other-project' does not match projectId 'my-project'`);
  });

  it('RuntimeSupervisor propagates the mismatch error', () => {
    const supervisor = new RuntimeSupervisor();
    const ctx = makeTestContext({ project_id: 'wrong-id' });

    expect(() => {
      supervisor.createProjectRuntime('correct-id', ctx, new MemoryStateIO());
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SUPER-U9: Multiple runtimes created and shut down independently
// ---------------------------------------------------------------------------

describe('SUPER-U9: multiple runtimes lifecycle is fully independent', () => {
  it('creating and shutting down three projects one by one leaves supervisor empty', async () => {
    const supervisor = new RuntimeSupervisor();

    supervisor.createProjectRuntime('p1', makeCtx('p1'), new MemoryStateIO());
    supervisor.createProjectRuntime('p2', makeCtx('p2'), new MemoryStateIO());
    supervisor.createProjectRuntime('p3', makeCtx('p3'), new MemoryStateIO());

    expect(supervisor.listActiveRuntimes()).toHaveLength(3);

    await supervisor.shutdownProjectRuntime('p2');
    expect(supervisor.listActiveRuntimes()).toHaveLength(2);
    expect(supervisor.listActiveRuntimes()).not.toContain('p2');

    await supervisor.shutdownProjectRuntime('p1');
    expect(supervisor.listActiveRuntimes()).toHaveLength(1);
    expect(supervisor.listActiveRuntimes()).toContain('p3');

    await supervisor.shutdownProjectRuntime('p3');
    expect(supervisor.listActiveRuntimes()).toHaveLength(0);
  });

  it('a project can be re-created after shutdown', async () => {
    const supervisor = new RuntimeSupervisor();

    supervisor.createProjectRuntime('reusable', makeCtx('reusable'), new MemoryStateIO());
    await supervisor.shutdownProjectRuntime('reusable');

    // Should not throw — runtime was removed.
    const runtime2 = supervisor.createProjectRuntime(
      'reusable',
      makeCtx('reusable'),
      new MemoryStateIO(),
    );

    expect(supervisor.getProjectRuntime('reusable')).toBe(runtime2);
  });
});
