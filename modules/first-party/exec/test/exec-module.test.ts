/**
 * Exec Module — Unit Tests
 *
 * Tests for the exec module manifest and executeExecRun handler.
 * All tests use adapter stubs — no real subprocesses are spawned.
 *
 * Test IDs: EXEC-U1 through EXEC-U10
 */

import { describe, it, expect } from 'vitest';
import { CapabilityType, RiskTier } from '@archon/kernel';
import type {
  KernelAdapters,
  CapabilityInstance,
  AdapterCallContext,
  RuleSnapshotHash,
  ResourceConfig,
} from '@archon/kernel';
import { EXEC_MANIFEST } from '../src/manifest.js';
import { executeExecRun } from '../src/execute.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<AdapterCallContext>): AdapterCallContext {
  return {
    agent_id: 'test-agent',
    capability_instance: makeInstance({}),
    rs_hash: 'test-hash' as RuleSnapshotHash,
    resource_config: {
      fs_roots: [],
      net_allowlist: [],
    } as ResourceConfig,
    ...overrides,
  };
}

function makeInstance(params: Record<string, unknown>): CapabilityInstance {
  return {
    project_id: 'test-project',
    capability_id: 'exec.run',
    module_id: 'exec',
    type: CapabilityType.ExecRun,
    tier: RiskTier.T3,
    params,
  };
}

function makeAdapters(
  execRun: (
    command: string,
    args: ReadonlyArray<string>,
    options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
    context: AdapterCallContext,
  ) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>,
): KernelAdapters {
  const notImplemented = (): never => {
    throw new Error('Not implemented in test');
  };
  return {
    filesystem: {
      read: notImplemented,
      list: notImplemented,
      write: notImplemented,
      delete: notImplemented,
    },
    exec: { run: execRun },
    network: { fetchHttp: notImplemented },
    secrets: { read: notImplemented, use: notImplemented, injectEnv: notImplemented },
    messaging: { send: notImplemented },
    ui: {
      requestApproval: notImplemented,
      presentRiskAck: notImplemented,
      requestClarification: notImplemented,
    },
  };
}

// ---------------------------------------------------------------------------
// Manifest tests
// ---------------------------------------------------------------------------

describe('Exec Module Manifest', () => {
  it('EXEC-U1: declares module_id "exec"', () => {
    expect(EXEC_MANIFEST.module_id).toBe('exec');
  });

  it('EXEC-U2: declares exactly one capability descriptor (exec.run)', () => {
    expect(EXEC_MANIFEST.capability_descriptors).toHaveLength(1);
    const desc = EXEC_MANIFEST.capability_descriptors[0]!;
    expect(desc.capability_id).toBe('exec.run');
    expect(desc.type).toBe(CapabilityType.ExecRun);
    expect(desc.tier).toBe(RiskTier.T3);
  });

  it('EXEC-U3: exec.run requires typed acknowledgment (T3)', () => {
    const desc = EXEC_MANIFEST.capability_descriptors[0]!;
    expect(desc.ack_required).toBe(true);
  });

  it('EXEC-U4: default_enabled is false (I1 deny-by-default)', () => {
    const desc = EXEC_MANIFEST.capability_descriptors[0]!;
    expect(desc.default_enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handler tests
// ---------------------------------------------------------------------------

describe('executeExecRun', () => {
  it('EXEC-U5: passes command and args to exec adapter', async () => {
    let capturedCommand = '';
    let capturedArgs: ReadonlyArray<string> = [];

    const adapters = makeAdapters(async (command, args) => {
      capturedCommand = command;
      capturedArgs = args;
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    });

    const instance = makeInstance({ command: 'echo', args: ['hello', 'world'] });
    const context = makeContext({ capability_instance: instance });

    await executeExecRun(instance, adapters, context);

    expect(capturedCommand).toBe('echo');
    expect(capturedArgs).toEqual(['hello', 'world']);
  });

  it('EXEC-U6: returns exitCode, stdout, stderr from adapter', async () => {
    const adapters = makeAdapters(async () => {
      return { exitCode: 42, stdout: 'out-text', stderr: 'err-text' };
    });

    const instance = makeInstance({ command: 'test-cmd' });
    const result = await executeExecRun(instance, adapters, makeContext());

    expect(result.exitCode).toBe(42);
    expect(result.stdout).toBe('out-text');
    expect(result.stderr).toBe('err-text');
  });

  it('EXEC-U7: throws if command parameter is empty', async () => {
    const adapters = makeAdapters(async () => {
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const instance = makeInstance({ command: '' });

    await expect(
      executeExecRun(instance, adapters, makeContext()),
    ).rejects.toThrow('command parameter is required');
  });

  it('EXEC-U8: throws if command parameter is missing', async () => {
    const adapters = makeAdapters(async () => {
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const instance = makeInstance({});

    await expect(
      executeExecRun(instance, adapters, makeContext()),
    ).rejects.toThrow('command parameter is required');
  });

  it('EXEC-U9: coerces non-array args to empty array', async () => {
    let capturedArgs: ReadonlyArray<string> = ['should-be-replaced'];

    const adapters = makeAdapters(async (_cmd, args) => {
      capturedArgs = args;
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const instance = makeInstance({ command: 'ls', args: 'not-an-array' });
    await executeExecRun(instance, adapters, makeContext());

    expect(capturedArgs).toEqual([]);
  });

  it('EXEC-U10: passes timeoutMs from params to adapter options', async () => {
    let capturedOptions: { timeoutMs?: number } = {};

    const adapters = makeAdapters(async (_cmd, _args, options) => {
      capturedOptions = options;
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const instance = makeInstance({ command: 'sleep', args: ['10'], timeout_ms: 5000 });
    await executeExecRun(instance, adapters, makeContext());

    expect(capturedOptions.timeoutMs).toBe(5000);
  });
});
