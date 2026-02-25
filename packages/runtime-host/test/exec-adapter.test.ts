/**
 * Archon Runtime Host — NodeExecAdapter Tests
 *
 * Verifies that exec.run() enforces CWD from resource_config, not from the
 * caller-provided options.cwd parameter.
 *
 *   EXEC-U1: subprocess uses declared workspace cwd
 *   EXEC-U2: caller-provided options.cwd is ignored; resource_config cwd wins
 *   EXEC-U3: unknown exec_cwd_root_id throws an explicit error
 *
 * Isolation: each test creates a temp workspace directory. No global state.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { realpath } from 'node:fs/promises';
import type { AdapterCallContext, RuleSnapshotHash } from '@archon/kernel';
import { CapabilityType } from '@archon/kernel';
import { NodeExecAdapter } from '../src/adapters/exec.js';

// ---------------------------------------------------------------------------
// Test context factory
// ---------------------------------------------------------------------------

function makeContext(workspacePath: string, execCwdRootId: string | null = 'workspace'): AdapterCallContext {
  return {
    agent_id: 'test-agent',
    capability_instance: {
      module_id: 'exec-module',
      capability_id: 'exec.run',
      type: CapabilityType.ExecRun,
      params: {},
      project_id: 'test-project',
    },
    rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
    resource_config: {
      fs_roots: [{ id: 'workspace', path: workspacePath, perm: 'rw' }],
      net_allowlist: [],
      exec_cwd_root_id: execCwdRootId,
      secrets_epoch: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeExecAdapter', () => {
  it('EXEC-U1: subprocess cwd matches declared workspace root', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-exec-u1-`));
    const adapter = new NodeExecAdapter();
    const context = makeContext(workspacePath);

    // node -e "process.stdout.write(process.cwd())" prints the real cwd without newline
    const result = await adapter.run(
      process.execPath, // use the same node binary running the tests
      ['-e', 'process.stdout.write(process.cwd())'],
      {},
      context,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(workspacePath);
  });

  it('EXEC-U2: caller-provided options.cwd is ignored — resource_config cwd wins', async () => {
    const workspacePath = await realpath(mkdtempSync(`${tmpdir()}/archon-exec-u2-`));
    const distractorPath = mkdtempSync(`${tmpdir()}/archon-exec-distractor-`);
    const adapter = new NodeExecAdapter();
    const context = makeContext(workspacePath);

    const result = await adapter.run(
      process.execPath,
      ['-e', 'process.stdout.write(process.cwd())'],
      { cwd: distractorPath }, // This must be ignored
      context,
    );

    expect(result.exitCode).toBe(0);
    // CWD must be the workspace root, NOT the caller-supplied distractorPath
    expect(result.stdout.trim()).toBe(workspacePath);
    expect(result.stdout.trim()).not.toBe(distractorPath);
  });

  it('EXEC-U3: unknown exec_cwd_root_id throws an explicit error', async () => {
    const workspacePath = mkdtempSync(`${tmpdir()}/archon-exec-u3-`);
    const adapter = new NodeExecAdapter();

    // exec_cwd_root_id='nonexistent' is not in fs_roots
    const context: AdapterCallContext = {
      agent_id: 'test-agent',
      capability_instance: {
        module_id: 'exec-module',
        capability_id: 'exec.run',
        type: CapabilityType.ExecRun,
        params: {},
        project_id: 'test-project',
      },
      rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
      resource_config: {
        fs_roots: [{ id: 'workspace', path: workspacePath, perm: 'rw' }],
        net_allowlist: [],
        exec_cwd_root_id: 'nonexistent-root',
        secrets_epoch: 0,
      },
    };

    await expect(
      adapter.run(process.execPath, ['-e', '{}'], {}, context),
    ).rejects.toThrow(/exec_cwd_root_id.*nonexistent-root/);
  });

  it('EXEC-U4: empty fs_roots allows execution without CWD constraint', async () => {
    const adapter = new NodeExecAdapter();

    // Backward compat: no roots → no constraint; inherits parent cwd
    const context: AdapterCallContext = {
      agent_id: 'test-agent',
      capability_instance: {
        module_id: 'exec-module',
        capability_id: 'exec.run',
        type: CapabilityType.ExecRun,
        params: {},
        project_id: 'test-project',
      },
      rs_hash: 'test-hash' as unknown as RuleSnapshotHash,
      resource_config: {
        fs_roots: [],
        net_allowlist: [],
        exec_cwd_root_id: null,
        secrets_epoch: 0,
      },
    };

    const result = await adapter.run(
      process.execPath,
      ['-e', 'process.exit(0)'],
      {},
      context,
    );

    expect(result.exitCode).toBe(0);
  });
});
