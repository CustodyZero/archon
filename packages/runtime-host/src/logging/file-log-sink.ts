/**
 * Archon Runtime Host — File-backed Decision Log Sink
 *
 * Implements the LogSink interface from @archon/kernel by appending JSONL
 * entries to the active project's `logs/decisions.jsonl`.
 *
 * The kernel owns the LogSink interface and DecisionLogger class.
 * The runtime host owns this concrete implementation — the only place
 * in the system that writes decision log entries to disk.
 *
 * Decision logs are project-scoped (P4): each project writes to its own
 * `<projectDir>/logs/decisions.jsonl` via the injected StateIO. Logs from
 * different projects never intermix.
 *
 * P7.5 / ACM-001: Each emitted line carries the full attribution envelope
 * (device_id, user_id, session_id, project_id, agent_id, archon_version,
 * schema_version) via buildEventEnvelope(). The RuntimeContext is injected
 * at construction time — it is required, not optional.
 *
 * This sink is synchronous: the write completes before the call returns,
 * guaranteeing the log entry is durable before execution proceeds.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 * @see docs/specs/archon-context-model-specification.md (ACM-001)
 */

import type { LogSink, DecisionLog } from '@archon/kernel';
import { unwrapRuleSnapshotHash } from '@archon/kernel';
import type { StateIO } from '../state/state-io.js';
import { ulid } from './ulid.js';
import type { RuntimeContext } from '../context/event-envelope.js';
import { buildEventEnvelope } from '../context/event-envelope.js';

/**
 * Appends each decision log entry as a single JSONL line to the project's
 * `logs/decisions.jsonl` via the injected project-scoped StateIO.
 *
 * Every line includes the full ACM-001 attribution envelope.
 */
export class FileLogSink implements LogSink {
  constructor(
    private readonly stateIO: StateIO,
    private readonly ctx: RuntimeContext,
  ) {}

  append(entry: DecisionLog): void {
    const payload = {
      agentId: entry.agent_id,
      capabilityType: entry.proposed_action.type,
      decision: entry.decision,
      reason: entry.triggered_rules.join(', ') || 'none',
      input_hash: entry.input_hash,
    };

    const envelope = buildEventEnvelope(
      this.ctx,
      ulid(),
      'governance.decision',
      unwrapRuleSnapshotHash(entry.rs_hash),
      payload,
    );

    this.stateIO.appendLine('decisions.jsonl', JSON.stringify(envelope));
  }
}
