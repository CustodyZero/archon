/**
 * Archon Module Loader — GateExecutionSurface
 *
 * P8.1: Concrete implementation of the ExecutionSurface interface defined in
 * @archon/runtime-host. Bridges ProjectRuntime's execute() entrypoint to the
 * ExecutionGate + handler system in module-loader/kernel.
 *
 * Dependency chain (no circular imports):
 *   kernel (ExecutionGate, LogSink) ← runtime-host (ExecutionSurface) ← module-loader (this file)
 *
 * Usage:
 *   const surface = new GateExecutionSurface(handlers, adapters);
 *   const runtime = new ProjectRuntime(projectId, ctx, stateIO, surface);
 *   // or via supervisor:
 *   const runtime = supervisor.getOrCreate(projectId, ctxProvider, stateIOProvider, surface);
 *
 * Logging contract:
 *   The LogSink is passed by ProjectRuntime on each execute() call — NOT stored
 *   at construction. This guarantees:
 *     - All log entries carry the correct project_id (from the runtime's ctx).
 *     - The surface cannot be accidentally shared across runtimes (no stale logSink).
 *     - Isolation invariant INV-U4 is preserved: log sinks do not bleed across runtimes.
 *
 * @see docs/specs/architecture.md §P8.1 (execution boundary)
 * @see docs/specs/architecture.md §4 (validation flow)
 */

import { ExecutionGate } from '@archon/kernel';
import type { KernelAdapters, LogSink, ModuleHandler } from '@archon/kernel';
import type { ExecutionRequest, ExecutionResult, ExecutionSurface } from '@archon/runtime-host';

// ---------------------------------------------------------------------------
// GateExecutionSurface
// ---------------------------------------------------------------------------

/**
 * Concrete ExecutionSurface that routes requests through ExecutionGate.
 *
 * Constructed with a handler map and KernelAdapters. The ExecutionGate is
 * created fresh per execute() call, which is intentional: the gate is
 * stateless (it holds no mutable state beyond its constructor args), so
 * creating one per call is correct and avoids shared-state bugs.
 *
 * Handlers are registered at construction via the Map. To add or remove
 * handlers, construct a new GateExecutionSurface.
 */
export class GateExecutionSurface implements ExecutionSurface {
  /**
   * Construct a GateExecutionSurface.
   *
   * @param handlers - Map from `"${module_id}:${capability_id}"` to ModuleHandler.
   *                   Only these handlers will be executed on Permit decisions.
   * @param adapters - KernelAdapters bundle providing access to FS, network, exec,
   *                   secrets, and UI capabilities. Handlers receive this via gate().
   */
  constructor(
    private readonly handlers: Map<string, ModuleHandler>,
    private readonly adapters: KernelAdapters,
  ) {}

  /**
   * Execute a structured action request through ExecutionGate.
   *
   * Creates a fresh ExecutionGate per invocation, injects the provided logSink
   * (owned by the calling ProjectRuntime), and delegates to gate.gate().
   *
   * Logging: ExecutionGate.gate() logs every decision (Permit, Deny, Escalate)
   * unconditionally via the logSink. Do not call logSink.append() separately —
   * that would double-log the entry.
   *
   * @param req     - Structured execution request with pre-computed snapshot.
   * @param logSink - The project-bound log sink from the calling ProjectRuntime.
   *                  All events are written here with the runtime's project_id.
   */
  async execute(req: ExecutionRequest, logSink: LogSink): Promise<ExecutionResult> {
    const gate = new ExecutionGate(this.handlers, this.adapters, logSink);
    const result = await gate.gate(req.agentId, req.action, req.snapshot, req.snapshotHash);
    return {
      decision: result.decision,
      triggeredRules: result.triggered_rules,
      output: result.result,
    };
  }
}
