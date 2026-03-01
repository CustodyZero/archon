/**
 * Archon Runtime Host — P8.1 Project Switch Tests
 *
 * Verifies the context isolation guarantees that prevent Desktop ctx-pinning bugs.
 * Each test simulates the "project switch" scenario: two distinct projectIds
 * must produce two independent, correctly-attributed runtimes.
 *
 *   DESK-U1: ProjectRuntime constructor rejects ctx.project_id ≠ projectId
 *   DESK-U2: Two runtimes with different projectIds have isolated stateIOs
 *   DESK-U3: ctx.project_id matches projectId in each runtime after project switch
 *   DESK-U4: ProjectRuntime.ctx is publicly accessible with the correct project_id
 *   ENV-U-P8.1: Log entries carry the correct project attribution after project switch
 *
 * Isolation: uses MemoryStateIO — no filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import type { DecisionLog, RuleSnapshotHash } from '@archon/kernel';
import { DecisionOutcome, CapabilityType } from '@archon/kernel';
import { ProjectRuntime } from '../src/runtime/project-runtime.js';
import { MemoryStateIO } from '../src/state/state-io.js';
import { makeTestContext } from '../src/context/event-envelope.js';

// ---------------------------------------------------------------------------
// DESK-U1: ProjectRuntime constructor rejects ctx.project_id ≠ projectId
// ---------------------------------------------------------------------------

describe('DESK-U1: ProjectRuntime constructor rejects ctx.project_id ≠ projectId', () => {
  it('throws when ctx.project_id does not match projectId', () => {
    const stateIO = new MemoryStateIO();
    const ctx = makeTestContext({ project_id: 'project-alpha' });
    // Constructing a runtime for 'project-beta' with a context for 'project-alpha'
    // must throw — the guard prevents silent attribution corruption.
    expect(() => new ProjectRuntime('project-beta', ctx, stateIO)).toThrow(
      /does not match projectId/,
    );
  });

  it('does not throw when ctx.project_id matches projectId', () => {
    const stateIO = new MemoryStateIO();
    const ctx = makeTestContext({ project_id: 'project-ok' });
    expect(() => new ProjectRuntime('project-ok', ctx, stateIO)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DESK-U2: Two runtimes with different projectIds have isolated stateIOs
// ---------------------------------------------------------------------------

describe('DESK-U2: two runtimes with different projectIds have isolated stateIOs', () => {
  it('writes to runtime-A do not appear in runtime-B stateIO', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const ctxA = makeTestContext({ project_id: 'project-a' });
    const ctxB = makeTestContext({ project_id: 'project-b' });

    const runtimeA = new ProjectRuntime('project-a', ctxA, stateIOA);
    const runtimeB = new ProjectRuntime('project-b', ctxB, stateIOB);

    // Write to A's stateIO.
    runtimeA.stateIO.appendLine('decisions.jsonl', 'entry-for-project-a');

    expect(runtimeA.stateIO.readLines('decisions.jsonl')).toHaveLength(1);
    // B's stateIO is independent — should remain empty.
    expect(runtimeB.stateIO.readLines('decisions.jsonl')).toHaveLength(0);
  });

  it('writes to runtime-B do not appear in runtime-A stateIO', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();
    const ctxA = makeTestContext({ project_id: 'project-a' });
    const ctxB = makeTestContext({ project_id: 'project-b' });

    const runtimeA = new ProjectRuntime('project-a', ctxA, stateIOA);
    const runtimeB = new ProjectRuntime('project-b', ctxB, stateIOB);

    runtimeB.stateIO.appendLine('decisions.jsonl', 'entry-for-project-b');

    expect(runtimeB.stateIO.readLines('decisions.jsonl')).toHaveLength(1);
    expect(runtimeA.stateIO.readLines('decisions.jsonl')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DESK-U3: ctx.project_id matches projectId in each runtime (project switch invariant)
// ---------------------------------------------------------------------------

describe('DESK-U3: ctx.project_id matches projectId in each runtime after project switch', () => {
  it('each runtime carries the correct project_id in its ctx', () => {
    const ctxA = makeTestContext({ project_id: 'project-a' });
    const ctxB = makeTestContext({ project_id: 'project-b' });

    const runtimeA = new ProjectRuntime('project-a', ctxA, new MemoryStateIO());
    const runtimeB = new ProjectRuntime('project-b', ctxB, new MemoryStateIO());

    expect(runtimeA.ctx.project_id).toBe('project-a');
    expect(runtimeB.ctx.project_id).toBe('project-b');
  });
});

// ---------------------------------------------------------------------------
// DESK-U4: ProjectRuntime.ctx is publicly accessible with the correct project_id
// ---------------------------------------------------------------------------

describe('DESK-U4: ProjectRuntime.ctx is publicly accessible with correct project_id', () => {
  it('runtime.ctx.project_id equals the projectId constructor argument', () => {
    const ctx = makeTestContext({ project_id: 'my-project' });
    const runtime = new ProjectRuntime('my-project', ctx, new MemoryStateIO());

    expect(runtime.ctx.project_id).toBe('my-project');
  });

  it('runtime.ctx carries device_id, user_id, session_id from the injected context', () => {
    const ctx = makeTestContext({
      project_id: 'my-project',
      device_id: 'dev-desk-u4',
      user_id: 'usr-desk-u4',
      session_id: 'ses-desk-u4',
    });
    const runtime = new ProjectRuntime('my-project', ctx, new MemoryStateIO());

    expect(runtime.ctx.device_id).toBe('dev-desk-u4');
    expect(runtime.ctx.user_id).toBe('usr-desk-u4');
    expect(runtime.ctx.session_id).toBe('ses-desk-u4');
  });
});

// ---------------------------------------------------------------------------
// ENV-U-P8.1: After project switch, log entry carries correct project attribution
// ---------------------------------------------------------------------------

describe('ENV-U-P8.1: log entry after project switch carries correct project_id attribution', () => {
  it('runtime-B logSink writes entries with project-b ctx, not project-a', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    const ctxA = makeTestContext({ project_id: 'project-a', device_id: 'dev-env', session_id: 'ses-env' });
    const ctxB = makeTestContext({ project_id: 'project-b', device_id: 'dev-env', session_id: 'ses-env' });

    const runtimeA = new ProjectRuntime('project-a', ctxA, stateIOA);
    const runtimeB = new ProjectRuntime('project-b', ctxB, stateIOB);

    const entry: DecisionLog = {
      agent_id: 'env-test-agent',
      proposed_action: {
        project_id: 'project-b',
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: { path: '/tmp' },
      },
      decision: DecisionOutcome.Deny,
      triggered_rules: ['capability_not_enabled'],
      rs_hash: 'env-u-rs-hash' as unknown as RuleSnapshotHash,
      input_hash: 'env-u-input-hash',
      output_hash: null,
      timestamp: new Date().toISOString(),
    };

    // Log via runtime-B's logSink (bound to project-b ctx).
    runtimeB.logSink.append(entry);

    // runtime-A log must remain empty — no cross-log contamination.
    expect(runtimeA.stateIO.readLines('decisions.jsonl')).toHaveLength(0);

    // runtime-B log must have exactly one entry.
    const linesB = runtimeB.stateIO.readLines('decisions.jsonl');
    expect(linesB).toHaveLength(1);

    const envelope = JSON.parse(linesB[0]!) as Record<string, unknown>;

    // All attribution fields must come from project-b's ctx.
    expect(envelope['project_id']).toBe('project-b');
    expect(envelope['device_id']).toBe('dev-env');
    expect(envelope['session_id']).toBe('ses-env');
  });

  it('log entries from both runtimes carry their respective project_ids', () => {
    const stateIOA = new MemoryStateIO();
    const stateIOB = new MemoryStateIO();

    const ctxA = makeTestContext({ project_id: 'project-a' });
    const ctxB = makeTestContext({ project_id: 'project-b' });

    const runtimeA = new ProjectRuntime('project-a', ctxA, stateIOA);
    const runtimeB = new ProjectRuntime('project-b', ctxB, stateIOB);

    const makeEntry = (projectId: string): DecisionLog => ({
      agent_id: 'env-agent',
      proposed_action: {
        project_id: projectId,
        module_id: 'filesystem',
        capability_id: 'fs.read',
        type: CapabilityType.FsRead,
        params: { path: '/tmp' },
      },
      decision: DecisionOutcome.Deny,
      triggered_rules: [],
      rs_hash: 'rs-hash' as unknown as RuleSnapshotHash,
      input_hash: 'input-hash',
      output_hash: null,
      timestamp: new Date().toISOString(),
    });

    runtimeA.logSink.append(makeEntry('project-a'));
    runtimeB.logSink.append(makeEntry('project-b'));

    const envelopeA = JSON.parse(runtimeA.stateIO.readLines('decisions.jsonl')[0]!) as Record<string, unknown>;
    const envelopeB = JSON.parse(runtimeB.stateIO.readLines('decisions.jsonl')[0]!) as Record<string, unknown>;

    expect(envelopeA['project_id']).toBe('project-a');
    expect(envelopeB['project_id']).toBe('project-b');
  });
});
