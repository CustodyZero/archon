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
import type { DecisionLog, DecisionOutcome } from '../types/decision.js';
import type { RuleSnapshot, RuleSnapshotHash } from '../types/snapshot.js';
import { ValidationEngine } from './engine.js';
import { DecisionLogger } from '../logging/decision-log.js';
import { NotImplementedError } from '@archon/restriction-dsl';

/**
 * The execution gate.
 *
 * No action executes without passing through this gate.
 * See architecture.md §4.
 *
 * The gate is the sole path between a proposed agent action and execution.
 * It is not bypassed for any reason — not for trusted agents, not for
 * first-party modules, not for operator-initiated actions. All actions
 * are evaluated and logged.
 *
 * @see docs/specs/architecture.md §4
 */
export class ExecutionGate {
  private readonly engine: ValidationEngine;
  private readonly logger: DecisionLogger;

  constructor() {
    this.engine = new ValidationEngine();
    this.logger = new DecisionLogger();
  }

  /**
   * Gate a proposed action against the active Rule Snapshot.
   *
   * Unconditional contract:
   * 1. Calls ValidationEngine.evaluate(action, snapshot)
   * 2. Calls DecisionLogger.record(entry) — regardless of outcome
   * 3. Returns the DecisionOutcome
   *
   * The caller must not proceed with execution if the outcome is Deny
   * or Escalate. The gate itself does not block I/O — it returns the
   * outcome and the caller enforces it.
   *
   * @param agentId - Identifier of the agent proposing the action
   * @param action - The capability instance proposed by the agent
   * @param snapshot - The active, immutable Rule Snapshot
   * @param activeSnapshotHash - Branded hash of the active snapshot
   * @returns Promise<DecisionOutcome> — Permit, Deny, or Escalate
   *
   * @throws {NotImplementedError} — stub implementation
   *   Will implement:
   *   - Call ValidationEngine.evaluate() to get outcome
   *   - Compute input_hash from canonical(agentId + action)
   *   - Construct complete DecisionLog entry
   *   - Call DecisionLogger.record() before returning outcome
   *   - Handle Escalate by triggering ui.request_approval flow
   *
   * @see docs/specs/architecture.md §4 (validation flow)
   * @see docs/specs/architecture.md §6 (decision log entry fields)
   */
  async gate(
    _agentId: string,
    _action: CapabilityInstance,
    _snapshot: RuleSnapshot,
    _activeSnapshotHash: RuleSnapshotHash,
  ): Promise<DecisionOutcome> {
    // TODO: call this.engine.evaluate(_action, _snapshot)
    // TODO: compute input_hash = sha256(canonical(agentId + action))
    // TODO: construct DecisionLog entry with all required fields
    // TODO: call this.logger.record(entry) — MUST happen before return
    // TODO: if outcome === Escalate: trigger ui.request_approval capability
    // TODO: return outcome
    throw new NotImplementedError(
      'architecture.md §4–§6 (execution gate implementation)',
    );
  }
}

/**
 * Compute the SHA-256 hash of a canonical input for decision log attribution.
 *
 * This function IS implemented (not a stub) — it is a pure deterministic
 * function with no governance implications.
 *
 * @internal
 */
export function computeInputHash(agentId: string, action: CapabilityInstance): string {
  const canonical = JSON.stringify({
    agent_id: agentId,
    capability_id: action.capability_id,
    module_id: action.module_id,
    type: action.type,
    tier: action.tier,
    params: action.params,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// Type-only import to keep DecisionLog in scope for future implementation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _DecisionLogRef = DecisionLog;
