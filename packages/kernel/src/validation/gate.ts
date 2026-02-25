/**
 * Archon Kernel — Execution Gate
 *
 * The ExecutionGate is the final enforcement boundary in the Archon system.
 * No action reaches execution without passing through this gate.
 * No decision goes unlogged, regardless of outcome.
 *
 * The gate enforces two invariants unconditionally:
 * 1. Every action is evaluated by the ValidationEngine before execution.
 * 2. Every evaluation is logged, regardless of outcome (Permit, Deny, Escalate).
 *
 * Gate contract:
 * - Calls ValidationEngine.evaluate()
 * - Calls DecisionLogger.record() with the full log entry — ALWAYS
 * - Returns the DecisionOutcome to the caller
 * - The caller is responsible for halting execution on Deny/Escalate
 *
 * @see docs/specs/architecture.md §4 (validation flow — step 5: execution gate)
 * @see docs/specs/architecture.md §6 (logging and replay)
 */

import { createHash } from 'node:crypto';
import type { CapabilityInstance } from '../types/capability.js';
import type { DecisionLog } from '../types/decision.js';
import { DecisionOutcome } from '../types/decision.js';
import type { RuleSnapshot, RuleSnapshotHash } from '../types/snapshot.js';
import type { AdapterCallContext, KernelAdapters } from '../adapters/index.js';
import type { LogSink } from '../logging/log-sink.js';
import { ValidationEngine } from './engine.js';
import { DecisionLogger } from '../logging/decision-log.js';

/**
 * Handler function registered per capability.
 *
 * Key format: `"${module_id}:${capability_id}"`.
 * Registered by the CLI or platform layer before calling gate().
 * Called only if the gate returns Permit.
 *
 * The gate constructs the AdapterCallContext from its own validated state
 * (real agentId, real capability instance, real activeSnapshotHash) and
 * passes it to the handler so adapters can attribute all I/O to the
 * validated action. Handlers must not construct their own contexts.
 *
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */
export type ModuleHandler = (
  instance: CapabilityInstance,
  adapters: KernelAdapters,
  context: AdapterCallContext,
) => Promise<unknown>;

/**
 * The execution gate.
 *
 * No action executes without passing through this gate.
 *
 * The gate is the sole path between a proposed agent action and execution.
 * It is not bypassed for any reason — not for trusted agents, not for
 * first-party modules, not for operator-initiated actions. All actions
 * are evaluated and logged.
 *
 * Handler registration:
 * - Handlers are registered per capability key `"${module_id}:${capability_id}"`.
 * - The platform layer (CLI, desktop) registers handlers before invoking gate().
 * - If no handler is registered for a Permitted action, the gate returns the
 *   Permit decision without executing anything (the call site decides how to handle).
 *
 * Return type: `{ decision, result? }` — not just `DecisionOutcome` — so that
 * the caller can receive both the decision and any handler result.
 *
 * @see docs/specs/architecture.md §4
 */
export class ExecutionGate {
  private readonly engine: ValidationEngine;
  private readonly logger: DecisionLogger;

  constructor(
    private readonly handlers: Map<string, ModuleHandler> = new Map(),
    private readonly adapters?: KernelAdapters,
    logSink?: LogSink,
  ) {
    this.engine = new ValidationEngine();
    this.logger = new DecisionLogger(logSink);
  }

  /**
   * Gate a proposed action against the active Rule Snapshot.
   *
   * Unconditional contract:
   * 1. Calls ValidationEngine.evaluate(action, snapshot)
   * 2. Computes input_hash and constructs a complete DecisionLog entry
   * 3. Calls DecisionLogger.record(entry) — regardless of outcome, including handler errors
   * 4. If Permit and a handler is registered, executes the handler
   * 5. Returns { decision, result? }
   *
   * The caller must not proceed with execution if decision is Deny or Escalate.
   *
   * @param agentId - Identifier of the agent proposing the action
   * @param action - The capability instance proposed by the agent
   * @param snapshot - The active, immutable Rule Snapshot
   * @param activeSnapshotHash - Branded hash of the active snapshot
   * @returns { decision, triggered_rules, result? }
   *   - `decision`: the outcome (Permit, Deny, etc.)
   *   - `triggered_rules`: IDs of rules that determined the outcome. Non-empty
   *     only when a specific DRR was matched (deny-rule match or allow-rule
   *     permit). Empty for I1/I7 containment denials and allowlist-exhaustion
   *     denials. Callers may use non-empty triggered_rules as evidence that a
   *     restriction (I2) — not a capability-containment check (I1) — caused denial.
   *   - `result`: handler output, present only on Permit with a registered handler.
   *
   * @see docs/specs/architecture.md §4 (validation flow)
   * @see docs/specs/architecture.md §6 (decision log entry fields)
   */
  async gate(
    agentId: string,
    action: CapabilityInstance,
    snapshot: RuleSnapshot,
    activeSnapshotHash: RuleSnapshotHash,
  ): Promise<{ decision: DecisionOutcome; triggered_rules: ReadonlyArray<string>; result?: unknown }> {
    const evalResult = this.engine.evaluate(action, snapshot);
    const decision = evalResult.outcome;
    const inputHash = computeInputHash(agentId, action);

    const entry: DecisionLog = {
      agent_id: agentId,
      proposed_action: action,
      decision,
      triggered_rules: evalResult.triggered_rules,
      rs_hash: activeSnapshotHash,
      input_hash: inputHash,
      output_hash: null,
      timestamp: new Date().toISOString(),
    };

    if (decision === DecisionOutcome.Permit) {
      const handlerKey = `${action.module_id}:${action.capability_id}`;
      const handler = this.handlers.get(handlerKey);
      if (handler !== undefined && this.adapters !== undefined) {
        // Build the real context from validated gate state.
        // Handlers must use this context for all adapter calls — not construct their own.
        const context: AdapterCallContext = {
          agent_id: agentId,
          capability_instance: action,
          rs_hash: activeSnapshotHash,
          resource_config: snapshot.resource_config,
        };

        // Log is recorded in the finally block to guarantee it is written
        // even if the handler throws. The log invariant is unconditional.
        let result: unknown;
        try {
          result = await handler(action, this.adapters, context);
        } finally {
          // INVARIANT: log is written regardless of handler success or failure.
          this.logger.record(entry);
        }
        return { decision, triggered_rules: evalResult.triggered_rules, result };
      }
      // No handler registered — permit decision is returned, no execution.
      this.logger.record(entry);
      return { decision, triggered_rules: evalResult.triggered_rules };
    }

    // Deny or Escalate: log and return without execution.
    this.logger.record(entry);
    return { decision, triggered_rules: evalResult.triggered_rules };
  }
}

/**
 * Compute the SHA-256 hash of a canonical input for decision log attribution.
 *
 * Uses sorted-key JSON serialization for determinism: two CapabilityInstances
 * with the same field values but different property insertion order in `params`
 * must produce the same hash (Invariant I4).
 *
 * @internal
 */
export function computeInputHash(agentId: string, action: CapabilityInstance): string {
  const canonical = canonicalJson({
    agent_id: agentId,
    capability_id: action.capability_id,
    module_id: action.module_id,
    type: action.type,
    tier: action.tier,
    params: action.params,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Produce a deterministic JSON string with sorted keys at every level.
 * Mirrors the canonicalize() function in snapshot/builder.ts.
 *
 * @internal
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const pairs = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}
