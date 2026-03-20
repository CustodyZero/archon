/**
 * Archon First-Party Exec Module — Execute Handler
 *
 * Handler implementation for the exec.run capability instance.
 * All subprocess execution flows through the kernel's ExecAdapter,
 * which enforces P5 CWD rooting from the resource_config. This module
 * does not use node:child_process directly.
 *
 * The AdapterCallContext is provided by the gate (real agentId, capability
 * instance, and activeSnapshotHash). Handlers must not construct their own
 * contexts — the gate is the sole authority for context construction.
 *
 * @see docs/specs/module_api.md §4 (tool implementations)
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */

import type { CapabilityInstance, KernelAdapters, AdapterCallContext } from '@archon/kernel';

/**
 * Execute an exec.run capability instance.
 *
 * Runs a subprocess via the kernel exec adapter with CWD enforcement.
 * Returns the process exit code, stdout, and stderr.
 *
 * @param instance - The resolved exec.run capability instance
 * @param adapters - Kernel-provided adapters
 * @param context - Gate-constructed adapter call context (real rs_hash, agentId)
 * @returns { exitCode: number | null, stdout: string, stderr: string }
 */
export async function executeExecRun(
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const command = String(instance.params['command'] ?? '');
  if (command === '') {
    throw new Error('exec.run: command parameter is required and must be non-empty');
  }

  const rawArgs = instance.params['args'];
  const args: ReadonlyArray<string> = Array.isArray(rawArgs)
    ? rawArgs.map((a) => String(a))
    : [];

  const rawTimeout = instance.params['timeout_ms'];
  const timeoutMs = typeof rawTimeout === 'number' && rawTimeout > 0
    ? rawTimeout
    : undefined;

  const result = await adapters.exec.run(command, args, { timeoutMs }, context);

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
