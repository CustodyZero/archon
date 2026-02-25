/**
 * Archon Runtime Host — Subprocess Execution Adapter
 *
 * Implements the ExecAdapter interface from @archon/kernel.
 * Uses node:child_process.spawn for all subprocess execution.
 *
 * CWD ENFORCEMENT (P5):
 * The caller-provided `options.cwd` is IGNORED in v0.1. The working directory
 * is always resolved from the active resource configuration:
 *
 *   1. If resource_config.exec_cwd_root_id is set, resolve the root by id
 *      from resource_config.fs_roots and use its path as cwd.
 *   2. If exec_cwd_root_id is null, fall back to the root with id='workspace'
 *      (the default root created by createProject()).
 *   3. If fs_roots is empty (no roots declared), cwd is not constrained
 *      (backward compat for pre-P5 projects). The process inherits the
 *      parent process's cwd.
 *   4. If a non-null exec_cwd_root_id cannot be matched in fs_roots, throw
 *      (defensive: the kernel's ValidationEngine should have denied the action
 *      before this point).
 *
 * This ensures exec actions are always rooted to a declared FS root, preventing
 * a module from executing subprocesses relative to an arbitrary directory.
 *
 * @see docs/specs/architecture.md §P5 (resource scoping — exec adapter layer)
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 */

import { spawn } from 'node:child_process';
import type { ExecAdapter, AdapterCallContext, ResourceConfig } from '@archon/kernel';

// ---------------------------------------------------------------------------
// NodeExecAdapter
// ---------------------------------------------------------------------------

/**
 * Node.js subprocess execution adapter with P5 CWD enforcement.
 *
 * All module exec operations must flow through this adapter — modules must not
 * call child_process directly. This adapter enforces the ExecAdapter contract
 * including P5 CWD rooting from resource_config.
 */
export class NodeExecAdapter implements ExecAdapter {
  /**
   * Spawn a subprocess and collect its stdout/stderr.
   *
   * The working directory is resolved from context.resource_config, not from
   * options.cwd. options.cwd is accepted by the interface but ignored in v0.1
   * to prevent caller-side CWD bypass.
   *
   * @throws {Error} If exec_cwd_root_id is set but cannot be resolved in fs_roots
   */
  async run(
    command: string,
    args: ReadonlyArray<string>,
    options: {
      readonly cwd?: string | undefined;
      readonly env?: Record<string, string> | undefined;
      readonly timeoutMs?: number | undefined;
    },
    context: AdapterCallContext,
  ): Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }> {
    // P5: CWD is always from resource_config. options.cwd is ignored.
    const cwd = resolveExecCwd(context.resource_config);

    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd,
        // Use caller env if provided; otherwise inherit parent process env.
        env: options.env ?? (process.env as Record<string, string>),
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk); });
      child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk); });

      child.on('close', (exitCode: number | null) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        });
      });

      child.on('error', (err: Error) => { reject(err); });
    });
  }
}

// ---------------------------------------------------------------------------
// CWD resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective working directory from the resource configuration.
 *
 * Returns `undefined` when no roots are declared (backward compat — the process
 * inherits the parent's cwd, matching pre-P5 behavior).
 *
 * @throws {Error} If exec_cwd_root_id is non-null and not found in fs_roots
 */
function resolveExecCwd(resourceConfig: ResourceConfig): string | undefined {
  const { exec_cwd_root_id, fs_roots } = resourceConfig;

  // No roots declared: no CWD enforcement (backward compat with pre-P5 projects).
  if (fs_roots.length === 0) return undefined;

  // Determine which root ID to resolve.
  const rootId = exec_cwd_root_id ?? 'workspace';

  const root = fs_roots.find((r) => r.id === rootId);
  if (root === undefined) {
    throw new Error(
      `ExecAdapter: exec_cwd_root_id '${rootId}' is not declared in fs_roots. ` +
        `Declare the root via 'archon resource fs-roots set' before executing subprocesses. ` +
        `Declared roots: [${fs_roots.map((r) => r.id).join(', ')}].`,
    );
  }

  return root.path;
}
