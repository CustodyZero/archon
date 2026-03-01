/**
 * Archon Runtime Host — ExecutionSurface
 *
 * P8.1: Adoption + Boundary Hardening
 *
 * ExecutionSurface is the dependency-inversion boundary that allows
 * ProjectRuntime (in runtime-host) to route execution requests to
 * handlers (in module-loader) without creating a circular import.
 *
 * Dependency order: restriction-dsl → kernel → runtime-host → module-loader
 * - runtime-host CANNOT import from module-loader.
 * - Defining the interface in runtime-host lets module-loader implement it.
 *
 * Usage pattern:
 *   1. runtime-host: ProjectRuntime holds an optional ExecutionSurface.
 *   2. module-loader: GateExecutionSurface implements ExecutionSurface using ExecutionGate.
 *   3. CLI/Desktop: construct a GateExecutionSurface and inject it into ProjectRuntime.
 *
 * @see docs/specs/architecture.md §P8.1 (execution boundary)
 */

import type { CapabilityInstance, DecisionOutcome, RuleSnapshot, RuleSnapshotHash } from '@archon/kernel';
import type { LogSink } from '@archon/kernel';

// ---------------------------------------------------------------------------
// ExecutionRequest
// ---------------------------------------------------------------------------

/**
 * A structured request to execute a single agent action through the gate.
 *
 * The request is STRUCTURED — not raw text. The caller must resolve the
 * capability instance before constructing an ExecutionRequest. Raw input
 * parsing lives in the CLI/Desktop layer, NOT in runtime-host.
 *
 * snapshot and snapshotHash must be pre-computed by the caller via
 * buildSnapshotForProject() or equivalent.
 */
export interface ExecutionRequest {
  /** Identifier of the agent proposing the action. */
  readonly agentId: string;
  /** The structured capability instance being proposed. */
  readonly action: CapabilityInstance;
  /** The active Rule Snapshot to evaluate against. Pre-computed by caller. */
  readonly snapshot: RuleSnapshot;
  /** Branded SHA-256 hash of the snapshot. Pre-computed by caller. */
  readonly snapshotHash: RuleSnapshotHash;
}

// ---------------------------------------------------------------------------
// ExecutionResult
// ---------------------------------------------------------------------------

/**
 * The result of a single ExecutionSurface.execute() call.
 *
 * Mirrors the gate() return type; field names are camelCase for consistency
 * with the broader TypeScript idiom in this codebase.
 */
export interface ExecutionResult {
  /** The validation outcome (Permit, Deny, or Escalate). */
  readonly decision: DecisionOutcome;
  /** IDs of DRR rules that triggered the outcome. Empty on I1/I7 denials. */
  readonly triggeredRules: ReadonlyArray<string>;
  /**
   * Handler output on Permit with a registered handler.
   * undefined on Deny, Escalate, or Permit with no registered handler.
   */
  readonly output?: unknown;
}

// ---------------------------------------------------------------------------
// ExecutionSurface
// ---------------------------------------------------------------------------

/**
 * Boundary interface for routing execution through the validation gate.
 *
 * Implementations live in module-loader (GateExecutionSurface) and must
 * NOT be imported by runtime-host. The interface is defined here so
 * ProjectRuntime can hold a reference without creating a circular import.
 *
 * The LogSink parameter is passed per-call (not stored at construction)
 * so that ProjectRuntime owns the log sink lifecycle and passes its own
 * bound instance. This guarantees:
 *   - All log entries carry the correct project_id via the runtime's ctx.
 *   - The surface implementation never holds a cross-project log reference.
 *
 * Contract:
 *   - execute() must log the decision (Permit, Deny, or Escalate) using logSink.
 *   - execute() must never emit events with a project_id other than the one
 *     bound to logSink (via the RuntimeContext used to construct logSink).
 *   - execute() must return ExecutionResult reflecting the actual gate outcome.
 */
export interface ExecutionSurface {
  /**
   * Execute a structured request through the validation gate.
   *
   * @param req     - The structured execution request with snapshot.
   * @param logSink - The project-bound log sink owned by the calling ProjectRuntime.
   *                  Implementation must use this for all decision logging.
   * @returns The gate outcome, triggered rules, and optional handler output.
   */
  execute(req: ExecutionRequest, logSink: LogSink): Promise<ExecutionResult>;
}
